import { describe, expect, it } from 'vitest';
import { SimWorld } from './world';
import { FixedLoop } from './loop';

describe('FixedLoop', () => {
  it('runs 25 ticks per simulated second', () => {
    const w = new SimWorld(1);
    let calls = 0;
    const loop = new FixedLoop(w, [{ name: 'count', update: () => void calls++ }]);
    for (let i = 0; i < 60; i++) loop.advance(1 / 60);
    expect(calls).toBeGreaterThanOrEqual(24);
    expect(calls).toBeLessThanOrEqual(25);
    expect(w.tick).toBe(calls);
  });
});
