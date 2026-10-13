// STUB (Wave 0) — replaced by agent "items-loot". Keep the exported signatures.
import type { GridContainer, ItemInstance } from './types';

export function itemSize(_item: ItemInstance): { w: number; h: number } {
  return { w: 1, h: 1 };
}
export function canPlace(c: GridContainer, item: ItemInstance, x: number, y: number): boolean {
  return (
    x >= 0 &&
    y >= 0 &&
    x < c.w &&
    y < c.h &&
    !c.items.some((e) => e.x === x && e.y === y && e.item.uid !== item.uid)
  );
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
  c.items.push({ item, ...spot });
  return true;
}
export function removeItem(c: GridContainer, uid: string): ItemInstance | null {
  const i = c.items.findIndex((e) => e.item.uid === uid);
  if (i < 0) return null;
  return c.items.splice(i, 1)[0]!.item;
}
export function autoSort(_c: GridContainer): void {}
export function emptyGrid(w: number, h: number): GridContainer {
  return { w, h, items: [] };
}
