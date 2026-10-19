/**
 * Damage application: turns an AttackResult into life loss, events, leech, crushing blow,
 * thorns, status effects and hit recovery. Exported for skills, missiles, areas and AI.
 */
import { DB } from '../../../data/db';
import { crushingBlowDamage, leechMultiplier } from '../../combat/damage';
import { resolveAttack } from '../../combat/resolve';
import type { AttackResult, AttackSpec, CombatantView } from '../../combat/types';
import type { DamageType, DefId, EntityId, Vec2 } from '../../types';
import { isActor, type Actor } from '../entities';
import { markCombat } from './regen';
import type { SimWorld } from '../world';
import { applyEffect, cancelAction } from './effects';
import { isTargetable, setMode, toCombatant } from './util';

export interface ApplyOpts {
  /** Melee delivery: enables thorns. */
  melee?: boolean;
  /** Where the hit happened (defaults to defender position). */
  pos?: Vec2;
  skillId?: DefId;
  /** Fallback attacker id when the attacker entity no longer exists (missile owner gone). */
  sourceId?: EntityId;
}

/** Base hit-recovery / block-recovery durations in seconds (divided by the actor's speed mul). */
export const HIT_RECOVERY_SEC = 0.4;
export const BLOCK_RECOVERY_SEC = 0.3;

export function healActor(world: SimWorld, a: Actor, amount: number): number {
  if (amount <= 0 || !isTargetable(a)) return 0;
  if ((a.stats.raw.preventHeal ?? 0) > 0) return 0;
  const before = a.life;
  a.life = Math.min(a.stats.lifeMax, a.life + amount);
  const got = a.life - before;
  if (got > 0) world.emit({ type: 'heal', targetId: a.id, amount: got });
  return got;
}

function enterRecovery(a: Actor, kind: 'hit' | 'block'): void {
  if (a.mode === 'stunned' || a.mode === 'frozen' || a.mode === 'dying' || a.mode === 'dead') return;
  cancelAction(a);
  a.path = [];
  setMode(a, kind);
  a.modeTime = 0;
}

/** Duration of the current 'hit'/'block' mode for an actor. */
export function recoveryDuration(a: Actor): number {
  return a.mode === 'block'
    ? BLOCK_RECOVERY_SEC / Math.max(0.1, a.stats.blockSpeedMul)
    : HIT_RECOVERY_SEC / Math.max(0.1, a.stats.hitRecoveryMul);
}

/** Flat damage (thorns, traps, DoT-like bursts). Ignores resists. Returns damage dealt. */
export function applyDamage(
  world: SimWorld,
  defender: Actor,
  amount: number,
  dtype: DamageType,
  sourceId?: EntityId,
  pos?: Vec2,
): number {
  if (!isTargetable(defender) || amount <= 0) return 0;
  markCombat(world, defender);
  if (sourceId !== undefined) {
    const src = world.get(sourceId);
    if (src && isActor(src)) markCombat(world, src);
  }
  const dealt = Math.min(defender.life, amount);
  defender.life -= dealt;
  if (sourceId !== undefined) defender.lastHitBy = sourceId;
  world.emit({
    type: 'damage',
    targetId: defender.id,
    sourceId,
    amount: dealt,
    dtype,
    crit: false,
    pos: pos ?? { x: defender.pos.x, y: defender.pos.y },
  });
  return dealt;
}

/**
 * Apply a resolved attack. `attacker` may be undefined/dead for missiles whose owner is gone
 * (pass `opts.sourceId`). Returns the total damage dealt.
 */
export function applyAttackResult(
  world: SimWorld,
  attacker: Actor | undefined,
  defender: Actor,
  result: AttackResult,
  opts: ApplyOpts = {},
): number {
  const sourceId = attacker?.id ?? opts.sourceId;
  // Any attack, landed or not, keeps both sides in combat (no out-of-combat regen mid-fight).
  markCombat(world, defender);
  markCombat(world, attacker);
  if (sourceId !== undefined)
    world.emit({
      type: 'attackResult',
      attackerId: sourceId,
      targetId: defender.id,
      outcome: result.outcome,
    });
  if (!isTargetable(defender)) return 0;
  const pos = opts.pos ?? { x: defender.pos.x, y: defender.pos.y };

  if (result.outcome === 'blocked') {
    if (defender.mode === 'idle' || defender.mode === 'walk' || defender.mode === 'run')
      enterRecovery(defender, 'block');
    return 0;
  }
  if (result.outcome !== 'hit') return 0;

  let dealt = 0;
  const lifeBefore = defender.life;
  let first = true;
  for (const [k, v] of Object.entries(result.damage)) {
    if (!v || v <= 0) continue;
    const amt = Math.min(defender.life, v);
    defender.life -= amt;
    dealt += amt;
    world.emit({
      type: 'damage',
      targetId: defender.id,
      sourceId,
      amount: amt,
      dtype: k as DamageType,
      crit: first && result.crit,
      pos,
    });
    first = false;
  }

  if (result.crushed && defender.life > 0) {
    const boss = monsterIsBoss(defender);
    const extra = crushingBlowDamage(
      defender.life,
      defender.kind === 'player' ? 'player' : boss ? 'boss' : 'normal',
    );
    if (extra > 0) {
      defender.life = Math.max(0, defender.life - extra);
      dealt += extra;
      world.emit({
        type: 'damage',
        targetId: defender.id,
        sourceId,
        amount: extra,
        dtype: 'physical',
        crit: false,
        pos,
      });
    }
  }

  if (sourceId !== undefined) defender.lastHitBy = sourceId;

  // Leech.
  if (attacker && attacker.alive && attacker.life > 0) {
    const mul = leechMultiplier(world.difficulty);
    if (result.lifeStolen > 0) healActor(world, attacker, result.lifeStolen * mul);
    if (result.manaStolen > 0)
      attacker.mana = Math.min(attacker.stats.manaMax, attacker.mana + result.manaStolen * mul);
  }

  // Status effects.
  for (const fx of result.effects) applyEffect(world, defender, fx, sourceId, attacker?.pos);

  // Thorns.
  const thorns = defender.stats.raw.thorns ?? 0;
  if (opts.melee && thorns > 0 && attacker && attacker !== defender) {
    applyDamage(world, attacker, thorns, 'magic', defender.id);
  }

  // Hit recovery: D2 triggers when a hit takes >= 1/12 of max life; bosses never flinch.
  if (defender.life > 0 && !monsterIsBoss(defender)) {
    const threshold = defender.stats.lifeMax / 12;
    if (dealt >= threshold && lifeBefore > 0) enterRecovery(defender, 'hit');
  }
  return dealt;
}

function monsterIsBoss(a: Actor): boolean {
  return a.kind === 'monster' && (DB.monsters.get(a.defId)?.flags.boss === true || a.rank === 'boss');
}

/** Resolve (to-hit, block, damage...) and apply in one go. `attackerView` overrides a live snapshot. */
export function dealAttack(
  world: SimWorld,
  attacker: Actor | undefined,
  defender: Actor,
  spec: AttackSpec,
  opts: ApplyOpts & { attackerView?: CombatantView } = {},
): AttackResult {
  const view = opts.attackerView ?? (attacker ? toCombatant(attacker) : undefined);
  if (!view) throw new Error('dealAttack: no attacker');
  const result = resolveAttack(view, toCombatant(defender), spec, world.combatRng);
  applyAttackResult(world, attacker, defender, result, { melee: spec.delivery === 'melee', ...opts });
  return result;
}
