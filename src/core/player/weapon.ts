/** Equipped weapon lookup shared by stats, skills and the HUD. */
import { DB } from '../../data/db';
import type { ItemBaseDef, WeaponClass } from '../../data/schema';
import type { Actor } from '../sim/entities';
import type { ItemInstance } from '../items/types';

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

/** D2 str/dex damage bonus (% per point). */
export const WEAPON_STAT_BONUS: Record<WeaponClass, { strBonus: number; dexBonus: number }> = {
  litesaber: { strBonus: 100, dexBonus: 0 },
  doubleLitesaber: { strBonus: 100, dexBonus: 0 },
  vibroAxe: { strBonus: 100, dexBonus: 0 },
  shockBaton: { strBonus: 100, dexBonus: 0 },
  vibroPike: { strBonus: 100, dexBonus: 0 },
  throwingDisc: { strBonus: 75, dexBonus: 75 },
  javelin: { strBonus: 75, dexBonus: 75 },
  blasturPistol: { strBonus: 0, dexBonus: 100 },
  blasturRifle: { strBonus: 0, dexBonus: 100 },
  forseStaff: { strBonus: 100, dexBonus: 0 },
  kyburFocus: { strBonus: 100, dexBonus: 0 },
};

export function getEquippedWeapon(actor: Actor): EquippedWeapon | undefined {
  if (actor.kind !== 'player' && actor.kind !== 'merc') return undefined;
  const item = actor.equipment.mainHand;
  if (!item) return undefined;
  const base = DB.items.get(item.base);
  if (!base || base.category !== 'weapon' || !base.damage) return undefined;
  return {
    item,
    base,
    weaponClass: base.weaponClass,
    min: base.damage.min,
    max: base.damage.max,
    speed: base.speed ?? DEFAULT_WEAPON_SPEED,
    range: base.range ?? DEFAULT_MELEE_RANGE,
  };
}
