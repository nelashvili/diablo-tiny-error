/**
 * Runtime item instances (what actually lives in inventories, stash and on the ground).
 *
 * CONTRACT FILE — frozen after Wave 0. Additive changes only, coordinated by the lead.
 */
import type { DefId, EquipSlot, ItemQuality } from '../types';
import type { Modifier } from '../stats/types';

export type ItemUid = string;

export interface ItemInstance {
  uid: ItemUid;
  base: DefId;
  quality: ItemQuality;
  /** Item level (D2 ilvl) — the level of the monster/area that dropped it. */
  ilvl: number;
  /** Rolled affix ids (magic: up to 1 prefix + 1 suffix, rare: up to 3+3). */
  affixes: DefId[];
  /** Unique/set id if any. */
  uniqueId?: DefId;
  setItemId?: DefId;
  /** Rare name parts (NameKeys). */
  rareName?: [string, string];
  /** All rolled modifiers (affix rolls + unique rolls + implicit), item-local ones resolved. */
  mods: Modifier[];
  /** Rolled base defense for armor. */
  defense?: number;
  sockets: number;
  socketed: ItemInstance[];
  durability?: { cur: number; max: number };
  quantity?: number;
  ethereal?: boolean;
  identified: boolean;
  /** Upgrade level +0..+5 from the smith. */
  upgrade?: number;
  /** A white item with a small built-in bonus (D2 "Superior"). */
  superior?: boolean;
}

/** D2-style grid container (inventory 10x4, stash 10x10, cube 3x4). */
export interface GridContainer {
  w: number;
  h: number;
  items: { item: ItemInstance; x: number; y: number }[];
}

export type Equipment = Partial<Record<EquipSlot, ItemInstance>>;

/** Belt: columns x rows of consumables (rows depend on belt item). slots[row*4+col]; row 0 = hotkey (bottom) row. */
export interface Belt {
  rows: number;
  cols: 4;
  slots: (ItemInstance | null)[];
}
