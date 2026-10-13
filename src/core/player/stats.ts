/**
 * Gathers every modifier source (equipment, sockets, set bonuses, passive skills, buffs) and runs
 * the stats pipeline. Player stats are fully recomputed; other actors only re-apply buff mods on
 * top of a cached baseline (their base stats are created by their own modules).
 */
import { DB } from '../../data/db';
import { evalLevel } from '../../data/levelScaled';
import { levelFromParts } from '../skills/level';
import { computeStats } from '../stats/compute';
import type { DerivedStats, Modifier, StatSources } from '../stats/types';
import type { Difficulty, EquipSlot } from '../types';
import type { Actor, PlayerEntity } from '../sim/entities';
import type { Equipment, ItemInstance } from '../items/types';
import { WEAPON_STAT_BONUS, getEquippedWeapon } from './weapon';

function itemMods(item: ItemInstance, slot: EquipSlot, out: Modifier[]): void {
  const src = `item:${item.uid}`;
  for (const m of item.mods) out.push(m.source ? m : { ...m, source: src });
  if (item.defense) out.push({ stat: 'defense', op: 'flat', value: item.defense, source: src });
  const base = DB.items.get(item.base);
  if (base?.block && base.armorClass === 'shield')
    out.push({ stat: 'blockChance', op: 'flat', value: base.block, source: src });
  // Gems / glyphs in sockets.
  const kind = slot === 'mainHand' ? 'weapon' : base?.armorClass === 'shield' ? 'shield' : 'armor';
  for (const gem of item.socketed) {
    const g = DB.gems.get(gem.base);
    if (g) for (const m of g[kind]) out.push({ ...m, source: `gem:${gem.base}` });
  }
}

function equipmentMods(eq: Equipment, out: Modifier[]): void {
  const setCounts = new Map<string, number>();
  for (const [slot, item] of Object.entries(eq) as [EquipSlot, ItemInstance | undefined][]) {
    if (!item) continue;
    itemMods(item, slot, out);
    if (item.setItemId) {
      for (const set of DB.sets.values()) {
        if (set.items.some((s) => s.id === item.setItemId)) {
          setCounts.set(set.id, (setCounts.get(set.id) ?? 0) + 1);
          break;
        }
      }
    }
  }
  for (const [setId, count] of setCounts) {
    const set = DB.sets.get(setId);
    if (!set) continue;
    for (const [n, mods] of Object.entries(set.bonuses)) {
      if (Number(n) <= count)
        for (const m of mods)
          out.push({ stat: m.stat, op: m.op, value: m.max, param: m.param, source: `set:${setId}` });
    }
  }
}

/** All modifiers on a player (equipment + passives + buffs). */
export function gatherModifiers(p: PlayerEntity): Modifier[] {
  const mods: Modifier[] = [];
  equipmentMods(p.equipment, mods);
  for (const b of p.buffs) for (const m of b.mods) mods.push(m);

  // +skills from items/buffs decide effective levels of passives.
  const bonus: DerivedStats['skillBonus'] = { all: 0, byClass: {}, byTree: {}, bySkill: {} };
  for (const m of mods) {
    if (m.op !== 'flat') continue;
    if (m.stat === 'allSkills') bonus.all += m.value;
    else if (m.stat === 'classSkills')
      bonus.byClass[m.param ?? ''] = (bonus.byClass[m.param ?? ''] ?? 0) + m.value;
    else if (m.stat === 'treeSkills')
      bonus.byTree[m.param ?? ''] = (bonus.byTree[m.param ?? ''] ?? 0) + m.value;
    else if (m.stat === 'singleSkill')
      bonus.bySkill[m.param ?? ''] = (bonus.bySkill[m.param ?? ''] ?? 0) + m.value;
  }
  const ids = new Set([...Object.keys(p.skills), ...Object.keys(bonus.bySkill)]);
  for (const id of ids) {
    const def = DB.skills.get(id);
    if (!def || def.kind !== 'passive' || !def.mods) continue;
    const lvl = levelFromParts(def, p.skills[id] ?? 0, bonus);
    if (lvl <= 0) continue;
    for (const m of def.mods)
      mods.push({
        stat: m.stat,
        op: m.op,
        value: evalLevel(m.value, lvl),
        param: m.param,
        source: `skill:${id}`,
      });
  }
  return mods;
}

