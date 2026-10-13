import { describe, expect, it } from 'vitest';
import { placeTooltip } from './position';

const vp = { w: 1000, h: 600 };

describe('placeTooltip', () => {
  it('prefers the right side', () => {
    const p = placeTooltip({ x: 100, y: 100, w: 40, h: 40 }, { w: 200, h: 100 }, vp);
    expect(p.side).toBe('right');
    expect(p.x).toBe(150);
    expect(p.y).toBe(70);
  });
  it('flips left near the right edge', () => {
    const p = placeTooltip({ x: 900, y: 100, w: 40, h: 40 }, { w: 200, h: 100 }, vp);
    expect(p.side).toBe('left');
    expect(p.x + 200).toBeLessThanOrEqual(900);
  });
  it('clamps vertically inside the viewport', () => {
    const p = placeTooltip({ x: 100, y: 580, w: 40, h: 20 }, { w: 200, h: 300 }, vp);
    expect(p.y + 300).toBeLessThanOrEqual(600 - 8);
    expect(p.y).toBeGreaterThanOrEqual(8);
  });
  it('uses top/bottom when sides do not fit', () => {
    const p = placeTooltip({ x: 400, y: 400, w: 200, h: 40 }, { w: 420, h: 100 }, { w: 1000, h: 600 }, [
      'right',
      'left',
      'top',
    ]);
    expect(p.side).toBe('top');
    expect(p.y).toBe(290);
  });
  it('falls back to an in-viewport overlap on tiny screens', () => {
    const p = placeTooltip({ x: 10, y: 10, w: 300, h: 300 }, { w: 300, h: 330 }, { w: 320, h: 340 });
    expect(p.side).toBe('overlap');
    expect(p.x).toBeGreaterThanOrEqual(8);
    expect(p.y).toBeGreaterThanOrEqual(8);
  });
  it('respects a custom preference order', () => {
    const p = placeTooltip({ x: 400, y: 300, w: 40, h: 40 }, { w: 100, h: 50 }, vp, ['bottom']);
    expect(p.side).toBe('bottom');
    expect(p.y).toBe(350);
  });
});
