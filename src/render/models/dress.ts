/**
 * What a hero's equipment shows: the held models (weapons by class, line and tier), the worn helm and
 * chest models, and the armor bases that recolor each body part. Shared by the world (entitySync) and
 * the hero preview screen so both dress the hero the same way.
 */
import type { EntityVisual } from '../types';
import { armorLook } from './outfit';
import { weaponModelOf } from './weaponStyle';

type Worn = Readonly<Partial<Record<string, WornItem>>>;
export type WornItem = {
  base: string;
  quality?: string;
  socketed?: readonly { base: string }[];
  mods?: readonly { stat: string; value: number }[];
};

export interface Dress {
  /** Attachment model ids ('' = empty hand). */
  mainHand: string;
  offHand: string;
  /** Armor base ids ('' = none). */
  head: string;
  chest: string;
  gloves: string;
  boots: string;
}

/** The look of an equipment set; `emptyHand` drops the main hand (a thrown saber in flight). */
export function dressOf(eq: Worn, emptyHand = false): Dress {
  const mi = emptyHand ? undefined : eq['mainHand'];
  const oi = eq['offHand'];
  return {
    mainHand: mi ? weaponModelOf(mi) : '',
    offHand: oi ? weaponModelOf(oi) : '',
    head: eq['head']?.base ?? '',
    chest: eq['chest']?.base ?? '',
    gloves: eq['gloves']?.base ?? '',
    boots: eq['boots']?.base ?? '',
  };
}

/** Puts a look on a visual, touching only what changed since `prev` (null = apply everything). */
export function applyDress(v: EntityVisual, d: Dress, prev: Dress | null): void {
  if (d.mainHand !== prev?.mainHand) v.setAttachment('mainHand', d.mainHand || null);
  if (d.offHand !== prev?.offHand) v.setAttachment('offHand', d.offHand || null);
  if (d.head !== prev?.head) v.setAttachment('head', d.head ? `item.${d.head}` : null);
  if (d.chest !== prev?.chest) v.setAttachment('chest', d.chest ? `item.${d.chest}` : null);
  // Armor reshapes the hero's colors per body part (cooler looks at higher lines/tiers).
  const outfitChanged =
    !prev ||
    d.head !== prev.head ||
    d.chest !== prev.chest ||
    d.gloves !== prev.gloves ||
    d.boots !== prev.boots;
  if (v.setOutfit && outfitChanged) {
    v.setOutfit('head', armorLook(d.head));
    v.setOutfit('body', armorLook(d.chest));
    v.setOutfit('arms', armorLook(d.gloves));
    v.setOutfit('legs', armorLook(d.boots));
  }
}
