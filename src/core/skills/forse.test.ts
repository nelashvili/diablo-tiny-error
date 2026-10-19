/**
 * Forse powers (Push, Pull, Grip, Lightning), knockback slides and wall slams, weight classes,
 * deflection, the boomerang Saber Throw, enemy telegraphs and the Count Dooky rework.
 */
import { describe, expect, it } from 'vitest';
import { DB } from '../../data/db';
import { hasName } from '../../data/names';
import { createItem } from '../items/create';
import { createPlayer } from '../player/create';
import { recomputeStats } from '../player/stats';
import { Rng } from '../rng';
import type { Actor, MissileEntity, PlayerEntity } from '../sim/entities';
import type { GameEvent } from '../sim/events';
import {
  applyEffect,
  DROP_STUN_SEC,
  hasEffect,
  KNOCKBACK_SPEED,
  PLAYER_MAX_KNOCKBACK,
  PLAYER_MAX_LIFT_SEC,
  weightOf,
} from '../sim/systems/effects';
import { makeFlatLevel, makeTestSim, spawnTestMonster } from '../sim/systems/testing';
import { TICK_SECONDS } from '../types';
import type { ClassId } from '../types';
import { startSkill } from './runtime';
import { spawnMissile } from './spawn';
import { buildAttackSpec } from './spec';

const WEAPON: Record<ClassId, string> = {
  yediKnight: 'litesaber',
  bountyHuntur: 'blasturPistol',
  forseAdept: 'forseStaff',
} as Record<ClassId, string>;

function baseFor(weaponClass: string): string {
  const b = [...DB.items.values()].find((i) => i.weaponClass === weaponClass);
  if (!b) throw new Error(`no base for ${weaponClass}`);
  return b.id;
}

function hero(
  world: ReturnType<typeof makeTestSim>['world'],
  classId: ClassId,
  skills: Record<string, number>,
) {
  const p = createPlayer(world, classId, 'H', { startingItems: [], local: true });
  p.pos = { x: 10, y: 20 };
  p.level = 30;
  p.equipment.mainHand = createItem(baseFor(WEAPON[classId]), { ilvl: 30 }, new Rng(1));
  Object.assign(p.skills, skills);
  recomputeStats(p, world.difficulty);
  p.mana = 9999;
  return p;
}

const secs = (s: number): number => Math.ceil(s / TICK_SECONDS);
const dx = (a: Actor, x0: number): number => a.pos.x - x0;

describe('knockback slides', () => {
  it('slides over time instead of teleporting, scaled by weight', () => {
    const { world, run } = makeTestSim(1);
    const med = spawnTestMonster(world, { pos: { x: 10, y: 10 } });
    const light = spawnTestMonster(world, { pos: { x: 10, y: 14 }, defId: 'jawwa' });
    const heavy = spawnTestMonster(world, { pos: { x: 10, y: 18 }, defId: 'mossBeast' });
    const boss = spawnTestMonster(world, { pos: { x: 10, y: 22 }, defId: 'countDooky' });
    expect([weightOf(med), weightOf(light), weightOf(heavy), weightOf(boss)]).toEqual([
      'medium',
      'light',
      'heavy',
      'boss',
    ]);
    for (const m of [med, light, heavy, boss])
      applyEffect(world, m, { kind: 'knockback', durationSec: 0.2, magnitude: 4 }, undefined, {
        x: m.pos.x - 1,
        y: m.pos.y,
      });
    expect(med.pos.x).toBe(10); // nothing moved yet
    run(1);
    expect(dx(med, 10)).toBeCloseTo(KNOCKBACK_SPEED * TICK_SECONDS, 5);
    run(secs(1));
    expect(dx(med, 10)).toBeCloseTo(4, 3);
    expect(dx(light, 10)).toBeCloseTo(6, 3);
    expect(dx(heavy, 10)).toBeCloseTo(2, 3);
    expect(dx(boss, 10)).toBeCloseTo(1, 3);
  });

  it('a slam into a wall deals the slam damage and stuns', () => {
    const level = makeFlatLevel(40, 40, [{ x: 13, y: 10 }]);
    const { world, run } = makeTestSim(1, level);
    const m = spawnTestMonster(world, { pos: { x: 11.5, y: 10.5 }, life: 100 });
    applyEffect(world, m, { kind: 'knockback', durationSec: 0.2, magnitude: 5, slam: 12 }, undefined, {
      x: 10.5,
      y: 10.5,
    });
    run(secs(0.5));
    expect(m.pos.x).toBeLessThan(13 - m.radius + 0.01);
    expect(m.life).toBe(88);
    expect(hasEffect(m, 'stun')).toBe(true);
  });

  it('strong pushes bowl over monsters in the path', () => {
    const { world, run } = makeTestSim(1);
    const front = spawnTestMonster(world, { pos: { x: 10, y: 10 } });
    const behind = spawnTestMonster(world, { pos: { x: 11.2, y: 10 } });
    applyEffect(world, front, { kind: 'knockback', durationSec: 0.3, magnitude: 5 }, undefined, {
      x: 9,
      y: 10,
    });
    run(secs(1));
    expect(behind.pos.x).toBeGreaterThan(11.6);
  });

  it('heroes are never shoved further than the cap', () => {
    const { world, run } = makeTestSim(1);
    const p = hero(world, 'yediKnight', {});
    applyEffect(world, p, { kind: 'knockback', durationSec: 0.3, magnitude: 9 }, undefined, { x: 9, y: 20 });
    run(secs(1));
    expect(dx(p, 10)).toBeCloseTo(PLAYER_MAX_KNOCKBACK, 3);
  });
});

