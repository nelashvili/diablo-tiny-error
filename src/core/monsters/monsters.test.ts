import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { DB } from '../../data/db';
import { t } from '../../data/names';
import type { LevelDef, MonsterModifier } from '../../data/schema';
import { isWalkable } from '../world/types';
import type { Placement } from '../world/types';
import { createMonster } from './create';
import { spawnLevelMonsters } from './spawn';
import { openLevel, testWorld } from './testWorld';
import { monsterTint, rollModifierCount } from './modifiers';

const P = { x: 10, y: 10 };

describe('createMonster', () => {
  it('scales life with level and difficulty', () => {
    const w = testWorld();
    const a = createMonster(w, 'scrapDroyd', P, 1, 'normal');
    const b = createMonster(w, 'scrapDroyd', P, 20, 'normal');
    expect(b.stats.lifeMax).toBeGreaterThan(a.stats.lifeMax * 5);
    w.difficulty = 'legend';
    const c = createMonster(w, 'scrapDroyd', P, 20, 'normal');
    expect(c.stats.lifeMax).toBeGreaterThan(b.stats.lifeMax * 2);
    expect(a.life).toBe(a.stats.lifeMax);
    expect(a.modelId).toBe('mon.scrapDroyd');
    expect(a.home).toEqual(P);
  });

  it('champions are tougher than normals and carry one modifier; uniques get a parody name', () => {
    const w = testWorld(3);
    const rng = new Rng(5);
    const n = createMonster(w, 'tuskinRaider', P, 10, 'normal', { rng: new Rng(5) });
    const c = createMonster(w, 'tuskinRaider', P, 10, 'champion', { rng: new Rng(5) });
    expect(c.stats.lifeMax).toBeGreaterThan(n.stats.lifeMax * 1.8);
    expect(c.mods).toHaveLength(1);
    const u = createMonster(w, 'tuskinRaider', P, 10, 'unique', { rng });
    expect(u.mods.length).toBeGreaterThanOrEqual(1);
    expect(u.mods.length).toBeLessThanOrEqual(3);
    expect(u.nameKey).toMatch(/^uname\./);
    expect(t(u.nameKey as string)).not.toMatch(/^uname\./);
    expect(monsterTint('champion', [])).not.toBeNull();
    expect(monsterTint('normal', [])).toBeNull();
  });

  it('is deterministic for a given seed', () => {
    const run = () => {
      const w = testWorld(7);
      const r = new Rng(99);
      return [1, 2, 3, 4].map((i) => {
        const m = createMonster(w, 'normtrooper', P, 5 + i, i % 2 ? 'unique' : 'champion', { rng: r });
        return [m.mods.join(','), m.nameKey, m.stats.lifeMax, m.stats.physMax];
      });
    };
    expect(run()).toEqual(run());
  });

  it('unique modifier count grows with difficulty', () => {
    const r = new Rng(1);
    for (let i = 0; i < 50; i++) {
      expect(rollModifierCount(r, 'normal')).toBeLessThanOrEqual(2);
      expect(rollModifierCount(r, 'legend')).toBe(3);
      expect(rollModifierCount(r, 'veteran')).toBeGreaterThanOrEqual(2);
    }
  });

  it('applies D2 modifier effects', () => {
    const w = testWorld();
    const base = createMonster(w, 'normtrooper', P, 10, 'normal', { rng: new Rng(1) });
    const mk = (mods: MonsterModifier[]) =>
      createMonster(w, 'normtrooper', P, 10, 'unique', { rng: new Rng(1), mods, nameKey: 'x' });
    const fast = mk(['extraFast']);
    expect(fast.stats.moveSpeedMul).toBeGreaterThan(1);
    expect(fast.stats.attackSpeedMul).toBeGreaterThan(1);
    const strong = mk(['extraStrong']);
    expect(strong.stats.physMax).toBeGreaterThan(base.stats.physMax * 1.4);
    const stone = mk(['stoneSkin']);
    expect(stone.stats.defense).toBeGreaterThan(base.stats.defense * 2);
    expect(stone.stats.raw.damageReducedPct).toBeGreaterThan(0);
    const mr = mk(['magicResistant']);
    expect(mr.stats.res.storm).toBeGreaterThanOrEqual(40);
    const cold = mk(['cryoEnchanted']);
    expect(cold.stats.res.cryo).toBeGreaterThanOrEqual(75);
    expect(cold.stats.elemental.cryo.max).toBeGreaterThan(0);
    const spec = mk(['spectralHit']);
    const el = spec.ai.spectralElement as 'plasma' | 'cryo' | 'storm';
    expect(spec.stats.elemental[el].max).toBeGreaterThan(0);
    expect(mk(['cursed']).ai.hitFlags).toMatchObject({ cursed: true });
    expect(mk(['manaBurn']).ai.hitFlags).toMatchObject({ manaBurn: true });
    expect(mk(['auraEnchanted']).ai.hitFlags).toHaveProperty('aura');
  });

  it('shadow wraith has physical resistance, scrap droyds are droyd revivable', () => {
    const w = testWorld();
    const g = createMonster(w, 'shadowWraith', P, 5, 'normal');
    expect(g.stats.raw.damageReducedPct).toBe(50);
    expect(createMonster(w, 'scrapDroyd', P, 5, 'normal').revivable).toBe(true);
  });
});

