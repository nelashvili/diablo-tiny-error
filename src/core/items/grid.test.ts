import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { createItem } from './create';
import {
  CUBE_SIZE,
  INVENTORY_SIZE,
  STASH_SIZE,
  autoSort,
  canPlace,
  emptyGrid,
  findSpace,
  growGrid,
  itemSize,
  placeItem,
  placeOrSwap,
  removeItem,
} from './grid';

const rng = new Rng(1);
const mk = (base: string) => createItem(base, {}, rng);

describe('grid', () => {
  it('default sizes', () => {
    expect(INVENTORY_SIZE).toEqual({ w: 10, h: 6 });
    expect(STASH_SIZE).toEqual({ w: 10, h: 10 });
    expect(CUBE_SIZE).toEqual({ w: 3, h: 4 });
  });

  it('growGrid enlarges an old 10x4 backpack in place, keeping items and never shrinking', () => {
    const g = emptyGrid(10, 4);
    const it = mk('buckler');
    placeItem(g, it, 8, 2);
    growGrid(g, INVENTORY_SIZE);
    expect([g.w, g.h]).toEqual([10, 6]);
    expect(g.items[0]).toMatchObject({ x: 8, y: 2 });
    expect(canPlace(g, mk('buckler'), 8, 4)).toBe(true);
    const big = growGrid(emptyGrid(12, 8), INVENTORY_SIZE);
    expect([big.w, big.h]).toEqual([12, 8]);
  });

  it('item sizes come from the base', () => {
    expect(itemSize(mk('buckler'))).toEqual({ w: 2, h: 2 });
    expect(itemSize(mk('baktaStim'))).toEqual({ w: 1, h: 1 });
    expect(itemSize(mk('trainingLitesaber'))).toEqual({ w: 1, h: 3 });
  });

  it('multi-cell overlap and bounds', () => {
    const g = emptyGrid(10, 4);
    const shield = mk('buckler');
    expect(placeItem(g, shield, 0, 0)).toBe(true);
    expect(canPlace(g, mk('baktaStim'), 1, 1)).toBe(false);
    expect(canPlace(g, mk('baktaStim'), 2, 0)).toBe(true);
    expect(canPlace(g, mk('trainingLitesaber'), 9, 2)).toBe(false); // out of bounds (h 3)
    expect(canPlace(g, mk('buckler'), 9, 0)).toBe(false); // out of bounds (w 2)
    expect(canPlace(g, shield, 1, 0)).toBe(true); // moving onto itself is fine
    expect(placeItem(g, mk('baktaStim'), 1, 1)).toBe(false);
  });

  it('findSpace / fill / remove', () => {
    const g = emptyGrid(3, 4);
    const items = Array.from({ length: 6 }, () => mk('buckler'));
    items.forEach((i) => placeItem(g, i));
    expect(g.items.length).toBe(2); // only 2 fit in 3x4
    expect(findSpace(g, mk('buckler'))).toBeNull();
    expect(findSpace(g, mk('baktaStim'))).toEqual({ x: 2, y: 0 });
    expect(removeItem(g, g.items[0]!.item.uid)).not.toBeNull();
    expect(removeItem(g, 'nope')).toBeNull();
  });

  it('placeOrSwap detail', () => {
    const g = emptyGrid(10, 4);
    const a = mk('baktaStim');
    const b = mk('energyCell');
    placeItem(g, a, 0, 0);
    placeItem(g, b, 1, 0);
    const shield = mk('buckler');
    const two = placeOrSwap(g, shield, 0, 0);
    expect(two).toEqual({ ok: false, swapped: null });
    const c = mk('antidote');
    const one = placeOrSwap(g, c, 0, 0);
    expect(one.ok).toBe(true);
    expect(one.swapped?.uid).toBe(a.uid);
    expect(g.items.map((e) => e.item.uid)).toContain(c.uid);
    expect(g.items.map((e) => e.item.uid)).not.toContain(a.uid);
    expect(placeOrSwap(g, mk('buckler'), 9, 0).ok).toBe(false);
  });

  it('autoSort is stable, compacts, largest first, loses nothing', () => {
    const g = emptyGrid(10, 4);
    const small = Array.from({ length: 5 }, () => mk('baktaStim'));
    const big = [mk('buckler'), mk('hunturRifle'), mk('trainingLitesaber')];
    [...small, ...big].forEach((i, n) => placeItem(g, i, (n * 2) % 10, n % 2 === 0 ? 0 : 3));
    const before = g.items.length;
    const uids = g.items.map((e) => e.item.uid).sort();
    autoSort(g);
    expect(g.items.length).toBe(before);
    expect(g.items.map((e) => e.item.uid).sort()).toEqual(uids);
    // first placed is the largest (2x3 rifle)
    expect(g.items[0]!.item.base).toBe('hunturRifle');
    // no overlaps
    for (const e of g.items) expect(canPlace(g, e.item, e.x, e.y)).toBe(true);
    const order = small.map((s) => g.items.findIndex((e) => e.item.uid === s.uid));
    expect(order).toEqual([...order].sort((x, y) => x - y)); // stable among equals
    const again = JSON.stringify(g.items.map((e) => [e.item.uid, e.x, e.y]));
    autoSort(g);
    expect(JSON.stringify(g.items.map((e) => [e.item.uid, e.x, e.y]))).toBe(again);
  });
});
