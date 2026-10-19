import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY_MULT,
  MAX_MONSTER_LEVEL,
  levelMultipliers,
  scaledMultipliers,
  clampMonsterLevel,
} from './scaling';

describe('monster level scaling', () => {
  const keys = ['life', 'defense', 'attackRating', 'damage', 'xp'] as const;

  it('is strictly increasing across levels 1..85 for every column', () => {
    for (const k of keys) {
      for (let l = 2; l <= MAX_MONSTER_LEVEL; l++) {
        expect(levelMultipliers(l)[k], `${k} @ ${l}`).toBeGreaterThan(levelMultipliers(l - 1)[k]);
      }
    }
  });

  it('spot checks', () => {
    expect(levelMultipliers(1).life).toBe(1);
    expect(levelMultipliers(10).life).toBeCloseTo(3.2, 5);
    expect(levelMultipliers(5).damage).toBeCloseTo(1.6, 5);
    expect(levelMultipliers(85).life).toBeCloseTo(600, 5);
    expect(levelMultipliers(30).damage).toBeCloseTo(16, 5);
  });

  it('clamps out-of-range levels', () => {
    expect(clampMonsterLevel(0)).toBe(1);
    expect(clampMonsterLevel(200)).toBe(85);
    expect(levelMultipliers(500)).toEqual(levelMultipliers(85));
  });

  it('difficulty multiplies on top and is monotonic', () => {
    const base = levelMultipliers(20);
    const normal = scaledMultipliers(20, 'normal');
    for (const k of keys) expect(normal[k]).toBeCloseTo(base[k] * DIFFICULTY_MULT.normal[k], 9);
    // Normal is softened: monsters never hit harder or more accurately than the raw level table.
    expect(DIFFICULTY_MULT.normal.damage).toBeLessThanOrEqual(1);
    expect(DIFFICULTY_MULT.normal.attackRating).toBeLessThanOrEqual(1);
    for (const k of keys) {
      expect(DIFFICULTY_MULT.veteran[k]).toBeGreaterThan(DIFFICULTY_MULT.normal[k]);
      expect(DIFFICULTY_MULT.legend[k]).toBeGreaterThan(DIFFICULTY_MULT.veteran[k]);
    }
  });
});

describe('rankMultFor', () => {
  it('scales a boss on an ordinary model as a superunique, above a unique', async () => {
    const { rankMultFor, RANK_MULT } = await import('./scaling');
    expect(rankMultFor({ flags: {} }, 'boss')).toBe(RANK_MULT.superunique);
    expect(rankMultFor({ flags: { boss: true } }, 'boss')).toBe(RANK_MULT.boss);
    expect(RANK_MULT.superunique.life).toBeGreaterThan(RANK_MULT.unique.life);
  });
});
