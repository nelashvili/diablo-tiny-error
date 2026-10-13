/**
 * Shared primitive types for the whole game.
 *
 * CONTRACT FILE — frozen after Wave 0. Additive changes only, coordinated by the lead.
 *
 * Coordinate system: the simulation works on a 2D ground plane measured in TILES.
 * 1 tile = 1 world unit. +x is "east" on the map grid, +y is "south".
 * The renderer maps sim (x, y) -> Three.js (x, 0, y) and views it with an isometric camera.
 */

export type EntityId = number;
export type DefId = string;

export interface Vec2 {
  x: number;
  y: number;
}

/** Simulation runs at a fixed 25 ticks per second, like Diablo II. */
export const TICK_RATE = 25;
export const TICK_SECONDS = 1 / TICK_RATE;

export type ClassId = 'yediKnight' | 'bountyHuntur' | 'forseAdept';
export const CLASS_IDS: readonly ClassId[] = ['yediKnight', 'bountyHuntur', 'forseAdept'];

/** D2 fire/cold/lightning/poison map to plasma/cryo/storm/toxin. 'magic' is untyped magic damage. */
export type DamageType = 'physical' | 'plasma' | 'cryo' | 'storm' | 'toxin' | 'magic';
export const DAMAGE_TYPES: readonly DamageType[] = ['physical', 'plasma', 'cryo', 'storm', 'toxin', 'magic'];
export type ElementalType = 'plasma' | 'cryo' | 'storm' | 'toxin';

export type Difficulty = 'normal' | 'veteran' | 'legend';
export const DIFFICULTIES: readonly Difficulty[] = ['normal', 'veteran', 'legend'];

export type ActId = 1 | 2 | 3 | 4;

export type Team = 'players' | 'monsters' | 'neutral';

export type ItemQuality = 'inferior' | 'normal' | 'magic' | 'rare' | 'set' | 'unique' | 'crafted';

export type EquipSlot =
  'head' | 'chest' | 'gloves' | 'belt' | 'boots' | 'mainHand' | 'offHand' | 'ring1' | 'ring2' | 'amulet';

export interface Range {
  min: number;
  max: number;
}
