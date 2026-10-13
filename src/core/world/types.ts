/**
 * World / map contracts.
 *
 * CONTRACT FILE — frozen after Wave 0. Additive changes only, coordinated by the lead.
 *
 * A level map is a grid of TILES (1 world unit each). Each tile has a walkability flag and a
 * visual tile type the renderer maps to models from the act's tileset.
 */
import type { DefId, Vec2 } from '../types';
import type { LevelGenKind } from '../../data/schema';

/** Visual/semantic tile kinds. Renderer picks meshes per (tileset, kind, variant). */
export type TileKind =
  | 'void' // nothing (outside map)
  | 'floor'
  | 'wall'
  | 'door'
  | 'water' // not walkable, visible
  | 'pit' // not walkable
  | 'bridge'
  | 'stairsDown'
  | 'stairsUp'
  | 'road'
  | 'grass'
  | 'sand'
  | 'rock'; // blocking decoration

export interface TileMap {
  width: number;
  height: number;
  /** Row-major, length = width*height. */
  kinds: TileKind[];
  /** 0..255 visual variant per tile for variety. */
  variants: Uint8Array;
  /** 1 = walkable, 0 = blocked. Row-major. */
  walkable: Uint8Array;
  /** 1 = blocks line of sight / missiles. */
  blocksMissiles: Uint8Array;
  /** Elevation in tiles for render only (0 for flat). Optional. */
  elevation?: Float32Array;
}

export type PlacementKind =
  | 'playerStart'
  | 'waypoint'
  | 'exit'
  | 'monsterPack'
  | 'boss'
  | 'chest'
  | 'shrine'
  | 'npc'
  | 'stash'
  | 'prop'
  | 'questObject'
  | 'light';

export interface Placement {
  kind: PlacementKind;
  pos: Vec2;
  /** Def id: monster/boss/npc/object/prop model, or target level for exits. */
  ref?: DefId;
  facing?: number;
  data?: Record<string, number | string | boolean>;
}

export interface GeneratedLevel {
  levelId: DefId;
  seed: number;
  map: TileMap;
  placements: Placement[];
  /** Rooms or regions for AI/minimap/fog. */
  regions: { x: number; y: number; w: number; h: number; tag?: string }[];
}

/** Generators implement this (core/world/mapgen, Wave 1). */
export interface LevelGenerator {
  kind: LevelGenKind;
  generate(levelId: DefId, params: Record<string, unknown>, seed: number): GeneratedLevel;
}

/** Pathfinding signature (core/world/pathfinding, Wave 1). Returns tile-center waypoints or null. */
export type FindPath = (
  map: TileMap,
  from: Vec2,
  to: Vec2,
  opts?: { maxNodes?: number; radius?: number },
) => Vec2[] | null;

export const tileIndex = (map: TileMap, x: number, y: number): number => y * map.width + x;
export const inBounds = (map: TileMap, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < map.width && y < map.height;
export const isWalkable = (map: TileMap, x: number, y: number): boolean => {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  return inBounds(map, tx, ty) && map.walkable[tileIndex(map, tx, ty)] === 1;
};
