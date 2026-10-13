import type { LevelScaled } from './schema';

/**
 * Evaluate a LevelScaled param at skill level `lvl` (1-based). D2 brackets:
 * levels 2-8, 9-16, 17-22, 23-28, 29+ use perLevel[0..4].
 */
export function evalLevel(v: LevelScaled | undefined, lvl: number): number {
  if (v === undefined) return 0;
  if (typeof v === 'number') return v;
  if ('table' in v) return v.table[Math.min(Math.max(lvl, 1), v.table.length) - 1] ?? 0;
  let total = v.base;
  for (let L = 2; L <= lvl; L++) {
    const b = L <= 8 ? 0 : L <= 16 ? 1 : L <= 22 ? 2 : L <= 28 ? 3 : 4;
    total += v.perLevel[b];
  }
  return total;
}
