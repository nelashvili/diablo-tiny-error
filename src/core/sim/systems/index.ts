/**
 * Core gameplay systems in tick order:
 * commands -> movement -> targeting -> actions -> missiles -> areas -> effects -> regen -> death
 * -> pickup -> stats(recompute dirty).
 */
import type { SimSystem } from '../world';
import { createActionsSystem } from './actions';
import { createCommandSystem } from './commands';
import { createDeathSystem } from './death';
import { createEffectsSystem } from './effects';
import { createAreaSystem, createMissileSystem } from './missiles';
import { createMovementSystem } from './movement';
import { createPickupSystem } from './pickup';
import { createRegenSystem, createStatsSystem } from './regen';
import { createTargetingSystem } from './targeting';

export function createCoreSystems(): SimSystem[] {
  return [
    createCommandSystem(),
    createMovementSystem(),
    createTargetingSystem(),
    createActionsSystem(),
    createMissileSystem(),
    createAreaSystem(),
    createEffectsSystem(),
    createRegenSystem(),
    createDeathSystem(),
    createPickupSystem(),
    createStatsSystem(),
  ];
}

export { CommandHandlers } from './commandHandlers';
export type { CommandHandlerFn, CommandOf } from './commandHandlers';
export { applyAttackResult, applyDamage, dealAttack, healActor, HIT_RECOVERY_SEC } from './damage';
export type { ApplyOpts } from './damage';
export {
  applyEffect,
  addBuff,
  removeBuff,
  addHealOverTime,
  removeEffects,
  hasEffect,
  getSlowFactor,
} from './effects';
export { deathHooks, revivePlayer } from './death';
export { setIntent, getIntent, setMoveDir, clearMovement } from './intent';
export type { Intent } from './intent';
export { queryActors, hostilesNear, invalidateActorGrid } from './spatial';
export { toCombatant, isHostile, isTargetable, getLocalPlayer } from './util';
export { moveWithCollision, canStand } from './collision';
