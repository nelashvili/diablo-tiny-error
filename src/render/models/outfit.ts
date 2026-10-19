/**
 * Equipped armor -> hero look. Each armor line has a palette that gets cooler the higher its level
 * (worn cloth -> clean trooper white -> tactical gunmetal -> polished battle plate), and each tier
 * steps it up again: exceptional = a navy "elite squad" finish, elite = black and gold with a soft glow.
 * Applied as palette swaps on the body part the slot covers (helm -> head gear, chest -> torso,
 * gloves -> arms, boots -> legs); skin and leather browns are left alone.
 */
import { ARMOR_LINES } from '../../data/items/_armorTable';
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
}

/** Palettes per armor line (keyed by the line's normal-tier id), in level order within a slot. */
const LINE_PALETTES: Record<string, [primary: number, trim: number]> = {
  // helms
  flightCap: [0xe8e8e4, 0xd26a2a],
  scoutHelm: [0x8a8a6a, 0x4a4a3a],
  trooperHelm: [0xe6e8ea, 0x2c2c30],
  reconHelm: [0x5a6a5a, 0x2c2c30],
  battleVisor: [0xa2b2c6, 0x9a2a2a],
  yediHood: [0x7a5634, 0xc8b08a],
  yediCowl: [0x3e2a1a, 0xc8b08a],
  yediMask: [0x26262a, 0xb02a2a],
  // chest
  // Rebel pilot orange with a white harness.
  flightSuit: [0xd8682a, 0xeeeeea],
  paddedVest: [0x8a7a5a, 0x5a4a3a],
  trooperArmor: [0xe6e8ea, 0x2c2c30],
  flakJacket: [0x5a6a4a, 0x3a3a34],
  meshVest: [0x4a5560, 0xd97a2a],
  battlePlate: [0xa2b2c6, 0x9a2a2a],
  // gloves
  workGloves: [0xa88a60, 0x7a7a72],
  paddedGloves: [0x7a6a50, 0x7a7a72],
  heavyGloves: [0x4a4440, 0x9aa4ae],
  gripGloves: [0x3e3a36, 0xb07a3a],
  platedGloves: [0x3a3e46, 0x9aa4ae],
  // boots
  workBoots: [0xa88a60, 0x7a7a72],
  trailBoots: [0x7a6a50, 0x7a7a72],
  heavyBoots: [0x4a4440, 0x9aa4ae],
  patrolBoots: [0x3e3a36, 0xb07a3a],
  platedBoots: [0x3a3e46, 0x9aa4ae],
};

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
  const pal = LINE_PALETTES[camel(line.names[0])];
  if (!pal) continue;
  line.names.forEach((name, tier) => {
    const id = camel(name);
    const [p, t] = pal;
    const look: ArmorLook =
      tier === 0
        ? { key: id, primary: p, trim: t, glow: 0 }
        : tier === 1
          ? { key: id, primary: mix(p, SQUAD_NAVY, 0.55), trim: t, glow: 0 }
          : { key: id, primary: mix(p, ELITE_BLACK, 0.8), trim: ELITE_TRIM, glow: ELITE_TRIM };
    LOOKS.set(id, look);
  });
}

export type HeadgearStyle = 'trooper' | 'mando' | 'hood';

/** Worn shape of each helm line (keyed by the line's normal-tier id). */
const LINE_HEADGEAR: Record<string, HeadgearStyle> = {
  flightCap: 'trooper',
  scoutHelm: 'trooper',
  trooperHelm: 'trooper',
  reconHelm: 'mando',
  battleVisor: 'mando',
  yediHood: 'hood',
  yediCowl: 'hood',
  yediMask: 'hood',
};
const HEADGEAR = new Map<string, HeadgearStyle>();
for (const line of ARMOR_LINES) {
  const style = LINE_HEADGEAR[camel(line.names[0])];
  if (style) for (const name of line.names) HEADGEAR.set(camel(name), style);
}

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
