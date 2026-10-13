/**
 * Tile A* (8-directional, no corner cutting) with line-of-sight string pulling.
 * Buffers are module-level and reused between calls (typed arrays + binary heap), so a search
 * allocates only its output. Returns tile-center waypoints (last one is the exact target when the
 * target tile is reachable), excluding the start position.
 */
import type { Vec2 } from '../types';
import { traceTiles } from './grid';
import type { FindPath, TileMap } from './types';

const SQRT2 = Math.SQRT2;
const DEFAULT_MAX_NODES = 6000;

let capacity = 0;
let gScore = new Float32Array(0);
let parent = new Int32Array(0);
let openStamp = new Uint32Array(0);
let closedStamp = new Uint32Array(0);
let stamp = 0;
let heapKeys = new Float32Array(1024);
let heapVals = new Int32Array(1024);
let heapSize = 0;

function ensureCapacity(n: number): void {
  if (n <= capacity) return;
  capacity = n;
  gScore = new Float32Array(n);
  parent = new Int32Array(n);
  openStamp = new Uint32Array(n);
  closedStamp = new Uint32Array(n);
  stamp = 0;
}

function heapPush(key: number, val: number): void {
  if (heapSize >= heapKeys.length) {
    const nk = new Float32Array(heapKeys.length * 2);
    nk.set(heapKeys);
    heapKeys = nk;
    const nv = new Int32Array(heapVals.length * 2);
    nv.set(heapVals);
    heapVals = nv;
  }
  let i = heapSize++;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if ((heapKeys[p] as number) <= key) break;
    heapKeys[i] = heapKeys[p] as number;
    heapVals[i] = heapVals[p] as number;
    i = p;
  }
  heapKeys[i] = key;
  heapVals[i] = val;
}

function heapPop(): number {
  const top = heapVals[0] as number;
  heapSize--;
  if (heapSize > 0) {
    const key = heapKeys[heapSize] as number;
    const val = heapVals[heapSize] as number;
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= heapSize) break;
      if (c + 1 < heapSize && (heapKeys[c + 1] as number) < (heapKeys[c] as number)) c++;
      if ((heapKeys[c] as number) >= key) break;
      heapKeys[i] = heapKeys[c] as number;
      heapVals[i] = heapVals[c] as number;
      i = c;
    }
    heapKeys[i] = key;
    heapVals[i] = val;
  }
  return top;
}

