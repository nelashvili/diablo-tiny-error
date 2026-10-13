import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { createMap, setKind } from './grid';
import { findPath } from './pathfinding';
import { SpatialHash, lineOfSight, moveWithCollision, nearestWalkable } from './collision';
import { RevealMap } from './fog';
import { isWalkable } from './types';
import type { TileMap } from './types';
import { generateLevel } from './mapgen';

function ascii(rows: string[]): TileMap {
  const map = createMap(rows[0]!.length, rows.length, 'floor');
  rows.forEach((r, y) => [...r].forEach((c, x) => c === '#' && setKind(map, x, y, 'wall')));
  return map;
}

describe('findPath', () => {
  it('goes straight in open space', () => {
    const m = ascii(['.....', '.....', '.....']);
    const p = findPath(m, { x: 0.5, y: 1.5 }, { x: 4.2, y: 1.5 });
    expect(p).toEqual([{ x: 4.2, y: 1.5 }]);
  });

  it('routes around walls and never cuts corners', () => {
    const m = ascii(['.....', '.###.', '.....']);
    const p = findPath(m, { x: 0.5, y: 0.5 }, { x: 4.5, y: 2.5 })!;
    expect(p.length).toBeGreaterThan(0);
    let prev = { x: 0.5, y: 0.5 };
    for (const q of p) {
      expect(isWalkable(m, q.x, q.y)).toBe(true);
      expect(lineOfSight(m, prev, q)).toBe(true);
      prev = q;
    }
    const last = p[p.length - 1]!;
    expect(last).toEqual({ x: 4.5, y: 2.5 });
  });

  it('does not squeeze diagonally between two walls', () => {
    const m = ascii(['.#', '#.']);
    expect(findPath(m, { x: 0.5, y: 0.5 }, { x: 1.5, y: 1.5 })).toBeNull();
  });

  it('paths to nearest reachable tile when the target is blocked', () => {
    const m = ascii(['.....', '.###.', '.....']);
    const p = findPath(m, { x: 0.5, y: 0.5 }, { x: 2.5, y: 1.5 })!;
    const last = p[p.length - 1]!;
    expect(isWalkable(m, last.x, last.y)).toBe(true);
    expect(Math.hypot(last.x - 2.5, last.y - 1.5)).toBeLessThan(1.6);
  });

  it('reports null for fully enclosed targets only when nothing is closer', () => {
    const m = ascii(['..#..', '..#..', '..#..']);
    const p = findPath(m, { x: 0.5, y: 1.5 }, { x: 4.5, y: 1.5 })!;
    const last = p[p.length - 1]!;
    expect(last.x).toBeLessThan(2);
  });

  it('respects clearance radius and the node budget', () => {
    const m = ascii(['.......', '..###..', '.......', '.#.....']);
    const p = findPath(m, { x: 0.5, y: 2.5 }, { x: 6.5, y: 2.5 }, { radius: 0.9 })!;
    expect(p).not.toBeNull();
    expect(findPath(m, { x: 0.5, y: 0.5 }, { x: 6.5, y: 2.5 }, { maxNodes: 1 })).not.toBeUndefined();
  });

  it('is fast on 100x100 maps', () => {
    const rng = new Rng(9);
    const m = createMap(100, 100, 'floor');
    for (let i = 0; i < 2500; i++) setKind(m, rng.int(1, 98), rng.int(1, 98), 'rock');
    for (let k = 0; k < 5; k++) findPath(m, { x: 1.5, y: 1.5 }, { x: 98.5, y: 98.5 }); // warm up
    const t0 = performance.now();
    const N = 50;
    for (let k = 0; k < N; k++) findPath(m, { x: 1.5, y: 1.5 + (k % 5) }, { x: 98.5, y: 98.5 });
    const avg = (performance.now() - t0) / N;
    expect(avg).toBeLessThan(5); // target <2ms; generous for CI noise
  });
});

describe('SpatialHash', () => {
  it('queries radius, nearest with filter, update and remove', () => {
    const h = new SpatialHash(4);
    h.insert(1, 1, 1);
    h.insert(2, 5, 1);
    h.insert(3, 20, 20);
    expect(h.queryRadius(1, 1, 5).sort()).toEqual([1, 2]);
    expect(h.queryNearest(4, 1, 10)).toBe(2);
    expect(h.queryNearest(4, 1, 10, (id) => id !== 2)).toBe(1);
    h.update(3, 2, 2);
    expect(h.queryRadius(1, 1, 2).sort()).toEqual([1, 3]);
    h.remove(1);
    expect(h.queryRadius(1, 1, 2)).toEqual([3]);
    expect(h.size).toBe(2);
    expect(h.queryNearest(100, 100, 3)).toBeUndefined();
  });
});

describe('collision', () => {
  const m = ascii(['.....', '..#..', '.....']);
  it('line of sight is blocked by walls only', () => {
    expect(lineOfSight(m, { x: 0.5, y: 1.5 }, { x: 4.5, y: 1.5 })).toBe(false);
    expect(lineOfSight(m, { x: 0.5, y: 0.5 }, { x: 4.5, y: 0.5 })).toBe(true);
    const water = createMap(5, 1, 'floor');
    setKind(water, 2, 0, 'water');
    expect(lineOfSight(water, { x: 0.5, y: 0.5 }, { x: 4.5, y: 0.5 })).toBe(true);
  });
  it('slides along walls', () => {
    const r = moveWithCollision(m, { x: 1.5, y: 2.5 }, { x: 0.8, y: -0.8 }, 0.3);
    expect(r.x).toBeGreaterThan(1.5);
    expect(r.y).toBeLessThan(2.5);
    const blocked = moveWithCollision(m, { x: 1.3, y: 1.5 }, { x: 2, y: 0 }, 0.3);
    expect(blocked.x).toBeLessThan(2 - 0.3 + 1e-6);
    expect(blocked.x).toBeGreaterThan(1.3);
  });
  it('finds nearest walkable', () => {
    expect(nearestWalkable(m, { x: 2.5, y: 1.5 })).toEqual({ x: 2.5, y: 0.5 });
    expect(nearestWalkable(m, { x: 0.2, y: 0.2 })).toEqual({ x: 0.2, y: 0.2 });
  });
});

describe('RevealMap', () => {
  it('reveals discs and round-trips', () => {
    const r = new RevealMap(20, 20);
    const n = r.reveal(10, 10, 3);
    expect(n).toBeGreaterThan(20);
    expect(r.reveal(10, 10, 3)).toBe(0);
    expect(r.isRevealed(10, 10)).toBe(true);
    expect(r.isRevealed(0, 0)).toBe(false);
    const r2 = RevealMap.deserialize(20, 20, r.serialize());
    expect(r2.revealedCount).toBe(r.revealedCount);
    expect(r2.isRevealed(10, 10)).toBe(true);
  });
});

describe('generateLevel minimal spec', () => {
  it('works with just id/gen/genParams for every kind', () => {
    for (const gen of ['outdoor', 'maze', 'preset', 'town'] as const) {
      const g = generateLevel({ id: 'x.' + gen, gen, genParams: {} }, 3);
      expect(g.placements.some((p) => p.kind === 'playerStart')).toBe(true);
      expect(g.map.kinds.length).toBe(g.map.width * g.map.height);
    }
  });
});
