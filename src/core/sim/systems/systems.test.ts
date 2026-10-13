import { describe, expect, it } from 'vitest';
import { DB } from '../../../data/db';
import { createPlayer } from '../../player/create';
import { allocateSkill, allocateStat, respec } from '../../player/progression';
import type { GameEvent } from '../events';
import type { MonsterEntity } from '../entities';
import { CommandHandlers, addBuff, applyEffect, createCoreSystems } from './index';
import { makeFlatLevel, makeTestSim, registerTestSkill, spawnTestMonster } from './testing';

function setup(
  items: string[] = ['test.saber', 'test.stim'],
  cls: 'yediKnight' | 'bountyHuntur' | 'forseAdept' = 'yediKnight',
) {
  const sim = makeTestSim(7);
  const events: GameEvent[] = [];
  sim.world.bus.onAny((e) => events.push(e));
  const player = createPlayer(sim.world, cls, 'Tester', { startingItems: items, pos: { x: 10.5, y: 10.5 } });
  return { ...sim, player, events };
}

const countOf = (events: GameEvent[], type: GameEvent['type']): number =>
  events.filter((e) => e.type === type).length;

describe('createCoreSystems', () => {
  it('has the documented order', () => {
    expect(createCoreSystems().map((s) => s.name)).toEqual([
      'commands',
      'movement',
      'targeting',
      'actions',
      'missiles',
      'areas',
      'effects',
      'regen',
      'death',
      'pickup',
      'stats',
    ]);
  });
});

describe('movement', () => {
  it('walks to a moveTo target at roughly run speed', () => {
    const { world, run, player } = setup();
    world.commands.push({ type: 'moveTo', pos: { x: 20.5, y: 10.5 } });
    run(25); // 1s at ~6 tiles/s
    expect(player.pos.x).toBeGreaterThan(14);
    expect(player.mode).toBe('run');
    run(100);
    expect(player.pos.x).toBeCloseTo(20.5, 0);
    expect(player.mode).toBe('idle');
    expect(player.moveTarget).toBeUndefined();
  });

  it('walks slower when not running and slides along walls', () => {
    const { world, run, player } = setup();
    world.commands.push({ type: 'setRunning', running: false });
    world.commands.push({ type: 'moveDir', dir: { x: 1, y: 0 } });
    run(25);
    expect(player.pos.x - 10.5).toBeGreaterThan(3.5);
    expect(player.pos.x - 10.5).toBeLessThan(4.6);
    world.commands.push({ type: 'moveDir', dir: { x: 0, y: 0 } });
    run(1);
    world.commands.push({ type: 'moveDir', dir: { x: 1, y: 0 } });
    world.commands.push({ type: 'setRunning', running: true });
    run(200);
    expect(player.pos.x).toBeLessThan(39); // stopped by the outer wall
  });

  it('drains stamina while running and regenerates when idle', () => {
    const { world, run, player } = setup();
    world.commands.push({ type: 'moveDir', dir: { x: 0, y: 1 } });
    run(50);
    expect(player.stamina).toBeLessThan(player.stats.staminaMax);
    const low = player.stamina;
    world.commands.push({ type: 'stop' });
    world.commands.push({ type: 'moveDir', dir: { x: 0, y: 0 } });
    run(50);
    expect(player.stamina).toBeGreaterThan(low);
  });

  it('separates overlapping monsters', () => {
    const { world, run } = setup();
    const a = spawnTestMonster(world, { pos: { x: 20, y: 20 } });
    const b = spawnTestMonster(world, { pos: { x: 20.05, y: 20 } });
    run(20);
    expect(Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y)).toBeGreaterThan(0.5);
  });

  it('chill slows movement and freeze stops it', () => {
    const { world, run, player } = setup();
    applyEffect(world, player, { kind: 'chill', durationSec: 5, magnitude: 50 });
    world.commands.push({ type: 'moveDir', dir: { x: 1, y: 0 } });
    run(25);
    const slow = player.pos.x - 10.5;
    expect(slow).toBeLessThan(4);
    applyEffect(world, player, { kind: 'freeze', durationSec: 2 });
    const x = player.pos.x;
    run(10);
    expect(player.mode).toBe('frozen');
    expect(player.pos.x).toBe(x);
    run(60);
    expect(player.mode).not.toBe('frozen');
  });
});