/** Whether `tile` can be stood on, given the clearance ring (0 = just walkable, 1 = all 8 neighbours too). */
function makeOk(map: TileMap, clearance: number, startIdx: number): (i: number) => boolean {
  const { width: w, height: h, walkable } = map;
  if (clearance <= 0) return (i) => walkable[i] === 1;
  return (i) => {
    if (i === startIdx) return true;
    if (walkable[i] !== 1) return false;
    const x = i % w;
    const y = (i - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return false;
    return (
      walkable[i - 1] === 1 &&
      walkable[i + 1] === 1 &&
      walkable[i - w] === 1 &&
      walkable[i + w] === 1 &&
      walkable[i - w - 1] === 1 &&
      walkable[i - w + 1] === 1 &&
      walkable[i + w - 1] === 1 &&
      walkable[i + w + 1] === 1
    );
  };
}

/** Closest tile (by Euclidean distance of tile centers) satisfying `ok`, searching in square rings. */
function nearestOkTile(map: TileMap, tx: number, ty: number, ok: (i: number) => boolean): number {
  const { width: w, height: h } = map;
  const cx = Math.min(w - 1, Math.max(0, tx));
  const cy = Math.min(h - 1, Math.max(0, ty));
  if (ok(cy * w + cx)) return cy * w + cx;
  const maxR = Math.max(w, h);
  let best = -1;
  let bestD = Infinity;
  for (let r = 1; r <= maxR; r++) {
    // any tile in ring r is at least r away; stop once a found candidate beats that bound
    if (best >= 0 && r > bestD + 1) break;
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= h) continue;
      const edge = dy === -r || dy === r;
      const step = edge ? 1 : 2 * r;
      for (let dx = -r; dx <= r; dx += step) {
        const x = cx + dx;
        if (x < 0 || x >= w) continue;
        const i = y * w + x;
        if (!ok(i)) continue;
        const d = Math.hypot(x - tx, y - ty);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
  }
  return best;
}

export const findPath: FindPath = (map, from, to, opts) => {
  const { width: w, height: h } = map;
  const maxNodes = opts?.maxNodes ?? DEFAULT_MAX_NODES;
  const radius = opts?.radius ?? 0;
  const clearance = radius > 0.5 ? 1 : 0;
  const fx = Math.floor(from.x);
  const fy = Math.floor(from.y);
  const startRaw = fy * w + fx;
  const inB = fx >= 0 && fy >= 0 && fx < w && fy < h;
  const baseOk = makeOk(map, clearance, inB ? startRaw : -1);

  // Resolve start tile.
  const plainWalk = (i: number): boolean => map.walkable[i] === 1;
  const startIdx = nearestOkTile(map, fx, fy, inB && baseOk(startRaw) ? baseOk : plainWalk);
  if (startIdx < 0) return null;
  const ok = makeOk(map, clearance, startIdx);

  // Resolve goal tile.
  const tx = Math.floor(to.x);
  const ty = Math.floor(to.y);
  const goalExact = tx >= 0 && ty >= 0 && tx < w && ty < h && ok(ty * w + tx);
  const goalIdx = goalExact ? ty * w + tx : nearestOkTile(map, tx, ty, ok);
  if (goalIdx < 0) return null;
  const gx0 = goalIdx % w;
  const gy0 = (goalIdx - gx0) / w;

  if (startIdx === goalIdx) {
    return [goalExact ? { x: to.x, y: to.y } : { x: gx0 + 0.5, y: gy0 + 0.5 }];
  }

  ensureCapacity(w * h);
  if (++stamp >= 0xfffffff0) {
    openStamp.fill(0);
    closedStamp.fill(0);
    stamp = 1;
  }
  heapSize = 0;

  const heur = (x: number, y: number): number => {
    const dx = Math.abs(x - gx0);
    const dy = Math.abs(y - gy0);
    return dx > dy ? dx + (SQRT2 - 1) * dy : dy + (SQRT2 - 1) * dx;
  };

  const sx = startIdx % w;
  const sy = (startIdx - sx) / w;
  gScore[startIdx] = 0;
  parent[startIdx] = -1;
  openStamp[startIdx] = stamp;
  heapPush(heur(sx, sy), startIdx);

  // Fallback node: closest (to the *requested* target) expanded tile.
  let bestIdx = startIdx;
  let bestD = Math.hypot(sx - to.x, sy - to.y);
  let expanded = 0;
  let found = false;

  while (heapSize > 0) {
    const cur = heapPop();
    if (closedStamp[cur] === stamp) continue;
    closedStamp[cur] = stamp;
    if (cur === goalIdx) {
      found = true;
      break;
    }
    if (++expanded > maxNodes) break;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    const d = Math.hypot(cx + 0.5 - to.x, cy + 0.5 - to.y);
    if (d < bestD) {
      bestD = d;
      bestIdx = cur;
    }
    const g0 = gScore[cur] as number;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = cy + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        if (nx < 0 || nx >= w) continue;
        const ni = ny * w + nx;
        if (closedStamp[ni] === stamp || !ok(ni)) continue;
        let step = 1;
        if (dx !== 0 && dy !== 0) {
          // no corner cutting
          if (!ok(cy * w + nx) || !ok(ny * w + cx)) continue;
          step = SQRT2;
        }
        const ng = g0 + step;
        if (openStamp[ni] === stamp && ng >= (gScore[ni] as number)) continue;
        openStamp[ni] = stamp;
        gScore[ni] = ng;
        parent[ni] = cur;
        heapPush(ng + heur(nx, ny), ni);
      }
    }
  }

  const endIdx = found ? goalIdx : bestIdx;
  if (endIdx === startIdx) return null;

  // Reconstruct tile chain start -> end.
  const chain: number[] = [];
  for (let i = endIdx; i !== -1; i = parent[i] as number) chain.push(i);
  chain.reverse();

  // String pulling with tile-level line of sight.
  const visible = (a: number, b: number): boolean => {
    const ax = a % w;
    const ay = (a - ax) / w;
    const bx = b % w;
    const by = (b - bx) / w;
    return traceTiles(ax + 0.5, ay + 0.5, bx + 0.5, by + 0.5, (x, y) => ok(y * w + x));
  };
  const out: Vec2[] = [];
  let anchor = 0;
  let k = 1;
  while (k < chain.length) {
    // extend as far as possible from the anchor
    let far = k;
    while (far + 1 < chain.length && visible(chain[anchor] as number, chain[far + 1] as number)) far++;
    const idx = chain[far] as number;
    const px = idx % w;
    out.push({ x: px + 0.5, y: (idx - px) / w + 0.5 });
    anchor = far;
    k = far + 1;
  }
  if (found && goalExact && out.length > 0) out[out.length - 1] = { x: to.x, y: to.y };
  return out;
};
