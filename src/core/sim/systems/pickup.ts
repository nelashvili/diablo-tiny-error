/** Auto-pickup: Creditz piles and stims (to the belt if there is room) within 1.5 tiles. */
import { pickupGroundItem } from '../../player/inventory';
import type { PlayerEntity } from '../entities';
import type { SimSystem } from '../world';
import { isBeltItemBase, isTargetable } from './util';

export const AUTO_PICKUP_RANGE = 1.5;

export function createPickupSystem(): SimSystem {
  return {
    name: 'pickup',
    update(world) {
      const players: PlayerEntity[] = [];
      for (const e of world.entities.values())
        if (e.kind === 'player' && e.alive && isTargetable(e)) players.push(e);
      if (players.length === 0) return;
      for (const g of world.entities.values()) {
        if (g.kind !== 'groundItem' || !g.alive) continue;
        const auto = g.creditz !== undefined || isBeltItemBase(g.item.base);
        if (!auto) continue;
        for (const p of players) {
          if (Math.hypot(g.pos.x - p.pos.x, g.pos.y - p.pos.y) > AUTO_PICKUP_RANGE) continue;
          // stims only auto-pickup when the belt has room (otherwise leave them for manual pickup)
          if (g.creditz === undefined && !p.belt.slots.includes(null)) continue;
          if (pickupGroundItem(world, p, g)) break;
        }
      }
    },
  };
}