export function statSourcesFor(p: PlayerEntity, difficulty: Difficulty): StatSources {
  const cls = DB.classes.get(p.classId);
  const w = getEquippedWeapon(p);
  const sb = w?.weaponClass ? WEAPON_STAT_BONUS[w.weaponClass] : { strBonus: 0, dexBonus: 0 };
  return {
    level: p.level,
    base: cls
      ? {
          strength: cls.start.strength,
          dexterity: cls.start.dexterity,
          vitality: cls.start.vitality,
          energy: cls.start.energy,
          lifeMax: cls.baseLife,
          manaMax: cls.baseMana,
          staminaMax: cls.baseStamina,
        }
      : {},
    allocated: p.allocated,
    modifiers: gatherModifiers(p),
    difficulty,
    weapon: w
      ? { min: w.min, max: w.max, strBonus: sb.strBonus, dexBonus: sb.dexBonus, speed: w.speed }
      : undefined,
    growth: cls?.growth,
  };
}

const baselines = new WeakMap<Actor, { base: DerivedStats; applied: DerivedStats }>();

/** Apply buff modifiers to a copy of a baseline (monsters / mercs): defense, AR, resists, damage, speed. */
function applyBuffsToBaseline(base: DerivedStats, a: Actor): DerivedStats {
  const s: DerivedStats = { ...base, res: { ...base.res }, raw: { ...base.raw } };
  const flat: Partial<Record<string, number>> = {};
  const pct: Partial<Record<string, number>> = {};
  for (const b of a.buffs)
    for (const m of b.mods)
      (m.op === 'flat' ? flat : pct)[m.stat] = ((m.op === 'flat' ? flat : pct)[m.stat] ?? 0) + m.value;
  const f = (k: string, v: number): number => (v + (flat[k] ?? 0)) * (1 + (pct[k] ?? 0) / 100);
  s.defense = Math.max(0, f('defense', s.defense));
  s.attackRating = Math.max(0, f('attackRating', s.attackRating));
  s.res.plasma = f('resPlasma', s.res.plasma) - 0;
  s.res.cryo = f('resCryo', s.res.cryo);
  s.res.storm = f('resStorm', s.res.storm);
  s.res.toxin = f('resToxin', s.res.toxin);
  const ed = 1 + ((flat.enhancedDamage ?? 0) + (pct.enhancedDamage ?? 0)) / 100;
  s.physMin = base.physMin * ed;
  s.physMax = base.physMax * ed;
  s.moveSpeedMul = base.moveSpeedMul * (1 + (flat.frw ?? 0) / 100);
  s.attackSpeedMul = base.attackSpeedMul * (1 + (flat.ias ?? 0) / 100);
  return s;
}

/**
 * Recompute derived stats for an actor, clamp current pools to the new maximums and clear
 * `statsDirty`. Players: full pipeline. Others: baseline (first-seen stats) + buff mods.
 */
export function recomputeStats(actor: Actor, difficulty: Difficulty = 'normal'): void {
  if (actor.kind === 'player') {
    actor.stats = computeStats(statSourcesFor(actor, difficulty));
  } else {
    const rec = baselines.get(actor);
    // If someone else swapped in fresh stats, treat them as the new baseline.
    const base = rec && (actor.stats === rec.applied || actor.stats === rec.base) ? rec.base : actor.stats;
    const applied = actor.buffs.length > 0 ? applyBuffsToBaseline(base, actor) : base;
    baselines.set(actor, { base, applied });
    actor.stats = applied;
  }
  actor.life = Math.min(actor.life, actor.stats.lifeMax);
  actor.mana = Math.min(actor.mana, actor.stats.manaMax);
  actor.stamina = Math.min(actor.stamina, actor.stats.staminaMax);
  actor.statsDirty = false;
}

/** For non-player actors: replace the baseline (call after you assign fresh base stats). */
export function setBaselineStats(actor: Actor, stats: DerivedStats): void {
  baselines.set(actor, { base: stats, applied: stats });
  actor.stats = stats;
}
