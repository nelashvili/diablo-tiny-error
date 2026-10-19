/**
 * Skill runtime: levels, range, cost/cooldown/weapon checks, starting a skill (ActionState) and
 * advancing it to the action frame where the SkillKind handler (or a registered behavior) fires.
 * Used by player commands AND monster AI (`startSkill`).
 */
import { DB } from '../../data/db';
import { evalLevel } from '../../data/levelScaled';
import type { SkillDef } from '../../data/schema';
import { angleTo } from '../math';
import { getEquippedWeapon, UNARMED_SPEED } from '../player/weapon';
import { isActor, type ActionState, type Actor } from '../sim/entities';
import { dealAttack } from '../sim/systems/damage';
import { getSlowFactor } from '../sim/systems/effects';
import { furthestWalkable, moveWithCollision } from '../sim/systems/collision';
import { hostilesNear } from '../sim/systems/spatial';
import { isTargetable, monsterDefOf, setMode } from '../sim/systems/util';
import type { SimWorld } from '../sim/world';
import type { DefId, EntityId, Vec2 } from '../types';
import './behaviors';
import './forse';
import { KIND_HANDLERS, emitCast } from './handlers';
import { getSkillLevel, skillParam } from './level';
import { getSkillBehavior, type SkillFireContext } from './registry';
import { buildAttackSpec } from './spec';

export { getSkillLevel } from './level';
export { registerSkillBehavior } from './registry';

export interface SkillTarget {
  id?: EntityId;
  pos?: Vec2;
}

export type SkillBlockReason =
  'unknown' | 'passive' | 'locked' | 'weapon' | 'mana' | 'cooldown' | 'busy' | 'incapacitated';

const INF = Number.POSITIVE_INFINITY;
export const DEFAULT_CAST_SEC = 0.6;
/** D2 melee monsters swing roughly every 1.3-1.6s; faster felt relentless at low level. */
export const DEFAULT_MONSTER_ATTACK_SEC = 1.4;
export const MIN_ACTION_SEC = 0.15;

interface ActionExtra {
  hits: number;
  leap?: { from: Vec2; to: Vec2 };
  whirlTimer?: number;
}
const extras = new WeakMap<ActionState, ActionExtra>();

/** Max distance (tiles) at which the actor can use the skill on a target without moving. */
export function getSkillRange(actor: Actor, skillId: DefId): number {
  const def = DB.skills.get(skillId);
  if (!def) return 1.5;
  const level = Math.max(1, getSkillLevel(actor, skillId));
  const beh = getSkillBehavior(def.behavior);
  if (beh?.range) return beh.range(actor, def, level);
  const explicit = skillParam(actor, def, 'range', level, -1);
  switch (def.kind) {
    case 'meleeAttack': {
      if (explicit >= 0) return explicit;
      const md = monsterDefOf(actor);
      if (md) return md.attackRange;
      return getEquippedWeapon(actor)?.range ?? 1.2;
    }
    case 'missile':
    case 'multiMissile':
    case 'beam':
    case 'chain': {
      if (explicit >= 0) return explicit;
      const m = def.missile ? DB.missiles.get(def.missile) : undefined;
      return Math.min(m?.range ?? 14, 14);
    }
    case 'area':
    case 'wall':
      return explicit >= 0 ? explicit : 12;
    case 'whirl':
      return explicit >= 0 ? explicit : 10;
    case 'movement':
      return skillParam(actor, def, 'distance', level, explicit >= 0 ? explicit : 8);
    default:
      return explicit >= 0 ? explicit : INF;
  }
}

export function getManaCost(actor: Actor, skillId: DefId): number {
  const def = DB.skills.get(skillId);
  if (!def) return 0;
  return Math.max(0, evalLevel(def.manaCost, Math.max(1, getSkillLevel(actor, skillId))));
}

/** Why the skill can't be started right now, or null if it can. */
export function getSkillBlockReason(world: SimWorld, actor: Actor, skillId: DefId): SkillBlockReason | null {
  const def = DB.skills.get(skillId);
  if (!def) return 'unknown';
  if (def.kind === 'passive') return 'passive';
  const level = getSkillLevel(actor, skillId);
  if (level < 1) return 'locked';
  if (!isTargetable(actor) || actor.mode === 'stunned' || actor.mode === 'frozen') return 'incapacitated';
  if (actor.mode === 'hit' || actor.mode === 'block' || actor.action) return 'busy';
  if (def.weaponReq && def.weaponReq.length > 0 && (actor.kind === 'player' || actor.kind === 'merc')) {
    const wc = getEquippedWeapon(actor)?.weaponClass;
    if (!wc || !def.weaponReq.includes(wc)) return 'weapon';
  }
  const beh = getSkillBehavior(def.behavior);
  if (beh?.canUse && !beh.canUse(world, actor, def)) return 'weapon';
  if ((actor.cooldowns[skillId] ?? 0) > 0) return 'cooldown';
  if (actor.kind === 'player' && actor.mana + 1e-6 < getManaCost(actor, skillId)) return 'mana';
  return null;
}

