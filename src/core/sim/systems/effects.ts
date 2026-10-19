/**
 * Status effects (chill, freeze, stun, toxin/burn DoT, knockback slides, Forse lift), buffs,
 * heal-over-time and timed summons. `createEffectsSystem()` ticks them; `applyEffect`/`addBuff`
 * are the entry points.
 */
import type { StatusEffectSpec } from '../../combat/types';
import type { EntityId, Vec2 } from '../../types';
import type { Actor, ActiveEffect, Buff } from '../entities';
import { isActor } from '../entities';
import type { SimSystem, SimWorld } from '../world';
import { moveWithCollision } from './collision';
import { invalidateActorGrid, queryActors } from './spatial';
import { isTargetable, monsterDefOf, setMode } from './util';
import { tickTrails } from '../../skills/trail';

/** Knockback slide speed (tiles/second). */
export const KNOCKBACK_SPEED = 14;
/** Push / lift scaling by body weight (MonsterDef.weight; bosses always 'boss'). */
export const WEIGHT_MUL = { light: 1.5, medium: 1, heavy: 0.5, boss: 0.25 } as const;
export type Weight = keyof typeof WEIGHT_MUL;
/** Fairness caps for enemy Forse powers used on heroes. */
export const PLAYER_MAX_KNOCKBACK = 3;
export const PLAYER_MAX_LIFT_SEC = 1.2;
/** Bosses can't be lifted: Grip only staggers them. */
export const BOSS_GRIP_STUN_SEC = 0.4;
/** Stun when a knockback slams the target into a wall, and the daze after being dropped. */
export const WALL_SLAM_STUN_SEC = 0.8;
export const DROP_STUN_SEC = 0.35;
/** Lift damage lands in pulses this far apart. */
export const LIFT_PULSE_SEC = 0.3;
/** Knockbacks at least this strong bowl over others in the path (at BOWL_PCT of the strength). */
const BOWL_MIN = 2;
const BOWL_PCT = 0.4;

export function weightOf(a: Actor): Weight {
  const md = monsterDefOf(a);
  if (!md) return 'medium';
  if (md.flags.boss || (a.kind === 'monster' && a.rank === 'boss')) return 'boss';
  return md.weight ?? 'medium';
}

/** Actors already bowled over by a slide (so one push doesn't hit the same body twice). */
const bowled = new WeakMap<ActiveEffect, Set<EntityId>>();

/** Fractional DoT damage not yet applied, per effect object. */
const dotAcc = new WeakMap<ActiveEffect, number>();

const SLOW_KINDS = new Set(['chill', 'slow']);

export function hasEffect(actor: Actor, kind: StatusEffectSpec['kind']): boolean {
  for (const e of actor.effects) if (e.spec.kind === kind && e.remainingSec > 0) return true;
  return false;
}

/** Movement/attack speed factor from chill/slow (1 = unaffected). */
export function getSlowFactor(actor: Actor): number {
  let slow = 0;
  for (const e of actor.effects) {
    if (SLOW_KINDS.has(e.spec.kind) && e.remainingSec > 0) slow = Math.max(slow, e.spec.magnitude ?? 50);
  }
  return slow > 0 ? Math.max(0.15, 1 - slow / 100) : 1;
}

export function cancelAction(actor: Actor): void {
  actor.action = undefined;
}

/**
 * Apply a status effect. Returns true if it took hold. `sourcePos` is used for knockback.
 */
