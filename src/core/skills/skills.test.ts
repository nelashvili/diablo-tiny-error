import { describe, expect, it } from 'vitest';
import { DB } from '../../data/db';
import { hasName } from '../../data/names';
import { createPlayer } from '../player/create';
import { MELEE_MASTERY } from '../player/weapon';
import { makeTestSim, registerTestSkill } from '../sim/systems/testing';
import { canUseSkill, getSkillLevel, getSkillRange, registerSkillBehavior, startSkill } from './runtime';

describe('common skill data', () => {
  it('defines attack, throw and kick with names', () => {
    for (const id of ['attack', 'throw', 'kick']) {
      const s = DB.skills.get(id);
      expect(s, id).toBeTruthy();
      expect(hasName(s!.name)).toBe(true);
      expect(hasName(s!.description)).toBe(true);
    }
    for (const id of ['blasturBolt', 'javelin', 'disc']) expect(DB.missiles.has(id)).toBe(true);
  });
});

describe('skill runtime', () => {
  it('effective level adds +skills only to skills with hard points; range by weapon', () => {
    const { world } = makeTestSim(1);
    const p = createPlayer(world, 'yediKnight', 'S', { startingItems: ['test.saber'] });
    registerTestSkill({ id: 'ykLv', kind: 'buff', classId: 'yediKnight', tree: 'yediKnight.commands' });
    p.stats.skillBonus = {
      all: 1,
      byClass: { yediKnight: 1 },
      byTree: { 'yediKnight.commands': 2 },
      bySkill: {},
    };
    expect(getSkillLevel(p, 'ykLv')).toBe(0);
    p.skills.ykLv = 5;
    expect(getSkillLevel(p, 'ykLv')).toBe(9);
    p.stats.skillBonus.bySkill.ykLv = 3;
    expect(getSkillLevel(p, 'ykLv')).toBe(12);
    expect(getSkillLevel(p, 'attack')).toBe(1);
    expect(getSkillRange(p, 'attack')).toBeCloseTo(1.6);
  });

  it('basic attack range is long with a ranged weapon; throw needs a thrown weapon', () => {
    const { world } = makeTestSim(1);
    const p = createPlayer(world, 'bountyHuntur', 'S', { startingItems: ['test.blastur'] });
    expect(getSkillRange(p, 'attack')).toBeGreaterThan(8);
    expect(canUseSkill(world, p, 'throw')).toBe(false);
    expect(canUseSkill(world, p, 'attack')).toBe(true);
  });

  it('action duration follows weapon speed and attack speed', () => {
    const { world } = makeTestSim(1);
    const p = createPlayer(world, 'yediKnight', 'S', { startingItems: ['test.saber'] });
    startSkill(world, p, 'attack', { pos: { x: 8, y: 8 } });
    const d1 = p.action!.duration;
    expect(d1).toBeCloseTo(1 / 1.5, 2);
    p.action = undefined;
    p.mode = 'idle';
    p.stats = { ...p.stats, attackSpeedMul: 2 };
    startSkill(world, p, 'attack', { pos: { x: 8, y: 8 } });
    expect(p.action!.duration).toBeCloseTo(d1 / 2, 2);
  });

  it('custom behaviors replace kind handlers and cooldowns gate reuse', () => {
    const { world, run } = makeTestSim(1);
    const p = createPlayer(world, 'yediKnight', 'S', { startingItems: ['test.saber'] });
    let fired = 0;
    const off = registerSkillBehavior('testBehavior', () => void fired++);
    registerTestSkill({ id: 'testCustom', kind: 'utility', behavior: 'testBehavior', cooldownSec: 1 });
    expect(startSkill(world, p, 'testCustom', {})).toBe(true);
    run(20);
    expect(fired).toBe(1);
    expect(canUseSkill(world, p, 'testCustom')).toBe(false); // cooling down
    run(30);
    expect(canUseSkill(world, p, 'testCustom')).toBe(true);
    off();
  });

  it('synergies boost damage per hard point of the source skill', () => {
    const { world } = makeTestSim(1);
    const p = createPlayer(world, 'forseAdept', 'S', { startingItems: [] });
    registerTestSkill({ id: 'synSrc', kind: 'passive', classId: 'forseAdept', tree: 'forseAdept.plasma' });
    const sk = registerTestSkill({
      id: 'synMain',
      kind: 'missile',
      missile: 'test.bolt',
      classId: 'forseAdept',
      tree: 'forseAdept.plasma',
      damage: { plasma: { min: 10, max: 20 } },
      synergies: [{ from: 'synSrc', pctPerLevel: 10, target: 'plasma' }],
    });
    p.skills.synMain = 1;
    p.skills.synSrc = 5;
    return import('./spec').then(({ buildAttackSpec }) => {
      const spec = buildAttackSpec(p, sk, 1, 'spell');
      expect(spec.skillDamage?.plasma).toEqual({ min: 15, max: 30 });
    });
  });
});

describe('melee mastery', () => {
  it('a melee weapon gives extra damage and damage reduction; a blastur does not', () => {
    const { world } = makeTestSim(1);
    const saber = createPlayer(world, 'yediKnight', 'S', { startingItems: ['trainingLitesaber'] });
    const gun = createPlayer(world, 'yediKnight', 'G', { startingItems: ['scoutBlastur'] });
    expect(saber.stats.raw.damageReducedPct).toBe(MELEE_MASTERY.damageReducedPct);
    expect(gun.stats.raw.damageReducedPct ?? 0).toBe(0);
  });

  it('basic melee swings cleave enemies in front at part damage', async () => {
    const { createMonster } = await import('../monsters/create');
    const { world, run } = makeTestSim(1);
    const p = createPlayer(world, 'yediKnight', 'S', { startingItems: ['trainingLitesaber'] });
    p.pos = { x: 10, y: 10 };
    p.stats = { ...p.stats, attackRating: 1e6 };
    const front = createMonster(world, 'tuskinRaider', { x: 11.2, y: 10 }, 1, 'normal');
    const side = createMonster(world, 'tuskinRaider', { x: 10.9, y: 10.9 }, 1, 'normal');
    const behind = createMonster(world, 'tuskinRaider', { x: 8.8, y: 10 }, 1, 'normal');
    for (const m of [front, side, behind]) {
      m.stats = { ...m.stats, defense: 0, lifeMax: 9999 };
      m.life = 9999;
    }
    startSkill(world, p, 'attack', { id: front.id, pos: front.pos });
    run(25);
    expect(front.life).toBeLessThan(9999);
    expect(side.life).toBeLessThan(9999);
    expect(behind.life).toBe(9999);
  });
});
