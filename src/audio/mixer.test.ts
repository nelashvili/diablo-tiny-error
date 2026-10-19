import { describe, expect, it } from 'vitest';
import {
  busGains,
  clamp01,
  distanceGain,
  pickTake,
  finalGain,
  nextTake,
  panFor,
  positional,
  SfxThrottle,
  VoiceLimiter,
} from './mixer';

describe('volume buses', () => {
  it('clamps and sanitizes', () => {
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(5)).toBe(1);
    expect(clamp01(-1)).toBe(0);
  });
  it('applies a squared curve', () => {
    expect(busGains({ master: 0.5, music: 1, sfx: 0, voice: 0.5 })).toEqual({
      master: 0.25,
      music: 1,
      sfx: 0,
      voice: 0.25,
    });
  });
  it('multiplies base, bus and master', () => {
    const v = { master: 0.5, music: 0.5, sfx: 1, voice: 1 };
    expect(finalGain(1, 'sfx', v)).toBeCloseTo(0.25);
    expect(finalGain(0.5, 'music', v)).toBeCloseTo(0.5 * 0.25 * 0.25);
  });
});

describe('positional', () => {
  it('distance gain falls off', () => {
    expect(distanceGain(0)).toBe(1);
    expect(distanceGain(100)).toBe(0);
    expect(distanceGain(10)).toBeLessThan(distanceGain(5));
  });
  it('pans by isometric screen x', () => {
    expect(panFor(10, 0)).toBeGreaterThan(0);
    expect(panFor(0, 10)).toBeLessThan(0);
    expect(panFor(5, 5)).toBe(0);
    expect(panFor(100, 0)).toBe(1);
  });
  it('combines', () => {
    const p = positional({ x: 0, y: 0 }, { x: 8, y: 0 });
    expect(p.gain).toBeGreaterThan(0);
    expect(p.gain).toBeLessThan(1);
    expect(p.pan).toBeGreaterThan(0);
  });
});

describe('VoiceLimiter', () => {
  it('caps per id and releases', () => {
    const l = new VoiceLimiter(2, 10);
    const a = l.acquire('x');
    const b = l.acquire('x');
    expect(a && b).toBeTruthy();
    expect(l.acquire('x')).toBe(0);
    expect(l.acquire('y')).toBeGreaterThan(0);
    l.release(a);
    expect(l.count('x')).toBe(1);
    expect(l.acquire('x')).toBeGreaterThan(0);
  });
  it('caps globally and honors overrides', () => {
    const l = new VoiceLimiter(5, 3, { solo: 1 });
    expect(l.acquire('solo')).toBeGreaterThan(0);
    expect(l.acquire('solo')).toBe(0);
    l.acquire('a');
    l.acquire('b');
    expect(l.acquire('c')).toBe(0);
    expect(l.count()).toBe(3);
  });
  it('double release is harmless', () => {
    const l = new VoiceLimiter();
    const h = l.acquire('x');
    l.release(h);
    l.release(h);
    expect(l.count()).toBe(0);
  });
});

describe('SfxThrottle', () => {
  it('limits per batch', () => {
    const t = new SfxThrottle(0, 3);
    t.beginBatch();
    let n = 0;
    for (let i = 0; i < 50; i++) if (t.allow('hit', 1)) n++;
    expect(n).toBe(3);
    t.beginBatch();
    expect(t.allow('hit', 1)).toBe(true);
  });
  it('enforces cooldown', () => {
    const t = new SfxThrottle(0.1, 10);
    t.beginBatch();
    expect(t.allow('a', 1)).toBe(true);
    expect(t.allow('a', 1.05)).toBe(false);
    expect(t.allow('a', 1.2)).toBe(true);
    expect(t.allow('b', 1.0)).toBe(true);
  });
});

describe('pickTake', () => {
  const cat = {
    a: { variants: ['a.2', 'missing'], rate: [1, 1] as [number, number] },
    'a.2': { rate: [0.5, 1.5] as [number, number] },
    plain: {},
  };
  it('alternates between the entry and its existing variants', () => {
    expect(pickTake('a', cat, 0, 0).id).toBe('a');
    expect(pickTake('a', cat, 0.99, 0).id).toBe('a.2');
  });
  it("draws the rate from the chosen take's range", () => {
    expect(pickTake('a', cat, 0.99, 0.5).rate).toBeCloseTo(1);
    expect(pickTake('a', cat, 0.99, 0).rate).toBeCloseTo(0.5);
    expect(pickTake('plain', cat, 0.3, 0.7)).toEqual({ id: 'plain', rate: 1 });
  });
});

describe('nextTake', () => {
  it('never repeats the last take when there is a choice', () => {
    for (let last = 0; last < 8; last++)
      for (const r of [0, 0.3, 0.5, 0.99]) {
        const t = nextTake(8, last, r);
        expect(t).not.toBe(last);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThan(8);
      }
  });
  it('covers every other take and handles one take or no history', () => {
    const seen = new Set([0, 1, 2, 3, 4, 5, 6].map((k) => nextTake(8, 3, k / 7 + 0.01)));
    expect(seen.size).toBe(7);
    expect(nextTake(1, 0, 0.7)).toBe(0);
    expect(nextTake(4, undefined, 0.6)).toBe(2);
  });
});
