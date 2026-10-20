/**
 * Equipped item -> how it looks on the hero: its line's shape and palette stepped up by tier
 * (outfit.ts), a set's or unique's own colors, a colored gem on rare, set and unique pieces, and a
 * small variation fixed per drop (from its uid), so two of the same boots aren't identical.
 */
import { DB } from '../../data/db';
import type { GearLook } from '../../data/schema';
import { findSetItem, parseLookKey } from '../../core/items/lookup';
import type { WornSlot, WornSpec } from '../types';
import { armorLook, type ArmorLook } from './outfit';

export type WornItem = {
  base: string;
  quality?: string;
  socketed?: readonly { base: string }[];
  mods?: readonly { stat: string; value: number }[];
  uid?: string;
  setItemId?: string;
  uniqueId?: string;
};

/** Uniques without their own look: the base's colors with gold trim and an amber gem. */
const UNIQUE_TRIM = 0xd8a040;
const UNIQUE_GLOW = 0xffb040;
const RARE_GEM = 0xffe060;

/** The set or unique look an item wears, if any. */
function ownLook(item: WornItem): { look: GearLook; tag: string } | null {
  if (item.setItemId) {
    const set = findSetItem(item.setItemId)?.set;
    if (set?.look) return { look: set.look, tag: `set.${set.id}` };
  }
  if (item.uniqueId) {
    const u = DB.uniques.get(item.uniqueId);
    if (u) {
      const line = armorLook(item.base);
      const look = u.look ?? { primary: line?.primary ?? 0x8a8a8a, trim: UNIQUE_TRIM, glow: UNIQUE_GLOW };
      return { look, tag: `u.${u.id}` };
    }
  }
  return null;
}

/**
 * The palette an item puts on the body part it covers: its line's look, in its set's or unique's own
 * colors when it has them (elite pieces keep their glow, in that color).
 */
export function gearLook(item: WornItem | undefined): ArmorLook | null {
  if (!item) return null;
  const line = armorLook(item.base);
  if (!line) return null;
  const own = ownLook(item);
  if (!own) return line;
  const elite = (line.tier ?? 0) >= 2;
  return {
    ...line,
    key: `${line.key}~${own.tag}`,
    primary: own.look.primary,
    trim: own.look.trim,
    glow: elite ? own.look.glow : 0,
  };
}

/** 0..1 from an item uid (FNV-1a), quantized so the look key stays short. */
export function varyOf(uid: string | undefined): number {
  if (!uid) return 0.5;
  let h = 0x811c9dc5;
  for (let i = 0; i < uid.length; i++) h = Math.imul(h ^ uid.charCodeAt(i), 0x01000193);
  return ((h >>> 0) % 16) / 16;
}

/** How an equipped item is worn in `slot`, or null when it has no worn shape. */
export function wornSpecOf(slot: WornSlot, item: WornItem | undefined): WornSpec | null {
  const look = gearLook(item);
  if (!item || !look?.shape) return null;
  const own = ownLook(item);
  const accent = own ? own.look.glow : item.quality === 'rare' ? RARE_GEM : 0;
  const vary = varyOf(item.uid);
  return {
    key: `${slot}:${look.key}:${accent.toString(16)}:${vary}`,
    slot,
    shape: look.shape,
    primary: look.primary,
    trim: look.trim,
    glow: look.glow,
    tier: look.tier ?? 0,
    vary,
    accent,
  };
}

const SLOT_OF: Partial<Record<string, WornSlot>> = {
  chest: 'chest',
  gloves: 'gloves',
  belt: 'belt',
  boots: 'boots',
};

/** The worn spec shown for an icon / ground look key (`base`, `base~set.x`, `base~u.x`), if any. */
export function wornSpecOfKey(key: string): WornSpec | null {
  const { base, setId, uniqueId } = parseLookKey(key);
  const slot = SLOT_OF[DB.items.get(base)?.armorClass ?? ''];
  if (!slot) return null;
  const setItemId = setId ? DB.sets.get(setId)?.items.find((i) => i.base === base)?.id : undefined;
  return wornSpecOf(slot, { base, ...(setItemId ? { setItemId } : {}), ...(uniqueId ? { uniqueId } : {}) });
}
