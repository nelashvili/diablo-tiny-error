import { describe, expect, it } from 'vitest';
import type { GridContainer, ItemInstance } from '../../core/items/types';
import { anchorForCenter, cellFromPoint, computeDrop, freeCells, itemAtCell, overlapping } from './gridLogic';

const item = (uid: string): ItemInstance => ({
  uid,
  base: uid,
  quality: 'normal',
  ilvl: 1,
  affixes: [],
  mods: [],
  sockets: 0,
  socketed: [],
  identified: true,
});

const sizes: Record<string, { w: number; h: number }> = {
  saber: { w: 1, h: 3 },
  armor: { w: 2, h: 3 },
  ring: { w: 1, h: 1 },
  ring2: { w: 1, h: 1 },
  big: { w: 2, h: 2 },
};
const sizeOf = (uid: string) => sizes[uid] ?? { w: 1, h: 1 };

function grid(): GridContainer {
  return {
    w: 10,
    h: 4,
    items: [
      { item: item('saber'), x: 0, y: 0 },
      { item: item('armor'), x: 3, y: 1 },
      { item: item('ring'), x: 9, y: 3 },
    ],
  };
}

describe('cellFromPoint', () => {
  const r = { left: 100, top: 50, cell: 40, cols: 10, rows: 4 };
  it('maps points to fractional cells', () => {
    expect(cellFromPoint(100, 50, r)).toEqual({ fx: 0, fy: 0 });
    expect(cellFromPoint(160, 110, r)).toEqual({ fx: 1.5, fy: 1.5 });
  });
  it('returns null outside', () => {
    expect(cellFromPoint(99, 60, r)).toBeNull();
    expect(cellFromPoint(500, 60, r)).toBeNull();
    expect(cellFromPoint(120, 210, r)).toBeNull();
  });
});

describe('anchorForCenter', () => {
  it('centers item on cursor', () => {
    expect(anchorForCenter(5.5, 2.5, { w: 1, h: 1 }, 10, 4)).toEqual({ x: 5, y: 2 });
    expect(anchorForCenter(5.2, 2.1, { w: 2, h: 2 }, 10, 4)).toEqual({ x: 4, y: 1 });
  });
  it('clamps inside the grid', () => {
    expect(anchorForCenter(0.1, 0.1, { w: 2, h: 3 }, 10, 4)).toEqual({ x: 0, y: 0 });
    expect(anchorForCenter(9.9, 3.9, { w: 2, h: 3 }, 10, 4)).toEqual({ x: 8, y: 1 });
  });
});

describe('overlapping / itemAtCell', () => {
  it('finds overlapped items', () => {
    expect(overlapping(grid(), 0, 0, { w: 1, h: 1 }, sizeOf)).toEqual(['saber']);
    expect(overlapping(grid(), 2, 0, { w: 2, h: 2 }, sizeOf)).toEqual(['armor']);
    expect(overlapping(grid(), 1, 0, { w: 2, h: 1 }, sizeOf)).toEqual([]);
    expect(overlapping(grid(), 0, 0, { w: 1, h: 1 }, sizeOf, 'saber')).toEqual([]);
  });
  it('hit-tests multi-cell items', () => {
    expect(itemAtCell(grid(), 0, 2, sizeOf)).toBe('saber');
    expect(itemAtCell(grid(), 4, 3, sizeOf)).toBe('armor');
    expect(itemAtCell(grid(), 5, 3, sizeOf)).toBeNull();
  });
});

describe('computeDrop', () => {
  it('places in empty space', () => {
    const d = computeDrop(grid(), 6.5, 1.5, { w: 1, h: 1 }, sizeOf, 'ring2');
    expect(d).toMatchObject({ x: 6, y: 1, kind: 'place', overlaps: [] });
  });
  it('swaps with exactly one item', () => {
    const d = computeDrop(grid(), 4, 2.5, { w: 1, h: 1 }, sizeOf, 'ring2');
    expect(d).toMatchObject({ kind: 'swap', overlaps: ['armor'] });
  });
  it('blocks when covering two items', () => {
    const d = computeDrop(grid(), 2, 1.5, { w: 4, h: 1 }, sizeOf, 'wide');
    expect(d?.kind).toBe('blocked');
    expect([...(d?.overlaps ?? [])].sort()).toEqual(['armor', 'saber']);
  });
  it('allows dropping an item onto its own old position', () => {
    const d = computeDrop(grid(), 0.5, 1.5, { w: 1, h: 3 }, sizeOf, 'saber');
    expect(d).toMatchObject({ x: 0, y: 0, kind: 'place' });
  });
  it('rejects items larger than the grid', () => {
    expect(computeDrop({ w: 3, h: 2, items: [] }, 1, 1, { w: 2, h: 3 }, sizeOf)).toBeNull();
  });
});

describe('freeCells', () => {
  it('counts free cells', () => {
    expect(freeCells(grid(), sizeOf)).toBe(40 - 3 - 6 - 1);
  });
});
