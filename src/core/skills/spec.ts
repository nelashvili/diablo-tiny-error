/** Turns SkillDef data + skill level into an AttackSpec the combat module can resolve. */
import { evalLevel } from '../../data/levelScaled';
import type { SkillDef } from '../../data/schema';
import type { AttackSpec, StatusEffectSpec } from '../combat/types';
import type { Actor } from '../sim/entities';
import type { DamageType } from '../types';
import { skillParam, synergyPct } from './level';

export type SpecDelivery = AttackSpec['delivery'];

/** Status effects configured through skill params (stunSec, freezeSec, chillSec/chillPct, slowSec/slowPct, knockback). */
export function paramEffects(caster: Actor, skill: SkillDef, level: number): StatusEffectSpec[] {
  const out: StatusEffectSpec[] = [];
  for (const e of skill.effects ?? []) out.push({ ...e });
  const p = (n: string): number => skillParam(caster, skill, n, level);
  if (p('stunSec') > 0) out.push({ kind: 'stun', durationSec: p('stunSec') });
  if (p('freezeSec') > 0) out.push({ kind: 'freeze', durationSec: p('freezeSec') });
  if (p('chillSec') > 0)
    out.push({ kind: 'chill', durationSec: p('chillSec'), magnitude: p('chillPct') || 50 });
  if (p('slowSec') > 0) out.push({ kind: 'slow', durationSec: p('slowSec'), magnitude: p('slowPct') || 50 });
  if (p('knockback') > 0) out.push({ kind: 'knockback', durationSec: 0.3, magnitude: p('knockback') });
  return out;
}

/**
 * Build the attack payload of a skill at `level`. Synergies targeting a damage type scale that
 * type's min/max (and 'physical' also scales weapon damage %); 'attackRating' scales AR %.
 */
export function buildAttackSpec(
  caster: Actor,
  skill: SkillDef,
  level: number,
  delivery: SpecDelivery,
  opts: { useWeapon?: boolean } = {},
): AttackSpec {
  const useWeaponDamage = opts.useWeapon ?? skill.weaponDamagePct !== undefined;
  const spec: AttackSpec = {
    delivery,
    useWeaponDamage,
    blockable: delivery !== 'spell',
  };
  if (skill.damage) {
    const sd: Partial<Record<DamageType, { min: number; max: number }>> = {};
    for (const [type, r] of Object.entries(skill.damage) as [DamageType, { min: never; max: never }][]) {
      const mul = 1 + (synergyPct(caster, skill, type) + synergyPct(caster, skill, 'damage')) / 100;
      const min = evalLevel(r.min, level) * mul;
      const max = Math.max(min, evalLevel(r.max, level) * mul);
      sd[type] = { min, max };
    }
    spec.skillDamage = sd;
  }
  if (useWeaponDamage) {
    const phys =
      1 + (synergyPct(caster, skill, 'physical') + synergyPct(caster, skill, 'weaponDamage')) / 100;
    spec.weaponDamagePct = evalLevel(skill.weaponDamagePct, level) * phys || 100 * phys;
  }
  const ar = evalLevel(skill.attackRatingPct, level) + synergyPct(caster, skill, 'attackRating');
  if (ar) spec.attackRatingPct = ar;
  const conv = skillParam(caster, skill, 'convertPct', level);
  if (conv > 0 && skill.element) spec.convert = { to: skill.element, pct: conv };
  const fx = paramEffects(caster, skill, level);
  if (fx.length) spec.effects = fx;
  return spec;
}