describe('Forse Push', () => {
  it('shoves enemies in the cone, not those behind', () => {
    const { world, run } = makeTestSim(3);
    const p = hero(world, 'forseAdept', { forsePush: 1 });
    const ahead = spawnTestMonster(world, { pos: { x: 12, y: 20 }, life: 500 });
    const back = spawnTestMonster(world, { pos: { x: 8, y: 20 }, life: 500 });
    expect(startSkill(world, p, 'forsePush', { id: ahead.id })).toBe(true);
    run(secs(1.5));
    expect(ahead.pos.x).toBeGreaterThan(14);
    expect(ahead.life).toBeLessThan(500);
    expect(back.pos.x).toBeCloseTo(8, 5);
  });

  it('pushes further at higher levels', () => {
    const dist = (lvl: number): number => {
      const { world, run } = makeTestSim(3);
      const p = hero(world, 'forseAdept', { forsePush: lvl });
      const m = spawnTestMonster(world, { pos: { x: 12, y: 20 }, life: 5000 });
      startSkill(world, p, 'forsePush', { id: m.id });
      run(secs(1.5));
      return m.pos.x - 12;
    };
    expect(dist(20)).toBeGreaterThan(dist(1) + 1.5);
  });
});

describe('Forse Pull', () => {
  it('slides enemies toward the caster, stopping short', () => {
    const { world, run } = makeTestSim(3);
    const p = hero(world, 'forseAdept', { forsePush: 1, forsePull: 1 });
    const m = spawnTestMonster(world, { pos: { x: 15, y: 20 } });
    startSkill(world, p, 'forsePull', { id: m.id });
    run(secs(1.5));
    expect(m.pos.x).toBeCloseTo(12, 3);
  });
});

describe('Forse Grip', () => {
  it('lifts the target (it cannot act), deals Forse damage over the lift, then drops it dazed', () => {
    const { world, run } = makeTestSim(5);
    const p = hero(world, 'forseAdept', { forseGrip: 1 });
    const m = spawnTestMonster(world, { pos: { x: 14, y: 20 }, life: 500 });
    const events: GameEvent[] = [];
    world.bus.onAny((e) => events.push(e));
    expect(startSkill(world, p, 'forseGrip', { id: m.id })).toBe(true);
    run(secs(0.7));
    expect(hasEffect(m, 'lifted')).toBe(true);
    expect(m.mode).toBe('stunned');
    run(secs(1.5));
    expect(hasEffect(m, 'lifted')).toBe(false);
    const magic = events
      .filter((e): e is Extract<GameEvent, { type: 'damage' }> => e.type === 'damage' && e.targetId === m.id)
      .reduce((s, e) => s + (e.dtype === 'magic' ? e.amount : 0), 0);
    expect(magic).toBe(11); // the average of 8-14 at level 1
    expect(events.some((e) => e.type === 'skillImpact' && e.vfx === 'vfx.grip.drop')).toBe(true);
    expect(DROP_STUN_SEC).toBeGreaterThan(0);
  });

  it('only staggers bosses, halves the lift on heavy beasts', () => {
    const { world } = makeTestSim(5);
    const boss = spawnTestMonster(world, { pos: { x: 14, y: 20 }, defId: 'countDooky' });
    const heavy = spawnTestMonster(world, { pos: { x: 14, y: 24 }, defId: 'mossBeast' });
    applyEffect(world, boss, { kind: 'lifted', durationSec: 2, magnitude: 20 });
    applyEffect(world, heavy, { kind: 'lifted', durationSec: 2, magnitude: 20 });
    expect(hasEffect(boss, 'lifted')).toBe(false);
    expect(hasEffect(boss, 'stun')).toBe(true);
    const fx = heavy.effects.find((e) => e.spec.kind === 'lifted')!;
    expect(fx.remainingSec).toBeCloseTo(1);
    expect(fx.spec.magnitude).toBeCloseTo(10); // same damage rate, shorter lift
  });

  it('never holds a hero longer than the cap', () => {
    const { world } = makeTestSim(5);
    const p = hero(world, 'yediKnight', {});
    applyEffect(world, p, { kind: 'lifted', durationSec: 5, magnitude: 30 });
    const fx = p.effects.find((e) => e.spec.kind === 'lifted')!;
    expect(fx.remainingSec).toBeLessThanOrEqual(PLAYER_MAX_LIFT_SEC + 1e-9);
  });

  it('grips more targets at level 10', () => {
    const { world, run } = makeTestSim(5);
    const p = hero(world, 'forseAdept', { forseGrip: 10 });
    const a = spawnTestMonster(world, { pos: { x: 14, y: 20 }, life: 500 });
    const b = spawnTestMonster(world, { pos: { x: 15, y: 21 }, life: 500 });
    startSkill(world, p, 'forseGrip', { id: a.id });
    run(secs(0.7));
    expect(hasEffect(a, 'lifted') && hasEffect(b, 'lifted')).toBe(true);
  });
});

