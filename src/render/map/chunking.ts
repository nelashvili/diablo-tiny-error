/** Pure chunk-grid helpers for the map renderer. */

export const CHUNK_SIZE = 16;

export interface ChunkGrid {
  cols: number;
  rows: number;
  size: number;
}

export function chunkGrid(width: number, height: number, size = CHUNK_SIZE): ChunkGrid {
  return { cols: Math.ceil(width / size), rows: Math.ceil(height / size), size };
}

export function chunkIndexOf(g: ChunkGrid, tx: number, ty: number): number {
  return Math.floor(ty / g.size) * g.cols + Math.floor(tx / g.size);
}

export function chunkRect(g: ChunkGrid, index: number, width: number, height: number) {
  const cx = index % g.cols;
  const cy = Math.floor(index / g.cols);
  const x0 = cx * g.size;
  const y0 = cy * g.size;
  return { x0, y0, x1: Math.min(width, x0 + g.size), y1: Math.min(height, y0 + g.size) };
}

/** Tile counts per kind per chunk (skipping `skip` kinds). */
export function countKindsPerChunk(
  kinds: readonly string[],
  width: number,
  height: number,
  size = CHUNK_SIZE,
  skip: ReadonlySet<string> = new Set(['void']),
): Map<string, number>[] {
  const g = chunkGrid(width, height, size);
  const out: Map<string, number>[] = Array.from({ length: g.cols * g.rows }, () => new Map());
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = kinds[y * width + x];
      if (k === undefined || skip.has(k)) continue;
      const m = out[chunkIndexOf(g, x, y)];
      if (m) m.set(k, (m.get(k) ?? 0) + 1);
    }
  }
  return out;
}

/** Cheap deterministic hash -> [0,1). */
export function hash01(a: number, b = 0): number {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
