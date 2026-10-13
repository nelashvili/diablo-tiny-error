// STUB (Wave 0) — replaced by agent "sim-systems". Keep the exported signatures.
import type { DefId, EntityId, Vec2 } from '../types';
import type { Actor } from '../sim/entities';
import type { SimWorld } from '../sim/world';

export interface SkillTarget {
  id?: EntityId;
  pos?: Vec2;
}

/** Effective skill level (hard points + item/buff bonuses; monsters use their def level). */
export function getSkillLevel(_actor: Actor, _skillId: DefId): number {
  return 1;
}

/** Max distance (tiles) at which the actor can use the skill on a target without moving. */
export function getSkillRange(_actor: Actor, _skillId: DefId): number {
  return 1.5;
}

/** Can the actor use this skill right now (mana, cooldown, weapon, not mid-action)? */
export function canUseSkill(_world: SimWorld, _actor: Actor, _skillId: DefId): boolean {
  return true;
}

/**
 * Begin using a skill (starts ActionState; effect fires on the action frame). Returns false if
 * it can't be used. Used by player commands AND monster AI.
 */
export function startSkill(_world: SimWorld, _actor: Actor, _skillId: DefId, _target: SkillTarget): boolean {
  return false;
}
