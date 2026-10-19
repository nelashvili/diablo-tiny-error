/** Monster skill damage keeps pace with monster level / difficulty / rank, like physical damage. */
import { describe, expect, it } from 'vitest';
import { DB } from '../../data/db';
import { buildAttackSpec } from '../skills/spec';
import { makeTestSim } from '../sim/systems/testing';
import { createMonster, monsterSpellMul } from './create';
import { scaledMultipliers } from './scaling';

describe('monster spell scaling', () => {
  it('follows the physical damage curve', () => {
    expect(monsterSpellMul(12, 'normal', 'normal')).toBeCloseTo(scaledMultipliers(12, 'normal').damage);
    expect(monsterSpellMul(12, 'normal', 'normal')).toBeGreaterThan(monsterSpellMul(1, 'normal', 'normal'));
    expect(monsterSpellMul(63, 'legend', 'normal')).toBeGreaterThan(
      monsterSpellMul(12, 'normal', 'normal') * 20,
    );
    expect(monsterSpellMul(10, 'normal', 'champion')).toBeGreaterThan(
      monsterSpellMul(10, 'normal', 'normal'),
    );
  });

  it('scales skill damage and damage-over-time of a created monster', () => {
    const { world } = makeTestSim(1);
    const low = createMonster(world, 'countDooky', { x: 5, y: 5 }, 1, 'boss');
    world.difficulty = 'legend';
    const high = createMonster(world, 'countDooky', { x: 9, y: 9 }, 63, 'boss', { difficulty: 'legend' });
    expect(high.spellMul! / low.spellMul!).toBeGreaterThan(50);
    const lightning = DB.skills.get('m_forseLightning')!;
    const lo = buildAttackSpec(low, lightning, 1, 'spell').skillDamage!.storm!;
    const hi = buildAttackSpec(high, lightning, 1, 'spell').skillDamage!.storm!;
    expect(hi.max / lo.max).toBeCloseTo(high.spellMul! / low.spellMul!, 5);
    const claw = DB.skills.get('m_dookyClaw')!;
    const venomLo = buildAttackSpec(low, claw, 1, 'melee').effects!.find((e) => e.kind === 'toxin')!;
    const venomHi = buildAttackSpec(high, claw, 1, 'melee').effects!.find((e) => e.kind === 'toxin')!;
    expect(venomHi.magnitude! / venomLo.magnitude!).toBeCloseTo(high.spellMul! / low.spellMul!, 5);
  });
});
