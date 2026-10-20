/** Small DB lookup helpers shared by the items/loot modules. */
import { DB } from '../../data/db';
import type { AffixDef, ItemBaseDef, SetDef, UniqueDef } from '../../data/schema';
import type { DefId } from '../types';
import type { ItemInstance } from './types';

export function baseOf(item: ItemInstance): ItemBaseDef | undefined {
  return DB.items.get(item.base);
}

/** Categories that can roll quality / affixes. */
export function isGear(base: ItemBaseDef): boolean {
  return base.category === 'weapon' || base.category === 'armor' || base.category === 'jewelry';
}

export function affixMatchesBase(def: AffixDef, base: ItemBaseDef): boolean {
  if (def.classOnly && def.classOnly !== base.classOnly) return false;
  return def.itemTypes.some(
    (t) =>
      t === 'any' ||
      t === base.weaponClass ||
      t === base.armorClass ||
      (t === 'weapon' && base.category === 'weapon') ||
      (t === 'armor' && base.category === 'armor') ||
      (t === 'jewelry' && base.category === 'jewelry'),
  );
}

let affixCache: { prefix: AffixDef[]; suffix: AffixDef[] } | null = null;
/** All affixes by kind, sorted by id so rolls are deterministic regardless of load order. */
export function affixPool(kind: 'prefix' | 'suffix'): AffixDef[] {
  if (!affixCache) {
    const all = [...DB.affixes.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
    affixCache = {
      prefix: all.filter((a) => a.kind === 'prefix'),
      suffix: all.filter((a) => a.kind === 'suffix'),
    };
  }
  return affixCache[kind];
}

export interface SetItemRef {
  set: SetDef;
  item: SetDef['items'][number];
}
let setIndex: Map<DefId, SetItemRef> | null = null;
export function findSetItem(setItemId: DefId): SetItemRef | undefined {
  if (!setIndex) {
    setIndex = new Map();
    for (const set of DB.sets.values()) for (const item of set.items) setIndex.set(item.id, { set, item });
  }
  return setIndex.get(setItemId);
}

export function uniqueCandidates(baseId: DefId, ilvl: number): UniqueDef[] {
  return [...DB.uniques.values()]
    .filter((u) => u.base === baseId && u.level <= ilvl)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function setCandidates(baseId: DefId, ilvl: number): SetItemRef[] {
  const out: SetItemRef[] = [];
  for (const set of DB.sets.values())
    for (const item of set.items) if (item.base === baseId && item.reqLevel <= ilvl) out.push({ set, item });
  return out.sort((a, b) => (a.item.id < b.item.id ? -1 : 1));
}

/**
 * Look key of an item (inventory icon, ground model): its base, plus the set or unique whose own colors
 * it wears (`base~set.<setId>`, `base~u.<uniqueId>`).
 */
export function itemLookKey(item: { base: DefId; setItemId?: DefId; uniqueId?: DefId }): string {
  const set = item.setItemId ? findSetItem(item.setItemId)?.set : undefined;
  if (set) return `${item.base}~set.${set.id}`;
  if (item.uniqueId && DB.uniques.has(item.uniqueId)) return `${item.base}~u.${item.uniqueId}`;
  return item.base;
}

export function parseLookKey(key: string): { base: DefId; setId?: DefId; uniqueId?: DefId } {
  const [base, tag] = key.split('~') as [DefId, string | undefined];
  if (tag?.startsWith('set.')) return { base, setId: tag.slice(4) };
  if (tag?.startsWith('u.')) return { base, uniqueId: tag.slice(2) };
  return { base };
}