describe('spawnLevelMonsters', () => {
  const levelDef: LevelDef = {
    id: 'a1.test',
    act: 1,
    name: 'x',
    gen: 'outdoor',
    genParams: {},
    tileset: 't',
    monsterLevel: { normal: 4, veteran: 34, legend: 61 },
    monsters: ['scrapDroyd', 'tuskinRaider', 'normtrooper'],
    density: 1,
    champions: { min: 2, max: 2 },
    uniques: { min: 1, max: 1 },
    waypoint: false,
    links: [],
    bosses: ['countDooky'],
  };

  const makeLevel = () => {
    const lvl = openLevel(80, 80, [
      { x: 20, y: 20 },
      { x: 21, y: 20 },
    ]);
    const placements: Placement[] = [];
    for (let i = 0; i < 8; i++) placements.push({ kind: 'monsterPack', pos: { x: 10 + i * 8, y: 30 } });
    placements.push({ kind: 'boss', pos: { x: 40, y: 60 }, ref: 'countDooky' });
    lvl.placements = placements;
    return lvl;
  };

  it('spawns packs on walkable tiles with the requested champion/unique counts', () => {
    const lvl = makeLevel();
    const w = testWorld(11, lvl);
    const res = spawnLevelMonsters(w, levelDef, lvl, new Rng(4));
    expect(res.packs).toBe(8);
    expect(res.uniques).toBe(1);
    expect(res.champions).toBe(2);
    expect(res.monsters.length).toBeGreaterThan(20);
    for (const m of res.monsters) {
      expect(isWalkable(lvl.map, m.pos.x, m.pos.y), `${m.defId} at ${m.pos.x},${m.pos.y}`).toBe(true);
      expect(w.get(m.id)).toBe(m);
    }
    const uniques = res.monsters.filter((m) => m.rank === 'unique');
    expect(uniques).toHaveLength(1);
    const leader = uniques[0]!;
    const minions = res.monsters.filter((m) => m.leaderId === leader.id);
    expect(minions.length).toBeGreaterThan(0);
    for (const mi of minions) expect(mi.mods).toEqual(leader.mods);
  });

  it('places the boss with its fixed level and bossId', () => {
    const lvl = makeLevel();
    const w = testWorld(11, lvl);
    const res = spawnLevelMonsters(w, levelDef, lvl, new Rng(4));
    expect(res.bosses).toHaveLength(1);
    const b = res.bosses[0]!;
    expect(b.rank).toBe('boss');
    expect(b.level).toBe(DB.bosses.get('countDooky')!.level.normal);
    expect(b.ai.bossId).toBe('countDooky');
    expect(b.nameKey).toBe('boss.countDooky');
  });

  it('is deterministic', () => {
    const sig = () => {
      const lvl = makeLevel();
      const w = testWorld(11, lvl);
      return spawnLevelMonsters(w, levelDef, lvl, new Rng(4)).monsters.map(
        (m) => `${m.defId}:${m.rank}:${m.pos.x.toFixed(2)}:${m.pos.y.toFixed(2)}:${m.mods.join('+')}`,
      );
    };
    expect(sig()).toEqual(sig());
  });
});
