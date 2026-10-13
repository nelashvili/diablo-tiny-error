import { describe, expect, it } from 'vitest';
import { QualityGovernor, autoQuality, detectDevice } from './device';

const IPAD = {
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  platform: 'MacIntel',
  maxTouchPoints: 5,
  hardwareConcurrency: 6,
};
const CROS = {
  userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  platform: 'Linux x86_64',
  maxTouchPoints: 10,
  deviceMemory: 4,
  hardwareConcurrency: 4,
};

describe('device detection', () => {
  it('detects iPadOS posing as a Mac', () => {
    const d = detectDevice(IPAD, { webgl2: true });
    expect(d.ios).toBe(true);
    expect(d.touch).toBe(true);
    expect(d.phone).toBe(false);
    expect(autoQuality(d)).toBe('medium');
  });
  it('detects a desktop Mac without touch', () => {
    const d = detectDevice(
      { userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 0, hardwareConcurrency: 10 },
      { webgl2: true },
    );
    expect(d.ios).toBe(false);
    expect(d.touch).toBe(false);
    expect(autoQuality(d)).toBe('high');
  });
  it('detects Chromebooks and low memory', () => {
    const d = detectDevice(CROS, { webgl2: true });
    expect(d.chromebook).toBe(true);
    expect(autoQuality(d)).toBe('low');
    const weak = detectDevice({ ...CROS, deviceMemory: 2 }, { webgl2: true });
    expect(weak.lowMemory).toBe(true);
  });
  it('detects Android phones', () => {
    const d = detectDevice(
      {
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile Safari',
        maxTouchPoints: 5,
        deviceMemory: 8,
        hardwareConcurrency: 8,
      },
      { webgl2: true },
    );
    expect(d.android).toBe(true);
    expect(d.phone).toBe(true);
    expect(autoQuality(d)).toBe('low');
  });
  it('webgl2 flag via injected canvas failure', () => {
    // no document in node env -> false, no throw
    expect(detectDevice({}, {}).webgl2).toBe(false);
  });
});

describe('QualityGovernor', () => {
  const feed = (g: QualityGovernor, ms: number, frames: number) => {
    const out = [];
    for (let i = 0; i < frames; i++) {
      const s = g.push(ms);
      if (s) out.push(s);
    }
    return out;
  };

  it('downgrades only after consecutive slow windows', () => {
    const g = new QualityGovernor('high', { windowFrames: 10 });
    expect(feed(g, 40, 10)).toEqual([]); // one slow window is not enough
    expect(g.level).toBe('high');
    const s = feed(g, 40, 10);
    expect(s).toEqual([{ action: 'downgrade', from: 'high', to: 'medium' }]);
    expect(g.level).toBe('medium');
  });

  it('a fast window between slow ones resets the streak', () => {
    const g = new QualityGovernor('high', { windowFrames: 10 });
    feed(g, 40, 10);
    feed(g, 16, 10);
    expect(feed(g, 40, 10)).toEqual([]);
    expect(g.level).toBe('high');
  });

  it('upgrades slowly and never back to a level that just failed', () => {
    const g = new QualityGovernor('medium', { windowFrames: 10 });
    expect(feed(g, 16, 50)).toEqual([]); // 5 fast windows < 6
    expect(feed(g, 16, 10)).toEqual([{ action: 'upgrade', from: 'medium', to: 'high' }]);
    feed(g, 40, 20); // fails at high
    expect(g.level).toBe('medium');
    expect(feed(g, 16, 200)).toEqual([]); // high is banned
    expect(g.level).toBe('medium');
  });

  it('never goes below low or above max, ignores hitches and bad values', () => {
    const g = new QualityGovernor('low', { windowFrames: 5, max: 'medium' });
    expect(feed(g, 100, 50)).toEqual([]);
    expect(g.level).toBe('low');
    feed(g, 16, 30);
    expect(g.level).toBe('medium');
    feed(g, 16, 100);
    expect(g.level).toBe('medium');
    const h = new QualityGovernor('high', { windowFrames: 5 });
    for (const bad of [NaN, -1, 0, 9999]) expect(h.push(bad)).toBeNull();
    expect(feed(h, 9999, 100)).toEqual([]);
  });
});
