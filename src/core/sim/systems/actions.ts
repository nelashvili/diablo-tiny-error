/** Actions: mode timers, cooldowns, hit/block recovery and advancing skill ActionStates. */
import { advanceAction } from '../../skills/runtime';
import { isActor, type Actor } from '../entities';
import type { SimSystem } from '../world';
import { recoveryDuration } from './damage';
import { setMode } from './util';

export function createActionsSystem(): SimSystem {
  return {
    name: 'actions',
    update(world, dt) {
      for (const e of world.entities.values()) {
        if (!isActor(e) || !e.alive) continue;
        const a: Actor = e;
        a.modeTime += dt;
        for (const k in a.cooldowns) {
          const v = (a.cooldowns[k] as number) - dt;
          if (v <= 0) delete a.cooldowns[k];
          else a.cooldowns[k] = v;
        }
        if ((a.mode === 'hit' || a.mode === 'block') && a.modeTime >= recoveryDuration(a)) setMode(a, 'idle');
        if (a.action) advanceAction(world, a, dt);
      }
    },
  };
}
