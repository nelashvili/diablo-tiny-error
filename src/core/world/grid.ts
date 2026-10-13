/** Low-level tile grid helpers shared by map generators, pathfinding and collision. */
import type { Vec2 } from '../types';
import type { TileKind, TileMap } from './types';

export const KIND_WALKABLE: Record<TileKind, 0 | 1> = {
  void: 0,
  floor: 1,
  wall: 0,
  door: 1,
  water: 0,
  pit: 0,
  bridge: 1,
  stairsDown: 1,
  stairsUp: 1,
  road: 1,
  grass: 1,
  sand: 1,
  rock: 0,
};

export const KIND_BLOCKS_MISSILES: Record<TileKind, 0 | 1> = {
  void: 1,
  floor: 0,
  wall: 1,
  door: 0,
  water: 0,
  pit: 0,
  bridge: 0,
  stairsDown: 0,
  stairsUp: 0,
  road: 0,
  grass: 0,
  sand: 0,
  rock: 1,
};

export function createMap(width: number, height: number, fill: TileKind): TileMap {
  const n = width * height;
  return {
    width,
    height,
    kinds: new Array<TileKind>(n).fill(fill),
    variants: new Uint8Array(n),
    walkable: new Uint8Array(n).fill(KIND_WALKABLE[fill]),
    blocksMissiles: new Uint8Array(n).fill(KIND_BLOCKS_MISSILES[fill]),
  };
}

export function setKindAt(map: TileMap, i: number, kind: TileKind): void {
  map.kinds[i] = kind;
  map.walkable[i] = KIND_WALKABLE[kind];
  map.blocksMissiles[i] = KIND_BLOCKS_MISSILES[kind];
}

export function setKind(map: TileMap, x: number, y: number, kind: TileKind): void {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
  setKindAt(map, y * map.width + x, kind);
}

export function kindAt(map: TileMap, x: number, y: number): TileKind {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return 'void';
  return map.kinds[y * map.width + x] as TileKind;
}

export function walkableAt(map: TileMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height && map.walkable[y * map.width + x] === 1;
}

export const center = (x: number, y: number): Vec2 => ({ x: x + 0.5, y: y + 0.5 });

/** 4-connected BFS distance field from a tile (-1 = unreachable). */
export function distanceField(map: TileMap, sx: number, sy: number): Int32Array {
  const { width: w, height: h } = map;
  const dist = new Int32Array(w * h).fill(-1);
  if (!walkableAt(map, sx, sy)) return dist;
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const s = sy * w + sx;
  dist[s] = 0;
  queue[tail++] = s;
  while (head < tail) {
    const i = queue[head++] as number;
    const x = i % w;
    const y = (i - x) / w;
    const d = (dist[i] as number) + 1;
    if (x > 0 && map.walkable[i - 1] === 1 && dist[i - 1] === -1) {
      dist[i - 1] = d;
      queue[tail++] = i - 1;
    }
    if (x < w - 1 && map.walkable[i + 1] === 1 && dist[i + 1] === -1) {
      dist[i + 1] = d;
      queue[tail++] = i + 1;
    }
    if (y > 0 && map.walkable[i - w] === 1 && dist[i - w] === -1) {
      dist[i - w] = d;
      queue[tail++] = i - w;
    }
    if (y < h - 1 && map.walkable[i + w] === 1 && dist[i + w] === -1) {
      dist[i + w] = d;
      queue[tail++] = i + w;
    }
  }
  return dist;
}

/** Carve a filled disc of `kind`. Only touches tiles inside [1, size-2] so borders survive. */
export function carveDisc(map: TileMap, cx: number, cy: number, r: number, kind: TileKind): void {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 1 || y < 1 || x > map.width - 2 || y > map.height - 2) continue;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) setKind(map, x, y, kind);
    }
}

/** Straight L-shaped dig between two tiles, only converting blocked tiles. */
export function digL(
  map: TileMap,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  kind: TileKind,
  horizontalFirst = true,
): void {
  const dig = (x: number, y: number): void => {
    if (x < 1 || y < 1 || x > map.width - 2 || y > map.height - 2) return;
    if (!walkableAt(map, x, y)) setKind(map, x, y, kind);
  };
  const sx = Math.sign(bx - ax);
  const sy = Math.sign(by - ay);
  let x = ax;
  let y = ay;
  dig(x, y);
  const stepX = (): void => {
    while (x !== bx) {
      x += sx;
      dig(x, y);
    }
  };
  const stepY = (): void => {
    while (y !== by) {
      y += sy;
      dig(x, y);
    }
  };
  if (horizontalFirst) {
    stepX();
    stepY();
  } else {
    stepY();
    stepX();
  }
}

/**
 * Supercover line traversal between two points (world coords). Calls `visit(tx, ty)` for every tile
 * the segment touches; stops early (returns false) if visit returns false. Exact corner crossings
 * visit both adjacent tiles, so diagonal squeezing between two blocked tiles is detected.
 */
export function traceTiles(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  visit: (tx: number, ty: number) => boolean,
): boolean {
  let tx = Math.floor(x0);
  let ty = Math.floor(y0);
  const ex = Math.floor(x1);
  const ey = Math.floor(y1);
  if (!visit(tx, ty)) return false;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const sx = dx > 0 ? 1 : -1;
  const sy = dy > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  let tMaxX = dx === 0 ? Infinity : (dx > 0 ? tx + 1 - x0 : x0 - tx) * tDeltaX;
  let tMaxY = dy === 0 ? Infinity : (dy > 0 ? ty + 1 - y0 : y0 - ty) * tDeltaY;
  let guard = Math.abs(ex - tx) + Math.abs(ey - ty) + 2;
  while ((tx !== ex || ty !== ey) && guard-- > 0) {
    const diff = tMaxX - tMaxY;
    if (Math.abs(diff) < 1e-9) {
      // exact corner: touch both side tiles, then the diagonal one
      if (!visit(tx + sx, ty)) return false;
      if (!visit(tx, ty + sy)) return false;
      tx += sx;
      ty += sy;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    } else if (diff < 0) {
      tx += sx;
      tMaxX += tDeltaX;
    } else {
      ty += sy;
      tMaxY += tDeltaY;
    }
    if (!visit(tx, ty)) return false;
  }
  return true;
}