/** Can the actor use this skill right now (mana, cooldown, weapon, not mid-action)? */
export function canUseSkill(world: SimWorld, actor: Actor, skillId: DefId): boolean {
  return getSkillBlockReason(world, actor, skillId) === null;
}

interface Timing {
  duration: number;
  fireAt: number;
  hits: number;
}

function timingFor(actor: Actor, def: SkillDef, level: number): Timing {
  const hits = Math.max(1, Math.round(skillParam(actor, def, 'hits', level, 1)));
  const explicitFire = skillParam(actor, def, 'fireAt', level, -1);
  if (def.kind === 'whirl')
    return { duration: skillParam(actor, def, 'duration', level, 2), fireAt: 1, hits: 1 };
  if (def.kind === 'movement' && skillParam(actor, def, 'teleport', level) <= 0)
    return { duration: skillParam(actor, def, 'leapSec', level, 0.5), fireAt: 1, hits: 1 };
  let base: number;
  const explicit = skillParam(actor, def, 'baseSec', level, -1);
  if (explicit > 0)
    base = explicit / (def.anim === 'cast' ? actor.stats.castSpeedMul : actor.stats.attackSpeedMul);
  else if (def.anim === 'cast') base = DEFAULT_CAST_SEC / Math.max(0.1, actor.stats.castSpeedMul);
  else {
    const w = getEquippedWeapon(actor);
    const perSec = w ? w.speed : actor.kind === 'player' ? UNARMED_SPEED : 1 / DEFAULT_MONSTER_ATTACK_SEC;
    base = 1 / (perSec * Math.max(0.1, actor.stats.attackSpeedMul));
  }
  const duration = Math.max(MIN_ACTION_SEC, base * (hits > 1 ? hits * 0.8 : 1));
  return { duration, fireAt: explicitFire >= 0 ? explicitFire : 0.5, hits };
}

/**
 * Begin using a skill (starts ActionState; effect fires on the action frame). Returns false if
 * it can't be used. Used by player commands AND monster AI.
 */
export function startSkill(world: SimWorld, actor: Actor, skillId: DefId, target: SkillTarget): boolean {
  if (getSkillBlockReason(world, actor, skillId) !== null) return false;
  const def = DB.skills.get(skillId) as SkillDef;
  const level = getSkillLevel(actor, skillId);

  const te = target.id !== undefined ? world.get(target.id) : undefined;
  const aim: Vec2 | undefined = te && isActor(te) ? te.pos : target.pos;
  if (aim && (aim.x !== actor.pos.x || aim.y !== actor.pos.y)) actor.facing = angleTo(actor.pos, aim);

  if (actor.kind === 'player') actor.mana -= getManaCost(actor, skillId);
  const cd = def.cooldownSec ? evalLevel(def.cooldownSec, level) : 0;
  if (cd > 0) actor.cooldowns[skillId] = cd;

  const tm = timingFor(actor, def, level);
  const act: ActionState = {
    skillId,
    targetId: target.id,
    targetPos: target.pos ?? (aim ? { x: aim.x, y: aim.y } : undefined),
    elapsed: 0,
    duration: tm.duration,
    fireAt: tm.fireAt,
    fired: false,
    repeats: tm.hits,
  };
  const ex: ActionExtra = { hits: tm.hits };
  if (def.kind === 'movement' && skillParam(actor, def, 'teleport', level) <= 0) {
    const want = aim ?? { x: actor.pos.x + Math.cos(actor.facing), y: actor.pos.y + Math.sin(actor.facing) };
    const maxD = getSkillRange(actor, skillId);
    const d = Math.hypot(want.x - actor.pos.x, want.y - actor.pos.y);
    const k = d > maxD && d > 0 ? maxD / d : 1;
    const to = furthestWalkable(
      world.level?.map,
      actor.pos,
      { x: actor.pos.x + (want.x - actor.pos.x) * k, y: actor.pos.y + (want.y - actor.pos.y) * k },
      actor.radius,
    );
    ex.leap = { from: { x: actor.pos.x, y: actor.pos.y }, to };
  }
  if (def.kind === 'whirl') ex.whirlTimer = 0;
  extras.set(act, ex);
  actor.action = act;
  actor.path = [];
  actor.moveTarget = undefined;
  setMode(actor, def.anim === 'cast' ? 'cast' : def.anim === 'throw' ? 'throw' : 'attack');
  actor.modeTime = 0;
  // Telegraphed skills (enemy Forse powers) announce their wind-up so the hero can react.
  if (skillParam(actor, def, 'telegraph', level) > 0)
    world.emit({
      type: 'skillWindup',
      casterId: actor.id,
      skillId,
      sec: (tm.duration / tm.hits) * tm.fireAt,
    });
  return true;
}

