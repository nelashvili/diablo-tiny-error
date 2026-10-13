import { describe, expect, it } from 'vitest';
import { evalLevel } from './levelScaled';

describe('evalLevel', () => {
  it('handles numbers, tables and D2 brackets', () => {
    expect(evalLevel(5, 3)).toBe(5);
    expect(evalLevel({ table: [1, 2, 3] }, 2)).toBe(2);
    expect(evalLevel({ table: [1, 2, 3] }, 9)).toBe(3);
    const v = { base: 10, perLevel: [1, 2, 3, 4, 5] as [number, number, number, number, number] };
    expect(evalLevel(v, 1)).toBe(10);
    expect(evalLevel(v, 8)).toBe(17);
    expect(evalLevel(v, 9)).toBe(19);
  });
});
