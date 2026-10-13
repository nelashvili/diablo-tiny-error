/**
 * Boss behavior scripts. A script runs every AI tick for a boss (monster whose def.behavior names a
 * registered key). It may cast specials and change phases; returning 'handled' skips the default
 * chase/attack logic for this tick.
 */
import type { Rng } from '../rng';
import type { Actor, MonsterEntity } from '../sim/entities';
import type { SimWorld } from '../sim/world';
import type { MonsterDef } from '../../data/schema';

export interface BossContext {
  world: SimWorld;
  boss: MonsterEntity;
  def: MonsterDef;
  target: Actor | null;
  rng: Rng;
  time: number;
  dt: number;
  /** Life fraction 0..1. */
  hpFrac: number;
  /** Distance to target (Infinity without a target). */
  distToTarget: number;
  /** Current phase (0 at spawn). */
  phase: number;
  setPhase(phase: number): void;
  /** Use a skill on the target now; stops movement and faces the target on success. */
  cast(skillId: string): boolean;
  /** Script-local cooldowns (seconds), stored in the boss blackboard. */
  ready(key: string): boolean;
  startCooldown(key: string, sec: number): void;
}

export type BossScriptResult = 'handled' | void;
export type BossScript = (ctx: BossContext) => BossScriptResult;

const scripts = new Map<string, BossScript>();

export function registerBossScript(key: string, fn: BossScript): void {
  scripts.set(key, fn);
}

export function getBossScript(key: string | undefined): BossScript | undefined {
  return key ? scripts.get(key) : undefined;
}

// ---------------------------------------------------------------- Count Dooky (Andariel analog)

/**
 * Phase 0: melee (venom claw) + dark-lightning nova when the hero is close + toxin spit at range.
 * Phase 1 (below 50% life): enrage - faster, harder hitting, shorter special cooldowns.
 */
registerBossScript('countDooky', (c) => {
  if (c.phase === 0 && c.hpFrac < 0.5) {
    c.setPhase(1);
    const s = c.boss.stats;
    s.attackSpeedMul *= 1.4;
    s.castSpeedMul *= 1.4;
    s.moveSpeedMul *= 1.25;
    s.physMin *= 1.25;
    s.physMax *= 1.25;
    c.world.emit({ type: 'toast', textKey: 'boss.countDooky.enrage' });
  }
  if (!c.target) return;
  const enraged = c.phase >= 1;
  if (c.distToTarget <= 8 && c.ready('nova') && c.cast('m_dookyNova')) {
    c.startCooldown('nova', enraged ? 4 : 6);
    return 'handled';
  }
  if (c.distToTarget > 3 && c.distToTarget <= 12 && c.ready('spit') && c.cast('m_dookyToxin')) {
    c.startCooldown('spit', enraged ? 5 : 8);
    return 'handled';
  }
});
