import { describe, expect, it } from 'vitest';
import { chunkGrid, chunkIndexOf, chunkRect, countKindsPerChunk, hash01 } from './chunking';
import { rectContains, rectsOverlap } from '../culling/viewRect';

describe('chunking', () => {
  it('computes grid dimensions and indices', () => {
    const g = chunkGrid(40, 20, 16);
    expect(g).toEqual({ cols: 3, rows: 2, size: 16 });
    expect(chunkIndexOf(g, 0, 0)).toBe(0);
    expect(chunkIndexOf(g, 17, 3)).toBe(1);
    expect(chunkIndexOf(g, 39, 19)).toBe(5);
  });
  it('clamps edge chunk rects', () => {
    const g = chunkGrid(40, 20, 16);
    expect(chunkRect(g, 5, 40, 20)).toEqual({ x0: 32, y0: 16, x1: 40, y1: 20 });
  });
  it('counts kinds per chunk and skips void', () => {
    const w = 20;
    const h = 4;
    const kinds = new Array<string>(w * h).fill('void');
    kinds[0] = 'floor';
    kinds[1] = 'floor';
    kinds[17] = 'wall';
    kinds[w + 18] = 'wall';
    const c = countKindsPerChunk(kinds, w, h, 16);
    expect(c.length).toBe(2);
    expect(c[0]?.get('floor')).toBe(2);
    expect(c[0]?.has('void')).toBe(false);
    expect(c[1]?.get('wall')).toBe(2);
    let total = 0;
    for (const m of c) for (const n of m.values()) total += n;
    expect(total).toBe(4);
  });
  it('hash01 is deterministic and in range', () => {
    expect(hash01(5, 9)).toBe(hash01(5, 9));
    let sum = 0;
    for (let i = 0; i < 1000; i++) {
      const v = hash01(i, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 1000).toBeGreaterThan(0.4);
    expect(sum / 1000).toBeLessThan(0.6);
  });
});

describe('view rect', () => {
  const r = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
  it('contains / overlaps', () => {
    expect(rectContains(r, 5, 5)).toBe(true);
    expect(rectContains(r, 11, 5)).toBe(false);
    expect(rectsOverlap(r, 9, 12, 9, 12)).toBe(true);
    expect(rectsOverlap(r, 11, 12, 0, 1)).toBe(false);
  });
});
