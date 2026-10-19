/** Item helpers: modifiers, weapon info, requirements, equip rules, stacking, value. */
import { DB } from '../../data/db';
import { WEAPON_STAT_BONUS } from '../../data/items/_weaponTable';
import type { WeaponClass } from '../../data/schema';
import type { Rng } from '../rng';
import type { Modifier } from '../stats/types';
import type { ClassId, DefId, EquipSlot } from '../types';
import { baseOf, findSetItem } from './lookup';
import type { ItemInstance } from './types';

const sumMods = (item: ItemInstance, stat: Modifier['stat'], op: Modifier['op']): number =>
  item.mods.reduce((s, m) => (m.stat === stat && m.op === op ? s + m.value : s), 0);

export function isTwoHanded(item: ItemInstance): boolean {
  return baseOf(item)?.twoHanded === true;
}

/** Final base defense of an armor piece (after item-local enhanced defense %, ethereal). */
export function itemDefense(item: ItemInstance): number {
  const b = baseOf(item);
  if (!b?.defense) return 0;
  const raw = item.defense ?? b.defense.min;
  const pct = sumMods(item, 'defense', 'percent');
  return Math.floor(raw * (1 + pct / 100) * (item.ethereal ? 1.5 : 1));
}

export interface WeaponInfo {
  weaponClass: WeaponClass;
  /** Weapon damage after item-local enhanced damage (flat +min/+max damage flows via itemModifiers). */
  min: number;
  max: number;
  /** D2 weapon class Str/Dex damage bonus (% per 100 points) — matches StatSources.weapon. */
  strBonus: number;
  dexBonus: number;
  eneBonus: number;
  /** Attacks per second at base. */
  speed: number;
  range: number;
  twoHanded: boolean;
}

export function weaponInfo(item: ItemInstance): WeaponInfo | null {
  const b = baseOf(item);
  if (!b?.weaponClass || !b.damage) return null;
  const ed = sumMods(item, 'enhancedDamage', 'percent');
  const q = (item.quality === 'inferior' ? 0.75 : 1) * (item.ethereal ? 1.5 : 1);
  const mul = (1 + ed / 100) * q;
  const min = Math.max(1, Math.round(b.damage.min * mul));
  const max = Math.max(min, Math.round(b.damage.max * mul));
  const bonus = WEAPON_STAT_BONUS[b.weaponClass];
  return {
    weaponClass: b.weaponClass,
    min,
    max,
    strBonus: bonus.str,
    dexBonus: bonus.dex,
    eneBonus: bonus.ene,
    speed: b.speed ?? 1,
    range: b.range ?? 1.5,
    twoHanded: b.twoHanded === true,
  };
}

/**
 * All modifiers an equipped item contributes to the stat pipeline. Item-local stats (enhanced damage %,
 * enhanced defense %, requirement reduction) are NOT included: they are resolved into `weaponInfo` /
 * `itemDefense`. The item's own total defense and shield block are emitted as flat `defense` /
 * `blockChance` modifiers, so callers must not add `item.defense` separately.
 */
export function itemModifiers(item: ItemInstance): Modifier[] {
  const b = baseOf(item);
  const source = `item:${item.uid}`;
  const out: Modifier[] = [];
  if (b?.defense) out.push({ stat: 'defense', op: 'flat', value: itemDefense(item), source });
  if (b?.block) out.push({ stat: 'blockChance', op: 'flat', value: b.block, source });
  for (const m of item.mods) {
    if (m.stat === 'enhancedDamage' && m.op === 'percent') continue;
    if (m.stat === 'defense' && m.op === 'percent') continue;
    if (m.stat === 'requirementsReduced') continue;
    out.push({ ...m, source: m.source ?? source });
  }
  const kind = b?.category === 'weapon' ? 'weapon' : b?.armorClass === 'shield' ? 'shield' : 'armor';
  for (const gem of item.socketed) {
    const g = DB.gems.get(gem.base);
    if (!g) continue;
    for (const m of g[kind]) out.push({ ...m, source: `gem:${gem.uid}` });
  }
  return out;
}

export interface Requirements {
  level: number;
  strength: number;
  dexterity: number;
}

