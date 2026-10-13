import { describe, expect, it } from 'vitest';
import type { Entity } from '../../core/sim/entities';
import type { WorldView } from '../../core/sim/world';
import {
  autoAimRadius,
  findAutoTarget,
  findInteractTarget,
  isHostile,
  pickBest,
  resolveAutoAim,
} from './autoTarget';

const mon = (id: number, x: number, y: number, extra: Record<string, unknown> = {}): Entity =>
  ({
    id,
    kind: 'monster',
    pos: { x, y },
    radius: 0.5,
    alive: true,
    team: 'monsters',
    life: 10,
    mode: 'idle',
    ...extra,
  }) as unknown as Entity;

function fakeWorld(ents: Entity[], facing = 0): WorldView {
  const player = {
    id: 1,
    kind: 'player',
    pos: { x: 0, y: 0 },
    facing,
    radius: 0.4,
    alive: true,
  } as unknown as Entity;
  const map = new Map<number, Entity>([[1, player], ...ents.map((e) => [e.id, e] as [number, Entity])]);
  return {
    tick: 0,
    time: 0,
    difficulty: 'normal',
    level: null,
    localPlayerId: 1,
    paused: false,
    get: (id) => map.get(id),
    all: () => map.values(),
    frameEvents: [],
  };
}

describe('isHostile', () => {
  it('excludes dead, dying, allied and non-monsters', () => {
    expect(isHostile(mon(2, 1, 0))).toBe(true);
    expect(isHostile(mon(2, 1, 0, { life: 0 }))).toBe(false);
    expect(isHostile(mon(2, 1, 0, { mode: 'dying' }))).toBe(false);
    expect(isHostile(mon(2, 1, 0, { team: 'players' }))).toBe(false); // summons
    expect(isHostile(mon(2, 1, 0, { alive: false }))).toBe(false);
  });
});

describe('findAutoTarget', () => {
  it('picks the nearest hostile in range', () => {
    const v = fakeWorld([mon(2, 3, 0), mon(3, 2, 0), mon(4, 20, 0)]);
    expect(findAutoTarget(v, { from: { x: 0, y: 0 }, facing: { x: 0, y: 0 }, range: 5 })).toBe(3);
  });
  it('prefers a monster in front over a slightly closer one behind', () => {
    const v = fakeWorld([mon(2, -2, 0), mon(3, 2.4, 0)]);
    expect(findAutoTarget(v, { from: { x: 0, y: 0 }, facing: { x: 1, y: 0 }, range: 5 })).toBe(3);
    expect(findAutoTarget(v, { from: { x: 0, y: 0 }, facing: { x: 1, y: 0 }, range: 5, frontBias: 0 })).toBe(
      2,
    );
  });
  it('respects the cone and range (including target radius)', () => {
    const v = fakeWorld([mon(2, -2, 0), mon(3, 5.4, 0)]);
    const q = { from: { x: 0, y: 0 }, facing: { x: 1, y: 0 }, range: 5, maxAngle: Math.PI / 2 };
    expect(findAutoTarget(v, q)).toBe(3);
    expect(findAutoTarget(v, { ...q, range: 4 })).toBeNull();
  });
  it('pickBest with no candidates', () => {
    expect(pickBest([], { from: { x: 0, y: 0 }, facing: { x: 1, y: 0 }, range: 5 }, () => true)).toBeNull();
  });
});

describe('findInteractTarget', () => {
  it('finds npcs and items but not monsters', () => {
    const npc = { id: 5, kind: 'npc', pos: { x: 1, y: 0 }, radius: 0.5, alive: true } as unknown as Entity;
    const item = {
      id: 6,
      kind: 'groundItem',
      pos: { x: 0.5, y: 0 },
      radius: 0.3,
      alive: true,
    } as unknown as Entity;
    const v = fakeWorld([mon(2, 0.2, 0), npc, item]);
    expect(findInteractTarget(v, { from: { x: 0, y: 0 }, facing: { x: 0, y: 0 }, range: 2 })).toBe(6);
  });
});

describe('resolveAutoAim', () => {
  it('targets a monster within the soft-aim radius', () => {
    expect(autoAimRadius(1.5)).toBe(4.5);
    expect(autoAimRadius(20)).toBe(24);
    const v = fakeWorld([mon(2, 4, 0)]);
    expect(resolveAutoAim(v, 'x')).toEqual({ targetId: 2 });
  });
  it('falls back to a point ahead of the player', () => {
    const v = fakeWorld([mon(2, 40, 0)], Math.PI / 2);
    const r = resolveAutoAim(v, 'x');
    expect(r.targetId).toBeUndefined();
    expect(r.targetPos!.x).toBeCloseTo(0);
    expect(r.targetPos!.y).toBeGreaterThan(0);
  });
  it('uses a preferred direction and custom finder', () => {
    const v = fakeWorld([]);
    expect(resolveAutoAim(v, 'x', { x: -1, y: 0 }).targetPos!.x).toBeLessThan(0);
    expect(resolveAutoAim(v, 'x', undefined, () => 42)).toEqual({ targetId: 42 });
    expect(resolveAutoAim(null, 'x')).toEqual({});
  });
});
