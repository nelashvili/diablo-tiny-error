import { describe, expect, it } from 'vitest';
import {
  ISO_PITCH,
  ISO_YAW,
  distSqToSegment,
  effectiveViewHeight,
  isoBasis,
  ndcToGround,
  smoothFactor,
  worldToNdc,
} from './isoMath';
import { Shake } from './shake';

describe('iso basis', () => {
  const b = isoBasis();
  const len = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);
  const dot = (a: typeof b.right, c: typeof b.right) => a.x * c.x + a.y * c.y + a.z * c.z;

  it('uses the D2 angle', () => {
    expect((ISO_PITCH * 180) / Math.PI).toBeCloseTo(35.264, 2);
    expect((ISO_YAW * 180) / Math.PI).toBeCloseTo(45, 6);
  });

  it('is orthonormal', () => {
    for (const v of [b.right, b.up, b.fwd, b.toCam]) expect(len(v)).toBeCloseTo(1, 6);
    expect(dot(b.right, b.up)).toBeCloseTo(0, 6);
    expect(dot(b.right, b.fwd)).toBeCloseTo(0, 6);
    expect(dot(b.up, b.fwd)).toBeCloseTo(0, 6);
    expect(b.up.y).toBeGreaterThan(0);
  });

  it('round-trips ground points through NDC', () => {
    const c = { x: 10, y: 0, z: 20 };
    const out = { x: 0, y: 0 };
    const g = { x: 0, z: 0 };
    for (const [x, z] of [
      [10, 20],
      [14, 17],
      [3, 31],
      [-4.5, 8.25],
    ] as const) {
      worldToNdc(b, c, x, 0, z, 8, 5, out);
      expect(ndcToGround(b, c, out.x, out.y, 8, 5, g)).toBe(true);
      expect(g.x).toBeCloseTo(x, 6);
      expect(g.z).toBeCloseTo(z, 6);
    }
  });

  it('puts the camera center target at NDC origin and east to the right', () => {
    const c = { x: 5, y: 0, z: 5 };
    const o = { x: 0, y: 0 };
    worldToNdc(b, c, 5, 0, 5, 4, 3, o);
    expect(o.x).toBeCloseTo(0);
    expect(o.y).toBeCloseTo(0);
    worldToNdc(b, c, 6, 0, 5, 4, 3, o);
    expect(o.x).toBeGreaterThan(0);
    // +z (south) moves toward the camera: lower on screen
    worldToNdc(b, c, 5, 0, 6, 4, 3, o);
    expect(o.y).toBeLessThan(0);
  });

  it('compresses ground depth by sin(pitch)', () => {
    const c = { x: 0, y: 0, z: 0 };
    const o = { x: 0, y: 0 };
    worldToNdc(b, c, 1, 0, 1, 1, 1, o);
    // diagonal step (1,1) is along toCam horizontally: pure vertical on screen
    expect(o.x).toBeCloseTo(0, 6);
    expect(Math.abs(o.y)).toBeCloseTo(Math.SQRT2 * Math.sin(ISO_PITCH), 6);
  });
});

describe('helpers', () => {
  it('effectiveViewHeight widens portrait views', () => {
    expect(effectiveViewHeight(15, 1.78)).toBe(15);
    expect(effectiveViewHeight(15, 0.75)).toBeCloseTo(25);
  });
  it('distSqToSegment', () => {
    expect(distSqToSegment(0, 1, -1, 0, 1, 0)).toBeCloseTo(1);
    expect(distSqToSegment(3, 0, -1, 0, 1, 0)).toBeCloseTo(4);
    expect(distSqToSegment(1, 1, 0, 0, 0, 0)).toBeCloseTo(2);
  });
  it('smoothFactor is framerate independent', () => {
    const a = 1 - (1 - smoothFactor(5, 0.01)) ** 10;
    expect(a).toBeCloseTo(smoothFactor(5, 0.1), 9);
  });
});

describe('Shake', () => {
  it('decays and can be disabled', () => {
    const s = new Shake();
    s.add(1);
    s.update(0.016);
    expect(Math.abs(s.offX) + Math.abs(s.offY)).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++) s.update(0.05);
    expect(s.trauma).toBe(0);
    expect(s.offX).toBe(0);
    s.setEnabled(false);
    s.add(1);
    expect(s.trauma).toBe(0);
  });
});
