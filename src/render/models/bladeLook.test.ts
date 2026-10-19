import { describe, expect, it } from 'vitest';
import { BLADE_COLORS } from '../../core/items/blade';
import { BLADE_LOOKS, flickerAt, type Flicker, type FlickerFrame } from './bladeLook';
import { parseWeaponStyle, weaponModelId, weaponModelOf } from './weaponStyle';
import { saberColor } from './attachments';

describe('blade looks', () => {
  it('has a distinct look for every blade color', () => {
    const colors = new Set(BLADE_COLORS.map((c) => BLADE_LOOKS[c].color));
    expect(colors.size).toBe(BLADE_COLORS.length);
    expect(new Set(BLADE_COLORS.map((c) => BLADE_LOOKS[c].flicker)).size).toBe(BLADE_COLORS.length);
  });

  it('keeps every flicker within a sane glow width', () => {
    const out: FlickerFrame = { w: 0, jx: 0 };
    const kinds: Flicker[] = ['hum', ...BLADE_COLORS.map((c) => BLADE_LOOKS[c].flicker)];
    for (const k of kinds)
      for (let i = 0; i < 200; i++) {
        flickerAt(k, i / 37, 0.3, () => (i * 0.618) % 1, out);
        expect(out.w, k).toBeGreaterThan(0.8);
        expect(out.w, k).toBeLessThan(1.5);
        expect(Math.abs(out.jx), k).toBeLessThan(0.02);
      }
  });

  it('steady blades barely move, unstable ones spit', () => {
    const out: FlickerFrame = { w: 0, jx: 0 };
    const spread = (k: Flicker, rnd: () => number) => {
      let lo = 9;
      let hi = 0;
      for (let i = 0; i < 100; i++) {
        flickerAt(k, i / 61, 0, rnd, out);
        lo = Math.min(lo, out.w);
        hi = Math.max(hi, out.w);
      }
      return hi - lo;
    };
    let s = 0.1;
    const rnd = () => (s = (s * 7.31 + 0.13) % 1);
    expect(spread('steady', rnd)).toBeLessThan(0.07);
    expect(spread('unstable', rnd)).toBeGreaterThan(0.15);
  });
});

describe('blade in the model id', () => {
  it('carries the blade color through the saber model id', () => {
    const id = weaponModelId('trainingLitesaber', 'unique', 'green');
    expect(id).toMatch(/\.u\.kgreen$/);
    expect(parseWeaponStyle(id)).toEqual({ line: 0, tier: 0, unique: true, blade: 'green' });
    // The crystal outshines the unique amber.
    expect(saberColor(parseWeaponStyle(id))).toBe(BLADE_LOOKS.green.color);
    expect(parseWeaponStyle(weaponModelId('trainingLitesaber'))?.blade).toBeUndefined();
  });

  it('reads the blade from a socketed crystal, sabers only', () => {
    expect(weaponModelOf({ base: 'trainingLitesaber', socketed: [{ base: 'kybur.syth.perfect' }] })).toMatch(
      /\.ksyth$/,
    );
    expect(weaponModelOf({ base: 'scoutBlastur', socketed: [{ base: 'kybur.red.chipped' }] })).not.toMatch(
      /\.k/,
    );
  });
});
