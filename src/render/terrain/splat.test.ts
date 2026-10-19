import { describe, expect, it } from 'vitest';
import type { TileKind } from '../../core/world/types';
import { buildSplat, kindDepth, valueNoise, vertexHeights } from './splat';

const layerOf = (k: TileKind) => ({ grass: 0, road: 1, sand: 2, floor: 3 })[k as string] ?? -1;

function grid(rows: string[]): { width: number; height: number; kinds: TileKind[] } {
  const map: Record<string, TileKind> = {
    g: 'grass',
    r: 'road',
    s: 'sand',
    f: 'floor',
    w: 'wall',
    '~': 'water',
    '.': 'void',
  };
  return {
    width: rows[0]!.length,
    height: rows.length,
    kinds: rows
      .join('')
      .split('')
      .map((c) => map[c]!),
  };
}

const weightAt = (s: ReturnType<typeof buildSplat>, x: number, y: number, ch: number) =>
  s.data[(Math.floor(y * 4) * s.width + Math.floor(x * 4)) * 4 + ch]!;

describe('valueNoise', () => {
  it('is deterministic, in [0,1) and continuous', () => {
    expect(valueNoise(3.3, 7.1, 5)).toBe(valueNoise(3.3, 7.1, 5));
    for (let i = 0; i < 200; i++) {
      const v = valueNoise(i * 0.37, i * 0.11, 2);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(Math.abs(valueNoise(i * 0.37 + 0.001, i * 0.11, 2) - v)).toBeLessThan(0.01);
    }
  });
});

describe('buildSplat', () => {
  const g = grid(['gggggrrrrr', 'gggggrrrrr', 'gggggrrrrr', 'gggggrrrrr', 'gggggrrrrr', 'gggggrrrrr']);

  it('has res texels per tile and weights that sum to ~1', () => {
    const s = buildSplat(g, layerOf, { res: 4 });
    expect(s.width).toBe(40);
    expect(s.height).toBe(24);
    for (let i = 0; i < s.width * s.height; i++) {
      const sum = s.data[i * 4]! + s.data[i * 4 + 1]! + s.data[i * 4 + 2]! + s.data[i * 4 + 3]!;
      expect(Math.abs(sum - 255)).toBeLessThanOrEqual(2);
    }
  });

  it('is pure layer away from boundaries and blends across them', () => {
    const s = buildSplat(g, layerOf, { res: 4, warp: 0.35 });
    expect(weightAt(s, 1.5, 3.5, 0)).toBe(255);
    expect(weightAt(s, 8.5, 3.5, 1)).toBe(255);
    // some texel near the grass/road border is mixed
    let mixed = 0;
    for (let y = 0; y < 6; y += 0.25) {
      const w = weightAt(s, 5, y, 0);
      if (w > 20 && w < 235) mixed++;
    }
    expect(mixed).toBeGreaterThan(5);
  });

  it('warps the border so it is not a straight line', () => {
    const s = buildSplat(g, layerOf, { res: 4, warp: 0.4, blur: 0 });
    const borderX = (y: number) => {
      for (let x = 0; x < 10; x += 0.25) if (weightAt(s, x, y, 1) > 127) return x;
      return 10;
    };
    const xs = new Set([0.5, 1.5, 2.5, 3.5, 4.5, 5.5].map(borderX));
    expect(xs.size).toBeGreaterThan(1);
  });

  it('gives walls and void the ground around them', () => {
    const s = buildSplat(grid(['sss', 'sws', 'sss']), layerOf, { res: 4, blur: 0, warp: 0 });
    expect(weightAt(s, 1.5, 1.5, 2)).toBe(255);
  });
});

describe('vertexHeights', () => {
  it('keeps flat ground flat and slopes banks into water', () => {
    const g = grid(['ggggg', 'gg~gg', 'ggggg']);
    const h = vertexHeights(g, 2);
    const vw = 11;
    expect(h[0]).toBe(0);
    // water tile center (tile 2,1 -> vertex 5,3) is the water bed
    expect(h[3 * vw + 5]).toBeCloseTo(kindDepth('water'), 6);
    // its corners are shared with grass: halfway-ish
    const corner = h[2 * vw + 4]!;
    expect(corner).toBeLessThan(0);
    expect(corner).toBeGreaterThan(kindDepth('water'));
  });

  it('ignores void tiles and adds level elevation', () => {
    const g = { ...grid(['.g']), elevation: new Float32Array([0, 1.5]) };
    const h = vertexHeights(g, 2);
    expect(h[0 * 5 + 2]).toBeCloseTo(1.5, 6);
    expect(h[1 * 5 + 3]).toBeCloseTo(1.5, 6);
  });
});