export function applyEffect(
  world: SimWorld,
  target: Actor,
  spec: StatusEffectSpec,
  sourceId?: EntityId,
  sourcePos?: Vec2,
): boolean {
  if (!isTargetable(target)) return false;
  const raw = target.stats.raw;
  let dur = spec.durationSec;
  switch (spec.kind) {
    case 'knockback': {
      let dist = (spec.magnitude ?? 1.5) * WEIGHT_MUL[weightOf(target)];
      if (target.kind === 'player') dist = Math.min(dist, PLAYER_MAX_KNOCKBACK);
      const from = sourcePos ?? (sourceId !== undefined ? world.get(sourceId)?.pos : undefined);
      if (!from || dist < 0.05) return false;
      const dx = target.pos.x - from.x;
      const dy = target.pos.y - from.y;
      const dir = Math.hypot(dx, dy) > 1e-6 ? Math.atan2(dy, dx) : target.facing + Math.PI;
      const slide = Math.max(0.1, dist / KNOCKBACK_SPEED);
      target.effects = target.effects.filter((e) => e.spec.kind !== 'knockback');
      target.effects.push({
        spec: { ...spec, durationSec: slide, magnitude: dist },
        remainingSec: slide,
        sourceId,
        dir,
        distLeft: dist,
      });
      target.path = [];
      if (target.mode !== 'stunned' && target.mode !== 'frozen') {
        cancelAction(target);
        setMode(target, 'hit');
        target.modeTime = 0;
      }
      return true;
    }
    case 'lifted': {
      const w = weightOf(target);
      if (w === 'boss')
        return applyEffect(world, target, { kind: 'stun', durationSec: BOSS_GRIP_STUN_SEC }, sourceId);
      if (w === 'heavy') dur *= 0.5;
      if (target.kind === 'player')
        dur = Math.min(PLAYER_MAX_LIFT_SEC, dur) / Math.max(1, target.stats.hitRecoveryMul);
      if (dur > 0 && dur !== spec.durationSec)
        spec = { ...spec, magnitude: ((spec.magnitude ?? 0) * dur) / spec.durationSec };
      break;
    }
    case 'freeze':
      if ((raw.cannotBeFrozen ?? 0) > 0) return false;
      if ((raw.halfFreezeDuration ?? 0) > 0) dur *= 0.5;
      break;
    case 'chill':
      if ((raw.cannotBeFrozen ?? 0) > 0) return false;
      break;
    case 'toxin':
      dur *= 1 - Math.min(90, raw.poisonLengthReduced ?? 0) / 100;
      break;
    default:
      break;
  }
  if (dur <= 0) return false;

  // Same kind from the same source refreshes instead of stacking (area ticks must not pile up).
  const existing = target.effects.find((e) => e.spec.kind === spec.kind && e.sourceId === sourceId);
  const next: ActiveEffect = { spec: { ...spec, durationSec: dur }, remainingSec: dur, sourceId };
  if (existing) {
    const isDot = spec.kind === 'toxin' || spec.kind === 'burn';
    const oldRate = (existing.spec.magnitude ?? 0) / Math.max(0.01, existing.spec.durationSec);
    const newRate = (spec.magnitude ?? 0) / Math.max(0.01, dur);
    const oldLeft = oldRate * existing.remainingSec;
    const newLeft = newRate * dur;
    if (isDot && oldLeft > newLeft) return false;
    if (!isDot && existing.remainingSec >= dur && (existing.spec.magnitude ?? 0) >= (spec.magnitude ?? 0))
      return false;
    target.effects[target.effects.indexOf(existing)] = next;
  } else {
    target.effects.push(next);
  }
  if (spec.kind === 'freeze' || spec.kind === 'stun' || spec.kind === 'lifted') {
    cancelAction(target);
    target.path = [];
    setMode(target, spec.kind === 'freeze' ? 'frozen' : 'stunned');
  }
  return true;
}

export function removeEffects(actor: Actor, kinds: StatusEffectSpec['kind'][]): void {
  actor.effects = actor.effects.filter((e) => !kinds.includes(e.spec.kind));
}

export function addBuff(actor: Actor, buff: Buff): void {
  const i = actor.buffs.findIndex((b) => b.id === buff.id);
  if (i >= 0) actor.buffs[i] = buff;
  else actor.buffs.push(buff);
  actor.statsDirty = true;
}

