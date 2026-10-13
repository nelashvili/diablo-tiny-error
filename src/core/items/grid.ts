import { baseOf } from './lookup';
import type { GridContainer, ItemInstance } from './types';

export const INVENTORY_SIZE = { w: 10, h: 4 };
export const STASH_SIZE = { w: 10, h: 10 };
export const CUBE_SIZE = { w: 3, h: 4 };

export function itemSize(item: ItemInstance): { w: number; h: number } {
  return baseOf(item)?.size ?? { w: 1, h: 1 };
}

type Entry = GridContainer['items'][number];

function overlaps(e: Entry, x: number, y: number, w: number, h: number): boolean {
  const s = itemSize(e.item);
  return x < e.x + s.w && e.x < x + w && y < e.y + s.h && e.y < y + h;
}

function inBounds(c: GridContainer, x: number, y: number, w: number, h: number): boolean {
  return x >= 0 && y >= 0 && x + w <= c.w && y + h <= c.h;
}

/** Entries (other than the item itself) that overlap the footprint of `item` at x,y. */
function blockers(c: GridContainer, item: ItemInstance, x: number, y: number): Entry[] {
  const s = itemSize(item);
  return c.items.filter((e) => e.item.uid !== item.uid && overlaps(e, x, y, s.w, s.h));
}

export function canPlace(c: GridContainer, item: ItemInstance, x: number, y: number): boolean {
  const s = itemSize(item);
  return inBounds(c, x, y, s.w, s.h) && blockers(c, item, x, y).length === 0;
}

export function findSpace(c: GridContainer, item: ItemInstance): { x: number; y: number } | null {
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (canPlace(c, item, x, y)) return { x, y };
  return null;
}

/** Place at x,y (or first free spot). Returns false if no room. */
export function placeItem(c: GridContainer, item: ItemInstance, x?: number, y?: number): boolean {
  const spot =
    x !== undefined && y !== undefined ? (canPlace(c, item, x, y) ? { x, y } : null) : findSpace(c, item);
  if (!spot) return false;
  const existing = c.items.find((e) => e.item.uid === item.uid);
  if (existing) {
    existing.x = spot.x;
    existing.y = spot.y;
  } else c.items.push({ item, ...spot });
  return true;
}

export function removeItem(c: GridContainer, uid: string): ItemInstance | null {
  const i = c.items.findIndex((e) => e.item.uid === uid);
  if (i < 0) return null;
  return c.items.splice(i, 1)[0]!.item;
}

/**
 * Drop `item` at x,y. If exactly one other item is in the way it is swapped out (D2 cursor behavior) and
 * returned; if several block, nothing changes.
 */
export function placeOrSwap(
  c: GridContainer,
  item: ItemInstance,
  x: number,
  y: number,
): { ok: boolean; swapped: ItemInstance | null } {
  const s = itemSize(item);
  if (!inBounds(c, x, y, s.w, s.h)) return { ok: false, swapped: null };
  const hit = blockers(c, item, x, y);
  if (hit.length > 1) return { ok: false, swapped: null };
  let swapped: ItemInstance | null = null;
  if (hit.length === 1) swapped = removeItem(c, hit[0]!.item.uid);
  placeItem(c, item, x, y);
  return { ok: true, swapped };
}

/** Compact the grid: largest items first (stable for equal sizes), first-fit. Never loses items. */
export function autoSort(c: GridContainer): void {
  const original = c.items.map((e) => ({ ...e }));
  const order = original
    .map((e, i) => ({ e, i, s: itemSize(e.item) }))
    .sort((a, b) => b.s.w * b.s.h - a.s.w * a.s.h || b.s.h - a.s.h || a.i - b.i);
  c.items = [];
  for (const { e } of order) {
    if (!placeItem(c, e.item)) {
      // cannot happen for a grid that was valid before, but never lose items
      c.items = original;
      return;
    }
  }
}

export function emptyGrid(w: number, h: number): GridContainer {
  return { w, h, items: [] };
}