describe('Forse Lightning', () => {
  const zapped = (lvl: number): number => {
    const { world, run } = makeTestSim(9);
    const p = hero(world, 'forseAdept', { sparkBolts: 1, forseLightning: lvl });
    const ms = [0, 1, 2, 3, 4].map((i) =>
      spawnTestMonster(world, { pos: { x: 15, y: 18.4 + i * 0.8 }, life: 999 }),
    );
    const behind = spawnTestMonster(world, { pos: { x: 7, y: 20 }, life: 999 });
    startSkill(world, p, 'forseLightning', { id: ms[2]!.id });
    run(secs(0.6));
    expect(behind.life).toBe(999);
    return ms.filter((m) => m.life < 999).length;
  };

  it('forks to more enemies in the cone as it levels', () => {
    expect(zapped(1)).toBe(1);
    expect(zapped(20)).toBe(5);
  });

  it('is a quick repeating cast (hold to keep it flowing) and draws arcs', () => {
    const { world, run } = makeTestSim(9);
    const p = hero(world, 'forseAdept', { sparkBolts: 1, forseLightning: 1 });
    const m = spawnTestMonster(world, { pos: { x: 13, y: 20 }, life: 999 });
    const events: GameEvent[] = [];
    world.bus.onAny((e) => events.push(e));
    startSkill(world, p, 'forseLightning', { id: m.id });
    expect(p.action!.duration).toBeLessThan(0.4);
    run(secs(0.5));
    expect(events.some((e) => e.type === 'skillArc' && e.vfx === 'vfx.arc.forseLightning')).toBe(true);
  });
});

describe('deflection', () => {
  it('a Saber Deflect hero bats a blastur bolt back into its shooter', () => {
    const { world, run } = makeTestSim(11);
    const p = hero(world, 'yediKnight', {});
    p.stats.raw.missileReflectPct = 100; // guarantee the roll (the cap is applied below)
    const shooter = spawnTestMonster(world, { pos: { x: 18, y: 20 }, life: 300 });
    const payload = buildAttackSpec(shooter, DB.skills.get('m_blastur')!, 1, 'missile', { useWeapon: true });
    payload.ignoreDefense = true;
    let deflected = 0;
    for (let i = 0; i < 40 && deflected === 0; i++) {
      spawnMissile(world, shooter, {
        defId: 'm_blasturBolt',
        pos: { x: 17.5, y: 20 },
        angle: Math.PI,
        payload,
        skillId: 'm_blastur',
        skillLevel: 1,
      });
      const before = shooter.life;
      const ev: GameEvent[] = [];
      const off = world.bus.onAny((e) => ev.push(e));
      run(secs(1.5));
      off();
      if (ev.some((e) => e.type === 'deflect')) {
        deflected++;
        expect(shooter.life).toBeLessThan(before);
      }
    }
    expect(deflected).toBe(1);
  });

  it('spells are never deflected', async () => {
    const { deflectChance } = await import('../sim/systems/missiles');
    const { world } = makeTestSim(11);
    const p = hero(world, 'yediKnight', {});
    p.stats.raw.missileReflectPct = 100;
    const m = {
      defId: 'plasmaBolt',
      payload: { delivery: 'spell', useWeaponDamage: false },
    } as MissileEntity;
    expect(deflectChance(m, p)).toBe(0);
    const bolt = {
      defId: 'm_blasturBolt',
      payload: { delivery: 'missile', useWeaponDamage: true },
    } as MissileEntity;
    expect(deflectChance(bolt, p)).toBe(75);
  });

  it('Saber Deflect only works with a litesaber in hand', () => {
    const { world } = makeTestSim(11);
    const p = hero(world, 'yediKnight', { saberDeflect: 5 });
    expect(p.stats.raw.missileReflectPct ?? 0).toBeGreaterThan(15);
    p.equipment.mainHand = createItem(baseFor('vibroAxe'), { ilvl: 30 }, new Rng(1));
    recomputeStats(p, world.difficulty);
    expect(p.stats.raw.missileReflectPct ?? 0).toBe(0);
  });
});

