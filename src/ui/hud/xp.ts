/**
 * XP bar math. Uses the Diablo II experience table (levels 1..75 — our cap, PLAN §5).
 * TODO(integration): switch to core/player's exported XP table once it exists, so there is
 * a single source of truth.
 */
export const XP_TABLE: readonly number[] = [
  0, 500, 1500, 3750, 7875, 14175, 22680, 32886, 44396, 57715, 72144, 90180, 112725, 140906, 176132, 220165,
  275207, 344008, 430010, 537513, 671891, 839864, 1049830, 1312287, 1640359, 2050449, 2563061, 3203826,
  3902260, 4663553, 5493363, 6397855, 7383752, 8458379, 9629723, 10906488, 12298162, 13815086, 15468534,
  17270791, 19235252, 21376515, 23710491, 26254525, 29027522, 32050088, 35344686, 38935798, 42850109,
  47116709, 51767302, 56836449, 62361819, 68384473, 74949165, 82104680, 89904191, 98405658, 107672256,
  117772849, 128782495, 140783010, 153863570, 168121381, 183662396, 200602101, 219066380, 239192444,
  261129853, 285041630, 311105466, 339515048, 370481492, 404234916, 441026148,
];

export const MAX_LEVEL = XP_TABLE.length;

/** Total XP needed to reach `level` (1-based). */
export function xpForLevel(level: number): number {
  const i = Math.min(Math.max(Math.floor(level), 1), MAX_LEVEL) - 1;
  return XP_TABLE[i] ?? 0;
}

export interface XpProgress {
  /** XP earned inside the current level. */
  cur: number;
  /** XP span of the current level (0 at max level). */
  span: number;
  /** 0..1 fill of the bar (1 at max level). */
  frac: number;
  maxed: boolean;
}

export function xpProgress(level: number, xp: number): XpProgress {
  if (level >= MAX_LEVEL) return { cur: 0, span: 0, frac: 1, maxed: true };
  const lo = xpForLevel(level);
  const hi = xpForLevel(level + 1);
  const span = hi - lo;
  const cur = Math.min(Math.max(xp - lo, 0), span);
  return { cur, span, frac: span > 0 ? cur / span : 0, maxed: false };
}
