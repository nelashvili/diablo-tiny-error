import { describe, expect, it, vi } from 'vitest';

vi.mock('../../loot', () => ({
  rollDrops: () => ({
    items: [
      {
        uid: 'test.stim-drop',
        base: 'test.stim',
        quality: 'normal',
        ilvl: 1,
        affixes: [],
        mods: [],
        sockets: 0,
        socketed: [],
        identified: true,
      },
    ],
    creditz: 42,
  }),
}));

import { createPlayer } from '../../player/create';
import type { GameEvent } from '../events';
import { makeTestSim, spawnTestMonster } from './testing';

describe('loot & pickup', () => {
  it('kills drop items + creditz; creditz and stims are auto-picked up', () => {
    const sim = makeTestSim(11);
    const events: GameEvent[] = [];
    sim.world.bus.onAny((e) => events.push(e));
    const player = createPlayer(sim.world, 'yediKnight', 'L', {
      startingItems: ['test.saber'],
      pos: { x: 10.5, y: 10.5 },
    });
    const m = spawnTestMonster(sim.world, { pos: { x: 11.2, y: 10.5 }, life: 1 });
    m.lastHitBy = player.id;
    m.life = 0;
    sim.run(2);
    expect(events.filter((e) => e.type === 'itemDropped')).toHaveLength(2);
    sim.run(5);
    expect(player.creditz).toBe(42);
    expect(player.belt.slots.some((s) => s?.uid === 'test.stim-drop')).toBe(true);
    expect(events.some((e) => e.type === 'creditzChanged')).toBe(true);
    expect([...sim.world.all()].filter((e) => e.kind === 'groundItem')).toHaveLength(0);
  });

  it('stims stay on the ground when the belt is full', () => {
    const sim = makeTestSim(12);
    const player = createPlayer(sim.world, 'yediKnight', 'L', {
      startingItems: ['test.saber', 'test.stim', 'test.stim', 'test.stim', 'test.stim'],
      pos: { x: 10.5, y: 10.5 },
    });
    expect(player.belt.slots.every((s) => s !== null)).toBe(true);
    const m = spawnTestMonster(sim.world, { pos: { x: 11.2, y: 10.5 }, life: 1 });
    m.lastHitBy = player.id;
    m.life = 0;
    sim.run(6);
    const ground = [...sim.world.all()].filter((e) => e.kind === 'groundItem');
    expect(ground).toHaveLength(1);
    expect(player.creditz).toBe(42);
  });
});
