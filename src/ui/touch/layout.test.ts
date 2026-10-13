import { describe, expect, it } from 'vitest';
import { computeWheelLayout, SLOT_COUNT } from './layout';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('computeWheelLayout', () => {
  for (const [w, h] of [
    [1024, 768],
    [768, 1024],
    [844, 390],
    [667, 375],
    [1366, 1024],
  ] as const) {
    it(`${w}x${h}: big enough, no overlaps, fits on screen`, () => {
      const L = computeWheelLayout(w, h);
      expect(L.slots).toHaveLength(SLOT_COUNT);
      expect(L.skillSize).toBeGreaterThanOrEqual(56);
      expect(L.primarySize).toBeGreaterThanOrEqual(84);
      const circles = [
        { p: { x: 0, y: 0 }, r: L.primarySize / 2 },
        ...L.slots.map((p) => ({ p, r: L.skillSize / 2 })),
        { p: L.stims.life, r: L.stimSize / 2 },
        { p: L.stims.mana, r: L.stimSize / 2 },
        { p: L.belt, r: L.beltSize / 2 },
      ];
      for (let i = 0; i < circles.length; i++)
        for (let j = i + 1; j < circles.length; j++)
          expect(dist(circles[i]!.p, circles[j]!.p)).toBeGreaterThanOrEqual(
            circles[i]!.r + circles[j]!.r - 0.5,
          );
      for (const c of circles) {
        expect(w - L.margin.right + c.p.x - c.r).toBeGreaterThanOrEqual(0);
        expect(w - L.margin.right + c.p.x + c.r).toBeLessThanOrEqual(w);
        expect(h - L.margin.bottom + c.p.y - c.r).toBeGreaterThanOrEqual(0);
        expect(h - L.margin.bottom + c.p.y + c.r).toBeLessThanOrEqual(h);
      }
    });
  }
});
