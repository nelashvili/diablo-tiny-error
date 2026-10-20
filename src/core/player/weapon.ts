/** Equipped weapon lookup shared by stats, skills and the HUD. */
import { DB } from '../../data/db';
import type { ItemBaseDef, WeaponClass } from '../../data/schema';
import type { Actor } from '../sim/entities';
import type { ItemInstance } from '../items/types';
import { weaponInfo } from '../items/helpers';

export interface EquippedWeapon {
  item: ItemInstance;
  base: ItemBaseDef;
  weaponClass?: WeaponClass;
  min: number;
  max: number;
  /** Base attacks per second. */
  speed: number;
  /** Melee reach in tiles. */
  range: number;
  strBonus: number;
  dexBonus: number;
  eneBonus: number;
}

export const DEFAULT_WEAPON_SPEED = 1.4;
export const DEFAULT_MELEE_RANGE = 1.5;
export const UNARMED_RANGE = 1.2;

/** Weapon class -> missile used by the basic ranged attack. */
export const RANGED_WEAPON_MISSILE: Partial<Record<WeaponClass, string>> = {
  blasturPistol: 'blasturBolt',
  blasturRifle: 'blasturBolt',
  javelin: 'javelin',
  throwingDisc: 'disc',
};

/**
 * Close-quarters fighting is riskier than shooting from range, so a hero holding a melee weapon
 * gets a built-in edge: more damage, less physical damage taken, and basic swings that cleave
 * through other enemies in front at part damage.
 */
export const MELEE_MASTERY = { enhancedDamage: 30, damageReducedPct: 15, cleavePct: 50, cleaveArcDeg: 120 };

/**
 * Swings take turns between the hands, so a second blade alone only averages the two weapons;
 * fighting with one in each hand makes every swing come quicker.
 */
export const DUAL_WIELD = { attackSpeed: 35 };

/** Is this actor fighting with a melee weapon (players/mercs)? */
export function wieldsMelee(actor: Actor): boolean {
  const wc = getEquippedWeapon(actor)?.weaponClass;
  return !!wc && !RANGED_WEAPON_MISSILE[wc];
}

export function getEquippedWeapon(actor: Actor): EquippedWeapon | undefined {
  if (actor.kind !== 'player' && actor.kind !== 'merc') return undefined;
  return weaponOf(actor.equipment.mainHand);
}

/** The weapon in the off hand when dual wielding (a shield or empty hand is undefined). */
export function getOffHandWeapon(actor: Actor): EquippedWeapon | undefined {
  if (actor.kind !== 'player' && actor.kind !== 'merc') return undefined;
  return weaponOf(actor.equipment.offHand);
}

function weaponOf(item: ItemInstance | undefined): EquippedWeapon | undefined {
  if (!item) return undefined;
  const base = DB.items.get(item.base);
  const info = weaponInfo(item);
  if (!base || !info) return undefined;
  return {
    item,
    base,
    weaponClass: info.weaponClass,
    min: info.min,
    max: info.max,
    speed: info.speed || DEFAULT_WEAPON_SPEED,
    range: info.range || DEFAULT_MELEE_RANGE,
    strBonus: info.strBonus,
    dexBonus: info.dexBonus,
    eneBonus: info.eneBonus,
  };
}

/** Attacks per second with no weapon equipped. */
export const UNARMED_SPEED = 1.6;

/**
 * Average damage per second of the hero's basic attack against one target, before the target's
 * defense and resistances: damage x attack rate, with critical hits doubling the physical part.
 * Matches the attack timing in skills/runtime (weapon speed x attack speed).
 */
export function heroDps(actor: Actor): number {
  const st = actor.stats;
  const w = getEquippedWeapon(actor);
  const ias = Math.max(0.1, st.attackSpeedMul);
  const raw = st.raw ?? {};
  const ds = Math.min(100, raw.deadlyStrike ?? 0) / 100;
  const cs = Math.min(100, raw.criticalStrike ?? 0) / 100;
  const crit = 1 - (1 - ds) * (1 - cs);
  let elem = 0;
  for (const e of Object.values(st.elemental ?? {})) elem += (e.min + e.max) / 2;
  const hit = (min: number, max: number) => ((min + max) / 2) * (1 + crit) + elem;
  const main = hit(st.physMin, st.physMax);
  const mainSec = 1 / ((w ? w.speed : UNARMED_SPEED) * ias);
  const off = getOffHandWeapon(actor);
  if (!off || !st.offHand) return main / mainSec;
  // Swings take turns between the hands, each at its own weapon's speed.
  return (main + hit(st.offHand.physMin, st.offHand.physMax)) / (mainSec + 1 / (off.speed * ias));
}

/**
 * Damage per second of a weapon on its own (its damage x its speed), with the melee bonus
 * included so a saber and a blaster compare fairly.
 */
export function weaponDps(min: number, max: number, speed: number, melee: boolean): number {
  return ((min + max) / 2) * speed * (melee ? 1 + MELEE_MASTERY.enhancedDamage / 100 : 1);
}
