/**
 * Pure D2 (LoD 1.14 / D2R) formula helpers. No state, no RNG.
 */
import type { Difficulty } from '../types';
import type { DerivedStats } from './types';

/** Diminishing-returns curve: k*x/(k+x). Used for FRW (k=150) and, floored, IAS/FCR/FHR/FBR (k=120). */
export function diminishing(x: number, k: number): number {
  if (x <= 0) return x; // negative values (slows) are linear
  return (k * x) / (k + x);
}

/** D2 "effective" speed stat: floor(120*x/(120+x)). 20 IAS -> 17. */
export function effectiveSpeedStat(x: number): number {
  return Math.floor(diminishing(x, 120));
}

export const MAX_EFFECTIVE_IAS = 75;

/** Speed multiplier (1 = base) from raw IAS%. EIAS capped at 75; slows floor at 0.25x. */
export function attackSpeedMulFromIas(ias: number): number {
  const eias = Math.min(MAX_EFFECTIVE_IAS, effectiveSpeedStat(ias));
  return Math.max(0.25, 1 + eias / 100);
}

/** FCR / FHR / FBR multiplier from raw %. */
export function speedMulFrom120(pct: number): number {
  return Math.max(0.25, 1 + effectiveSpeedStat(pct) / 100);
}

/** Run/walk multiplier from raw FRW%: 1 + 150*x/(150+x)/100 (asymptote 2.5x). */
export function moveSpeedMulFromFrw(frw: number): number {
  return Math.max(0.25, 1 + diminishing(frw, 150) / 100);
}

/** Percent resistance penalty applied to the player side per difficulty. */
export const RESIST_PENALTY: Record<Difficulty, number> = { normal: 0, veteran: -40, legend: -100 };

export const BASE_MAX_RES = 75;
export const ABSOLUTE_MAX_RES = 95;
export const MIN_RES = -100;

/** Max resist for a player: 75 + bonus, hard cap 95. */
export function maxResist(bonus: number): number {
  return Math.min(ABSOLUTE_MAX_RES, BASE_MAX_RES + bonus);
}

/** Final resist: raw + difficulty penalty, clamped to [-100, max]. */
export function finalResist(raw: number, difficulty: Difficulty, max: number, applyPenalty: boolean): number {
  const r = raw + (applyPenalty ? RESIST_PENALTY[difficulty] : 0);
  return Math.max(MIN_RES, Math.min(max, r));
}

/** Apply a resist percentage to damage. res >= 100 -> immune (0). Negative res amplifies (max 2x). */
export function applyResist(damage: number, res: number): number {
  if (damage <= 0) return 0;
  if (res >= 100) return 0;
  return damage * (1 - Math.max(MIN_RES, res) / 100);
}

/** D2 attack rating from dexterity: dex*5 - 35 (never below 0). */
export function attackRatingFromDex(dex: number): number {
  return Math.max(0, dex * 5 - 35);
}

/** D2 defense from dexterity: floor(dex/4). */
export function defenseFromDex(dex: number): number {
  return Math.floor(dex / 4);
}

/**
 * D2 chance to hit, in percent [5, 95]:
 * 200% * AR/(AR+DEF) * Alvl/(Alvl+Dlvl).
 */
export function hitChance(ar: number, def: number, alvl: number, dlvl: number): number {
  if (ar <= 0) return 5;
  const d = Math.max(0, def);
  const levelTerm = alvl + dlvl > 0 ? alvl / (alvl + dlvl) : 0.5;
  const pct = 200 * (ar / (ar + d)) * levelTerm;
  return Math.max(5, Math.min(95, pct));
}

export const MAX_BLOCK = 75;

/** Levels below this count as this level in the block formula. */
export const BLOCK_MIN_LEVEL = 3;

/**
 * D2 final block %: floor(shieldBlock * (dex - 15) / (clvl * 2)), capped at 75. Levels 1-2 count as 3:
 * otherwise a fresh hero with the starting shield sat at the 75% cap and Act I barely touched them.
 */
export function blockChanceFinal(rawBlock: number, dex: number, clvl: number): number {
  if (rawBlock <= 0) return 0;
  const v = Math.floor((rawBlock * Math.max(0, dex - 15)) / (Math.max(BLOCK_MIN_LEVEL, clvl) * 2));
  return Math.max(0, Math.min(MAX_BLOCK, v));
}

/** Combined chance (percent) of two independent percent chances: 1-(1-a)(1-b). */
export function combineChances(a: number, b: number): number {
  const pa = Math.max(0, Math.min(100, a)) / 100;
  const pb = Math.max(0, Math.min(100, b)) / 100;
  return (1 - (1 - pa) * (1 - pb)) * 100;
}

export interface Requirements {
  level?: number;
  strength?: number;
  dexterity?: number;
  vitality?: number;
  energy?: number;
}

/** Does a character (level + final attributes) meet an item/skill requirement set? */
export function meetsRequirements(
  stats: Pick<DerivedStats, 'strength' | 'dexterity' | 'vitality' | 'energy'>,
  level: number,
  req: Requirements,
): boolean {
  return (
    level >= (req.level ?? 0) &&
    stats.strength >= (req.strength ?? 0) &&
    stats.dexterity >= (req.dexterity ?? 0) &&
    stats.vitality >= (req.vitality ?? 0) &&
    stats.energy >= (req.energy ?? 0)
  );
}

/** Mana regen: a full pool regenerates in ~120 s, scaled by +% mana regeneration. */
export const MANA_REGEN_FULL_SECONDS = 120;
export function manaRegenPerSec(manaMax: number, regenPct: number): number {
  return (manaMax / MANA_REGEN_FULL_SECONDS) * Math.max(0, 1 + regenPct / 100);
}
