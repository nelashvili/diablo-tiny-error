import { describe, expect, it } from 'vitest';
import act1 from './act1';
import npcs from '../npcs/act1';
import names from '../names/levels';
import { generateLevel } from '../../core/world/mapgen';
import { distanceField } from '../../core/world/grid';
import { findPath } from '../../core/world/pathfinding';
import type { LevelDef } from '../schema';

const ids = new Set(act1.map((l) => l.id));

function check(def: LevelDef, seed: number): void {
  const g = generateLevel(def, seed);
  const { map } = g;
  const start = g.placements.find((p) => p.kind === 'playerStart');
  expect(start, def.id).toBeDefined();
  const dist = distanceField(map, Math.floor(start!.pos.x), Math.floor(start!.pos.y));
  const at = (x: number, y: number): number => dist[Math.floor(y) * map.width + Math.floor(x)] as number;
  for (const p of g.placements) {
    expect(map.walkable[Math.floor(p.pos.y) * map.width + Math.floor(p.pos.x)], `${def.id} ${p.kind}`).toBe(
      1,
    );
    expect(at(p.pos.x, p.pos.y), `${def.id} ${p.kind} reachable`).toBeGreaterThanOrEqual(0);
  }
  const exits = g.placements.filter((p) => p.kind === 'exit');
  expect(exits.map((e) => e.ref).sort()).toEqual(def.links.map((l) => l.to).sort());
  if (def.waypoint) expect(g.placements.some((p) => p.kind === 'waypoint')).toBe(true);
  for (const b of def.bosses ?? [])
    expect(g.placements.some((p) => p.kind === 'boss' && p.ref === b)).toBe(true);
  if (!def.isTown) expect(g.placements.some((p) => p.kind === 'monsterPack')).toBe(true);
  for (let i = 0; i < map.walkable.length; i++) {
    if (map.walkable[i] === 1) expect(dist[i], `${def.id} pocket`).toBeGreaterThanOrEqual(0);
  }
  // pathfinding between start and every exit
  for (const e of exits)
    expect(findPath(map, start!.pos, e.pos, { maxNodes: 100000 }), def.id).not.toBeNull();
}

describe('act1 levels', () => {
  it('links resolve and are bidirectional; names exist', () => {
    for (const l of act1) {
      expect(names[l.name as keyof typeof names], l.name).toBeDefined();
      for (const k of l.links) {
        const t = act1.find((o) => o.id === k.to);
        expect(t, `${l.id} -> ${k.to}`).toBeDefined();
        expect(
          t!.links.some((b) => b.to === l.id),
          `${k.to} back to ${l.id}`,
        ).toBe(true);
      }
    }
    expect(ids.size).toBe(act1.length);
    for (const n of npcs) {
      expect(names[n.name as keyof typeof names]).toBeDefined();
      for (const d of n.dialogue) expect(names[d as keyof typeof names]).toBeDefined();
    }
  });

  for (const def of act1) {
    it(`generates ${def.id} connected for several seeds`, () => {
      for (const seed of [1, 2, 3, 12345]) check(def as LevelDef, seed);
    });
  }

  it('is deterministic by seed', () => {
    for (const def of act1) {
      const a = generateLevel(def as LevelDef, 77);
      const b = generateLevel(def as LevelDef, 77);
      expect(a.map.kinds).toEqual(b.map.kinds);
      expect(a.placements).toEqual(b.placements);
      const c = generateLevel(def as LevelDef, 78);
      if (def.gen !== 'town') expect(c.map.kinds).not.toEqual(a.map.kinds);
    }
  });

  it('maze walls are one tile thick and town has npcs + stash', () => {
    const maze = generateLevel(act1.find((l) => l.id === 'a1.tuskinDen') as LevelDef, 5);
    const { map } = maze;
    for (let y = 1; y < map.height - 1; y++)
      for (let x = 1; x < map.width - 1; x++) {
        const i = y * map.width + x;
        if (map.kinds[i] === 'void') {
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) expect(map.walkable[i + dy * map.width + dx]).toBe(0);
        }
      }
    const town = generateLevel(act1.find((l) => l.id === 'a1.town') as LevelDef, 5);
    expect(town.placements.filter((p) => p.kind === 'npc').length).toBe(5);
    expect(town.placements.some((p) => p.kind === 'stash')).toBe(true);
    expect(town.placements.some((p) => p.kind === 'monsterPack')).toBe(false);
  });
});

describe('Act I opening area', () => {
  it('keeps monster packs away from where the player arrives', () => {
    const def = act1.find((l) => l.id === 'a1.mossfields')!;
    for (const seed of [1, 7, 42, 1234, 99991]) {
      const g = generateLevel(def, seed);
      const arrivals = g.placements.filter((p) => p.kind === 'playerStart' || p.kind === 'exit');
      for (const pack of g.placements.filter((p) => p.kind === 'monsterPack')) {
        for (const a of arrivals) {
          const d = Math.hypot(pack.pos.x - a.pos.x, pack.pos.y - a.pos.y);
          expect(d, `seed ${seed} pack near ${a.kind}`).toBeGreaterThanOrEqual(16);
        }
      }
    }
  });
});
