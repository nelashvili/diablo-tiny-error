import { describe, expect, it } from 'vitest';
import type { SkillDef } from '../../data/schema';
import { fmtNum, humanize, skillLines, synergyTotals } from './skillLines';

const orb: SkillDef = {
  id: 'plasmaOrb',
  classId: 'forseAdept',
  tree: 'forseAdept.plasma',
  name: 'skill.plasmaOrb',
  d2Analog: 'Fire Ball',
  description: 'skill.plasmaOrb.desc',
  kind: 'missile',
  reqLevel: 12,
  prereqs: ['plasmaBolt'],
  ui: { col: 0, row: 2, icon: 'missile' },
  maxHardPoints: 20,
  manaCost: { base: 5, perLevel: [0.5, 0.5, 0.5, 0.5, 0.5] },
  damage: {
    plasma: {
      min: { base: 6, perLevel: [8, 10, 12, 14, 16] },
      max: { base: 14, perLevel: [10, 12, 14, 16, 18] },
    },
  },
  params: { radius: 2 },
  synergies: [
    { from: 'plasmaBolt', pctPerLevel: 14, target: 'plasma' },
    { from: 'starfall', pctPerLevel: 14, target: 'plasma' },
  ],
  leftClickable: false,
  vfx: 'vfx.orb',
  anim: 'cast',
};

describe('skillLines', () => {
  it('evaluates level 1 values', () => {
    const lines = skillLines(orb, 1, {}, 'Forse');
    expect(lines.find((l) => l.key === 'mana')?.value).toBe('5');
    expect(lines.find((l) => l.key === 'dmg.plasma')?.value).toBe('6-14');
    expect(lines.find((l) => l.key === 'p.radius')?.value).toBe('2');
  });
  it('applies level scaling and synergies', () => {
    const lines = skillLines(orb, 2, { plasmaBolt: 5 }, 'Forse');
    // level 2: 14-24, synergy +70%
    expect(lines.find((l) => l.key === 'dmg.plasma')?.value).toBe('23.8-40.8');
    expect(lines.find((l) => l.key === 'mana')?.value).toBe('5.5');
  });
  it('returns nothing for level 0', () => expect(skillLines(orb, 0, {})).toEqual([]));
  it('synergyTotals', () =>
    expect(synergyTotals(orb, { plasmaBolt: 2, starfall: 1 })).toEqual({ plasma: 42 }));
  it('helpers', () => {
    expect(fmtNum(2.04)).toBe('2');
    expect(fmtNum(2.25)).toBe('2.3');
    expect(humanize('attackRating')).toBe('Attack Rating');
  });
});
