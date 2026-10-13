/**
 * Transient per-actor control state that is not part of the entity contract: joystick direction,
 * the player's pending intent (attack/pickup/talk/use object) and navigation bookkeeping.
 * Kept in WeakMaps so it never leaks into saves or the renderer.
 */
import type { DefId, EntityId, Vec2 } from '../../types';
import type { Actor } from '../entities';

export type Intent =
  | { kind: 'skill'; skillId: DefId; targetId?: EntityId; targetPos?: Vec2; standStill?: boolean }
  | { kind: 'pickup'; targetId: EntityId }
  | { kind: 'talk'; npcId: EntityId; option?: string }
  | { kind: 'object'; targetId: EntityId };

const intents = new WeakMap<Actor, Intent>();
const moveDirs = new WeakMap<Actor, Vec2>();

export function getIntent(a: Actor): Intent | undefined {
  return intents.get(a);
}
export function setIntent(a: Actor, i: Intent | undefined): void {
  if (i) intents.set(a, i);
  else intents.delete(a);
}

export function getMoveDir(a: Actor): Vec2 | undefined {
  return moveDirs.get(a);
}
/** Joystick steering. A zero vector clears it. */
export function setMoveDir(a: Actor, dir: Vec2 | undefined): void {
  if (!dir || (Math.abs(dir.x) < 1e-3 && Math.abs(dir.y) < 1e-3)) moveDirs.delete(a);
  else moveDirs.set(a, { x: dir.x, y: dir.y });
}

export interface NavState {
  /** Seconds the actor has been blocked while trying to move. */
  stuck: number;
  /** Seconds until a chase target is re-pathed. */
  repath: number;
  /** Player ran out of stamina and must recover before running again. */
  exhausted: boolean;
}
const navs = new WeakMap<Actor, NavState>();
export function navOf(a: Actor): NavState {
  let n = navs.get(a);
  if (!n) navs.set(a, (n = { stuck: 0, repath: 0, exhausted: false }));
  return n;
}

/** Cancel everything that makes the actor walk or chase. */
export function clearMovement(a: Actor): void {
  a.path = [];
  a.moveTarget = undefined;
  moveDirs.delete(a);
}