describe('combat loop', () => {
  it('player attacks a dummy until it dies: death, remnant, xp, kills level up', () => {
    const { world, run, player, events } = setup();
    const m = spawnTestMonster(world, { pos: { x: 14.5, y: 10.5 }, life: 30, level: 10 });
    world.commands.push({ type: 'interact', targetId: m.id });
    run(400);
    expect(m.life).toBe(0);
    expect(countOf(events, 'death')).toBeGreaterThanOrEqual(1);
    const death = events.find((e) => e.type === 'death' && e.id === m.id);
    expect(death).toMatchObject({ killerId: player.id, droyd: false });
    expect(player.xp).toBeGreaterThan(0);
    expect(countOf(events, 'xpGained')).toBeGreaterThan(0);
    // dying -> removed, remnant spawned
    run(30);
    expect(world.get(m.id)).toBeUndefined();
    const rem = [...world.all()].filter((e) => e.kind === 'remnant');
    expect(rem).toHaveLength(1);
    // remnant fades
    run(25 * 9);
    expect([...world.all()].filter((e) => e.kind === 'remnant')).toHaveLength(0);
  });

  it('levels up after enough kills (5 stat points, 1 skill point, no free heal)', () => {
    const { world, run, player, events } = setup();
    player.life = 10;
    for (let i = 0; i < 8; i++) {
      const m = spawnTestMonster(world, { pos: { x: 12.5, y: 10.5 }, life: 1, level: 12, defense: 0 });
      world.commands.push({ type: 'interact', targetId: m.id });
      run(60);
    }
    expect(player.level).toBeGreaterThanOrEqual(2);
    expect(countOf(events, 'levelUp')).toBeGreaterThanOrEqual(1);
    expect(player.statPointsUnspent).toBe((player.level - 1) * 5);
    expect(player.skillPointsUnspent).toBe(player.level - 1);
    expect(player.life).toBeLessThan(player.stats.lifeMax);
  });

  it('monsters killed by player summons give no xp', () => {
    const { world, run, player } = setup();
    const ally = spawnTestMonster(world, { pos: { x: 12, y: 12 }, team: 'players', ownerId: player.id });
    const m = spawnTestMonster(world, { pos: { x: 13, y: 12 }, life: 5 });
    m.lastHitBy = ally.id;
    m.life = 0;
    run(2);
    expect(player.xp).toBeGreaterThan(0); // owner of the killer is the player
    const x = player.xp;
    ally.life = 0;
    run(2);
    expect(player.xp).toBe(x);
  });

  it('missile skill (ranged weapon basic attack) hits and kills', () => {
    const { world, run, player, events } = setup(['test.blastur'], 'bountyHuntur');
    const m = spawnTestMonster(world, { pos: { x: 18.5, y: 10.5 }, life: 10 });
    world.commands.push({ type: 'interact', targetId: m.id });
    run(150);
    const hit = events.find((e) => e.type === 'missileHit' && e.targetId === m.id);
    expect(hit).toBeTruthy();
    expect(m.life).toBeLessThan(10);
    // Player stayed outside melee range
    expect(Math.hypot(player.pos.x - m.pos.x, player.pos.y - m.pos.y)).toBeGreaterThan(2);
  });

  it('missiles stop at walls', () => {
    const sim = makeTestSim(
      3,
      makeFlatLevel(40, 40, [
        { x: 14, y: 10 },
        { x: 14, y: 11 },
        { x: 14, y: 9 },
      ]),
    );
    const player = createPlayer(sim.world, 'bountyHuntur', 'A', {
      startingItems: ['test.blastur'],
      pos: { x: 10.5, y: 10.5 },
    });
    const m = spawnTestMonster(sim.world, { pos: { x: 17.5, y: 10.5 }, life: 100 });
    sim.world.commands.push({ type: 'useSkill', skillId: 'attack', targetId: m.id, standStill: true });
    sim.run(100);
    expect(m.life).toBe(100);
    expect(player.alive).toBe(true);
  });

  it('nova hits every enemy in radius, not outside', () => {
    const { world, run, player } = setup();
    registerTestSkill({
      id: 'testNova',
      kind: 'nova',
      damage: { storm: { min: 30, max: 30 } },
      params: { radius: 5 },
      manaCost: 0,
    });
    const near = [0, 1, 2].map((i) =>
      spawnTestMonster(world, { pos: { x: 10.5 + 2 + i * 0.5, y: 10.5 + i }, life: 200 }),
    );
    const far = spawnTestMonster(world, { pos: { x: 25, y: 25 }, life: 200 });
    world.commands.push({ type: 'useSkill', skillId: 'testNova', targetPos: player.pos });
    run(40);
    for (const m of near) expect(m.life).toBeLessThan(200);
    expect(far.life).toBe(200);
  });

  it('area skill ticks over time; multi-missile fans out', () => {
    const { world, run, player } = setup();
    registerTestSkill({
      id: 'testBlizzard',
      kind: 'area',
      damage: { cryo: { min: 5, max: 5 } },
      params: { radius: 3, duration: 2, tickInterval: 0.5, range: 20 },
    });
    const m = spawnTestMonster(world, { pos: { x: 15, y: 10.5 }, life: 500 });
    world.commands.push({ type: 'useSkill', skillId: 'testBlizzard', targetPos: { x: 15, y: 10.5 } });
    run(100);
    expect(m.life).toBeLessThanOrEqual(500 - 15); // several ticks landed
    expect([...world.all()].some((e) => e.kind === 'area')).toBe(false);

    m.alive = false;
    registerTestSkill({
      id: 'testFan',
      kind: 'multiMissile',
      missile: 'test.bolt',
      damage: { storm: { min: 5, max: 5 } },
      params: { missiles: 5, spread: 60 },
    });
    world.commands.push({ type: 'useSkill', skillId: 'testFan', targetPos: { x: 20, y: 10.5 } });
    run(18);
    expect([...world.all()].filter((e) => e.kind === 'missile').length).toBe(5);
    void player;
  });

  it('melee skill with hits repeats and applies stun', () => {
    const { world, run, player } = setup();
    registerTestSkill({
      id: 'testFrenzy',
      kind: 'meleeAttack',
      anim: 'attack1',
      weaponDamagePct: 100,
      params: { hits: 2, stunSec: 0.5, range: 2 },
    });
    const m = spawnTestMonster(world, { pos: { x: 11.8, y: 10.5 }, life: 1000 });
    const swings: number[] = [];
    world.bus.on('skillCast', () => swings.push(world.tick));
    world.commands.push({ type: 'useSkill', skillId: 'testFrenzy', targetId: m.id });
    run(60);
    expect(swings.length).toBeGreaterThanOrEqual(2);
    expect(m.life).toBeLessThan(1000);
    void player;
  });

  it('beam and chain hit multiple enemies', () => {
    const { world, run } = setup();
    registerTestSkill({
      id: 'testBeam',
      kind: 'beam',
      damage: { plasma: { min: 10, max: 10 } },
      params: { length: 10, width: 1.5 },
    });
    registerTestSkill({
      id: 'testChain',
      kind: 'chain',
      damage: { storm: { min: 10, max: 10 } },
      params: { hits: 4, jumpRange: 5 },
    });
    const ms = [13, 15, 17].map((x) => spawnTestMonster(world, { pos: { x, y: 10.5 }, life: 300 }));
    world.commands.push({ type: 'useSkill', skillId: 'testBeam', targetPos: { x: 20, y: 10.5 } });
    run(40);
    for (const m of ms) expect(m.life).toBeLessThan(300);
    const before = ms.map((m) => m.life);
    world.commands.push({ type: 'useSkill', skillId: 'testChain', targetId: ms[0]!.id });
    run(40);
    ms.forEach((m, i) => expect(m.life).toBeLessThan(before[i]!));
  });

  it('leap moves the caster and lands; blink teleports', () => {
    const { world, run, player } = setup();
    registerTestSkill({
      id: 'testLeap',
      kind: 'movement',
      anim: 'attack1',
      damage: { physical: { min: 5, max: 5 } },
      params: { distance: 8, landRadius: 2 },
    });
    registerTestSkill({ id: 'testBlink', kind: 'movement', params: { teleport: 1, distance: 12 } });
    const m = spawnTestMonster(world, { pos: { x: 18, y: 10.5 }, life: 100 });
    world.commands.push({ type: 'useSkill', skillId: 'testLeap', targetPos: { x: 18, y: 10.5 } });
    run(40);
    expect(player.pos.x).toBeGreaterThan(17);
    expect(m.life).toBeLessThan(100);
    world.commands.push({ type: 'useSkill', skillId: 'testBlink', targetPos: { x: 10.5, y: 25 } });
    run(30);
    expect(player.pos.y).toBeGreaterThan(20);
  });

  it('whirl hits through targets repeatedly while moving', () => {
    const { world, run, player } = setup();
    registerTestSkill({
      id: 'testWhirl',
      kind: 'whirl',
      anim: 'attack1',
      weaponDamagePct: 100,
      params: { duration: 1.5, radius: 2, interval: 0.25, speed: 6 },
    });
    const ms = [14, 17].map((x) => spawnTestMonster(world, { pos: { x, y: 10.5 }, life: 500 }));
    world.commands.push({
      type: 'useSkill',
      skillId: 'testWhirl',
      targetPos: { x: 20, y: 10.5 },
      standStill: true,
    });
    run(60);
    expect(player.pos.x).toBeGreaterThan(15);
    for (const m of ms) expect(m.life).toBeLessThan(500);
  });

  it('summon spawns owned player-side monsters and respects caps and duration', () => {
    const { world, run, player } = setup();
    registerTestSkill({
      id: 'testSummon',
      kind: 'summon',
      summon: 'test.dummy',
      params: { count: 1, maxSummons: 2, duration: 2 },
    });
    for (let i = 0; i < 3; i++) {
      world.commands.push({ type: 'useSkill', skillId: 'testSummon' });
      run(30);
    }
    const mine = [...world.all()].filter(
      (e): e is MonsterEntity => e.kind === 'monster' && e.ownerId === player.id && e.life > 0,
    );
    expect(mine.length).toBeLessThanOrEqual(2);
    expect(mine[0]?.team).toBe('players');
    run(25 * 4);
    expect([...world.all()].filter((e) => e.kind === 'monster' && e.life > 0)).toHaveLength(0);
  });

  it('warcry applies fear and debuffs to enemies', () => {
    const { world, run } = setup();
    registerTestSkill({
      id: 'testRoar',
      kind: 'warcry',
      params: { radius: 6, fearSec: 3, duration: 5 },
      mods: [{ stat: 'defense', op: 'flat', value: -10 }],
    });
    const m = spawnTestMonster(world, { pos: { x: 13, y: 10.5 } });
    world.commands.push({ type: 'useSkill', skillId: 'testRoar' });
    run(30);
    expect(typeof m.ai.fearUntil).toBe('number');
    expect(m.buffs.some((b) => b.id === 'testRoar')).toBe(true);
  });
});

