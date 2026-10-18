import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { createItem } from './create';
import type { ItemInstance } from './types';
import { itemScore, upgradeVerdict } from './upgrade';

const normal = (base: string): ItemInstance => createItem(base, { quality: 'normal', ilvl: 10 }, new Rng(1));

describe('upgradeVerdict', () => {
  it('anything beats an empty slot; consumables are not judged', () => {
    expect(upgradeVerdict(normal('flightCap'), [undefined])).toBe('up');
    expect(upgradeVerdict(normal('baktaStim'), [undefined])).toBeNull();
  });

  it('a stronger weapon is an upgrade and the reverse a downgrade', () => {
    const weak = normal('cadetSaber');
    const strong = normal('knightSaber');
    expect(itemScore(strong)).toBeGreaterThan(itemScore(weak));
    expect(upgradeVerdict(strong, [weak])).toBe('up');
    expect(upgradeVerdict(weak, [strong])).toBe('down');
    expect(upgradeVerdict(weak, [normal('cadetSaber')])).toBe('same');
  });

  it('extra modifiers make an item better than its plain twin', () => {
    const plain = normal('flightCap');
    const magic: ItemInstance = {
      ...plain,
      uid: 'm',
      quality: 'magic',
      mods: [...plain.mods, { stat: 'lifeMax', op: 'flat', value: 20 }],
    };
    expect(upgradeVerdict(magic, [plain])).toBe('up');
  });

  it('rings are measured against the weaker equipped ring', () => {
    const plain = normal('signalRing');
    const good: ItemInstance = { ...plain, uid: 'g', mods: [{ stat: 'strength', op: 'flat', value: 10 }] };
    const mid: ItemInstance = { ...plain, uid: 'k', mods: [{ stat: 'strength', op: 'flat', value: 5 }] };
    expect(upgradeVerdict(mid, [good, plain])).toBe('up');
  });

  it('does not judge a ranged weapon against a melee one', () => {
    expect(upgradeVerdict(normal('scoutBlastur'), [normal('cadetSaber')])).toBeNull();
  });
});
