/**
 * Equipped armor -> hero look. Each armor line has a worn shape and a palette (data/items/_armorTable)
 * that gets cooler the higher its level (worn cloth -> clean trooper white -> tactical gunmetal ->
 * polished battle plate), and each tier
 * steps it up again: exceptional = a navy "elite squad" finish, elite = black and gold with a soft glow.
 * Applied as palette swaps on the body part the slot covers (helm -> head gear, chest -> torso,
 * gloves -> arms, boots -> legs); skin and leather browns are left alone.
 */
import { ARMOR_LINES, type HelmShape, type WearShape } from '../../data/items/_armorTable';
import { camel } from '../../data/items/_build';
import type { RecolorRule } from './toon';

export type OutfitPart = 'head' | 'body' | 'arms' | 'legs';

export interface ArmorLook {
  /** Stable cache key. */
  key: string;
  primary: number;
  trim: number;
  /** Emissive glow color (elite), or 0. */
  glow: number;
  /** How the line is worn, and its tier (0 normal, 1 exceptional, 2 elite). */
  shape?: WearShape;
  tier?: number;
}

const ELITE_TRIM = 0xe0b040;

/** Blend two 0xRRGGBB colors (t = weight of b). */
function mix(a: number, b: number, t: number): number {
  const c = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

/** Exceptional: navy "elite squad" finish. Elite: near-black with gold trim and glow. */
const SQUAD_NAVY = 0x22304e;
const ELITE_BLACK = 0x18181c;

/** base item id -> look, built once from the armor table (all three tiers of every line). */
const LOOKS = new Map<string, ArmorLook>();
for (const line of ARMOR_LINES) {
  const ll = line.look;
  if (!ll) continue;
  line.names.forEach((name, tier) => {
    const id = camel(name);
    const { primary: p, trim: t, shape } = ll;
    const look: ArmorLook =
      tier === 0
        ? { key: id, primary: p, trim: t, glow: 0 }
        : tier === 1
          ? { key: id, primary: mix(p, SQUAD_NAVY, 0.55), trim: t, glow: 0 }
          : { key: id, primary: mix(p, ELITE_BLACK, 0.8), trim: ELITE_TRIM, glow: ELITE_TRIM };
    LOOKS.set(id, { ...look, shape, tier });
  });
}

export type HeadgearStyle = HelmShape;

/** Worn shape of each helm (from its line's look). */
const HEADGEAR = new Map<string, HeadgearStyle>();
for (const line of ARMOR_LINES)
  if (line.cls === 'helm' && line.look)
    for (const name of line.names) HEADGEAR.set(camel(name), line.look.shape as HelmShape);

/** How a helm item is worn on the universal rig (unknown helms: a trooper-style helmet). */
export function headgearStyle(baseId: string): HeadgearStyle {
  return HEADGEAR.get(baseId) ?? 'trooper';
}

export function armorLook(baseId: string | undefined): ArmorLook | null {
  return baseId ? (LOOKS.get(baseId) ?? null) : null;
}

/** Which outfit part a rig mesh belongs to (KayKit part names), or null (capes, props). */
export function outfitPartOf(meshName: string): OutfitPart | null {
  const n = meshName.toLowerCase();
  if (/cape/.test(n)) return null;
  if (/hat|helmet|hood|head/.test(n)) return 'head';
  if (/arm/.test(n)) return 'arms';
  if (/leg/.test(n)) return 'legs';
  if (/body|torso/.test(n)) return 'body';
  return null;
}

/**
 * Palette swap for a look, painted nearly flat so dark cloth really turns into white plastoid or
 * polished steel. First match wins: bright metal bits (buckles, studs) -> trim; cloth (every
 * non-skin hue, and dark greys) -> primary. On the head, blacks (eyes) are left alone.
 */
export function outfitRules(look: ArmorLook, part: OutfitPart): RecolorRule[] {
  // Elite gauntlets and greaves are solid gold.
  const main = look.glow && (part === 'arms' || part === 'legs') ? look.trim : look.primary;
  return [
    { hue: [0, 360], maxSat: 0.12, minVal: 0.55, color: look.trim, flat: 0.5 },
    // Hues outside 10..40 deg (skin and leather browns stay as they are).
    { hue: [40, 10], minSat: 0.2, color: main, flat: 0.75 },
    { hue: [0, 360], maxSat: 0.2, minVal: part === 'head' ? 0.12 : 0.02, color: main, flat: 0.75 },
  ];
}