function makeContext(world: SimWorld, caster: Actor, act: ActionState, def: SkillDef): SkillFireContext {
  const te = act.targetId !== undefined ? world.get(act.targetId) : undefined;
  const targetActor = te && isActor(te) && te.alive && te.life > 0 ? te : undefined;
  const aim: Vec2 = targetActor?.pos ??
    act.targetPos ?? { x: caster.pos.x + Math.cos(caster.facing), y: caster.pos.y + Math.sin(caster.facing) };
  const angle =
    Math.hypot(aim.x - caster.pos.x, aim.y - caster.pos.y) > 1e-6 ? angleTo(caster.pos, aim) : caster.facing;
  caster.facing = angle;
  return {
    world,
    caster,
    skill: def,
    level: Math.max(1, getSkillLevel(caster, def.id)),
    target: { id: act.targetId, pos: act.targetPos },
    targetActor,
    aim,
    angle,
    range: getSkillRange(caster, def.id),
  };
}

/** Fire a skill's effect right now (the action frame). */
export function fireSkill(world: SimWorld, caster: Actor, act: ActionState): void {
  const def = DB.skills.get(act.skillId);
  if (!def) return;
  const ctx = makeContext(world, caster, act, def);
  const beh = getSkillBehavior(def.behavior);
  if (beh) beh.fire(ctx);
  else KIND_HANDLERS[def.kind](ctx);
}

export function cancelSkill(actor: Actor): void {
  actor.action = undefined;
}

function whirlStep(
  world: SimWorld,
  caster: Actor,
  act: ActionState,
  def: SkillDef,
  ex: ActionExtra,
  dt: number,
): void {
  const level = Math.max(1, getSkillLevel(caster, def.id));
  const interval = skillParam(caster, def, 'interval', level, 0.25);
  const radius = skillParam(caster, def, 'radius', level, 1.6);
  const speed = skillParam(caster, def, 'speed', level, 6);
  const dest = act.targetPos;
  if (dest) {
    const d = Math.hypot(dest.x - caster.pos.x, dest.y - caster.pos.y);
    if (d > 0.15) {
      const step = Math.min(d, speed * dt);
      moveWithCollision(
        world.level?.map,
        caster.pos,
        ((dest.x - caster.pos.x) / d) * step,
        ((dest.y - caster.pos.y) / d) * step,
        caster.radius,
      );
    }
  }
  ex.whirlTimer = (ex.whirlTimer ?? 0) - dt;
  if (ex.whirlTimer <= 0) {
    ex.whirlTimer += interval;
    const spec = buildAttackSpec(caster, def, level, 'melee', {
      useWeapon: def.weaponDamagePct !== undefined || !def.damage,
    });
    emitCast({
      world,
      caster,
      skill: def,
      level,
      target: { pos: dest },
      aim: dest ?? caster.pos,
      angle: caster.facing,
      range: radius,
    });
    for (const a of hostilesNear(world, caster.team, caster.pos, radius))
      dealAttack(world, caster, a, spec, { melee: true, skillId: def.id });
    world.emit({
      type: 'skillImpact',
      skillId: def.id,
      pos: { x: caster.pos.x, y: caster.pos.y },
      radius,
      vfx: def.vfx,
    });
  }
}

/** Advance the actor's current action by dt seconds (called by the actions system). */
export function advanceAction(world: SimWorld, actor: Actor, dt: number): void {
  const act = actor.action;
  if (!act) return;
  const def = DB.skills.get(act.skillId);
  if (!def || !isTargetable(actor) || actor.mode === 'stunned' || actor.mode === 'frozen') {
    actor.action = undefined;
    return;
  }
  const ex = extras.get(act) ?? { hits: 1 };
  act.elapsed += dt * getSlowFactor(actor);

  if (ex.leap) {
    const t = Math.min(1, act.elapsed / Math.max(1e-6, act.duration));
    actor.pos.x = ex.leap.from.x + (ex.leap.to.x - ex.leap.from.x) * t;
    actor.pos.y = ex.leap.from.y + (ex.leap.to.y - ex.leap.from.y) * t;
  }

  if (def.kind === 'whirl') {
    whirlStep(world, actor, act, def, ex, dt);
  } else {
    const seg = act.duration / ex.hits;
    while ((act.repeats ?? 0) > 0) {
      const k = ex.hits - (act.repeats as number);
      if (act.elapsed < (k + act.fireAt) * seg - 1e-9) break;
      act.repeats = (act.repeats as number) - 1;
      fireSkill(world, actor, act);
      if (actor.action !== act) return; // interrupted by its own effect
    }
  }
  act.fired = (act.repeats ?? 0) <= 0;
  if (act.elapsed >= act.duration - 1e-9) {
    actor.action = undefined;
    if (actor.mode === 'attack' || actor.mode === 'cast' || actor.mode === 'throw') setMode(actor, 'idle');
  }
}
