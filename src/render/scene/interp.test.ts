import { describe, expect, it } from 'vitest';
import { MotionBuffer, lerpAngle, type MotionSample } from './interp';
import { AdaptiveScale } from './adaptiveScale';

describe('lerpAngle', () => {
  it('takes the short way around', () => {
    expect(lerpAngle(3.0, -3.0, 0.5)).toBeCloseTo(Math.PI, 1);
    expect(lerpAngle(0, 1, 0.5)).toBeCloseTo(0.5);
    expect(lerpAngle(-3.0, 3.0, 0.5)).toBeCloseTo(-Math.PI, 1);
  });
});

describe('MotionBuffer', () => {
  const out: MotionSample = { x: 0, y: 0, facing: 0 };
  it('starts at the first position', () => {
    const m = new MotionBuffer();
    m.push(1, 5, 6, 0.5);
    m.sample(0.5, out);
    expect(out).toEqual({ x: 5, y: 6, facing: 0.5 });
  });
  it('interpolates between the last two ticks', () => {
    const m = new MotionBuffer();
    m.push(1, 0, 0, 0);
    m.push(2, 2, 3, 0);
    m.sample(0.25, out);
    expect(out.x).toBeCloseTo(0.5);
    expect(out.y).toBeCloseTo(0.75);
    m.push(2, 99, 99, 0); // same tick: ignored
    m.sample(1, out);
    expect(out.x).toBeCloseTo(2);
  });
  it('shifts the window each tick and clamps alpha', () => {
    const m = new MotionBuffer();
    m.push(1, 0, 0, 0);
    m.push(2, 1, 0, 0);
    m.push(3, 2, 0, 0);
    m.sample(0, out);
    expect(out.x).toBeCloseTo(1);
    m.sample(5, out);
    expect(out.x).toBeCloseTo(2);
    m.sample(-1, out);
    expect(out.x).toBeCloseTo(1);
  });
  it('snaps on teleports', () => {
    const m = new MotionBuffer(4);
    m.push(1, 0, 0, 0);
    m.push(2, 50, 50, 0);
    m.sample(0.5, out);
    expect(out.x).toBe(50);
  });
});

describe('AdaptiveScale', () => {
  it('drops under sustained slowness and recovers', () => {
    const a = new AdaptiveScale();
    let changed = false;
    for (let i = 0; i < 100; i++) changed = a.update(40) || changed;
    expect(changed).toBe(true);
    expect(a.scale).toBeLessThan(1);
    expect(a.scale).toBeGreaterThanOrEqual(0.6);
    for (let i = 0; i < 2000; i++) a.update(8);
    expect(a.scale).toBe(1);
  });
});
