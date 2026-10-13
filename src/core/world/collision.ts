/** Entity broad-phase (SpatialHash) and tile-map collision helpers. */
import type { EntityId, Vec2 } from '../types';
import { traceTiles } from './grid';
import { inBounds, isWalkable } from './types';
import type { TileMap } from './types';

// ------------------------------------------------------------------ SpatialHash

const KEY_OFFSET = 1 << 14;
const cellKey = (cx: number, cy: number): number => (cy + KEY_OFFSET) * 32768 + (cx + KEY_OFFSET);

/** Uniform-grid spatial hash over point entities. Positions are in tiles. */
export class SpatialHash {
  private cells = new Map<number, EntityId[]>();
  private pos = new Map<EntityId, { x: number; y: number; key: number }>();

  constructor(readonly cellSize = 4) {}

  get size(): number {
    return this.pos.size;
  }

  has(id: EntityId): boolean {
    return this.pos.has(id);
  }

  private keyFor(x: number, y: number): number {
    return cellKey(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
  }

  insert(id: EntityId, x: number, y: number): void {
    if (this.pos.has(id)) {
      this.update(id, x, y);
      return;
    }
    const key = this.keyFor(x, y);
    this.pos.set(id, { x, y, key });
    let cell = this.cells.get(key);
    if (!cell) this.cells.set(key, (cell = []));
    cell.push(id);
  }

  update(id: EntityId, x: number, y: number): void {
    const p = this.pos.get(id);
    if (!p) {
      this.insert(id, x, y);
      return;
    }
    const key = this.keyFor(x, y);
    p.x = x;
    p.y = y;
    if (key === p.key) return;
    this.removeFromCell(id, p.key);
    p.key = key;
    let cell = this.cells.get(key);
    if (!cell) this.cells.set(key, (cell = []));
    cell.push(id);
  }

  remove(id: EntityId): void {
    const p = this.pos.get(id);
    if (!p) return;
    this.removeFromCell(id, p.key);
    this.pos.delete(id);
  }

  clear(): void {
    this.cells.clear();
    this.pos.clear();
  }

  position(id: EntityId): Vec2 | undefined {
    const p = this.pos.get(id);
    return p ? { x: p.x, y: p.y } : undefined;
  }

  private removeFromCell(id: EntityId, key: number): void {
    const cell = this.cells.get(key);
    if (!cell) return;
    const i = cell.indexOf(id);
    if (i < 0) return;
    cell[i] = cell[cell.length - 1] as EntityId;
    cell.pop();
    if (cell.length === 0) this.cells.delete(key);
  }

  /** All ids within `radius` of (x, y). Pass `out` to reuse an array. Order is unspecified. */
  queryRadius(x: number, y: number, radius: number, out: EntityId[] = []): EntityId[] {
    const cs = this.cellSize;
    const r2 = radius * radius;
    const x0 = Math.floor((x - radius) / cs);
    const x1 = Math.floor((x + radius) / cs);
    const y0 = Math.floor((y - radius) / cs);
    const y1 = Math.floor((y + radius) / cs);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells.get(cellKey(cx, cy));
        if (!cell) continue;
        for (const id of cell) {
          const p = this.pos.get(id) as { x: number; y: number };
          const dx = p.x - x;
          const dy = p.y - y;
          if (dx * dx + dy * dy <= r2) out.push(id);
        }
      }
    return out;
  }

  /** Nearest id within `maxRadius` passing `filter` (ties -> lowest id, for determinism). */
  queryNearest(
    x: number,
    y: number,
    maxRadius: number,
    filter?: (id: EntityId) => boolean,
  ): EntityId | undefined {
    let best: EntityId | undefined;
    let bestD = maxRadius * maxRadius;
    const cs = this.cellSize;
    const x0 = Math.floor((x - maxRadius) / cs);
    const x1 = Math.floor((x + maxRadius) / cs);
    const y0 = Math.floor((y - maxRadius) / cs);
    const y1 = Math.floor((y + maxRadius) / cs);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells.get(cellKey(cx, cy));
        if (!cell) continue;
        for (const id of cell) {
          const p = this.pos.get(id) as { x: number; y: number };
          const dx = p.x - x;
          const dy = p.y - y;
          const d = dx * dx + dy * dy;
          if (d > bestD || (d === bestD && best !== undefined && id > best)) continue;
          if (filter && !filter(id)) continue;
          bestD = d;
          best = id;
        }
      }
    return best;
  }
}

