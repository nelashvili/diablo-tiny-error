import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../skills/runtime', () => ({
  getSkillLevel: vi.fn(() => 1),
  getSkillRange: vi.fn(() => 1.5),
  canUseSkill: vi.fn(() => true),
  startSkill: vi.fn(() => true),
}));

import { startSkill } from '../skills/runtime';
import { FixedLoop } from '../sim/loop';
import { dist } from '../math';
import type { RemnantEntity, MonsterEntity } from '../sim/entities';
import type { SimWorld } from '../sim/world';
import { createMonster } from '../monsters/create';
import { addHero, openLevel, testWorld } from '../monsters/testWorld';
import { createAiSystem } from './system';
import { lineOfSight } from './los';

const start = vi.mocked(startSkill);

function sim(world: SimWorld) {
  const loop = new FixedLoop(world, [createAiSystem()]);
  return (ticks: number) => {
    for (let i = 0; i < ticks; i++) loop.step();
  };
}

beforeEach(() => {
  start.mockClear();
  start.mockImplementation(() => true);
});

describe('line of sight', () => {
  it('is blocked by walls', () => {
    const lvl = openLevel(30, 30, [{ x: 10, y: 10 }]);
    expect(lineOfSight(lvl.map, { x: 5.5, y: 10.5 }, { x: 15.5, y: 10.5 })).toBe(false);
    expect(lineOfSight(lvl.map, { x: 5.5, y: 12.5 }, { x: 15.5, y: 12.5 })).toBe(true);
  });
});

describe('melee AI', () => {
  it('idle -> aggro -> chase -> attack', () => {
    const w = testWorld();
    const m = createMonster(w, 'tuskinRaider', { x: 20.5, y: 20.5 }, 3, 'normal');
    const hero = addHero(w, { x: 27.5, y: 20.5 });
    const step = sim(w);
    step(10);
    expect(m.ai.targetId).toBe(hero.id);
    expect(m.moveTarget).toBeDefined();
    expect(dist(m.moveTarget!, hero.pos)).toBeLessThan(1);
    expect(start).not.toHaveBeenCalled();
    // The movement system would walk it; emulate arrival.
    m.pos = { x: 26, y: 20.5 };
    step(2);
    expect(start).toHaveBeenCalledWith(w, m, 'm_slam', expect.objectContaining({ id: hero.id }));
    expect(m.moveTarget).toBeUndefined();
    expect(m.facing).toBeCloseTo(0, 1);
  });

  it('does not aggro through walls', () => {
    const walls = [];
    for (let y = 15; y < 26; y++) walls.push({ x: 24, y });
    const w = testWorld(1, openLevel(80, 80, walls));
    const m = createMonster(w, 'tuskinRaider', { x: 20.5, y: 20.5 }, 3, 'normal');
    addHero(w, { x: 27.5, y: 20.5 });
    sim(w)(15);
    expect(m.ai.targetId).toBeUndefined();
  });

  it('wakes the pack when one member sees the hero', () => {
    const w = testWorld();
    const a = createMonster(w, 'tuskinRaider', { x: 20.5, y: 20.5 }, 3, 'normal');
    const b = createMonster(w, 'tuskinRaider', { x: 18.5, y: 20.5 }, 3, 'minion', { leaderId: a.id });
    const hero = addHero(w, { x: 27.5, y: 20.5 });
    sim(w)(10);
    expect(b.ai.targetId).toBe(hero.id);
  });

  it('wanders near home when idle', () => {
    const w = testWorld();
    const m = createMonster(w, 'tuskinRaider', { x: 40.5, y: 40.5 }, 3, 'normal');
    sim(w)(200);
    expect(m.moveTarget).toBeDefined();
    expect(dist(m.moveTarget!, m.home)).toBeLessThanOrEqual(4.1);
  });

  it('leashes back home when dragged too far', () => {
    const w = testWorld();
    const m = createMonster(w, 'tuskinRaider', { x: 10.5, y: 10.5 }, 3, 'normal');
    addHero(w, { x: 60.5, y: 10.5 });
    m.pos = { x: 60, y: 10.5 };
    sim(w)(3);
    expect(m.ai.state).toBe('return');
    expect(m.targetId).toBeUndefined();
    expect(dist(m.moveTarget!, m.home)).toBeLessThan(0.1);
    m.pos = { x: 10.5, y: 11 };
    sim(w)(2);
    expect(m.ai.state).toBe('idle');
  });
});

