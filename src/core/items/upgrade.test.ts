import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { createItem } from './create';
import type { ItemInstance } from './types';
import { itemScore, upgradePct, upgradeVerdict } from './upgrade';

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

describe('upgradePct', () => {
  it('measures the change against the equipped item', () => {
    const weak = normal('cadetSaber');
    const strong = normal('knightSaber');
    const pct = upgradePct(strong, weak);
    expect(pct).toBe(Math.round((itemScore(strong) / itemScore(weak) - 1) * 100));
    expect(pct).toBeGreaterThan(0);
    expect(upgradePct(weak, strong)).toBeLessThan(0);
    expect(upgradePct(weak, normal('cadetSaber'))).toBe(0);
  });

  it('a second blade is judged per hand: it can beat the off hand and lose to the main', () => {
    const main = normal('knightSaber');
    const off = normal('trainingLitesaber');
    const mid = normal('cadetSaber');
    expect(upgradeVerdict(mid, [main])).toBe('down');
    expect(upgradeVerdict(mid, [off])).toBe('up');
    expect(upgradeVerdict(mid, [main, off])).toBe('up');
  });
});
