import { describe, expect, it } from 'vitest';
import type { SkillDef } from '../../data/schema';
import {
  buildGuideNext,
  canAllocate,
  effectiveLevel,
  guideIds,
  pointsInTree,
  skillBonus,
  skillStatus,
  treeConnectors,
} from './skillLogic';

function sk(
  id: string,
  reqLevel: SkillDef['reqLevel'],
  prereqs: string[],
  col: number,
  row: number,
): SkillDef {
  return {
    id,
    classId: 'forseAdept',
    tree: 'forseAdept.plasma',
    name: id,
    d2Analog: id,
    description: id,
    kind: 'missile',
    reqLevel,
    prereqs,
    ui: { col, row, icon: id },
    maxHardPoints: 20,
    manaCost: 2,
    leftClickable: true,
    vfx: 'vfx.x',
    anim: 'cast',
  };
}

const bolt = sk('plasmaBolt', 1, [], 0, 0);
const stream = sk('plasmaStream', 6, [], 2, 1);
const orb = sk('plasmaOrb', 12, ['plasmaBolt'], 0, 2);
const wall = sk('plasmaWall', 18, ['plasmaStream', 'burningTrail'], 2, 3);
const all = [bolt, stream, orb, wall];
const byId = new Map(all.map((s) => [s.id, s]));

describe('skillBonus', () => {
  const bonus = {
    all: 1,
    byClass: { forseAdept: 2 },
    byTree: { 'forseAdept.plasma': 1 },
    bySkill: { plasmaOrb: 3 },
  };
  it('sums all bonus sources when the skill has hard points', () => {
    expect(skillBonus(bonus, orb, 1)).toBe(7);
    expect(skillBonus(bonus, bolt, 4)).toBe(4);
  });
  it('only +specific skill applies with 0 hard points', () => {
    expect(skillBonus(bonus, orb, 0)).toBe(3);
    expect(skillBonus(bonus, bolt, 0)).toBe(0);
  });
  it('handles missing stats', () => expect(skillBonus(undefined, orb, 5)).toBe(0));
  it('effectiveLevel', () => {
    expect(effectiveLevel(0, 0)).toBe(0);
    expect(effectiveLevel(5, 2)).toBe(7);
    expect(effectiveLevel(0, 3)).toBe(3);
  });
});

describe('skillStatus', () => {
  it('locks by character level', () => {
    const s = skillStatus(stream, { charLevel: 5, unspent: 3, hard: {} });
    expect(s.state).toBe('locked');
    expect(s.levelOk).toBe(false);
  });
  it('locks by missing prerequisite', () => {
    const s = skillStatus(orb, { charLevel: 20, unspent: 3, hard: {} });
    expect(s.state).toBe('locked');
    expect(s.missingPrereqs).toEqual(['plasmaBolt']);
  });
  it('available when requirements met and points to spend', () => {
    expect(skillStatus(orb, { charLevel: 12, unspent: 1, hard: { plasmaBolt: 1 } }).state).toBe('available');
    expect(canAllocate(orb, { charLevel: 12, unspent: 1, hard: { plasmaBolt: 1 } })).toBe(true);
  });
  it('learned / unlocked without points', () => {
    expect(skillStatus(bolt, { charLevel: 12, unspent: 0, hard: { plasmaBolt: 3 } }).state).toBe('learned');
    expect(skillStatus(stream, { charLevel: 12, unspent: 0, hard: {} }).state).toBe('unlocked');
  });
  it('maxed at 20 hard points', () => {
    expect(skillStatus(bolt, { charLevel: 40, unspent: 5, hard: { plasmaBolt: 20 } }).state).toBe('maxed');
    expect(canAllocate(bolt, { charLevel: 40, unspent: 5, hard: { plasmaBolt: 20 } })).toBe(false);
  });
});

describe('treeConnectors', () => {
  it('links prerequisites inside the tree', () => {
    const c = treeConnectors(all, { plasmaBolt: 1 });
    expect(c).toHaveLength(2); // burningTrail missing from tree => skipped
    expect(c[0]).toMatchObject({ fromId: 'plasmaBolt', toId: 'plasmaOrb', met: true });
    expect(c[1]).toMatchObject({ fromId: 'plasmaStream', toId: 'plasmaWall', met: false });
  });
  it('pointsInTree', () => expect(pointsInTree(all, { plasmaBolt: 4, plasmaOrb: 2, other: 9 })).toBe(6));
});

describe('buildGuideNext', () => {
  const guide = ['plasmaBolt:2', 'plasmaOrb', 'plasmaStream'];
  it('suggests the first unfinished reachable step', () => {
    expect(buildGuideNext(guide, byId, { charLevel: 3, unspent: 1, hard: {} })).toBe('plasmaBolt');
    expect(buildGuideNext(guide, byId, { charLevel: 3, unspent: 1, hard: { plasmaBolt: 2 } })).toBeNull();
    expect(buildGuideNext(guide, byId, { charLevel: 12, unspent: 1, hard: { plasmaBolt: 2 } })).toBe(
      'plasmaOrb',
    );
  });
  it('skips unknown skills', () => {
    expect(buildGuideNext(['nope', 'plasmaBolt'], byId, { charLevel: 1, unspent: 1, hard: {} })).toBe(
      'plasmaBolt',
    );
  });
  it('guideIds', () => expect([...guideIds(guide)]).toEqual(['plasmaBolt', 'plasmaOrb', 'plasmaStream']));
});
