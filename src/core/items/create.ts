// STUB (Wave 0) — replaced by agent "items-loot". Keep the exported signatures.
import type { Rng } from '../rng';
import type { DefId, ItemQuality } from '../types';
import type { ItemInstance } from './types';

export interface CreateItemOpts {
  quality?: ItemQuality;
  ilvl?: number;
  quantity?: number;
  /** Force identified (default true: auto-identify, PLAN §6). */
  identified?: boolean;
}

/** Create an item instance of a base (rolling affixes/defense/sockets according to quality). */
export function createItem(baseId: DefId, opts: CreateItemOpts, rng: Rng): ItemInstance {
  return {
    uid: `${baseId}-${rng.nextU32().toString(36)}`,
    base: baseId,
    quality: opts.quality ?? 'normal',
    ilvl: opts.ilvl ?? 1,
    affixes: [],
    mods: [],
    sockets: 0,
    socketed: [],
    identified: true,
    ...(opts.quantity ? { quantity: opts.quantity } : {}),
  };
}
