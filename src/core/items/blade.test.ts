import { describe, expect, it } from 'vitest';
import { DB } from '../../data/db';
import { Rng } from '../rng';
import { BLADE_COLORS, bladeColor, isSaberBase } from './blade';
import { createItem } from './create';
import { describeItem } from './describe';

const saber = 'trainingLitesaber';
const double = [...DB.items.values()].find((b) => b.weaponClass === 'doubleLitesaber')!.id;
const blaster = 'scoutBlastur';

describe('bladeColor', () => {
  it('knows sabers from other weapons', () => {
    expect(isSaberBase(saber)).toBe(true);
    expect(isSaberBase(double)).toBe(true);
    expect(isSaberBase(blaster)).toBe(false);
  });

  it('leaves plain sabers and non-sabers without a color', () => {
    expect(bladeColor({ base: saber })).toBeNull();
    expect(bladeColor(null)).toBeNull();
    expect(bladeColor({ base: blaster, socketed: [{ base: 'kybur.red.chipped' }] })).toBeNull();
  });

  it('burns the color of the first socketed Kybur crystal', () => {
    for (const c of BLADE_COLORS) {
      expect(DB.items.has(`kybur.${c}.flawed`), c).toBe(true);
      expect(bladeColor({ base: double, socketed: [{ base: `kybur.${c}.flawed` }] })).toBe(c);
    }
    const two = { base: saber, socketed: [{ base: 'kybur.green.chipped' }, { base: 'kybur.red.perfect' }] };
    expect(bladeColor(two)).toBe('green');
  });

  it('takes the strongest elemental damage when no crystal is socketed', () => {
    const mods = [
      { stat: 'plasmaMin', value: 30 },
      { stat: 'plasmaMax', value: 6 },
      { stat: 'stormMax', value: 9 },
    ];
    expect(bladeColor({ base: saber, mods })).toBe('yellow');
    // Toxin totals are spread over seconds: 30 toxin does not outshine 9 storm.
    expect(bladeColor({ base: saber, mods: [...mods, { stat: 'toxinMax', value: 30 }] })).toBe('yellow');
    expect(bladeColor({ base: saber, mods: [{ stat: 'toxinMax', value: 60 }] })).toBe('green');
    // A crystal wins over affixes.
    expect(bladeColor({ base: saber, mods, socketed: [{ base: 'kybur.white.perfect' }] })).toBe('white');
  });
});

describe('blade tooltip line', () => {
  it('names the blade color of a crystal saber, and nothing for a plain one', () => {
    const item = createItem(saber, {}, new Rng(1));
    expect(describeItem(item).lines.some((l) => l.style === 'blade')).toBe(false);
    const gem = createItem('kybur.purple.flawed', {}, new Rng(2));
    const line = describeItem({ ...item, sockets: 1, socketed: [gem] }).lines.find(
      (l) => l.style === 'blade',
    );
    expect(line?.text).toBe('Violet blade: hits ring with Forse');
  });
});
