/**
 * D2 MonLvl.txt analog: per-monster-level multipliers (1..85) for life, defense, attack rating,
 * damage and experience, plus per-difficulty multipliers layered on top.
 *
 * The curves are piecewise-linear interpolations through anchor points approximating D2's
 * MonLvl.txt shape (slow start, steepening mid-game). They are strictly increasing in level.
 */
import type { Difficulty } from '../types';
import { DIFFICULTIES } from '../types';

export const MIN_MONSTER_LEVEL = 1;
export const MAX_MONSTER_LEVEL = 85;

type Anchors = readonly (readonly [number, number])[];

function buildTable(anchors: Anchors): readonly number[] {
  const out: number[] = [0]; // index 0 unused so table[level] is direct
  for (let lvl = MIN_MONSTER_LEVEL; lvl <= MAX_MONSTER_LEVEL; lvl++) {
    let i = 0;
    while (i < anchors.length - 2 && lvl > (anchors[i + 1] as readonly [number, number])[0]) i++;
    const [x0, y0] = anchors[i] as readonly [number, number];
    const [x1, y1] = anchors[i + 1] as readonly [number, number];
    const f = (lvl - x0) / (x1 - x0);
    out.push(y0 + (y1 - y0) * f);
  }
  return out;
}

const LIFE = buildTable([
  [1, 1],
  [10, 8],
  [20, 22],
  [30, 48],
  [40, 95],
  [50, 170],
  [60, 270],
  [70, 380],
  [85, 600],
]);
const DEFENSE = buildTable([
  [1, 1],
  [20, 5],
  [40, 11],
  [60, 18],
  [85, 30],
]);
const ATTACK_RATING = buildTable([
  [1, 1],
  [20, 4],
  [40, 9],
  [60, 15],
  [85, 25],
]);
const DAMAGE = buildTable([
  [1, 1],
  [10, 4],
  [20, 9],
  [30, 16],
  [50, 36],
  [70, 70],
  [85, 100],
]);
const XP = buildTable([
  [1, 1],
  [10, 6],
  [30, 40],
  [60, 200],
  [85, 600],
]);

export interface LevelMultipliers {
  life: number;
  defense: number;
  attackRating: number;
  damage: number;
  xp: number;
}

/** Extra multipliers by difficulty (D2 Nightmare/Hell columns). */
export const DIFFICULTY_MULT: Record<Difficulty, LevelMultipliers> = {
  normal: { life: 1, defense: 1, attackRating: 1, damage: 1, xp: 1 },
  veteran: { life: 1.7, defense: 1.4, attackRating: 1.4, damage: 1.5, xp: 1.6 },
  legend: { life: 2.8, defense: 2, attackRating: 2, damage: 2.2, xp: 2.4 },
};

export const clampMonsterLevel = (level: number): number =>
  Math.min(MAX_MONSTER_LEVEL, Math.max(MIN_MONSTER_LEVEL, Math.round(level)));

/** Level-only multipliers (no difficulty). Level is clamped to 1..85. */
export function levelMultipliers(level: number): LevelMultipliers {
  const l = clampMonsterLevel(level);
  return {
    life: LIFE[l] as number,
    defense: DEFENSE[l] as number,
    attackRating: ATTACK_RATING[l] as number,
    damage: DAMAGE[l] as number,
    xp: XP[l] as number,
  };
}

/** Level multipliers combined with difficulty multipliers. */
export function scaledMultipliers(level: number, difficulty: Difficulty): LevelMultipliers {
  const a = levelMultipliers(level);
  const d = DIFFICULTY_MULT[difficulty];
  return {
    life: a.life * d.life,
    defense: a.defense * d.defense,
    attackRating: a.attackRating * d.attackRating,
    damage: a.damage * d.damage,
    xp: a.xp * d.xp,
  };
}

export const difficultyIndex = (d: Difficulty): number => DIFFICULTIES.indexOf(d);

/** Rank multipliers (D2: champions ~ x2.5 life, uniques ~ x3; minions are plain). */
export const RANK_MULT = {
  normal: { life: 1, damage: 1, attackRating: 1, xp: 1 },
  minion: { life: 1, damage: 1, attackRating: 1, xp: 1 },
  summon: { life: 1, damage: 1, attackRating: 1, xp: 0 },
  champion: { life: 2.5, damage: 1.4, attackRating: 1.3, xp: 3 },
  unique: { life: 3, damage: 1.5, attackRating: 1.4, xp: 5 },
  boss: { life: 1, damage: 1, attackRating: 1, xp: 1 },
} as const;