export function removeBuff(actor: Actor, id: string): boolean {
  const i = actor.buffs.findIndex((b) => b.id === id);
  if (i < 0) return false;
  actor.buffs.splice(i, 1);
  actor.statsDirty = true;
  return true;
}

// ------------------------------------------------------------------ heal over time

interface Hot {
  pool: 'life' | 'mana' | 'stamina';
  left: number;
  rate: number;
}
const hots = new WeakMap<Actor, Hot[]>();

export function addHealOverTime(actor: Actor, pool: Hot['pool'], total: number, durationSec: number): void {
  if (total <= 0 || durationSec <= 0) return;
  let list = hots.get(actor);
  if (!list) hots.set(actor, (list = []));
  list.push({ pool, left: total, rate: total / durationSec });
}

function tickHots(world: SimWorld, a: Actor, dt: number): void {
  const list = hots.get(a);
  if (!list || list.length === 0) return;
  for (const h of list) {
    const amt = Math.min(h.left, h.rate * dt);
    h.left -= amt;
    if (h.pool === 'life') a.life = Math.min(a.stats.lifeMax, a.life + amt);
    else if (h.pool === 'mana') a.mana = Math.min(a.stats.manaMax, a.mana + amt);
    else a.stamina = Math.min(a.stats.staminaMax, a.stamina + amt);
  }
  for (let i = list.length - 1; i >= 0; i--) if ((list[i] as Hot).left <= 1e-6) list.splice(i, 1);
  void world;
}

// ------------------------------------------------------------------ system

function tickDot(world: SimWorld, a: Actor, e: ActiveEffect, dt: number): void {
  const kind = e.spec.kind;
  if (kind !== 'toxin' && kind !== 'burn' && kind !== 'lifted') return;
  const dps = (e.spec.magnitude ?? 0) / Math.max(0.01, e.spec.durationSec);
  const step = Math.min(dt, Math.max(0, e.remainingSec));
  const acc = (dotAcc.get(e) ?? 0) + dps * step;
  // On the last tick flush the fractional remainder so the full pool is always dealt.
  const last = e.remainingSec - dt <= 1e-9;
  // A lift squeezes in a few readable pulses instead of a stream of 1s and 2s.
  if (kind === 'lifted' && !last && acc < Math.max(1, dps * LIFT_PULSE_SEC)) {
    dotAcc.set(e, acc);
    return;
  }
  const whole = last ? Math.round(acc) : Math.floor(acc);
  dotAcc.set(e, acc - whole);
  if (whole <= 0 || !isTargetable(a)) return;
  a.life = Math.max(0, a.life - whole);
  if (e.sourceId !== undefined) a.lastHitBy = e.sourceId;
  world.emit({
    type: 'damage',
    targetId: a.id,
    sourceId: e.sourceId,
    amount: whole,
    dtype: kind === 'toxin' ? 'toxin' : kind === 'lifted' ? 'magic' : 'plasma',
    crit: false,
    pos: { x: a.pos.x, y: a.pos.y },
  });
}

/**
 * Move a knocked-back actor along its slide. Hitting a wall head-on ends the slide with a slam
 * (damage + stun); strong pushes bowl over others in the path.
 */
