// STUB (Wave 0) — replaced by agent "items-loot". Keep the exported signatures.
import type { ItemQuality } from '../types';
import type { ItemInstance } from './types';

export interface ItemLine {
  text: string;
  /** Style hint: 'base' | 'mod' | 'req' | 'reqFail' | 'set' | 'flavor' | 'socket' | 'better' | 'worse'. */
  style: string;
}

export interface ItemDescription {
  name: string;
  /** Second line for rares/uniques (base type name). */
  baseName?: string;
  quality: ItemQuality;
  lines: ItemLine[];
}

/** Tooltip text for an item (all strings already translated via t()). */
export function describeItem(item: ItemInstance): ItemDescription {
  return { name: item.base, quality: item.quality, lines: [] };
}
