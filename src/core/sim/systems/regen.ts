/** Life / mana regeneration and the statsDirty recompute pass. */
import { recomputeStats } from '../../player/stats';
import { isActor, type Actor } from '../entities';
import type { SimSystem } from '../world';
import { isTargetable } from './util';

export function createRegenSystem(): SimSystem {
  return {
    name: 'regen',
    update(world, dt) {
      for (const e of world.entities.values()) {
        if (!isActor(e) || !e.alive) continue;
        const a: Actor = e;
        if (!isTargetable(a)) continue;
        const s = a.stats;
        if (s.lifeRegen > 0 && a.life < s.lifeMax && (s.raw.preventHeal ?? 0) <= 0)
          a.life = Math.min(s.lifeMax, a.life + s.lifeRegen * dt);
        if (a.kind === 'player' || a.kind === 'merc') {
          if (a.mana < s.manaMax) a.mana = Math.min(s.manaMax, a.mana + s.manaRegenPerSec * dt);
        }
      }
    },
  };
}

/** Recomputes stats of every actor flagged `statsDirty` (gear, buffs, level, allocation changes). */
export function createStatsSystem(): SimSystem {
  return {
    name: 'stats',
    update(world) {
      for (const e of world.entities.values()) {
        if (!isActor(e) || !e.alive || !e.statsDirty) continue;
        recomputeStats(e, world.difficulty);
        world.emit({ type: 'statsChanged', id: e.id });
      }
    },
  };
}
