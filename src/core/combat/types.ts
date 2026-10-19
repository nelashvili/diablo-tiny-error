/**
 * Combat contracts (D2 hit/damage resolution).
 *
 * CONTRACT FILE — frozen after Wave 0. Additive changes only, coordinated by the lead.
 */
import type { DamageType, EntityId } from '../types';
import type { DerivedStats } from '../stats/types';
import type { Rng } from '../rng';

export type DamagePacket = Partial<Record<DamageType, number>>;

export interface StatusEffectSpec {
  /**
   * chill = slowed (cryo), freeze = cannot act, stun, toxin = damage over time, burn = DoT,
   * knockback = shoved away from the source (slides for durationSec), lifted = held in the air by
   * the Forse (cannot act; magnitude = total Forse damage over the lift).
   */
  kind: 'chill' | 'freeze' | 'stun' | 'toxin' | 'burn' | 'knockback' | 'slow' | 'lifted';
  durationSec: number;
  /** Strength: slow % for chill/slow, total damage for toxin/burn/lifted, tiles for knockback. */
  magnitude?: number;
  /** Knockback only: damage dealt (and a short stun) if the target is slammed into a wall. */
  slam?: number;
}

/** What is being attempted. Skills build these. */
export interface AttackSpec {
  /** 'melee' and 'missile' roll to-hit (AR vs DEF). 'spell' always hits (D2 rule). */
  delivery: 'melee' | 'missile' | 'spell';
  /** Use the attacker's weapon/physical damage? (D2 "uses weapon damage") */
  useWeaponDamage: boolean;
  /** % weapon damage multiplier (100 = normal). */
  weaponDamagePct?: number;
  /** Flat skill damage by type, rolled min..max. */
  skillDamage?: Partial<Record<DamageType, { min: number; max: number }>>;
  /** Bonus attack rating % from skill (e.g. Litesaber Strike +AR%). */
  attackRatingPct?: number;
  /** Converts % of physical into an element (D2 "converts to"). */
  convert?: { to: DamageType; pct: number };
  effects?: StatusEffectSpec[];
  /** Can be blocked by a shield? Spells: false unless specified. */
  blockable?: boolean;
  /** Ignores defense entirely (always hits). */
  ignoreDefense?: boolean;
}

/** Minimal view of a fighter that combat math needs. */
export interface CombatantView {
  id: EntityId;
  level: number;
  stats: DerivedStats;
  /** Is currently moving (for evade) / standing still. */
  moving: boolean;
  isPlayerSide: boolean;
  /** Monster type flags affecting damage (D2 e.g. undead/demon — here: droyd/organic/boss). */
  flags?: { droyd?: boolean; boss?: boolean; immune?: Partial<Record<DamageType, boolean>> };
  hasShield: boolean;
}

export type AttackOutcome = 'hit' | 'miss' | 'blocked' | 'dodged' | 'avoided' | 'evaded';

export interface AttackResult {
  outcome: AttackOutcome;
  /** Final damage per type after resists/DR (only on 'hit'). */
  damage: DamagePacket;
  total: number;
  crit: boolean; // deadly/critical strike doubled physical
  crushed: boolean;
  effects: StatusEffectSpec[];
  lifeStolen: number;
  manaStolen: number;
}

/** Signature implemented by core/combat/resolve.ts in Wave 1. */
export type ResolveAttack = (
  attacker: CombatantView,
  defender: CombatantView,
  spec: AttackSpec,
  rng: Rng,
) => AttackResult;
