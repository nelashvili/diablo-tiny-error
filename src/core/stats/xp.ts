/**
 * Experience table (D2-style, levels 1..75, cap 75).
 *
 * Levels 1-27 follow the exact D2 progression (the per-level increment grows x1.25, e.g. level 2 = 500,
 * 3 = 1500, 10 = 57715). Beyond that D2's ratio decays toward ~1; we model the decay with an exponential
 * fitted so level 99 would be ~3.47e9 (D2: 3.52e9). Values past ~27 are therefore approximations, not the
 * literal Experience.txt numbers.
 */
export const MAX_LEVEL = 75;

const EARLY: readonly number[] = [0, 0, 500, 1500, 3750, 7875, 14175, 22680, 32886, 44396, 57715, 72144];

const TABLE: number[] = (() => {
  const x = [...EARLY];
  let step = 14429; // increment from level 10 -> 11
  for (let l = 12; l <= MAX_LEVEL; l++) {
    step *= l <= 27 ? 1.25 : 1 + 0.25 * Math.exp(-0.04 * (l - 27));
    x[l] = (x[l - 1] as number) + Math.round(step);
  }
  return x;
})();

/** Total experience required to reach `lvl` (level 1 = 0). Clamped to 1..75. */
export function experienceForLevel(lvl: number): number {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(lvl)));
  return TABLE[l] as number;
}

/** Level (1..75) a character with total `xp` has reached. */
export function levelForExperience(xp: number): number {
  let lo = 1;
  let hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((TABLE[mid] as number) <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Experience still needed for the next level (0 at the cap). */
export function experienceToNext(xp: number): number {
  const l = levelForExperience(xp);
  return l >= MAX_LEVEL ? 0 : experienceForLevel(l + 1) - xp;
}

/**
 * XP multiplier for killing a monster, from level difference (D2-style):
 *  - Players up to level 25 take no penalty.
 *  - Monsters at or above the player's level give full XP (no bonus).
 *  - Above level 25, each level the monster is below the player removes 5% (floor 5%).
 */
export function xpPenaltyFactor(playerLvl: number, monsterLvl: number): number {
  if (playerLvl <= 25 || monsterLvl >= playerLvl) return 1;
  const diff = playerLvl - monsterLvl;
  return Math.max(0.05, 1 - diff * 0.05);
}
