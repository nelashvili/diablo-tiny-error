/**
 * Damage rolling and mitigation (pure; all randomness through the passed Rng).
 */
import type { Rng } from '../rng';
import type { Difficulty, ElementalType } from '../types';
import { applyResist, combineChances } from '../stats/formulas';
import type { StatId } from '../stats/types';
import type { AttackSpec, CombatantView } from './types';

/** Pre-mitigation damage by type. Toxin is the TOTAL damage-over-time pool, not an instant hit. */
export interface RolledDamage {
  physical: number;
  plasma: number;
  cryo: number;
  storm: number;
  magic: number;
  toxin: number;
}

export const DEFAULT_TOXIN_SECONDS = 3;
export const MAX_PHYSICAL_DR_PCT = 50;
export const MAX_AVOIDANCE_PCT = 75;

export function rollRange(rng: Rng, min: number, max: number): number {
  const lo = Math.round(Math.min(min, max));
  const hi = Math.round(Math.max(min, max));
  if (hi <= 0) return 0;
  return rng.int(lo, hi);
}

const SKILL_DAMAGE_STAT: Record<ElementalType, StatId> = {
  plasma: 'plasmaSkillDamage',
  cryo: 'cryoSkillDamage',
  storm: 'stormSkillDamage',
  toxin: 'toxinSkillDamage',
};

const ENEMY_RES_STAT: Record<ElementalType, StatId> = {
  plasma: 'enemyPlasmaRes',
  cryo: 'enemyCryoRes',
  storm: 'enemyStormRes',
  toxin: 'enemyToxinRes',
};

export const ELEMENTS: readonly ElementalType[] = ['plasma', 'cryo', 'storm', 'toxin'];

export function rawStat(c: CombatantView, s: StatId): number {
  return c.stats.raw[s] ?? 0;
}

/**
 * Roll weapon (+ added elemental) and skill damage, then convert physical.
 * Weapon-added elemental/magic damage applies only with `useWeaponDamage`. `+% <element> skill damage`
 * scales only the skill's own damage of that element.
 */
export function rollRawDamage(attacker: CombatantView, spec: AttackSpec, rng: Rng): RolledDamage {
  const out: RolledDamage = { physical: 0, plasma: 0, cryo: 0, storm: 0, magic: 0, toxin: 0 };
  const st = attacker.stats;
  if (spec.useWeaponDamage) {
    const pct = (spec.weaponDamagePct ?? 100) / 100;
    out.physical += rollRange(rng, st.physMin, st.physMax) * pct;
    for (const e of ELEMENTS) out[e] += rollRange(rng, st.elemental[e].min, st.elemental[e].max);
    out.magic += rollRange(rng, st.elemental.magic.min, st.elemental.magic.max);
  }
  const sd = spec.skillDamage;
  if (sd) {
    for (const [type, r] of Object.entries(sd) as [
      keyof RolledDamage | 'physical',
      { min: number; max: number },
    ][]) {
      let v = rollRange(rng, r.min, r.max);
      if (type in SKILL_DAMAGE_STAT)
        v *= 1 + rawStat(attacker, SKILL_DAMAGE_STAT[type as ElementalType]) / 100;
      out[type] += v;
    }
  }
  const conv = spec.convert;
  if (conv && conv.to !== 'physical' && conv.pct > 0) {
    const moved = out.physical * Math.min(1, conv.pct / 100);
    out.physical -= moved;
    out[conv.to] += moved;
  }
  return out;
}

/** Chance (percent) that a hit is doubled: deadly strike combined with critical strike. */
export function critChance(attacker: CombatantView): number {
  return combineChances(rawStat(attacker, 'deadlyStrike'), rawStat(attacker, 'criticalStrike'));
}

/** Physical damage reduction: flat first, then % (capped at 50). */
export function reducePhysical(dmg: number, flat: number, pct: number): number {
  const after = Math.max(0, dmg - Math.max(0, flat));
  return after * (1 - Math.min(MAX_PHYSICAL_DR_PCT, Math.max(0, pct)) / 100);
}

/** Effective resist of defender against an element after the attacker's -enemy-res. */
export function effectiveResist(attacker: CombatantView, defender: CombatantView, e: ElementalType): number {
  if (defender.flags?.immune?.[e]) return 100;
  return defender.stats.res[e] - rawStat(attacker, ENEMY_RES_STAT[e]);
}

export { applyResist };

/**
 * D2R reduces life/mana leech on higher difficulties (33% on veteran/nightmare, 50% on legend/hell).
 * resolveAttack applies NO difficulty scaling; callers multiply `lifeStolen/manaStolen` by this.
 */
export function leechMultiplier(difficulty: Difficulty): number {
  return difficulty === 'normal' ? 1 : difficulty === 'veteran' ? 0.67 : 0.5;
}

export type CrushingTarget = 'normal' | 'boss' | 'player';

/**
 * Life removed by a Crushing Blow: 1/4 of current life vs normal monsters, 1/8 vs bosses, 1/10 vs players.
 * resolveAttack only sets `crushed`; the caller (knowing current life) applies this on top of `total`.
 */
export function crushingBlowDamage(defenderLife: number, kind: CrushingTarget): number {
  const div = kind === 'normal' ? 4 : kind === 'boss' ? 8 : 10;
  return Math.max(0, Math.floor(defenderLife / div));
}
