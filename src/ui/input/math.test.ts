import { describe, expect, it } from 'vitest';
import {
  angleBetween,
  applyRadialDeadzone,
  DirectionThrottle,
  followBase,
  isLongPress,
  isoScreenDirToSim,
  joystickVector,
  RepeatTimer,
  screenDirToSim,
} from './math';

describe('applyRadialDeadzone', () => {
  it('zeroes input inside the deadzone', () => {
    expect(applyRadialDeadzone(0.1, 0.1, 0.2)).toEqual({ dir: { x: 0, y: 0 }, magnitude: 0 });
    expect(applyRadialDeadzone(0, 0, 0)).toEqual({ dir: { x: 0, y: 0 }, magnitude: 0 });
  });
  it('rescales magnitude so the deadzone edge is 0 and full tilt is 1', () => {
    expect(applyRadialDeadzone(0.2001, 0, 0.2).magnitude).toBeCloseTo(0, 3);
    expect(applyRadialDeadzone(0.6, 0, 0.2).magnitude).toBeCloseTo(0.5);
    expect(applyRadialDeadzone(1, 0, 0.2).magnitude).toBeCloseTo(1);
    expect(applyRadialDeadzone(3, 4, 0.2).magnitude).toBe(1);
  });
  it('is radial: diagonal small input keeps its exact direction', () => {
    const r = applyRadialDeadzone(0.5, -0.5, 0.2);
    expect(r.dir.x).toBeCloseTo(Math.SQRT1_2);
    expect(r.dir.y).toBeCloseTo(-Math.SQRT1_2);
  });
});

describe('joystickVector / followBase', () => {
  it('normalizes by radius and clamps the knob', () => {
    expect(joystickVector(30, 0, 60)).toEqual({ x: 0.5, y: 0, knobX: 30, knobY: 0 });
    const v = joystickVector(0, 120, 60);
    expect(v.y).toBeCloseTo(1);
    expect(v.knobY).toBeCloseTo(60);
  });
  it('drags the base after a far finger', () => {
    expect(followBase({ x: 0, y: 0 }, { x: 50, y: 0 }, 60)).toEqual({ x: 0, y: 0 });
    const b = followBase({ x: 0, y: 0 }, { x: 184, y: 0 }, 60, 1.4);
    expect(b.x).toBeCloseTo(100);
  });
});

describe('screen -> sim directions', () => {
  it('iso fallback maps screen right / down to the iso diagonals', () => {
    const r = isoScreenDirToSim(1, 0);
    expect(r.x).toBeCloseTo(Math.SQRT1_2);
    expect(r.y).toBeCloseTo(-Math.SQRT1_2);
    const d = isoScreenDirToSim(0, 1);
    expect(d.x).toBeCloseTo(Math.SQRT1_2);
    expect(d.y).toBeCloseTo(Math.SQRT1_2);
  });
  it('uses the context projection when available', () => {
    const ctx = { screenToWorld: (px: number, py: number) => ({ x: px / 10, y: py / 10 }) };
    const v = screenDirToSim(ctx, { x: 100, y: 100 }, 0, -5);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(-1);
  });
  it('falls back when picking fails, zero stays zero', () => {
    const ctx = { screenToWorld: () => null };
    expect(screenDirToSim(ctx, { x: 0, y: 0 }, 1, 0).x).toBeCloseTo(Math.SQRT1_2);
    expect(screenDirToSim(ctx, { x: 0, y: 0 }, 0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('angleBetween', () => {
  it('handles zero vectors and opposite directions', () => {
    expect(angleBetween({ x: 1, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(Math.PI);
    expect(angleBetween({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0);
    expect(angleBetween({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(Math.PI);
  });
});

describe('DirectionThrottle', () => {
  it('sends on start, big turns, keep-alive, and a single stop', () => {
    const th = new DirectionThrottle((4 * Math.PI) / 180, 0.5);
    expect(th.next({ x: 1, y: 0 }, 0.016)).toEqual({ x: 1, y: 0 });
    expect(th.next({ x: 1, y: 0.01 }, 0.016)).toBeNull(); // < 4 degrees
    expect(th.next({ x: 0, y: 1 }, 0.016)).toEqual({ x: 0, y: 1 });
    expect(th.next({ x: 0, y: 1 }, 0.6)).toEqual({ x: 0, y: 1 }); // keep-alive
    expect(th.next({ x: 0, y: 0 }, 0.016)).toBe('stop');
    expect(th.next({ x: 0, y: 0 }, 0.016)).toBeNull();
  });
});

describe('RepeatTimer (hold-to-repeat)', () => {
  it('fires once per interval while active and never bursts', () => {
    const t = new RepeatTimer(0.1);
    expect(t.tick(1)).toBe(false); // inactive
    t.start();
    expect(t.tick(0.05)).toBe(false);
    expect(t.tick(0.05)).toBe(true);
    expect(t.tick(0.016)).toBe(false);
    let n = 0;
    for (let i = 0; i < 60; i++) if (t.tick(1 / 60)) n++;
    expect(n).toBeGreaterThanOrEqual(9);
    expect(n).toBeLessThanOrEqual(10);
    // a 1 second hitch yields one fire, then at most one more on the next frame
    expect(t.tick(1)).toBe(true);
    expect(t.tick(0)).toBe(true);
    expect(t.tick(0)).toBe(false);
    t.stop();
    expect(t.tick(1)).toBe(false);
  });
});

describe('isLongPress', () => {
  it('needs time and stillness', () => {
    expect(isLongPress(0.5, 3)).toBe(true);
    expect(isLongPress(0.3, 3)).toBe(false);
    expect(isLongPress(0.9, 30)).toBe(false);
  });
});
