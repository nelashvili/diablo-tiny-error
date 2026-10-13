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
    expect(levelMultipliers(10).life).toBeCloseTo(8, 5);
    expect(levelMultipliers(85).life).toBeCloseTo(600, 5);
    expect(levelMultipliers(30).damage).toBeCloseTo(16, 5);
  });

  it('clamps out-of-range levels', () => {
    expect(clampMonsterLevel(0)).toBe(1);
    expect(clampMonsterLevel(200)).toBe(85);
    expect(levelMultipliers(500)).toEqual(levelMultipliers(85));
  });

  it('difficulty multiplies on top and is monotonic', () => {
    expect(scaledMultipliers(20, 'normal')).toEqual(levelMultipliers(20));
    for (const k of keys) {
      expect(DIFFICULTY_MULT.veteran[k]).toBeGreaterThan(DIFFICULTY_MULT.normal[k]);
      expect(DIFFICULTY_MULT.legend[k]).toBeGreaterThan(DIFFICULTY_MULT.veteran[k]);
    }
  });
});
