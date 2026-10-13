import { describe, expect, it } from 'vitest';
import { moodFor, MOOD_SPECS, MOODS } from './ambient';
import { PROCEDURAL_IDS, RECIPES, renderSamples } from './synth';

describe('procedural synth', () => {
  it('has the required sounds', () => {
    for (const id of [
      'saberHum',
      'saberSwing',
      'saberClash',
      'blastur',
      'lightning',
      'plasma',
      'cryo',
      'toxin',
      'hit',
      'droydDeath',
      'smoke',
      'levelUp',
      'creditz',
      'itemDrop.unique',
      'uiClick',
      'uiOpen',
      'uiClose',
      'footstep',
    ])
      expect(PROCEDURAL_IDS).toContain(id);
  });
  it('renders finite, non-silent, bounded, deterministic samples', () => {
    for (const id of PROCEDURAL_IDS) {
      const a = renderSamples(id, 16000);
      const b = renderSamples(id, 16000);
      expect(a, id).not.toBeNull();
      if (!a || !b) continue;
      let peak = 0;
      for (let i = 0; i < a.length; i++) {
        const v = a[i] ?? NaN;
        if (!Number.isFinite(v)) throw new Error(`${id}[${i}] not finite`);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(peak, id).toBeGreaterThan(0.05);
      expect(peak, id).toBeLessThanOrEqual(1);
      expect(Array.from(a.slice(0, 200)), id).toEqual(Array.from(b.slice(0, 200)));
    }
  });
  it('hum loops seamlessly (end continues into start)', () => {
    const d = renderSamples('saberHum', 16000);
    expect(RECIPES.saberHum?.loop).toBe(true);
    expect(d).not.toBeNull();
    if (!d) return;
    const step = Math.abs((d[1] ?? 0) - (d[0] ?? 0));
    const wrap = Math.abs((d[0] ?? 0) - (d[d.length - 1] ?? 0));
    expect(wrap).toBeLessThan(Math.max(step * 3, 0.1));
  });
});

describe('ambient moods', () => {
  it('maps ids to moods', () => {
    expect(moodFor('town')).toBe('town');
    expect(moodFor('music.a1.dungeon')).toBe('dungeon');
    expect(moodFor('boss.dooky')).toBe('boss');
    expect(moodFor('a1.mossfields')).toBe('wild');
    expect(MOODS.every((m) => MOOD_SPECS[m].intervals.length > 0)).toBe(true);
  });
});
