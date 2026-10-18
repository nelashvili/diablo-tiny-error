/**
 * Attack resolution (D2 order): to-hit -> block -> dodge/avoid/evade -> damage -> crit -> crushing blow
 * -> mitigation (DR, resists) -> status effects -> leech.
 *
 * Conventions:
 *  - `damage`/`total` hold INSTANT damage. Toxin (poison) is returned only as a 'toxin' StatusEffectSpec
 *    whose `magnitude` is the total damage over `durationSec`; the caller applies it over time.
 *  - Conversion (`spec.convert`) happens before critical strikes, so only remaining physical doubles.
 *  - `crushed` is set when crushing blow procs; the caller applies `crushingBlowDamage(currentLife, kind)`.
 *  - Leech is NOT scaled by difficulty here; callers multiply by `leechMultiplier(difficulty)`.
 */
import type { ElementalType } from '../types';
import { hitChance } from '../stats/formulas';
import {
  ELEMENTS,
  MAX_AVOIDANCE_PCT,
  applyResist,
  critChance,
  effectiveResist,
  rawStat,
  reducePhysical,
  rollRawDamage,
  DEFAULT_TOXIN_SECONDS,
} from './damage';
import type { AttackResult, DamagePacket, ResolveAttack, StatusEffectSpec } from './types';

const CHILL_SLOW_PCT = 50;
/** Player-side attacks never drop below this hit chance (D2's ~50% at equal level felt like whiffing). */
export const PLAYER_MIN_HIT_PCT = 80;
const KNOCKBACK_SECONDS = 0.3;

const miss = (outcome: AttackResult['outcome']): AttackResult => ({
  outcome,
  damage: {},
  total: 0,
  crit: false,
  crushed: false,
  effects: [],
  lifeStolen: 0,
  manaStolen: 0,
});

export const resolveAttack: ResolveAttack = (attacker, defender, spec, rng) => {
  const physicalDelivery = spec.delivery !== 'spell';

  // 1. To-hit (melee/missile only).
  if (physicalDelivery && !spec.ignoreDefense) {
    const ar = attacker.stats.attackRating * (1 + (spec.attackRatingPct ?? 0) / 100);
    let chance = hitChance(ar, defender.stats.defense, attacker.level, defender.level);
    if (attacker.isPlayerSide) chance = Math.max(chance, PLAYER_MIN_HIT_PCT);
    if (!rng.percent(chance)) return miss('miss');
  }

  // 2. Block (needs shield, blockable attack).
  const blockable = spec.blockable ?? physicalDelivery;
  if (blockable && defender.hasShield && defender.stats.blockChance > 0) {
    if (rng.percent(Math.min(75, defender.stats.blockChance))) return miss('blocked');
  }

  // 3. Dodge (melee, standing) / avoid (missile, standing) / evade (any, moving).
  if (physicalDelivery) {
    if (defender.moving) {
      if (rng.percent(Math.min(MAX_AVOIDANCE_PCT, rawStat(defender, 'evadeChance')))) return miss('evaded');
    } else if (spec.delivery === 'melee') {
      if (rng.percent(Math.min(MAX_AVOIDANCE_PCT, rawStat(defender, 'dodgeChance')))) return miss('dodged');
    } else if (rng.percent(Math.min(MAX_AVOIDANCE_PCT, rawStat(defender, 'avoidChance')))) {
      return miss('avoided');
    }
  }

  // 4. Damage.
  const d = rollRawDamage(attacker, spec, rng);
  let crit = false;
  if (d.physical > 0 && rng.percent(critChance(attacker))) {
    d.physical *= 2;
    crit = true;
  }
  const crushed = d.physical > 0 && rng.percent(rawStat(attacker, 'crushingBlow'));

  // 5. Mitigation.
  const immune = defender.flags?.immune;
  const physical = immune?.physical
    ? 0
    : reducePhysical(d.physical, rawStat(defender, 'damageReduced'), rawStat(defender, 'damageReducedPct'));
  const magic = immune?.magic ? 0 : Math.max(0, d.magic - rawStat(defender, 'magicDamageReduced'));
  const resisted = {} as Record<ElementalType, number>;
  for (const e of ELEMENTS) resisted[e] = applyResist(d[e], effectiveResist(attacker, defender, e));

  const damage: DamagePacket = {};
  const put = (k: keyof DamagePacket, v: number): void => {
    const r = Math.round(v);
    if (r > 0) damage[k] = r;
  };
  put('physical', physical);
  put('magic', magic);
  put('plasma', resisted.plasma);
  put('cryo', resisted.cryo);
  put('storm', resisted.storm);
  let total = 0;
  for (const v of Object.values(damage)) total += v;

  // 6. Status effects.
  const effects: StatusEffectSpec[] = [];
  const frozenImmune = rawStat(defender, 'cannotBeFrozen') > 0;
  const halfFreeze = rawStat(defender, 'halfFreezeDuration') > 0;
  const plr = Math.min(100, Math.max(0, rawStat(defender, 'poisonLengthReduced'))) / 100;
  let hasChill = false;
  for (const fx of spec.effects ?? []) {
    if (fx.kind === 'chill' || fx.kind === 'freeze') {
      if (frozenImmune) continue;
      hasChill ||= fx.kind === 'chill';
      effects.push({ ...fx, durationSec: halfFreeze ? fx.durationSec / 2 : fx.durationSec });
    } else if (fx.kind === 'toxin' || fx.kind === 'burn') {
      const res = effectiveResist(attacker, defender, fx.kind === 'toxin' ? 'toxin' : 'plasma');
      const keep = fx.kind === 'toxin' ? 1 - plr : 1;
      const mag = applyResist((fx.magnitude ?? 0) * keep, res);
      if (mag > 0) effects.push({ ...fx, durationSec: fx.durationSec * keep, magnitude: mag });
    } else effects.push({ ...fx });
  }
  // Cryo damage dealt chills for cryoLength seconds.
  const cryoLen = rawStat(attacker, 'cryoLength');
  if (resisted.cryo > 0 && cryoLen > 0 && !frozenImmune && !hasChill) {
    effects.push({
      kind: 'chill',
      durationSec: halfFreeze ? cryoLen / 2 : cryoLen,
      magnitude: CHILL_SLOW_PCT,
    });
  }
  // Toxin: DoT total, shortened and weakened by poison length reduction and resist.
  if (d.toxin > 0) {
    const tox = applyResist(d.toxin * (1 - plr), effectiveResist(attacker, defender, 'toxin'));
    const len = (rawStat(attacker, 'toxinLength') || DEFAULT_TOXIN_SECONDS) * (1 - plr);
    if (tox >= 1 && len > 0) effects.push({ kind: 'toxin', durationSec: len, magnitude: Math.round(tox) });
  }
  if (rawStat(attacker, 'knockback') > 0 && total > 0 && !effects.some((e) => e.kind === 'knockback')) {
    effects.push({ kind: 'knockback', durationSec: KNOCKBACK_SECONDS, magnitude: 1 });
  }

  // 7. Leech on instant damage dealt.
  const lifeStolen = (total * Math.max(0, rawStat(attacker, 'lifeSteal'))) / 100;
  const manaStolen = (total * Math.max(0, rawStat(attacker, 'manaSteal'))) / 100;

  return { outcome: 'hit', damage, total, crit, crushed, effects, lifeStolen, manaStolen };
};
