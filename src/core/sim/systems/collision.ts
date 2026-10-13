/** Tile collision helpers: walking, sliding and ray tests against the level TileMap. */
import type { Vec2 } from '../../types';
import { inBounds, tileIndex, type TileMap } from '../../world/types';

const EPS = 1e-4;

/** Max collision radius used against walls (keeps 1-tile corridors passable for big actors). */
export const MAX_WALL_RADIUS = 0.4;

export function canStand(map: TileMap | null | undefined, x: number, y: number, r: number): boolean {
  if (!map) return true;
  const rr = Math.min(r, MAX_WALL_RADIUS);
  const x0 = Math.floor(x - rr + EPS);
  const x1 = Math.floor(x + rr - EPS);
  const y0 = Math.floor(y - rr + EPS);
  const y1 = Math.floor(y + rr - EPS);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      if (!inBounds(map, tx, ty) || map.walkable[tileIndex(map, tx, ty)] !== 1) return false;
  return true;
}

/**
 * Move `pos` by (dx,dy) sliding along walls. Mutates pos. Returns the distance actually moved.
 * An actor already inside a wall may move freely so it can get out.
 */
export function moveWithCollision(
  map: TileMap | null | undefined,
  pos: Vec2,
  dx: number,
  dy: number,
  r: number,
): number {
  if (!map || !canStand(map, pos.x, pos.y, r)) {
    pos.x += dx;
    pos.y += dy;
    return Math.hypot(dx, dy);
  }
  const nx = pos.x + dx;
  const ny = pos.y + dy;
  if (canStand(map, nx, ny, r)) {
    pos.x = nx;
    pos.y = ny;
    return Math.hypot(dx, dy);
  }
  let moved = 0;
  if (dx !== 0 && canStand(map, nx, pos.y, r)) {
    moved += Math.abs(dx);
    pos.x = nx;
  } else if (dy !== 0 && canStand(map, pos.x, ny, r)) {
    moved += Math.abs(dy);
    pos.y = ny;
  }
  return moved;
}

export function blocksMissilesAt(map: TileMap | null | undefined, x: number, y: number): boolean {
  if (!map) return false;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!inBounds(map, tx, ty)) return true;
  return map.blocksMissiles[tileIndex(map, tx, ty)] === 1;
}

/** First point along from->to (inclusive of `to`) that is blocked, or null. Step 0.25 tiles. */
export function firstBlocked(
  map: TileMap | null | undefined,
  from: Vec2,
  to: Vec2,
  kind: 'missile' | 'walk',
): Vec2 | null {
  if (!map) return null;
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  const n = Math.max(1, Math.ceil(d / 0.25));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    const blocked = kind === 'missile' ? blocksMissilesAt(map, x, y) : !canStand(map, x, y, 0.1);
    if (blocked) return { x, y };
  }
  return null;
}

/** Furthest standable point along from->to (walking, stops at walls). */
export function furthestWalkable(map: TileMap | null | undefined, from: Vec2, to: Vec2, r: number): Vec2 {
  if (!map) return { x: to.x, y: to.y };
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  const n = Math.max(1, Math.ceil(d / 0.25));
  let last: Vec2 = { x: from.x, y: from.y };
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    if (!canStand(map, x, y, r)) break;
    last = { x, y };
  }
  return last;
}

/** Nearest standable point to `to` searching back toward `from` (teleport ignoring walls en route). */
export function nearestStandable(map: TileMap | null | undefined, from: Vec2, to: Vec2, r: number): Vec2 {
  if (!map || canStand(map, to.x, to.y, r)) return { x: to.x, y: to.y };
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  const n = Math.max(1, Math.ceil(d / 0.25));
  for (let i = n - 1; i >= 0; i--) {
    const t = i / n;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    if (canStand(map, x, y, r)) return { x, y };
  }
  return { x: from.x, y: from.y };
}
