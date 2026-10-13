// STUB (Wave 0) — replaced by agent "items-loot". Keep the exported signatures.
import type { Rng } from '../rng';
import type { ItemInstance } from '../items/types';

export interface DropContext {
  treasureClass: string;
  monsterLevel: number;
  magicFind: number;
  goldFind: number;
  /** D2 player-count analog for noDrop; always 1 here. */
  players: 1;
  rank: 'normal' | 'champion' | 'unique' | 'boss';
}

export interface DropResult {
  items: ItemInstance[];
  creditz: number;
}

export function rollDrops(_ctx: DropContext, _rng: Rng): DropResult {
  return { items: [], creditz: 0 };
}