export function itemRequirements(item: ItemInstance): Requirements {
  const b = baseOf(item);
  let level = b?.req.level ?? 0;
  if (item.uniqueId) level = Math.max(level, DB.uniques.get(item.uniqueId)?.reqLevel ?? 0);
  else if (item.setItemId) level = Math.max(level, findSetItem(item.setItemId)?.item.reqLevel ?? 0);
  else for (const id of item.affixes) level = Math.max(level, DB.affixes.get(id)?.level ?? 0);
  for (const g of item.socketed) level = Math.max(level, baseOf(g)?.qlvl ?? 0);
  const red = Math.min(80, sumMods(item, 'requirementsReduced', 'percent'));
  const f = (v: number | undefined): number => Math.max(0, Math.ceil((v ?? 0) * (1 - red / 100)));
  return { level, strength: f(b?.req.strength), dexterity: f(b?.req.dexterity) };
}

export function canEquip(
  item: ItemInstance,
  slot: EquipSlot,
  classId: ClassId,
  stats: { level: number; strength: number; dexterity: number },
): boolean {
  const b = baseOf(item);
  if (!b || !b.slots.includes(slot)) return false;
  if (b.classOnly && b.classOnly !== classId) return false;
  const r = itemRequirements(item);
  return stats.level >= r.level && stats.strength >= r.strength && stats.dexterity >= r.dexterity;
}

/** Merge `b` into `a` (same stackable base). Returns the leftover of `b` (or null when fully merged). */
export function stack(a: ItemInstance, b: ItemInstance): ItemInstance | null {
  const cap = baseOf(a)?.stackable ?? 1;
  if (a.base !== b.base || cap <= 1) return b;
  const room = Math.max(0, cap - (a.quantity ?? 1));
  const moved = Math.min(room, b.quantity ?? 1);
  a.quantity = (a.quantity ?? 1) + moved;
  b.quantity = (b.quantity ?? 1) - moved;
  return b.quantity > 0 ? b : null;
}

/** Split `n` units off a stack. Returns the new item or null when impossible. */
export function split(item: ItemInstance, n: number, rng: Rng): ItemInstance | null {
  const q = item.quantity ?? 1;
  if (n <= 0 || n >= q) return null;
  item.quantity = q - n;
  return {
    ...item,
    uid: `${item.base}-${rng.nextU32().toString(36)}${rng.nextU32().toString(36)}`,
    quantity: n,
  };
}

const QUALITY_MUL: Record<string, number> = {
  inferior: 0.5,
  normal: 1,
  magic: 1.5,
  rare: 2.5,
  set: 3,
  unique: 4,
  crafted: 3,
};

/** D2-style price. `buy` is what a vendor charges, `sell` what the player gets. */
export function itemValue(item: ItemInstance, mode: 'buy' | 'sell'): number {
  const b = baseOf(item);
  if (!b) return 0;
  let raw = b.cost * (QUALITY_MUL[item.quality] ?? 1);
  for (const id of item.affixes) raw += (DB.affixes.get(id)?.level ?? 0) * 20;
  if (item.uniqueId) raw += (DB.uniques.get(item.uniqueId)?.level ?? 0) * 60;
  if (item.setItemId) raw += (findSetItem(item.setItemId)?.item.reqLevel ?? 0) * 40;
  raw += item.sockets * 25;
  for (const g of item.socketed) raw += baseOf(g)?.cost ?? 0;
  if (item.durability && item.durability.max > 0)
    raw *= 0.5 + 0.5 * (item.durability.cur / item.durability.max);
  raw *= item.quantity ?? 1;
  return mode === 'buy' ? Math.max(1, Math.ceil(raw)) : Math.max(1, Math.floor(raw / 4));
}

/** Socket a gem into an item with a free socket. */
export function socketGem(host: ItemInstance, gem: ItemInstance): boolean {
  if (host.socketed.length >= host.sockets || !DB.gems.has(gem.base)) return false;
  host.socketed.push(gem);
  return true;
}

/** Cumulative set bonuses for the currently worn items (D2: 2 pieces gives bonus 2, 3 pieces gives 2+3...). */
export function setBonusModifiers(equipped: readonly ItemInstance[]): Modifier[] {
  const counts = new Map<string, number>();
  for (const it of equipped) {
    const ref = it.setItemId ? findSetItem(it.setItemId) : undefined;
    if (ref) counts.set(ref.set.id, (counts.get(ref.set.id) ?? 0) + 1);
  }
  const out: Modifier[] = [];
  for (const [setId, n] of counts) {
    const set = DB.sets.get(setId);
    if (!set) continue;
    for (const [need, mods] of Object.entries(set.bonuses))
      if (Number(need) <= n)
        for (const m of mods)
          out.push({
            stat: m.stat,
            op: m.op,
            value: m.max,
            ...(m.param ? { param: m.param } : {}),
            source: `set:${setId}`,
          });
  }
  return out;
}

export type { DefId };