describe('ranged AI', () => {
  it('a shooter fights hand to hand when the hero is right next to it', () => {
    const w = testWorld();
    const m = createMonster(w, 'normtrooper', { x: 30.5, y: 30.5 }, 3, 'normal');
    const hero = addHero(w, { x: 31.4, y: 30.5 });
    sim(w)(10);
    expect(start).toHaveBeenCalledWith(w, m, 'attack', expect.objectContaining({ id: hero.id }));
    expect(start.mock.calls.some((c) => c[2] === 'm_blastur')).toBe(false);
    expect(dist(m.pos, { x: 30.5, y: 30.5 })).toBeLessThan(0.2);
  });

  it('normtrooper kites away when crowded, then shoots from range', () => {
    const w = testWorld();
    const m = createMonster(w, 'normtrooper', { x: 30.5, y: 30.5 }, 3, 'normal');
    const hero = addHero(w, { x: 33, y: 30.5 });
    const step = sim(w);
    step(10);
    expect(m.moveTarget).toBeDefined();
    expect(dist(m.moveTarget!, hero.pos)).toBeGreaterThan(dist(m.pos, hero.pos) + 1);
    expect(start).not.toHaveBeenCalled();
    // At a comfortable distance it fires.
    m.pos = { x: 25.5, y: 30.5 };
    m.ai.kiteUntil = 0;
    m.ai.kiteCdUntil = 999;
    step(3);
    expect(start).toHaveBeenCalledWith(w, m, 'm_blastur', expect.objectContaining({ id: hero.id }));
  });

  it('multishot packs swap to the multishot skill', () => {
    const w = testWorld();
    const m = createMonster(w, 'normtrooper', { x: 25.5, y: 30.5 }, 3, 'unique', {
      mods: ['multishot'],
      nameKey: 'x',
    });
    addHero(w, { x: 31.5, y: 30.5 });
    sim(w)(10);
    expect(start.mock.calls.some((c) => c[2] === 'm_multishot')).toBe(true);
    expect(m.ai.targetId).toBeDefined();
  });
});

describe('reviver AI', () => {
  it('a Jawwa revives a droyd remnant as the original monster', () => {
    const w = testWorld();
    const jawwa = createMonster(w, 'jawwa', { x: 30.5, y: 30.5 }, 4, 'normal');
    const rem: RemnantEntity = w.add({
      id: w.allocId(),
      kind: 'remnant',
      pos: { x: 32, y: 30.5 },
      facing: 0,
      radius: 0.3,
      alive: true,
      monsterDefId: 'scrapDroyd',
      sourceMonsterId: 999,
      remainingSec: 10,
      used: false,
      droyd: true,
    });
    const step = sim(w);
    step(5);
    expect(jawwa.mode).toBe('cast');
    expect(jawwa.ai.state).toBe('revive');
    step(30);
    expect(rem.used).toBe(true);
    const revived = [...w.all()].filter(
      (e): e is MonsterEntity => e.kind === 'monster' && e.defId === 'scrapDroyd',
    );
    expect(revived).toHaveLength(1);
    expect(revived[0]!.pos).toEqual(rem.pos);
    expect(revived[0]!.life).toBe(revived[0]!.stats.lifeMax);
    expect(jawwa.mode).toBe('idle');
  });

  it('ignores non-droyd remnants', () => {
    const w = testWorld();
    const jawwa = createMonster(w, 'jawwa', { x: 30.5, y: 30.5 }, 4, 'normal');
    const rem: RemnantEntity = w.add({
      id: w.allocId(),
      kind: 'remnant',
      pos: { x: 32, y: 30.5 },
      facing: 0,
      radius: 0.3,
      alive: true,
      monsterDefId: 'mossBeast',
      sourceMonsterId: 999,
      remainingSec: 10,
      used: false,
      droyd: false,
    });
    sim(w)(40);
    expect(rem.used).toBe(false);
    expect(jawwa.ai.state).not.toBe('revive');
  });
});

describe('cowardly AI', () => {
  it('scrap droyds flee when their leader dies', () => {
    const w = testWorld();
    const leader = createMonster(w, 'scrapDroyd', { x: 30.5, y: 30.5 }, 3, 'normal');
    const f = createMonster(w, 'scrapDroyd', { x: 31.5, y: 30.5 }, 3, 'minion', { leaderId: leader.id });
    const hero = addHero(w, { x: 36.5, y: 30.5 });
    const step = sim(w);
    step(10);
    expect(f.ai.targetId).toBe(hero.id);
    leader.alive = false;
    w.sweep();
    step(2);
    expect(f.ai.state).toBe('flee');
    expect(f.running).toBe(true);
    expect(dist(f.moveTarget!, hero.pos)).toBeGreaterThan(dist(f.pos, hero.pos));
    // Flee ends after a few seconds and it fights again.
    step(25 * 10);
    expect(f.ai.state).not.toBe('flee');
  });
});

