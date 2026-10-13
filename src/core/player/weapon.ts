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

export function getEquippedWeapon(actor: Actor): EquippedWeapon | undefined {
  if (actor.kind !== 'player' && actor.kind !== 'merc') return undefined;
  const item = actor.equipment.mainHand;
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
  };
}
