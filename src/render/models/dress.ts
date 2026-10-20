/**
 * What a hero's equipment shows: the held models (weapons by class, line and tier), the worn helm,
 * the worn gear built on the body (chest extras, gloves, belt, boots), the palettes each body part
 * takes from its armor, and a full set's aura. Shared by the world (entitySync) and the hero preview
 * screen so both dress the hero the same way.
 */
import { findSetItem } from '../../core/items/lookup';
import type { EntityVisual, WornSlot, WornSpec } from '../types';
import type { ArmorLook, OutfitPart } from './outfit';
import { weaponModelOf } from './weaponStyle';
import { gearLook, wornSpecOf, type WornItem } from './wornSpec';

export type { WornItem } from './wornSpec';

type Worn = Readonly<Partial<Record<string, WornItem>>>;

const WORN_SLOTS: readonly WornSlot[] = ['chest', 'gloves', 'belt', 'boots'];
const PARTS: readonly OutfitPart[] = ['head', 'body', 'arms', 'legs'];

export interface Dress {
  /** Attachment model ids ('' = empty hand). */
  mainHand: string;
  offHand: string;
  /** Helm and chest base ids ('' = none). */
  head: string;
  chest: string;
  /** Palette per body part: helm -> head, chest -> torso and sleeves, boots -> legs. */
  looks: Record<OutfitPart, ArmorLook | null>;
  /** Gear built on the body. */
  worn: Record<WornSlot, WornSpec | null>;
  /** A full set's aura color (0 = none). */
  aura: number;
}

/** The glow of a set worn complete (the first one found), or 0. */
export function fullSetAura(eq: Worn): number {
  const counts = new Map<string, number>();
  for (const it of Object.values(eq)) {
    const set = it?.setItemId ? findSetItem(it.setItemId)?.set : undefined;
    if (!set?.look) continue;
    const n = (counts.get(set.id) ?? 0) + 1;
    counts.set(set.id, n);
    if (n === set.items.length) return set.look.glow;
  }
  return 0;
}

/** The look of an equipment set; `emptyHand` drops the main hand (a thrown saber in flight). */
export function dressOf(eq: Worn, emptyHand = false): Dress {
  const mi = emptyHand ? undefined : eq['mainHand'];
  const oi = eq['offHand'];
  const chest = gearLook(eq['chest']);
  return {
    mainHand: mi ? weaponModelOf(mi) : '',
    offHand: oi ? weaponModelOf(oi) : '',
    head: eq['head']?.base ?? '',
    chest: eq['chest']?.base ?? '',
    looks: { head: gearLook(eq['head']), body: chest, arms: chest, legs: gearLook(eq['boots']) },
    worn: {
      chest: wornSpecOf('chest', eq['chest']),
      gloves: wornSpecOf('gloves', eq['gloves']),
      belt: wornSpecOf('belt', eq['belt']),
      boots: wornSpecOf('boots', eq['boots']),
    },
    aura: fullSetAura(eq),
  };
}

/** A string that changes whenever anything the dress shows changes. */
export function dressKey(d: Dress): string {
  return [
    d.mainHand,
    d.offHand,
    d.head,
    d.chest,
    ...PARTS.map((p) => d.looks[p]?.key ?? ''),
    ...WORN_SLOTS.map((s) => d.worn[s]?.key ?? ''),
    d.aura,
  ].join('|');
}

/** Puts a look on a visual, touching only what changed since `prev` (null = apply everything). */
export function applyDress(v: EntityVisual, d: Dress, prev: Dress | null): void {
  if (d.mainHand !== prev?.mainHand) v.setAttachment('mainHand', d.mainHand || null);
  if (d.offHand !== prev?.offHand) v.setAttachment('offHand', d.offHand || null);
  // Palettes first: a worn helm takes the head's color.
  for (const p of PARTS)
    if (!prev || (d.looks[p]?.key ?? null) !== (prev.looks[p]?.key ?? null)) v.setOutfit?.(p, d.looks[p]);
  if (d.head !== prev?.head) v.setAttachment('head', d.head ? `item.${d.head}` : null);
  if (d.chest !== prev?.chest) v.setAttachment('chest', d.chest ? `item.${d.chest}` : null);
  for (const s of WORN_SLOTS)
    if (!prev || (d.worn[s]?.key ?? null) !== (prev.worn[s]?.key ?? null)) v.setWorn?.(s, d.worn[s]);
  if (!prev || d.aura !== prev.aura) v.setAura?.(d.aura || null);
}
