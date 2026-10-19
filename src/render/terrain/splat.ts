/**
 * Pure terrain helpers: splat weights (which ground layer shows where) and vertex heights, built from
 * the tile grid. Tile edges are warped by smooth noise and blurred, so grass meets dirt along organic
 * lines instead of a staircase of squares; heights are averaged across tiles so water and pits get
 * sloped banks.
 */
import type { TileKind } from '../../core/world/types';
import { hash01 } from '../map/chunking';

export interface GroundGrid {
  width: number;
  height: number;
  kinds: readonly TileKind[];
  elevation?: Float32Array | undefined;
}

/** Smooth 2D value noise in [0, 1), deterministic per seed. */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) => hash01(a * 7919 + seed, b * 104729 - seed);
  const top = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * sx;
  const bot = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * sx;
  return top + (bot - top) * sy;
}

export interface SplatOptions {
  /** Texels per tile. */
  res?: number;
  /** Max boundary displacement, in tiles. */
  warp?: number;
  /** Noise frequency of the warp, per tile. */
  warpFreq?: number;
  /** Box-blur radius in texels (applied twice: a soft tent). */
  blur?: number;
  seed?: number;
}

/**
 * RGBA8 splat map, `res` texels per tile, row-major from tile (0,0): channel i = weight of ground
 * layer i (0..3). `layerOf(kind)` picks the layer, or -1 for kinds with no ground of their own (void,
 * walls): those texels borrow the nearest real ground so walls sit on the surrounding floor.
 */
export function buildSplat(
  grid: GroundGrid,
  layerOf: (kind: TileKind) => number,
  opts: SplatOptions = {},
): { data: Uint8Array; width: number; height: number } {
  const res = opts.res ?? 4;
  const warp = opts.warp ?? 0.35;
  const freq = opts.warpFreq ?? 0.7;
  const blur = opts.blur ?? 1;
  const seed = opts.seed ?? 1;
  const { width: W, height: H, kinds } = grid;
  const tw = W * res;
  const th = H * res;

  // Per-tile layer, with -1 tiles filled from their nearest layered neighbor (BFS).
  const tileLayer = new Int8Array(W * H);
  const queue: number[] = [];
  for (let i = 0; i < W * H; i++) {
    tileLayer[i] = layerOf(kinds[i] ?? 'void');
    if (tileLayer[i]! >= 0) queue.push(i);
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (tileLayer[j]! >= 0) continue;
      tileLayer[j] = tileLayer[i]!;
      queue.push(j);
    }
  }
  for (let i = 0; i < W * H; i++) if (tileLayer[i]! < 0) tileLayer[i] = 0;

  // One-hot layer per texel, sampled at a noise-warped position.
  const w = [0, 1, 2, 3].map(() => new Float32Array(tw * th));
  for (let v = 0; v < th; v++) {
    for (let u = 0; u < tw; u++) {
      const x = (u + 0.5) / res;
      const y = (v + 0.5) / res;
      const wx = x + (valueNoise(x * freq, y * freq, seed) - 0.5) * 2 * warp;
      const wy = y + (valueNoise(x * freq + 31.7, y * freq - 17.3, seed + 1) - 0.5) * 2 * warp;
      const tx = Math.min(W - 1, Math.max(0, Math.floor(wx)));
      const ty = Math.min(H - 1, Math.max(0, Math.floor(wy)));
      w[tileLayer[ty * W + tx]!]![v * tw + u] = 1;
    }
  }
  // Separable box blur, twice.
  const tmp = new Float32Array(tw * th);
  const pass = (src: Float32Array, dst: Float32Array, dx: number, dy: number) => {
    for (let v = 0; v < th; v++)
      for (let u = 0; u < tw; u++) {
        let s = 0;
        let n = 0;
        for (let k = -blur; k <= blur; k++) {
          const uu = u + k * dx;
          const vv = v + k * dy;
          if (uu < 0 || vv < 0 || uu >= tw || vv >= th) continue;
          s += src[vv * tw + uu]!;
          n++;
        }
        dst[v * tw + u] = s / n;
      }
  };
  if (blur > 0)
    for (const ch of w)
      for (let r = 0; r < 2; r++) {
        pass(ch, tmp, 1, 0);
        pass(tmp, ch, 0, 1);
      }

  const data = new Uint8Array(tw * th * 4);
  for (let i = 0; i < tw * th; i++) {
    const sum = w[0]![i]! + w[1]![i]! + w[2]![i]! + w[3]![i]! || 1;
    for (let c = 0; c < 4; c++) data[i * 4 + c] = Math.round((w[c]![i]! / sum) * 255);
  }
  return { data, width: tw, height: th };
}

/** Ground surface height of a tile kind (before the level's elevation). */
export function kindDepth(kind: TileKind): number {
  if (kind === 'water') return -0.32;
  if (kind === 'pit') return -0.9;
  return 0;
}

/**
 * Heights of a (W*sub+1) x (H*sub+1) vertex grid: each vertex averages the surface heights of the
 * tiles around it (void tiles ignored), so banks slope between levels. Vertices inside a tile's own
 * area (not on its border) keep that tile's height, which keeps big flat areas flat.
 */
export function vertexHeights(grid: GroundGrid, sub = 2): Float32Array {
  const { width: W, height: H, kinds, elevation } = grid;
  const vw = W * sub + 1;
  const vh = H * sub + 1;
  const out = new Float32Array(vw * vh);
  const tileH = (x: number, y: number): number | null => {
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const k = kinds[y * W + x];
    if (!k || k === 'void') return null;
    return kindDepth(k) + (elevation?.[y * W + x] ?? 0);
  };
  for (let j = 0; j < vh; j++) {
    for (let i = 0; i < vw; i++) {
      // Tiles touching this vertex: on a border it's shared by 2 or 4 tiles.
      const fx = i / sub;
      const fy = j / sub;
      const xs = i % sub === 0 ? [fx - 1, fx] : [Math.floor(fx)];
      const ys = j % sub === 0 ? [fy - 1, fy] : [Math.floor(fy)];
      let s = 0;
      let n = 0;
      for (const y of ys)
        for (const x of xs) {
          const h = tileH(x, y);
          if (h === null) continue;
          s += h;
          n++;
        }
      out[j * vw + i] = n ? s / n : 0;
    }
  }
  return out;
}
