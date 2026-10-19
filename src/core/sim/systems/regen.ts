/** Life / mana regeneration and the statsDirty recompute pass. */
import { recomputeStats } from '../../player/stats';
import { isActor, type Actor } from '../entities';
import type { SimSystem } from '../world';
import { isTargetable } from './util';
import type { SimWorld } from '../world';
import { TICK_SECONDS } from '../../types';

/** Out of combat this long (no hits dealt or taken), heroes and mercs heal on their own. */
export const OUT_OF_COMBAT_SEC = 4;
/** Share of max life restored per second while out of combat. */
export const OUT_OF_COMBAT_REGEN_PCT = 4;

const lastCombat = new WeakMap<Actor, number>();

/** Note that `a` just dealt or took damage (resets its out-of-combat timer). */
export function markCombat(world: SimWorld, a: Actor | undefined): void {
  if (a && (a.kind === 'player' || a.kind === 'merc')) lastCombat.set(a, world.tick);
}

export function outOfCombat(world: SimWorld, a: Actor): boolean {
  const t = lastCombat.get(a);
  return t === undefined || (world.tick - t) * TICK_SECONDS >= OUT_OF_COMBAT_SEC;
}

export function createRegenSystem(): SimSystem {
  return {
    name: 'regen',
    update(world, dt) {
      for (const e of world.entities.values()) {
        if (!isActor(e) || !e.alive) continue;
        const a: Actor = e;
        if (!isTargetable(a)) continue;
        const s = a.stats;
        const heal = (s.raw.preventHeal ?? 0) <= 0;
        if (s.lifeRegen > 0 && a.life < s.lifeMax && heal)
          a.life = Math.min(s.lifeMax, a.life + s.lifeRegen * dt);
        if (a.kind === 'player' || a.kind === 'merc') {
          if (heal && a.life < s.lifeMax && outOfCombat(world, a))
            a.life = Math.min(s.lifeMax, a.life + ((s.lifeMax * OUT_OF_COMBAT_REGEN_PCT) / 100) * dt);
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