describe('Saber Throw', () => {
  it('flies out through enemies, comes back, and hits again on the way home', () => {
    const { world, run } = makeTestSim(13);
    const p: PlayerEntity = hero(world, 'yediKnight', { twinStrike: 1, saberThrow: 1 });
    p.stats.attackRating = 1e6;
    const near = spawnTestMonster(world, { pos: { x: 13, y: 20 }, life: 999 });
    const far = spawnTestMonster(world, { pos: { x: 15, y: 20 }, life: 999 });
    const hits: number[] = [];
    world.bus.on('missileHit', (e) => {
      if (e.targetId !== undefined) hits.push(e.targetId);
    });
    expect(startSkill(world, p, 'saberThrow', { id: near.id })).toBe(true);
    run(secs(3));
    expect(hits.filter((h) => h === near.id).length).toBe(2);
    expect(hits.filter((h) => h === far.id).length).toBe(2);
    expect([...world.entities.values()].some((e) => e.kind === 'missile')).toBe(false); // caught
  });
});

describe('enemy Forse powers', () => {
  it('are telegraphed with a wind-up event before they fire', () => {
    const { world } = makeTestSim(17);
    const p = hero(world, 'yediKnight', {});
    const acolyte = spawnTestMonster(world, { pos: { x: 13, y: 20 }, defId: 'sythAcolyte' });
    const events: GameEvent[] = [];
    world.bus.onAny((e) => events.push(e));
    for (const id of ['m_forseLightning', 'm_forsePush', 'm_forsePull', 'm_forseGrip', 'm_saberThrow']) {
      events.length = 0;
      acolyte.action = undefined;
      acolyte.cooldowns = {};
      acolyte.mode = 'idle';
      expect(startSkill(world, acolyte, id, { id: p.id }), id).toBe(true);
      const w = events.find((e) => e.type === 'skillWindup');
      expect(w, id).toBeTruthy();
      expect((w as Extract<GameEvent, { type: 'skillWindup' }>).sec, id).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('a hit interrupts the wind-up', () => {
    const { world, run } = makeTestSim(17);
    const p = hero(world, 'yediKnight', {});
    const acolyte = spawnTestMonster(world, { pos: { x: 13, y: 20 }, defId: 'sythAcolyte' });
    startSkill(world, acolyte, 'm_forsePush', { id: p.id });
    run(2);
    applyEffect(world, acolyte, { kind: 'stun', durationSec: 0.5 });
    run(secs(1));
    expect(p.pos.x).toBeCloseTo(10, 5);
  });

  it('the Syth Acolyte and the new skills have display names', () => {
    expect(hasName('mon.sythAcolyte')).toBe(true);
    for (const id of [
      'forsePush',
      'forseLightning',
      'forseGrip',
      'saberThrow',
      'saberDeflect',
      'mindTrik',
      'forseSpeed',
      'forseRepulse',
      'jetpakBoost',
    ]) {
      const s = DB.skills.get(id);
      expect(s, id).toBeTruthy();
      expect(hasName(s!.name), id).toBe(true);
      expect(hasName(s!.description), id).toBe(true);
    }
    for (const id of [
      'staticField',
      'stormNova',
      'lightning',
      'twinThrow',
      'pikeMastery',
      'avoid',
      'fearRoar',
    ])
      expect(DB.skills.has(id), id).toBe(false);
  });
});
