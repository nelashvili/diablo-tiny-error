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
import type { Difficulty } from '../types';
import type { Actor, PlayerEntity } from '../sim/entities';
import type { Equipment, ItemInstance } from '../items/types';
import {
  DUAL_WIELD,
  MELEE_MASTERY,
  getEquippedWeapon,
  getOffHandWeapon,
  wieldsMelee,
  type EquippedWeapon,
} from './weapon';
import { itemModifiers, setBonusModifiers } from '../items/helpers';

function equipmentMods(eq: Equipment, out: Modifier[]): void {
  const worn: ItemInstance[] = [];
  for (const item of Object.values(eq)) {
    if (!item) continue;
    worn.push(item);
    for (const m of itemModifiers(item)) out.push(m);
  }
  for (const m of setBonusModifiers(worn)) out.push(m);
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
  const wielded = getEquippedWeapon(p)?.weaponClass;
  for (const id of ids) {
    const def = DB.skills.get(id);
    if (!def || def.kind !== 'passive' || !def.mods) continue;
    // Weapon masteries only count while wielding one of their weapons.
    if (def.weaponReq?.length && (!wielded || !def.weaponReq.includes(wielded))) continue;
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

/** The built-in melee edge (see MELEE_MASTERY) while a melee weapon is equipped. */
function meleeMasteryMods(p: PlayerEntity): Modifier[] {
  if (!wieldsMelee(p)) return [];
  const mods: Modifier[] = [
    { stat: 'enhancedDamage', op: 'flat', value: MELEE_MASTERY.enhancedDamage, source: 'melee' },
    { stat: 'damageReducedPct', op: 'flat', value: MELEE_MASTERY.damageReducedPct, source: 'melee' },
  ];
  if (getOffHandWeapon(p))
    mods.push({ stat: 'ias', op: 'flat', value: DUAL_WIELD.attackSpeed, source: 'dualWield' });
  return mods;
}

export function statSourcesFor(p: PlayerEntity, difficulty: Difficulty): StatSources {
  const cls = DB.classes.get(p.classId);
  const w = getEquippedWeapon(p);
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
    modifiers: [...gatherModifiers(p), ...meleeMasteryMods(p)],
    difficulty,
    weapon: w ? weaponSource(w) : undefined,
    growth: cls?.growth,
  };
}

function weaponSource(w: EquippedWeapon): NonNullable<StatSources['weapon']> {
  return {
    min: w.min,
    max: w.max,
    strBonus: w.strBonus,
    dexBonus: w.dexBonus,
    eneBonus: w.eneBonus,
    speed: w.speed,
  };
}

/** Player stats; a dual wielder also gets the off-hand weapon's damage through the same pipeline. */
function playerStats(p: PlayerEntity, difficulty: Difficulty): DerivedStats {
  const src = statSourcesFor(p, difficulty);
  const stats = computeStats(src);
  const off = getOffHandWeapon(p);
  if (off) {
    const o = computeStats({ ...src, weapon: weaponSource(off) });
    stats.offHand = { physMin: o.physMin, physMax: o.physMax };
  }
  return stats;
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
    actor.stats = playerStats(actor, difficulty);
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
