/**
 * How an item base looks as an object (inventory icon, item on the ground): the model id, the shape
 * kind and the armor line's colors, from the item's data (weapon class, armor slot, use) rather than
 * guessed from its name.
 */
import { DB } from '../../data/db';
import type { ItemBaseDef } from '../../data/schema';
import { classifyItem, type ItemKind } from './helpers';
import { weaponModelId } from './weaponStyle';
import { armorLook } from './outfit';
import { wornSpecOfKey } from './wornSpec';
import { parseLookKey } from '../../core/items/lookup';
import type { WornSpec } from '../types';

export interface ItemLook {
  id: string;
  kind: ItemKind;
  glow?: number;
  body?: number;
  /** Worn gear (gloves, boots, belts, chest pieces): shown as the hero wears it (wearables.ts). */
  worn?: WornSpec;
}

/** Model ids for non-weapon bases, by armor class. */
const ARMOR_MODEL: Record<string, string> = {
  helm: 'item.helm',
  chest: 'item.armor',
  shield: 'item.shield',
  gloves: 'item.gloves',
  belt: 'item.belt',
  boots: 'item.boots',
  ring: 'item.ring',
  amulet: 'item.amulet',
};

/** Icon body / glow colors per kind (placeholder catalog colors are tuned for the world, not UI). */
export const KIND_COLORS: Partial<Record<ItemKind, [number, number]>> = {
  helm: [0x8d96a3, 0x4fc3ff],
  armor: [0x6b7a8f, 0x4fc3ff],
  shield: [0x7c8794, 0x66ccff],
  gloves: [0x8a6a4a, 0xffb347],
  belt: [0x7a5a3a, 0xffd24a],
  boots: [0x6a5040, 0xffb347],
  ring: [0xd8b04a, 0xff5a8a],
  amulet: [0xd8b04a, 0x4fc3ff],
  gem: [0x9a7aff, 0xb36bff],
  potion: [0xdfe8f0, 0xff4040],
  scroll: [0x8a5a3a, 0xeadfb4],
  generic: [0x8a929c, 0xffd24a],
};

const USE_GLOW: Record<string, number> = {
  heal: 0xff3a3a,
  rejuv: 0xc040ff,
  mana: 0x3a7aff,
  stamina: 0xffd24a,
  antidote: 0x66dd44,
  thaw: 0xff8a30,
};

/**
 * Which model shows an item (inventory icon and ground drop), its kind and line colors. `key` is a
 * base id, or a look key naming the set or unique whose colors it wears (core/items itemLookKey).
 */
export function itemLook(
  key: string,
  base: ItemBaseDef | undefined = DB.items.get(parseLookKey(key).base),
): ItemLook {
  const baseId = parseLookKey(key).base;
  if (base?.weaponClass) {
    const id = weaponModelId(baseId);
    return { id, kind: classifyItem(id) };
  }
  if (base?.armorClass && ARMOR_MODEL[base.armorClass]) {
    // Helms and chests by line (hood, mask, helmet / flight suit, armor), in the line's colors.
    const byName = classifyItem(`item.${baseId}`);
    const kind =
      base.armorClass === 'helm' && (byName === 'hood' || byName === 'mask')
        ? byName
        : base.armorClass === 'chest' && byName === 'suit'
          ? 'suit'
          : classifyItem(ARMOR_MODEL[base.armorClass] as string);
    const look = armorLook(baseId);
    const worn = wornSpecOfKey(key);
    return {
      id: `item.${baseId}`,
      kind,
      ...(look ? { body: look.primary, glow: look.glow || undefined } : {}),
      ...(worn ? { worn } : {}),
    };
  }
  if (base?.use) {
    const k = base.use.kind;
    if (k === 'recall' || k === 'identify') return { id: 'item.scroll', kind: 'scroll' };
    return { id: 'item.potion', kind: 'potion', glow: USE_GLOW[k] };
  }
  if (base?.category === 'gem') return { id: 'item.gem', kind: 'gem' };
  const id = `item.${baseId}`;
  return { id, kind: classifyItem(id) };
}