describe('effects & buffs', () => {
  it('buff skill raises stats and expires', () => {
    const { world, run, player } = setup();
    registerTestSkill({
      id: 'testArmor',
      kind: 'buff',
      mods: [{ stat: 'defense', op: 'flat', value: { base: 100, perLevel: [0, 0, 0, 0, 0] } }],
      params: { duration: 1 },
    });
    const before = player.stats.defense;
    world.commands.push({ type: 'useSkill', skillId: 'testArmor' });
    run(20);
    expect(player.stats.defense).toBeGreaterThanOrEqual(before + 100);
    run(60);
    expect(player.buffs).toHaveLength(0);
    expect(player.stats.defense).toBe(before);
  });

  it('toxin DoT ticks and credits the source', () => {
    const { world, run, player, events } = setup();
    const m = spawnTestMonster(world, { pos: { x: 20, y: 20 }, life: 100 });
    applyEffect(world, m, { kind: 'toxin', durationSec: 2, magnitude: 40 }, player.id);
    run(25);
    expect(m.life).toBeLessThan(100);
    expect(m.life).toBeGreaterThan(55);
    run(40);
    expect(m.life).toBe(60);
    expect(m.effects).toHaveLength(0);
    expect(events.some((e) => e.type === 'damage' && e.dtype === 'toxin' && e.sourceId === player.id)).toBe(
      true,
    );
  });

  it('DoT from an area refreshes instead of stacking', () => {
    const { world, player } = setup();
    const m = spawnTestMonster(world, { pos: { x: 20, y: 20 }, life: 100 });
    for (let i = 0; i < 5; i++)
      applyEffect(world, m, { kind: 'toxin', durationSec: 2, magnitude: 10 }, player.id);
    expect(m.effects).toHaveLength(1);
  });

  it('cannotBeFrozen prevents freeze; trail buff drops areas as the caster moves', () => {
    const { world, run, player } = setup();
    registerTestSkill({
      id: 'testTrail',
      kind: 'trail',
      damage: { plasma: { min: 3, max: 3 } },
      params: { duration: 5, radius: 1, areaDuration: 1 },
    });
    world.commands.push({ type: 'useSkill', skillId: 'testTrail' });
    run(20);
    world.commands.push({ type: 'moveTo', pos: { x: 20.5, y: 10.5 } });
    run(15);
    expect([...world.all()].filter((e) => e.kind === 'area').length).toBeGreaterThan(1);
    addBuff(player, {
      id: 'x',
      level: 1,
      remainingSec: 10,
      mods: [{ stat: 'cannotBeFrozen', op: 'flat', value: 1 }],
    });
    run(2);
    expect(applyEffect(world, player, { kind: 'freeze', durationSec: 2 })).toBe(false);
  });

  it('big hits cause hit recovery that interrupts the monster action', () => {
    const { world, run } = setup();
    const m = spawnTestMonster(world, { pos: { x: 20, y: 20 }, life: 100 });
    // damage via a monster hitting itself is awkward; use applyAttackResult directly
    return import('./damage').then(({ applyAttackResult }) => {
      applyAttackResult(world, undefined, m, {
        outcome: 'hit',
        damage: { physical: 30 },
        total: 30,
        crit: false,
        crushed: false,
        effects: [],
        lifeStolen: 0,
        manaStolen: 0,
      });
      expect(m.mode).toBe('hit');
      run(30);
      expect(m.mode).toBe('idle');
    });
  });
});

