import { describe, expect, it } from 'vitest';
import { createItem } from '../items/create';
import { isDualWieldBase } from '../items/helpers';
import { Rng } from '../rng';
import { startSkill } from '../skills/runtime';
import type { PlayerEntity } from '../sim/entities';
import { makeTestSim } from '../sim/systems/testing';
import { toCombatant } from '../sim/systems/util';
import type { SimWorld } from '../sim/world';
import { createPlayer } from './create';
import { equipItem, giveItem, unequipItem } from './inventory';
import { recomputeStats } from './stats';
import { getOffHandWeapon, heroDps } from './weapon';

const rng = new Rng(7);

function give(p: PlayerEntity, base: string): string {
  const it = createItem(base, { quality: 'normal' }, rng);
  expect(giveItem(p, it, false)).toBe(true);
  return it.uid;
}

function hero(): { world: SimWorld; p: PlayerEntity } {
  const { world } = makeTestSim(1);
  const p = createPlayer(world, 'yediKnight', 'Dual', { level: 30 });
  p.stats = { ...p.stats, strength: 200, dexterity: 200 };
  delete p.equipment.mainHand;
  delete p.equipment.offHand;
  return { world, p };
}

describe('dual wielding', () => {
  it('one-handed melee weapons fit the off hand; two-handers and thrown weapons do not', () => {
    expect(isDualWieldBase('trainingLitesaber')).toBe(true);
    expect(isDualWieldBase('vibroHatchet')).toBe(true);
    expect(isDualWieldBase('doubleLitesaber')).toBe(false);
    expect(isDualWieldBase('javelinTrainer')).toBe(false);
    expect(isDualWieldBase('flightCap')).toBe(false);
  });

  it('equips a second saber in the off hand', () => {
    const { world, p } = hero();
    const a = give(p, 'trainingLitesaber');
    const b = give(p, 'vibroHatchet');
    expect(equipItem(world, p, a, 'mainHand')).toBe(true);
    expect(equipItem(world, p, b, 'offHand')).toBe(true);
    expect(p.equipment.mainHand?.uid).toBe(a);
    expect(p.equipment.offHand?.uid).toBe(b);
    expect(getOffHandWeapon(p)?.base.id).toBe('vibroHatchet');
  });

  it('an off-hand weapon with an empty main hand goes to the main hand', () => {
    const { world, p } = hero();
    const a = give(p, 'trainingLitesaber');
    expect(equipItem(world, p, a, 'offHand')).toBe(true);
    expect(p.equipment.mainHand?.uid).toBe(a);
    expect(p.equipment.offHand).toBeUndefined();
  });

  it('needs a dual-wield weapon in the main hand', () => {
    const { world, p } = hero();
    const jav = give(p, 'javelinTrainer');
    const saber = give(p, 'trainingLitesaber');
    expect(equipItem(world, p, jav, 'mainHand')).toBe(true);
    expect(equipItem(world, p, saber, 'offHand')).toBe(false);
    expect(p.equipment.offHand).toBeUndefined();
  });

  it('a main-hand weapon that cannot be dual wielded frees the off-hand weapon', () => {
    const { world, p } = hero();
    const a = give(p, 'trainingLitesaber');
    const b = give(p, 'vibroHatchet');
    const jav = give(p, 'javelinTrainer');
    equipItem(world, p, a, 'mainHand');
    equipItem(world, p, b, 'offHand');
    expect(equipItem(world, p, jav, 'mainHand')).toBe(true);
    expect(p.equipment.mainHand?.uid).toBe(jav);
    expect(p.equipment.offHand).toBeUndefined();
    expect(p.inventory.items.some((i) => i.item.uid === b)).toBe(true);
  });

  it('unequipping the main weapon moves the off-hand weapon over', () => {
    const { world, p } = hero();
    const a = give(p, 'trainingLitesaber');
    const b = give(p, 'vibroHatchet');
    equipItem(world, p, a, 'mainHand');
    equipItem(world, p, b, 'offHand');
    expect(unequipItem(world, p, 'mainHand')).toBe(true);
    expect(p.equipment.mainHand?.uid).toBe(b);
    expect(p.equipment.offHand).toBeUndefined();
  });

  it('stats carry the off-hand damage; swings take turns and hit with their own weapon', () => {
    const { world, p } = hero();
    const a = give(p, 'trainingLitesaber');
    const b = give(p, 'vibroAxe');
    equipItem(world, p, a, 'mainHand');
    equipItem(world, p, b, 'offHand');
    recomputeStats(p);
    const off = p.stats.offHand!;
    expect(off).toBeDefined();
    expect(off.physMax).toBeGreaterThan(p.stats.physMax);

    const hands: (boolean | undefined)[] = [];
    for (let i = 0; i < 4; i++) {
      p.action = undefined;
      p.mode = 'idle';
      expect(startSkill(world, p, 'attack', { pos: { x: p.pos.x + 1, y: p.pos.y } })).toBe(true);
      hands.push(p.action!.offHand);
      const view = toCombatant(p);
      if (p.action!.offHand) expect(view.stats.physMax).toBe(off.physMax);
      else expect(view.stats.physMax).toBe(p.stats.physMax);
    }
    expect(hands).toEqual([false, true, false, true]);
  });

  it('a single weapon marks no hand', () => {
    const { world, p } = hero();
    equipItem(world, p, give(p, 'trainingLitesaber'), 'mainHand');
    expect(startSkill(world, p, 'attack', { pos: { x: p.pos.x + 1, y: p.pos.y } })).toBe(true);
    expect(p.action!.offHand).toBeUndefined();
  });

  it('a weaker off-hand blade still raises dps (dual wield attack speed)', () => {
    const { world, p } = hero();
    equipItem(world, p, give(p, 'scoutLitesaber'), 'mainHand');
    recomputeStats(p);
    const single = heroDps(p);
    const speed = p.stats.attackSpeedMul;
    p.stats = { ...p.stats, strength: 200 };
    expect(equipItem(world, p, give(p, 'trainingLitesaber'), 'offHand')).toBe(true);
    recomputeStats(p);
    expect(p.stats.offHand!.physMax).toBeLessThan(p.stats.physMax);
    expect(p.stats.attackSpeedMul).toBeGreaterThan(speed);
    expect(heroDps(p)).toBeGreaterThan(single * 1.15);
  });

  it('dps counts both hands', () => {
    const { world, p } = hero();
    equipItem(world, p, give(p, 'trainingLitesaber'), 'mainHand');
    recomputeStats(p);
    const single = heroDps(p);
    p.stats = { ...p.stats, strength: 200 };
    expect(equipItem(world, p, give(p, 'vibroAxe'), 'offHand')).toBe(true);
    recomputeStats(p);
    expect(heroDps(p)).toBeGreaterThan(single);
  });
});
