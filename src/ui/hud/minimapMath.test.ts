import { describe, expect, it } from 'vitest';
import type { TileKind, TileMap } from '../../core/world/types';
import {
  applyAffine,
  classifyTiles,
  fitScale,
  isoAngle,
  isoProject,
  minimapTransform,
  revealCircle,
  TILE_FLOOR,
  TILE_NONE,
  TILE_PORTAL,
  TILE_WALL,
  TILE_WATER,
} from './minimapMath';

function map(rows: string[]): TileMap {
  const h = rows.length;
  const w = rows[0]!.length;
  const kinds: TileKind[] = [];
  const walkable = new Uint8Array(w * h);
  rows.forEach((r, y) =>
    [...r].forEach((c, x) => {
      const k: TileKind = c === '.' ? 'floor' : c === '~' ? 'water' : c === '>' ? 'stairsDown' : 'void';
      kinds.push(k);
      walkable[y * w + x] = c === '.' || c === '>' ? 1 : 0;
    }),
  );
  return { width: w, height: h, kinds, variants: new Uint8Array(w * h), walkable, blocksMissiles: walkable };
}

describe('iso projection', () => {
  it('maps +x down-right and +y down-left', () => {
    const px = isoProject(1, 0, 10);
    const py = isoProject(0, 1, 10);
    expect(px.x).toBeGreaterThan(0);
    expect(px.y).toBeGreaterThan(0);
    expect(py.x).toBeLessThan(0);
    expect(py.y).toBeGreaterThan(0);
    expect(px.y).toBeCloseTo(px.x / 2); // 2:1 iso diamond
  });

  it('transform puts the center at the canvas center and agrees with isoProject', () => {
    const m = minimapTransform({ x: 10, y: 20 }, 8, 100, 50);
    expect(applyAffine(m, { x: 10, y: 20 })).toEqual({ x: 100, y: 50 });
    const p = applyAffine(m, { x: 13, y: 18 });
    const d = isoProject(3, -2, 8);
    expect(p.x).toBeCloseTo(100 + d.x);
    expect(p.y).toBeCloseTo(50 + d.y);
  });

  it('facing angles follow the projection', () => {
    expect(isoAngle(0)).toBeCloseTo(Math.atan2(0.5, 1)); // east -> down-right
    expect(isoAngle(Math.PI / 4)).toBeCloseTo(Math.PI / 2); // south-east -> straight down
  });

  it('fitScale fits the projected map in the box', () => {
    const s = fitScale(40, 40, 400, 400);
    const right = isoProject(40, 0, s).x - isoProject(0, 40, s).x;
    expect(right).toBeLessThanOrEqual(400 + 1e-9);
    expect(fitScale(0, 0, 10, 10)).toBe(1);
  });
});

describe('classifyTiles', () => {
  it('marks floors, wall outlines, water and portals', () => {
    const m = map(['#####', '#..>#', '#####', '~~###', '#####']);
    const c = classifyTiles(m);
    const at = (x: number, y: number) => c[y * 5 + x];
    expect(at(1, 1)).toBe(TILE_FLOOR);
    expect(at(3, 1)).toBe(TILE_PORTAL);
    expect(at(0, 0)).toBe(TILE_WALL);
    expect(at(4, 2)).toBe(TILE_WALL);
    expect(at(0, 3)).toBe(TILE_WATER);
    expect(at(4, 4)).toBe(TILE_NONE);
  });
});

describe('revealCircle', () => {
  it('reveals only new tiles inside the radius', () => {
    const ex = new Uint8Array(100);
    const n = revealCircle(ex, 10, 10, 5, 5, 2);
    expect(n).toBeGreaterThan(8);
    expect(ex[5 * 10 + 5]).toBe(1);
    expect(ex[0]).toBe(0);
    expect(revealCircle(ex, 10, 10, 5, 5, 2)).toBe(0);
    // Clamped at the borders.
    expect(() => revealCircle(ex, 10, 10, 0, 0, 5)).not.toThrow();
  });
});