describe('player summons', () => {
  it('follow the owner and attack nearby enemies', () => {
    const w = testWorld();
    const owner = addHero(w, { x: 30.5, y: 30.5 });
    const s = createMonster(w, 'scrapDroyd', { x: 20.5, y: 30.5 }, 3, 'summon', {
      team: 'players',
      ownerId: owner.id,
    });
    const step = sim(w);
    step(3);
    expect(s.moveTarget).toBeDefined();
    expect(dist(s.moveTarget!, owner.pos)).toBeLessThan(0.1);
    s.pos = { x: 29, y: 30.5 };
    const foe = createMonster(w, 'tuskinRaider', { x: 33, y: 30.5 }, 3, 'normal');
    foe.ai.targetId = undefined;
    s.pos = { x: 31.5, y: 30.5 };
    step(10);
    expect(s.ai.targetId).toBe(foe.id);
    expect(start.mock.calls.some((c) => c[1] === s)).toBe(true);
  });

  it('despawn when the owner is gone', () => {
    const w = testWorld();
    const s = createMonster(w, 'scrapDroyd', { x: 20.5, y: 30.5 }, 3, 'summon', {
      team: 'players',
      ownerId: 424242,
    });
    sim(w)(2);
    expect(s.alive).toBe(false);
  });
});

describe('swarm and teleport', () => {
  it('probe droyds flutter away after an attack', () => {
    const w = testWorld();
    const m = createMonster(w, 'probeDroyd', { x: 30.5, y: 30.5 }, 3, 'normal');
    const hero = addHero(w, { x: 31.2, y: 30.5 });
    sim(w)(6);
    expect(start).toHaveBeenCalled();
    expect(m.ai.flutterUntil).toBeGreaterThan(w.time - 0.1);
    expect(hero.alive).toBe(true);
  });

  it('teleporting monsters blink next to a far target', () => {
    const w = testWorld();
    const m = createMonster(w, 'normtrooper', { x: 20.5, y: 20.5 }, 3, 'unique', {
      mods: ['teleport'],
      nameKey: 'x',
    });
    const hero = addHero(w, { x: 29.5, y: 20.5 });
    const before = { ...m.pos };
    sim(w)(10);
    expect(dist(m.pos, hero.pos)).toBeLessThan(dist(before, hero.pos) - 2);
  });
});

describe('boss scripts', () => {
  it('Count Dooky novas close targets, spits at range and enrages below 50% life', () => {
    const w = testWorld();
    const boss = createMonster(w, 'countDooky', { x: 30.5, y: 30.5 }, 12, 'boss', { bossId: 'countDooky' });
    addHero(w, { x: 35.5, y: 30.5 });
    const step = sim(w);
    step(10);
    expect(start.mock.calls.some((c) => c[2] === 'm_dookyNova')).toBe(true);
    expect(boss.ai.phase ?? 0).toBe(0);
    const atk = boss.stats.attackSpeedMul;
    const dmg = boss.stats.physMax;
    boss.life = boss.stats.lifeMax * 0.4;
    step(2);
    expect(boss.ai.phase).toBe(1);
    expect(boss.stats.attackSpeedMul).toBeGreaterThan(atk);
    expect(boss.stats.physMax).toBeGreaterThan(dmg);
    // Cooldowns respected: only one nova per cooldown window.
    start.mockClear();
    step(25 * 3);
    expect(start.mock.calls.filter((c) => c[2] === 'm_dookyNova').length).toBeLessThanOrEqual(1);
  });

  it('emits a boss intro once', () => {
    const w = testWorld();
    createMonster(w, 'countDooky', { x: 30.5, y: 30.5 }, 12, 'boss', { bossId: 'countDooky' });
    addHero(w, { x: 38.5, y: 30.5 });
    sim(w)(30);
    expect(w.frameEvents.filter((e) => e.type === 'bossIntro')).toHaveLength(1);
  });
});

describe('death procs', () => {
  it('enchanted monsters spawn a nova area on death', () => {
    const w = testWorld();
    const m = createMonster(w, 'tuskinRaider', { x: 30.5, y: 30.5 }, 3, 'unique', {
      mods: ['cryoEnchanted'],
      nameKey: 'x',
    });
    const step = sim(w);
    step(1);
    w.emit({ type: 'death', id: m.id, pos: m.pos, droyd: false, defId: m.defId });
    const areas = [...w.all()].filter((e) => e.kind === 'area');
    expect(areas).toHaveLength(1);
  });
});
