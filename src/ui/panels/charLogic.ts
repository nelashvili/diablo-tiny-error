/**
 * Pure character-sheet helpers: "Suggested" stat hint (PLAN §4, optional, never auto-assigns)
 * and resist/value formatting.
 */
import type { ClassId } from '../../core/types';

export type AttrId = 'strength' | 'dexterity' | 'vitality' | 'energy';
export const ATTRS: readonly AttrId[] = ['strength', 'dexterity', 'vitality', 'energy'];

type Attrs = Record<AttrId, number>;

/**
 * Classic D2 advice per class: enough Strength for gear, Dexterity for aim/block, a bit of
 * Energy for casters early, everything else Vitality. Targets grow with character level.
 */
export function statTargets(classId: ClassId, level: number): Omit<Attrs, 'vitality'> {
  const L = Math.max(1, level);
  switch (classId) {
    case 'yediKnight':
      return {
        strength: Math.min(156, Math.round(30 + L * 1.5)),
        dexterity: Math.min(90, Math.round(20 + L * 0.7)),
        energy: 0,
      };
    case 'bountyHuntur':
      return {
        strength: Math.min(100, Math.round(20 + L * 0.8)),
        dexterity: Math.min(250, Math.round(25 + L * 2.4)),
        energy: 0,
      };
    case 'forseAdept':
      return {
        // Staffs and focuses hit harder with energy; strength only for gear requirements.
        strength: Math.min(60, Math.round(10 + L * 0.5)),
        dexterity: Math.min(50, Math.round(25 + L * 0.3)),
        energy: Math.min(220, Math.round(35 + L * 1.8)),
      };
  }
}

/**
 * Which attribute to highlight as "Suggested". `base` = class start + allocated points
 * (hard stats, not item-boosted). Picks the biggest relative shortfall; otherwise Vitality.
 */
export function suggestStat(classId: ClassId, level: number, base: Attrs): AttrId {
  const targets = statTargets(classId, level);
  let best: AttrId = 'vitality';
  let bestGap = 0;
  for (const k of ['strength', 'dexterity', 'energy'] as const) {
    const gap = (targets[k] - base[k]) / Math.max(1, targets[k]);
    if (gap > 0.04 && gap > bestGap) {
      best = k;
      bestGap = gap;
    }
  }
  return best;
}

export type ResistTone = 'negative' | 'low' | 'good' | 'max';

export function resistTone(value: number, max = 75): ResistTone {
  if (value < 0) return 'negative';
  if (value >= max) return 'max';
  if (value < 30) return 'low';
  return 'good';
}

/** "12-34" with integers. */
export function range(min: number, max: number): string {
  const a = Math.round(min);
  const b = Math.round(max);
  return a === b ? `${a}` : `${a}-${b}`;
}

/** D2 XP curve is owned by core/player (Wave 2); fallback approximation for the bar. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  // Smooth approximation of the D2 experience table for the first ~75 levels.
  return Math.round(500 * Math.pow(level - 1, 2.4) + 0.5);
}

export function xpProgress(xp: number, level: number, table?: (lvl: number) => number) {
  const f = table ?? xpForLevel;
  const cur = f(level);
  const next = f(level + 1);
  const pct = next > cur ? Math.max(0, Math.min(1, (xp - cur) / (next - cur))) : 1;
  return { cur, next, pct };
}

/** Speed multiplier (1 = base) → "+12%" label. */
export function pctLabel(mul: number): string {
  const p = Math.round((mul - 1) * 100);
  return `${p >= 0 ? '+' : ''}${p}%`;
}
