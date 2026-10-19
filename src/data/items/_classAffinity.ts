/**
 * Which weapon classes each hero class fights with. Loot leans toward these (core/loot): drops of
 * a hero's own weapons, and of gear only their class can use, are much more likely.
 */
import type { ClassId } from '../../core/types';
import type { WeaponClass } from '../schema';

export const CLASS_WEAPONS: Record<ClassId, readonly WeaponClass[]> = {
  yediKnight: ['litesaber', 'doubleLitesaber', 'vibroAxe', 'shockBaton'],
  bountyHuntur: ['blasturPistol', 'blasturRifle', 'throwingDisc', 'javelin', 'vibroPike'],
  forseAdept: ['forseStaff', 'kyburFocus'],
};