describe('player rules', () => {
  it('allocateSkill respects reqLevel, prereqs and max points; respec refunds', () => {
    const { world, player } = setup();
    registerTestSkill({ id: 'ykA', kind: 'passive', classId: 'yediKnight', tree: 'yediKnight.saberForms' });
    registerTestSkill({
      id: 'ykB',
      kind: 'passive',
      classId: 'yediKnight',
      tree: 'yediKnight.saberForms',
      reqLevel: 6,
      prereqs: ['ykA'],
    });
    registerTestSkill({ id: 'bhX', kind: 'passive', classId: 'bountyHuntur', tree: 'bountyHuntur.blasturs' });
    player.skillPointsUnspent = 30;
    expect(allocateSkill(player, 'ykB')).toBe(false); // prereq + level
    expect(allocateSkill(player, 'bhX')).toBe(false); // other class
    expect(allocateSkill(player, 'ykA')).toBe(true);
    expect(allocateSkill(player, 'ykB')).toBe(false); // level 1 < 6
    player.level = 6;
    expect(allocateSkill(player, 'ykB')).toBe(true);
    for (let i = 0; i < 25; i++) allocateSkill(player, 'ykA');
    expect(player.skills.ykA).toBe(20);
    expect(player.skillPointsUnspent).toBe(30 - 20 - 1);

    player.statPointsUnspent = 10;
    expect(allocateStat(player, 'strength', 4)).toBe(true);
    expect(allocateStat(player, 'strength', 99)).toBe(false);
    expect(player.allocated.strength).toBe(4);

    expect(respec(player, world.difficulty)).toBe(true);
    expect(player.skills).toEqual({});
    expect(player.skillPointsUnspent).toBe(30);
    expect(player.statPointsUnspent).toBe(10);
    expect(respec(player, world.difficulty)).toBe(false);
  });

  it('passive skill mods and +skills feed recomputed stats', () => {
    const { run, player } = setup();
    registerTestSkill({
      id: 'ykMastery',
      kind: 'passive',
      classId: 'yediKnight',
      tree: 'yediKnight.masteries',
      mods: [{ stat: 'defense', op: 'flat', value: { base: 10, perLevel: [10, 10, 10, 10, 10] } }],
    });
    const before = player.stats.defense;
    player.skills.ykMastery = 3;
    player.statsDirty = true;
    run(1);
    expect(player.stats.defense).toBe(before + 30);
    addBuff(player, {
      id: 'plusAll',
      level: 1,
      remainingSec: Infinity,
      mods: [{ stat: 'allSkills', op: 'flat', value: 2 }],
    });
    run(1);
    expect(player.stats.defense).toBe(before + 50);
  });

  it('player defeat: Defeated event, creditz loss, respawn with full life', () => {
    const { world, run, player, events } = setup();
    player.creditz = 1000;
    player.life = 0;
    run(2);
    expect(player.mode).toBe('dying');
    expect(countOf(events, 'playerDefeated')).toBe(1);
    expect(player.creditz).toBeLessThan(1000);
    run(25 * 2);
    expect(player.mode).toBe('idle');
    expect(player.life).toBe(player.stats.lifeMax);
    expect(player.alive).toBe(true);
  });

  it('veteran difficulty also costs XP but never de-levels', () => {
    const { world, run, player } = setup();
    world.difficulty = 'veteran';
    player.level = 5;
    player.xp = 8000;
    player.life = 0;
    run(2);
    expect(player.xp).toBeLessThan(8000);
    expect(player.xp).toBeGreaterThanOrEqual(7875);
  });
});

