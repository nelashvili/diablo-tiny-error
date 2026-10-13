/** Custom skill behaviors (SkillDef.behavior) registered by content modules. */
import type { SkillDef } from '../../data/schema';
import type { Actor } from '../sim/entities';
import type { SimWorld } from '../sim/world';
import type { Vec2 } from '../types';
import type { SkillTarget } from './runtime';

export interface SkillFireContext {
  world: SimWorld;
  caster: Actor;
  skill: SkillDef;
  /** Effective skill level. */
  level: number;
  target: SkillTarget;
  /** Target actor if the target is an actor. */
  targetActor?: Actor;
  /** Resolved aim point. */
  aim: Vec2;
  /** Aim angle from the caster. */
  angle: number;
  /** Skill range in tiles (see getSkillRange). */
  range: number;
}

export type SkillBehaviorFn = (ctx: SkillFireContext) => void;

export interface SkillBehavior {
  /** Runs at the action frame (replaces the SkillKind handler). */
  fire: SkillBehaviorFn;
  /** Override range (tiles) for the auto-approach logic. */
  range?: (caster: Actor, skill: SkillDef, level: number) => number;
  /** Extra usability check (weapon, resources...). */
  canUse?: (world: SimWorld, caster: Actor, skill: SkillDef) => boolean;
}

const behaviors = new Map<string, SkillBehavior>();

/** Register a custom behavior; returns an unregister function. */
export function registerSkillBehavior(key: string, impl: SkillBehaviorFn | SkillBehavior): () => void {
  behaviors.set(key, typeof impl === 'function' ? { fire: impl } : impl);
  return () => behaviors.delete(key);
}

export const getSkillBehavior = (key: string | undefined): SkillBehavior | undefined =>
  key ? behaviors.get(key) : undefined;