// ------------------------------------------------------------------ line of sight

/**
 * True if nothing with `blocksMissiles` lies on the segment a -> b. The origin tile is ignored
 * (a caster standing against a wall can still shoot away from it); out-of-bounds blocks.
 */
export function lineOfSight(map: TileMap, a: Vec2, b: Vec2): boolean {
  const ax = Math.floor(a.x);
  const ay = Math.floor(a.y);
  return traceTiles(a.x, a.y, b.x, b.y, (tx, ty) => {
    if (tx === ax && ty === ay) return true;
    if (!inBounds(map, tx, ty)) return false;
    return map.blocksMissiles[ty * map.width + tx] === 0;
  });
}

// ------------------------------------------------------------------ movement

/** Does a circle at (x, y) with `radius` overlap any non-walkable tile? */
export function circleBlocked(map: TileMap, x: number, y: number, radius: number): boolean {
  const x0 = Math.floor(x - radius);
  const x1 = Math.floor(x + radius);
  const y0 = Math.floor(y - radius);
  const y1 = Math.floor(y + radius);
  const r2 = radius * radius;
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      if (inBounds(map, tx, ty) && map.walkable[ty * map.width + tx] === 1) continue;
      const cx = Math.max(tx, Math.min(x, tx + 1));
      const cy = Math.max(ty, Math.min(y, ty + 1));
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy < r2) return true;
    }
  return false;
}

/** Closest walkable tile center to `pos` (returns `pos` itself if already walkable). null if none. */
export function nearestWalkable(map: TileMap, pos: Vec2): Vec2 | null {
  if (isWalkable(map, pos.x, pos.y)) return { x: pos.x, y: pos.y };
  const tx = Math.floor(pos.x);
  const ty = Math.floor(pos.y);
  const maxR = Math.max(map.width, map.height);
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (let r = 1; r <= maxR; r++) {
    if (best && r > bestD + 1) break;
    for (let dy = -r; dy <= r; dy++) {
      const edge = dy === -r || dy === r;
      const step = edge ? 1 : 2 * r;
      for (let dx = -r; dx <= r; dx += step) {
        const x = tx + dx;
        const y = ty + dy;
        if (!inBounds(map, x, y) || map.walkable[y * map.width + x] !== 1) continue;
        const d = Math.hypot(x + 0.5 - pos.x, y + 0.5 - pos.y);
        if (d < bestD) {
          bestD = d;
          best = { x: x + 0.5, y: y + 0.5 };
        }
      }
    }
  }
  return best;
}

/**
 * Move a circle by `delta`, sliding along walls (axis-separated, sub-stepped so fast movers
 * can't tunnel). Returns the new position. If `pos` starts inside a wall it is first pushed out.
 */
export function moveWithCollision(map: TileMap, pos: Vec2, delta: Vec2, radius = 0.3): Vec2 {
  let x = pos.x;
  let y = pos.y;
  if (circleBlocked(map, x, y, radius)) {
    const n = nearestWalkable(map, pos);
    if (n) {
      x = n.x;
      y = n.y;
    }
  }
  const dist = Math.hypot(delta.x, delta.y);
  if (dist === 0) return { x, y };
  const steps = Math.max(1, Math.ceil(dist / Math.max(0.1, radius * 0.8)));
  const sx = delta.x / steps;
  const sy = delta.y / steps;
  for (let i = 0; i < steps; i++) {
    if (sx !== 0 && !circleBlocked(map, x + sx, y, radius)) x += sx;
    if (sy !== 0 && !circleBlocked(map, x, y + sy, radius)) y += sy;
  }
  return { x, y };
}