describe('commands & items', () => {
  it('equip/unequip, stim use, drop and pickup', () => {
    const { world, run, player, events } = setup(['test.stim']);
    const stim = player.belt.slots[0]!;
    expect(stim.base).toBe('test.stim');
    player.life = 10;
    world.commands.push({ type: 'useBeltSlot', index: 0 });
    run(2);
    expect(player.life).toBe(40);
    expect(player.belt.slots[0]).toBeNull();

    // gives a saber via inventory and equips it
    const saber = { ...stim, uid: 's1', base: 'test.saber' };
    player.inventory.items.push({ item: saber, x: 0, y: 0 });
    world.commands.push({ type: 'equip', uid: 's1', slot: 'mainHand' });
    run(2);
    expect(player.equipment.mainHand?.uid).toBe('s1');
    expect(player.stats.physMax).toBeGreaterThan(9);
    world.commands.push({ type: 'unequip', slot: 'mainHand' });
    run(2);
    expect(player.equipment.mainHand).toBeUndefined();
    expect(player.inventory.items.some((e) => e.item.uid === 's1')).toBe(true);

    world.commands.push({ type: 'dropItem', uid: 's1' });
    run(2);
    const ground = [...world.all()].find((e) => e.kind === 'groundItem');
    expect(ground).toBeTruthy();
    world.commands.push({ type: 'pickup', targetId: ground!.id });
    run(10);
    expect(player.inventory.items.some((e) => e.item.uid === 's1')).toBe(true);
    expect(events.some((e) => e.type === 'inventoryChanged')).toBe(true);
  });

  it('two-handed weapons displace the shield and requirements are enforced', () => {
    const { world, run, player, events } = setup(['test.saber']);
    (DB.items as Map<string, unknown>).set('test.heavy', {
      ...DB.items.get('test.saber')!,
      id: 'test.heavy',
      req: { strength: 999 },
    });
    player.inventory.items.push({
      item: { ...player.equipment.mainHand!, uid: 'h1', base: 'test.heavy' },
      x: 0,
      y: 0,
    });
    world.commands.push({ type: 'equip', uid: 'h1', slot: 'mainHand' });
    run(2);
    expect(player.equipment.mainHand?.base).toBe('test.saber');
    expect(events.some((e) => e.type === 'toast' && e.textKey === 'toast.requirementsNotMet')).toBe(true);
  });

  it('module commands route through CommandHandlers, else toast', () => {
    const { world, run, events } = setup();
    world.commands.push({ type: 'cubeTransmute' });
    run(2);
    expect(events.some((e) => e.type === 'toast' && e.textKey === 'toast.notAvailable')).toBe(true);
    let got = 0;
    const off = CommandHandlers.register('cubeTransmute', () => {
      got++;
      return true;
    });
    world.commands.push({ type: 'cubeTransmute' });
    run(2);
    off();
    expect(got).toBe(1);
  });

  it('selectSkill / bindHotkey validate known skills; pause toggles', () => {
    const { world, run, player } = setup();
    registerTestSkill({ id: 'ykZ', kind: 'buff', classId: 'yediKnight', tree: 'yediKnight.commands' });
    world.commands.push({ type: 'selectSkill', hand: 'right', skillId: 'ykZ' }); // 0 points
    run(1);
    expect(player.rightSkill).toBe('attack');
    player.skills.ykZ = 1;
    world.commands.push({ type: 'selectSkill', hand: 'right', skillId: 'ykZ' });
    world.commands.push({ type: 'bindHotkey', slot: 2, skillId: 'ykZ' });
    run(1);
    expect(player.rightSkill).toBe('ykZ');
    expect(player.hotkeys[2]).toBe('ykZ');
    world.commands.push({ type: 'pause', paused: true });
    run(1);
    expect(world.paused).toBe(true);
  });

  it('cannot use skills without mana or the right weapon', () => {
    const { world, run, player, events } = setup();
    registerTestSkill({ id: 'testCost', kind: 'nova', manaCost: 9999, params: { radius: 2 } });
    world.commands.push({ type: 'useSkill', skillId: 'testCost' });
    run(3);
    expect(events.some((e) => e.type === 'toast' && e.textKey === 'toast.notEnoughMana')).toBe(true);
    world.commands.push({ type: 'useSkill', skillId: 'throw', targetPos: { x: 15, y: 10 } });
    run(3);
    expect(events.some((e) => e.type === 'toast' && e.textKey === 'toast.wrongWeapon')).toBe(true);
    expect(player.action).toBeUndefined();
  });
});