function slideStep(world: SimWorld, a: Actor, fx: ActiveEffect, dt: number): void {
  const left = fx.distLeft ?? 0;
  if (left <= 1e-6 || fx.dir === undefined || !isTargetable(a)) return;
  const step = Math.min(left, KNOCKBACK_SPEED * dt);
  const moved = moveWithCollision(
    world.level?.map,
    a.pos,
    Math.cos(fx.dir) * step,
    Math.sin(fx.dir) * step,
    a.radius,
  );
  fx.distLeft = left - step;
  invalidateActorGrid(world);
  if (moved < step * 0.5) {
    fx.distLeft = 0;
    fx.remainingSec = Math.min(fx.remainingSec, dt);
    const slam = fx.spec.slam ?? 0;
    if (slam > 0) {
      const dealt = Math.min(a.life, Math.round(slam));
      if (dealt > 0) {
        a.life -= dealt;
        if (fx.sourceId !== undefined) a.lastHitBy = fx.sourceId;
        world.emit({
          type: 'damage',
          targetId: a.id,
          sourceId: fx.sourceId,
          amount: dealt,
          dtype: 'physical',
          crit: false,
          pos: { x: a.pos.x, y: a.pos.y },
        });
      }
      world.emit({
        type: 'skillImpact',
        skillId: 'wallSlam',
        pos: { x: a.pos.x, y: a.pos.y },
        radius: 1,
        vfx: 'vfx.wallSlam',
      });
      applyEffect(world, a, { kind: 'stun', durationSec: WALL_SLAM_STUN_SEC }, fx.sourceId);
    }
    return;
  }
  const strength = fx.spec.magnitude ?? 0;
  if (strength < BOWL_MIN) return;
  let hit = bowled.get(fx);
  for (const o of queryActors(world, a.pos, a.radius + 0.35)) {
    if (o === a || o.team !== a.team || o.kind === 'npc' || !isTargetable(o)) continue;
    if (!hit) bowled.set(fx, (hit = new Set()));
    if (hit.has(o.id)) continue;
    hit.add(o.id);
    applyEffect(
      world,
      o,
      { kind: 'knockback', durationSec: 0.2, magnitude: strength * BOWL_PCT },
      fx.sourceId,
      a.pos,
    );
  }
}

export function createEffectsSystem(): SimSystem {
  return {
    name: 'effects',
    update(world, dt) {
      for (const e of world.entities.values()) {
        if (!isActor(e) || !e.alive) continue;
        const a: Actor = e;

        if (a.effects.length > 0) {
          let dropped = false;
          for (const fx of a.effects) {
            tickDot(world, a, fx, dt);
            if (fx.spec.kind === 'knockback') slideStep(world, a, fx, dt);
            fx.remainingSec -= dt;
            if (fx.spec.kind === 'lifted' && fx.remainingSec <= 0) dropped = true;
          }
          a.effects = a.effects.filter((f) => f.remainingSec > 0);
          if (dropped && isTargetable(a)) {
            world.emit({
              type: 'skillImpact',
              skillId: 'forseGrip',
              pos: { x: a.pos.x, y: a.pos.y },
              radius: 0.8,
              vfx: 'vfx.grip.drop',
            });
            applyEffect(world, a, { kind: 'stun', durationSec: DROP_STUN_SEC });
          }
          if (isTargetable(a)) {
            const frozen = hasEffect(a, 'freeze');
            const stunned = hasEffect(a, 'stun') || hasEffect(a, 'lifted');
            if (frozen) setMode(a, 'frozen');
            else if (stunned) setMode(a, 'stunned');
            else if (a.mode === 'frozen' || a.mode === 'stunned') setMode(a, 'idle');
          }
        } else if (a.mode === 'frozen' || a.mode === 'stunned') {
          setMode(a, 'idle');
        }

        if (a.buffs.length > 0) {
          let expired = false;
          for (let i = a.buffs.length - 1; i >= 0; i--) {
            const b = a.buffs[i] as Buff;
            if (b.remainingSec === Infinity) continue;
            b.remainingSec -= dt;
            if (b.remainingSec <= 0) {
              a.buffs.splice(i, 1);
              expired = true;
            }
          }
          if (expired) a.statsDirty = true;
          tickTrails(world, a, dt);
        }

        tickHots(world, a, dt);

        // Timed summons (turrets, decoys).
        if (a.kind === 'monster') {
          const exp = a.ai.expireAt;
          if (typeof exp === 'number' && world.time >= exp && a.life > 0) {
            a.life = 0;
            a.lastHitBy = undefined;
          }
        }
      }
    },
  };
}
