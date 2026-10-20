import { DB, req } from '../../data/db';
import type { AffixDef, ItemBaseDef } from '../../data/schema';
import type { Rng } from '../rng';
import type { Modifier } from '../stats/types';
import type { ClassId, DefId, ItemQuality } from '../types';
import { affixMatchesBase, affixPool, isGear, setCandidates, uniqueCandidates } from './lookup';
import type { ItemInstance } from './types';

export * from './helpers';

export interface CreateItemOpts {
  quality?: ItemQuality;
  ilvl?: number;
  quantity?: number;
  /** Force identified (default true: auto-identify, PLAN §6). */
  identified?: boolean;
  /** Force a specific unique / set item (quality is then 'unique' / 'set'). */
  uniqueId?: DefId;
  setItemId?: DefId;
  /** Hero the drop is for: a set piece on a shared base leans toward that class's sets. */
  classId?: ClassId;
}

/** Class sets drop mostly for their own class (x4); other classes' sets rarely (x0.25). */
export function setAffinity(set: { forClass?: ClassId }, classId: ClassId | undefined): number {
  if (!classId || !set.forClass) return 1;
  return set.forClass === classId ? 4 : 0.25;
}

const RARE_NAME_POOL = 20;
/** Chance weights for the number of affixes on a rare (D2: 4-6 typical, 3 possible). */
const RARE_COUNTS: [number, number][] = [
  [3, 20],
  [4, 35],
  [5, 30],
  [6, 15],
];

/** Roll the mods of one affix/unique row. Mods with identical (min,max) share a single roll. */
export function rollMods(
  mods: readonly {
    stat: Modifier['stat'];
    op: 'flat' | 'percent';
    min: number;
    max: number;
    param?: string;
  }[],
  rng: Rng,
  source: string,
): Modifier[] {
  const shared = new Map<string, number>();
  return mods.map((m) => {
    const key = `${m.min}:${m.max}`;
    let value = shared.get(key);
    if (value === undefined) {
      value = m.min === m.max ? m.min : rng.int(m.min, m.max);
      shared.set(key, value);
    }
    return { stat: m.stat, value, op: m.op, ...(m.param ? { param: m.param } : {}), source };
  });
}

function eligibleAffixes(
  kind: 'prefix' | 'suffix',
  base: ItemBaseDef,
  mlvl: number,
  rare: boolean,
  taken: Set<string>,
): AffixDef[] {
  return affixPool(kind).filter(
    (a) =>
      a.level <= mlvl &&
      (a.maxLevel === undefined || mlvl <= a.maxLevel) &&
      (!rare || a.rare) &&
      !taken.has(a.group) &&
      affixMatchesBase(a, base),
  );
}

function rollAffixes(base: ItemBaseDef, quality: 'magic' | 'rare', ilvl: number, rng: Rng): AffixDef[] {
  const mlvl = Math.min(99, Math.max(ilvl, base.qlvl));
  const rare = quality === 'rare';
  const taken = new Set<string>();
  const out: AffixDef[] = [];
  const counts = { prefix: 0, suffix: 0 };
  const tryPick = (kind: 'prefix' | 'suffix'): boolean => {
    const pool = eligibleAffixes(kind, base, mlvl, rare, taken);
    if (pool.length === 0) return false;
    const a = rng.weighted(pool, (x) => x.frequency);
    taken.add(a.group);
    out.push(a);
    counts[kind]++;
    return true;
  };
  if (!rare) {
    let wantP = rng.chance(0.65);
    const wantS = rng.chance(0.65);
    if (!wantP && !wantS) wantP = rng.chance(0.5);
    const first: 'prefix' | 'suffix' = wantP ? 'prefix' : 'suffix';
    if (wantP) tryPick('prefix');
    if (wantS || !wantP) tryPick('suffix');
    if (out.length === 0) tryPick(first === 'prefix' ? 'suffix' : 'prefix');
    return out;
  }
  const n = rng.weighted(RARE_COUNTS, (c) => c[1])[0];
  for (let i = 0; i < n; i++) {
    const order: ('prefix' | 'suffix')[] = rng.chance(0.5) ? ['prefix', 'suffix'] : ['suffix', 'prefix'];
    for (const kind of order) {
      if (counts[kind] >= 3) continue;
      if (tryPick(kind)) break;
    }
  }
  return out;
}

