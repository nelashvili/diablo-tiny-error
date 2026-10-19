/**
 * Litesaber blade colors. A saber burns the color of the Kybur crystal socketed in it (the first one),
 * else of its strongest elemental damage (plasma red, cryo blue, storm yellow, toxin green, magic
 * purple); a plain saber has no blade color and keeps its line's look. Render shows each color with its
 * own blade, swing trail and hit effects; the crystal's or affix's real damage is what the color means.
 */
import { DB } from '../../data/db';
import type { StatId } from '../stats/types';

export const BLADE_COLORS = ['red', 'blue', 'yellow', 'green', 'white', 'purple', 'syth'] as const;
export type BladeColor = (typeof BLADE_COLORS)[number];

const SABER_CLASSES = new Set(['litesaber', 'doubleLitesaber']);
const CRYSTAL = /^kybur\.([a-z]+)\./;

/** Elemental damage stat -> blade color. Toxin rolls are totals over seconds, so they count for less. */
const ELEMENT_BLADES: [StatId, BladeColor, number][] = [
  ['plasmaMax', 'red', 1],
  ['cryoMax', 'blue', 1],
  ['stormMax', 'yellow', 1],
  ['toxinMax', 'green', 0.25],
  ['magicMax', 'purple', 1],
];

export interface BladeSource {
  base: string;
  socketed?: readonly { base: string }[];
  mods?: readonly { stat: string; value: number }[];
}

export function isSaberBase(baseId: string): boolean {
  const wc = DB.items.get(baseId)?.weaponClass;
  return wc !== undefined && SABER_CLASSES.has(wc);
}

function isBladeColor(s: string): s is BladeColor {
  return (BLADE_COLORS as readonly string[]).includes(s);
}

/** The blade color of a saber (null for plain sabers and anything that is not a saber). */
export function bladeColor(item: BladeSource | undefined | null): BladeColor | null {
  if (!item || !isSaberBase(item.base)) return null;
  for (const g of item.socketed ?? []) {
    const m = CRYSTAL.exec(g.base);
    if (m && isBladeColor(m[1]!)) return m[1];
  }
  let best: BladeColor | null = null;
  let bestV = 0;
  for (const [stat, color, w] of ELEMENT_BLADES) {
    let v = 0;
    for (const m of item.mods ?? []) if (m.stat === stat) v += m.value;
    if (v * w > bestV) {
      bestV = v * w;
      best = color;
    }
  }
  return best;
}
