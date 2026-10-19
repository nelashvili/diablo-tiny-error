import { describe, expect, it } from 'vitest';
import { DB } from '../../data/db';
import { createItem } from '../items/create';
import { placeItem } from '../items/grid';
import { itemValue } from '../items/helpers';
import { Rng } from '../rng';
import type { NpcEntity } from '../sim/entities';
import { makeTestSim } from '../sim/systems/testing';
import { createPlayer } from './create';
import { buyItem, restockVendor, sellItem, TRADE_RANGE, vendorQlvlCap } from './vendor';

function setup(npcDef = 'gheedo') {
  const sim = makeTestSim(1);
  const p = createPlayer(sim.world, 'yediKnight', 'T', { startingItems: [], local: true });
  p.inventory.items.length = 0;
  const npc = sim.world.add({
    id: sim.world.allocId(),
    kind: 'npc',
    defId: npcDef,
    pos: { x: p.pos.x + 1, y: p.pos.y },
    facing: 0,
    radius: 0.4,
    alive: true,
  } as unknown as NpcEntity);
  restockVendor(npc, 5, new Rng(3));
  return { ...sim, p, npc };
}

describe('vendors', () => {
  it('stock their wares; healers carry every consumable', () => {
    const { npc } = setup('medicAkarra');
    const bases = new Set(npc.stock!.items.map((e) => e.item.base));
    for (const b of DB.items.values())
      if (b.category === 'consumable' && b.use) expect(bases.has(b.id)).toBe(true);
    expect(setup('chiefCharzi').npc.stock!.items.length).toBeGreaterThan(5);
  });

  it("a smith's stock keeps up with the hero and leans toward their class", () => {
    const { npc } = setup('chiefCharzi');
    const recent = (level: number, classId: 'yediKnight' | 'forseAdept') => {
      let near = 0;
      let mine = 0;
      let n = 0;
      for (let seed = 0; seed < 40; seed++) {
        restockVendor(npc, level, new Rng(seed), classId);
        for (const e of npc.stock!.items) {
          const b = DB.items.get(e.item.base)!;
          if (b.category !== 'weapon' && b.category !== 'armor') continue;
          n++;
          if (b.qlvl > vendorQlvlCap(level) - 6) near++;
          if (b.classOnly === classId || b.weaponClass === 'forseStaff' || b.weaponClass === 'kyburFocus')
            mine++;
        }
      }
      return { near: near / n, staves: mine / n };
    };
    expect(recent(10, 'yediKnight').near).toBeGreaterThan(0.6);
    expect(recent(10, 'forseAdept').staves).toBeGreaterThan(recent(10, 'yediKnight').staves * 2);
  });

  it('buy what you can afford, sell for creditz and buy it back', () => {
    const { world, p, npc } = setup();
    const ware = npc.stock!.items[0]!.item;
    p.creditz = 0;
    expect(buyItem(world, p, npc.id, ware.uid, new Rng(1))).toBe(false);
    p.creditz = itemValue(ware, 'buy');
    expect(buyItem(world, p, npc.id, ware.uid, new Rng(1))).toBe(true);
    expect(p.creditz).toBe(0);
    expect(p.inventory.items.some((e) => e.item.uid === ware.uid)).toBe(true);

    expect(sellItem(world, p, npc.id, ware.uid)).toBe(true);
    expect(p.creditz).toBe(itemValue(ware, 'sell'));
    expect(p.inventory.items.length).toBe(0);
    expect(npc.stock!.items.some((e) => e.item.uid === ware.uid)).toBe(true);
  });

  it('healers never run out of stims', () => {
    const { world, p, npc } = setup('medicAkarra');
    const stim = npc.stock!.items.find((e) => e.item.base === 'baktaStim')!.item;
    p.creditz = 10_000;
    const before = npc.stock!.items.filter((e) => e.item.base === 'baktaStim').length;
    expect(buyItem(world, p, npc.id, stim.uid, new Rng(1))).toBe(true);
    expect(npc.stock!.items.filter((e) => e.item.base === 'baktaStim').length).toBe(before);
  });

  it('only trades within reach', () => {
    const { world, p, npc } = setup();
    const it = createItem('flightCap', { ilvl: 3 }, new Rng(2));
    placeItem(p.inventory, it);
    npc.pos.x = p.pos.x + TRADE_RANGE + 2;
    expect(sellItem(world, p, npc.id, it.uid)).toBe(false);
  });
});

describe('stash', () => {
  it('stores items in camp only', () => {
    const { world, p, run, npc } = setup();
    world.entities.delete(npc.id); // a bare stand-in, not a full actor the tick can update
    const it = createItem('flightCap', { ilvl: 3 }, new Rng(2));
    placeItem(p.inventory, it);
    world.levelId = 'a1.mossfields';
    world.commands.push({ type: 'moveItem', uid: it.uid, from: 'inventory', to: 'stash' });
    run(1);
    expect(p.stash?.items.length ?? 0).toBe(0);
    world.levelId = 'a1.town';
    world.commands.push({ type: 'moveItem', uid: it.uid, from: 'inventory', to: 'stash' });
    run(1);
    expect(p.stash!.items.map((e) => e.item.uid)).toEqual([it.uid]);
    expect(p.inventory.items.length).toBe(0);
    world.commands.push({ type: 'moveItem', uid: it.uid, from: 'stash', to: 'inventory' });
    run(1);
    expect(p.inventory.items.length).toBe(1);
  });
});