describe('save-relevant state', () => {
  it('player persisted fields are JSON-stable', () => {
    const { run, player } = setup();
    run(10);
    const snap = {
      level: player.level,
      xp: player.xp,
      creditz: player.creditz,
      allocated: player.allocated,
      skills: player.skills,
      equipment: player.equipment,
      inventory: player.inventory,
      belt: player.belt,
      respecs: player.respecs,
      hotkeys: player.hotkeys,
    };
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    expect(Number.isFinite(player.life)).toBe(true);
  });
});

describe('performance smoke', () => {
  it('200 monsters + 100 missiles for 250 ticks stays fast', () => {
    const sim = makeTestSim(5, makeFlatLevel(80, 80));
    const { world, loop } = sim;
    const player = createPlayer(world, 'bountyHuntur', 'P', {
      startingItems: ['test.blastur'],
      pos: { x: 40, y: 40 },
    });
    for (let i = 0; i < 200; i++) {
      const m = spawnTestMonster(world, {
        pos: { x: 10 + (i % 20) * 3, y: 10 + Math.floor(i / 20) * 3 },
        life: 100000,
      });
      m.moveTarget = { x: 40, y: 40 };
    }
    const payload = { delivery: 'missile' as const, useWeaponDamage: true };
    let spawned = 0;
    const t0 = performance.now();
    for (let t = 0; t < 250; t++) {
      if (t % 5 === 0) {
        // keep ~100 missiles in flight
        for (let k = 0; k < 20; k++) {
          const a = (k / 20) * Math.PI * 2 + t;
          world.add({
            id: world.allocId(),
            kind: 'missile',
            pos: { x: 40, y: 40 },
            facing: a,
            radius: 0.3,
            alive: true,
            defId: 'test.bolt',
            ownerId: player.id,
            team: 'players',
            skillLevel: 1,
            velocity: { x: Math.cos(a) * 20, y: Math.sin(a) * 20 },
            traveled: 0,
            range: 20,
            hitIds: [],
            payload,
          });
          spawned++;
        }
      }
      loop.step();
    }
    const ms = performance.now() - t0;
    expect(spawned).toBe(1000);
    expect(ms).toBeLessThan(4000);
  });
});
