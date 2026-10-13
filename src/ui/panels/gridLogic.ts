/**
 * Pure grid helpers for inventory/stash/cube/vendor grids: pointer → cell hit-testing and
 * D2-style drop target computation (held item is centered on the cursor).
 */
import type { GridContainer, ItemUid } from '../../core/items/types';

export interface Size {
  w: number;
  h: number;
}

export interface GridRect {
  left: number;
  top: number;
  cell: number; // px per cell (square)
  cols: number;
  rows: number;
}

/** Fractional cell coordinate under a point, or null if the point is outside the grid. */
export function cellFromPoint(px: number, py: number, r: GridRect): { fx: number; fy: number } | null {
  const fx = (px - r.left) / r.cell;
  const fy = (py - r.top) / r.cell;
  if (fx < 0 || fy < 0 || fx >= r.cols || fy >= r.rows) return null;
  return { fx, fy };
}

/**
 * Top-left cell for an item of `size` held centered under fractional cell (fx, fy), clamped
 * so the item stays fully inside the grid (D2 behavior).
 */
export function anchorForCenter(fx: number, fy: number, size: Size, cols: number, rows: number) {
  const x = Math.round(fx - size.w / 2);
  const y = Math.round(fy - size.h / 2);
  return {
    x: Math.max(0, Math.min(cols - size.w, x)),
    y: Math.max(0, Math.min(rows - size.h, y)),
  };
}

export type DropKind = 'place' | 'swap' | 'blocked';

export interface DropTarget {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: DropKind;
  /** Uids of items overlapped by the footprint (excluding the held item itself). */
  overlaps: ItemUid[];
}

/** Items in `c` whose footprint intersects the rectangle. */
export function overlapping(
  c: GridContainer,
  x: number,
  y: number,
  size: Size,
  sizeOf: (uid: ItemUid) => Size,
  ignoreUid?: ItemUid,
): ItemUid[] {
  const out: ItemUid[] = [];
  for (const e of c.items) {
    if (e.item.uid === ignoreUid) continue;
    const s = sizeOf(e.item.uid);
    if (x < e.x + s.w && x + size.w > e.x && y < e.y + s.h && y + size.h > e.y) out.push(e.item.uid);
  }
  return out;
}

/** Compute where a held item would land and whether that is allowed. */
export function computeDrop(
  c: GridContainer,
  fx: number,
  fy: number,
  size: Size,
  sizeOf: (uid: ItemUid) => Size,
  heldUid?: ItemUid,
): DropTarget | null {
  if (size.w > c.w || size.h > c.h) return null;
  const { x, y } = anchorForCenter(fx, fy, size, c.w, c.h);
  const overlaps = overlapping(c, x, y, size, sizeOf, heldUid);
  const kind: DropKind = overlaps.length === 0 ? 'place' : overlaps.length === 1 ? 'swap' : 'blocked';
  return { x, y, w: size.w, h: size.h, kind, overlaps };
}

/** Item occupying a given integer cell, if any. */
export function itemAtCell(
  c: GridContainer,
  cx: number,
  cy: number,
  sizeOf: (uid: ItemUid) => Size,
): ItemUid | null {
  for (const e of c.items) {
    const s = sizeOf(e.item.uid);
    if (cx >= e.x && cx < e.x + s.w && cy >= e.y && cy < e.y + s.h) return e.item.uid;
  }
  return null;
}

/** Number of free cells (for "bag is full" hints). */
export function freeCells(c: GridContainer, sizeOf: (uid: ItemUid) => Size): number {
  let used = 0;
  for (const e of c.items) {
    const s = sizeOf(e.item.uid);
    used += s.w * s.h;
  }
  return Math.max(0, c.w * c.h - used);
}
