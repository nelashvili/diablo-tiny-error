import type { Vec2 } from '../types';
import type { TileMap } from '../world/types';
import { inBounds, tileIndex } from '../world/types';

/** True if the tile under (x, y) blocks line of sight / missiles. Out of bounds blocks. */
export function blocksSight(map: TileMap, x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!inBounds(map, tx, ty)) return true;
  return map.blocksMissiles[tileIndex(map, tx, ty)] === 1;
}

/** Simple sampled tile raycast between two points (0.25 tile steps). */
export function lineOfSight(map: TileMap | undefined, a: Vec2, b: Vec2): boolean {
  if (!map) return true;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const steps = Math.ceil(dist / 0.25);
  for (let i = 1; i < steps; i++) {
    const f = i / steps;
    if (blocksSight(map, a.x + dx * f, a.y + dy * f)) return false;
  }
  return true;
}
