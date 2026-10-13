import { describe, expect, it } from 'vitest';
import { pctLabel, range, resistTone, statTargets, suggestStat, xpProgress } from './charLogic';

describe('suggestStat', () => {
  it('Yedi Knight: strength early', () => {
    expect(suggestStat('yediKnight', 10, { strength: 30, dexterity: 20, vitality: 25, energy: 10 })).toBe(
      'strength',
    );
  });
  it('Bounty Huntur: dexterity is the priority', () => {
    expect(suggestStat('bountyHuntur', 10, { strength: 30, dexterity: 25, vitality: 20, energy: 15 })).toBe(
      'dexterity',
    );
  });
  it('vitality when targets are met', () => {
    const t = statTargets('forseAdept', 20);
    expect(
      suggestStat('forseAdept', 20, {
        strength: t.strength,
        dexterity: t.dexterity,
        vitality: 10,
        energy: 80,
      }),
    ).toBe('vitality');
  });
  it('ignores tiny shortfalls', () => {
    const t = statTargets('yediKnight', 30);
    expect(
      suggestStat('yediKnight', 30, {
        strength: t.strength - 1,
        dexterity: t.dexterity,
        vitality: 50,
        energy: 10,
      }),
    ).toBe('vitality');
  });
  it('never suggests Energy for the Yedi', () => {
    expect(suggestStat('yediKnight', 1, { strength: 30, dexterity: 20, vitality: 25, energy: 0 })).not.toBe(
      'energy',
    );
  });
  it('targets are capped', () => {
    expect(statTargets('yediKnight', 99).strength).toBe(156);
    expect(statTargets('bountyHuntur', 200).dexterity).toBe(250);
  });
});

describe('formatting helpers', () => {
  it('resistTone', () => {
    expect(resistTone(-20)).toBe('negative');
    expect(resistTone(10)).toBe('low');
    expect(resistTone(40)).toBe('good');
    expect(resistTone(75)).toBe('max');
    expect(resistTone(80, 85)).toBe('good');
  });
  it('range', () => {
    expect(range(3.2, 7.6)).toBe('3-8');
    expect(range(5, 5)).toBe('5');
  });
  it('pctLabel', () => {
    expect(pctLabel(1.2)).toBe('+20%');
    expect(pctLabel(0.9)).toBe('-10%');
  });
  it('xpProgress', () => {
    const p = xpProgress(0, 1);
    expect(p.pct).toBe(0);
    const q = xpProgress(250, 1, (l) => (l - 1) * 500);
    expect(q).toEqual({ cur: 0, next: 500, pct: 0.5 });
  });
});