function rollSockets(base: ItemBaseDef, quality: ItemQuality, ilvl: number, rng: Rng): number {
  if (base.maxSockets <= 0) return 0;
  const chance =
    quality === 'normal' ? 0.15 : quality === 'inferior' ? 0.1 : quality === 'magic' ? 0.08 : 0.04;
  if (quality === 'unique' || quality === 'set') return 0;
  if (!rng.chance(chance)) return 0;
  const cap = Math.min(base.maxSockets, quality === 'inferior' ? 2 : ilvl <= 25 ? 3 : ilvl <= 40 ? 4 : 6);
  return rng.int(1, Math.max(1, cap));
}

/** Chance a dropped white weapon/armor is Superior: higher when it drops above its own level. */
export function superiorChance(base: ItemBaseDef, ilvl: number): number {
  return Math.min(0.3, Math.max(0.06, 0.06 + 0.03 * (ilvl - base.qlvl)));
}

/**
 * Maybe turn a plain dropped white item into a Superior one: weapons get 5-15% (more at higher item
 * levels) enhanced damage, armor the same as enhanced defense. Returns whether it did.
 */
export function rollSuperior(item: ItemInstance, rng: Rng): boolean {
  const base = DB.items.get(item.base);
  if (!base || item.quality !== 'normal' || !isGear(base)) return false;
  const stat = base.damage ? 'enhancedDamage' : base.defense ? 'defense' : null;
  if (!stat || !rng.chance(superiorChance(base, item.ilvl))) return false;
  const top = Math.min(30, 15 + Math.floor(item.ilvl / 4));
  item.superior = true;
  item.mods.push({ stat, op: 'percent', value: rng.int(5, top), source: 'superior' });
  return true;
}

/** Create an item instance of a base (rolling affixes/defense/sockets according to quality). */
export function createItem(baseId: DefId, opts: CreateItemOpts, rng: Rng): ItemInstance {
  const base = req(DB.items, baseId, 'item base');
  const ilvl = opts.ilvl ?? Math.max(1, base.qlvl);
  const uid = `${baseId}-${rng.nextU32().toString(36)}${rng.nextU32().toString(36)}`;
  const item: ItemInstance = {
    uid,
    base: baseId,
    quality: 'normal',
    ilvl,
    affixes: [],
    mods: [],
    sockets: 0,
    socketed: [],
    identified: opts.identified ?? true,
  };
  if (opts.quantity !== undefined || (base.stackable ?? 0) > 1) item.quantity = opts.quantity ?? 1;

  let quality: ItemQuality = isGear(base) ? (opts.quality ?? 'normal') : 'normal';
  if (quality === 'crafted') quality = 'rare';
  if (opts.uniqueId && isGear(base)) quality = 'unique';
  if (opts.setItemId && isGear(base)) quality = 'set';

  // unique / set selection (fallback: rare)
  if (quality === 'unique') {
    const pool = uniqueCandidates(baseId, ilvl);
    const def = opts.uniqueId
      ? DB.uniques.get(opts.uniqueId)
      : pool.length
        ? rng.weighted(pool, (u) => u.rarity)
        : undefined;
    if (def && def.base === baseId) {
      item.uniqueId = def.id;
      item.mods = rollMods(def.mods, rng, `unique:${def.id}`);
    } else quality = 'rare';
  } else if (quality === 'set') {
    const pool = setCandidates(baseId, ilvl);
    const ref = opts.setItemId ? pool.find((p) => p.item.id === opts.setItemId) : undefined;
    const pick =
      ref ??
      (pool.length && !opts.setItemId
        ? rng.weighted(pool, (r) => setAffinity(r.set, opts.classId))
        : undefined);
    if (pick) {
      item.setItemId = pick.item.id;
      item.mods = rollMods(pick.item.mods, rng, `set:${pick.item.id}`);
    } else quality = 'rare';
  }

  if (quality === 'magic' || quality === 'rare') {
    const affixes = rollAffixes(base, quality, ilvl, rng);
    if (affixes.length === 0) quality = 'normal';
    else {
      item.affixes = affixes.map((a) => a.id);
      // prefixes first, then suffixes (stable display order)
      for (const a of [...affixes].sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'prefix' ? -1 : 1)))
        item.mods.push(...rollMods(a.mods, rng, `affix:${a.id}`));
      if (quality === 'rare')
        item.rareName = [
          `rare.a.${rng.int(0, RARE_NAME_POOL - 1)}`,
          `rare.b.${rng.int(0, RARE_NAME_POOL - 1)}`,
        ];
    }
  }
  item.quality = quality;

  if (base.defense) {
    const roll = rng.int(base.defense.min, base.defense.max);
    item.defense = quality === 'inferior' ? Math.max(1, Math.floor(roll * 0.75)) : roll;
  }
  if (base.durability) item.durability = { cur: base.durability, max: base.durability };
  item.sockets = rollSockets(base, quality, ilvl, rng);
  return item;
}
