/**
 * Monster AI system. One `SimSystem` drives every monster (and player-owned summons) through
 * light behavior trees keyed by `MonsterDef.ai`. State lives in the `monster.ai` blackboard.
 *
 * AI only decides: it sets `targetId`, `path`/`moveTarget`, `running`, and calls `startSkill`.
 * Actual movement, action timing and damage belong to the movement/skills/combat systems.
 */
import type { SimSystem, SimWorld } from '../sim/world';
import type { Actor, MonsterEntity, RemnantEntity } from '../sim/entities';
import { isActor } from '../sim/entities';
import type { Rng } from '../rng';
import type { Vec2 } from '../types';
import { angleTo, dist } from '../math';
import { isWalkable } from '../world/types';
import type { TileMap } from '../world/types';
import { findPath } from '../world/pathfinding';
import { canUseSkill, getSkillRange, startSkill } from '../skills/runtime';
import { DB } from '../../data/db';
import type { MonsterDef } from '../../data/schema';
import { createMonster } from '../monsters/create';
import { spawnDeathProc } from '../monsters/modifiers';
import { getBossScript, type BossContext } from './bossScripts';
import { lineOfSight } from './los';

export type AiState = 'idle' | 'chase' | 'attack' | 'flee' | 'return' | 'revive';

interface Ctx {
  world: SimWorld;
  dt: number;
  time: number;
  rng: Rng;
  map: TileMap | undefined;
  /** Actors on the players' side (players, mercs, player summons). */
  heroes: Actor[];
  /** Monster-team monsters. */
  foes: MonsterEntity[];
  remnants: RemnantEntity[];
}

const BUSY_MODES = new Set(['stunned', 'frozen', 'hit', 'dying', 'dead']);

const deathProcWorlds = new WeakSet<SimWorld>();

function attachDeathProcs(world: SimWorld): void {
  if (deathProcWorlds.has(world)) return;
  deathProcWorlds.add(world);
  world.bus.on('death', (ev) => {
    const e = world.get(ev.id);
    if (e && e.kind === 'monster' && e.mods.length && !e.ai.deathProcDone) {
      e.ai.deathProcDone = true;
      spawnDeathProc(world, e, ev.pos);
    }
  });
}

export function createAiSystem(): SimSystem {
  let rng: Rng | null = null;
  return {
    name: 'ai',
    update(world, dt) {
      rng ??= world.rng.fork('ai');
      attachDeathProcs(world);
      const ctx: Ctx = {
        world,
        dt,
        time: world.time,
        rng,
        map: world.level?.map,
        heroes: [],
        foes: [],
        remnants: [],
      };
      const monsters: MonsterEntity[] = [];
      for (const e of world.all()) {
        if (!e.alive) continue;
        if (e.kind === 'remnant') {
          if (e.droyd && !e.used) ctx.remnants.push(e);
          continue;
        }
        if (!isActor(e) || e.life <= 0 || e.mode === 'dying' || e.mode === 'dead') continue;
        if (e.team === 'players') ctx.heroes.push(e);
        if (e.kind === 'monster') {
          monsters.push(e);
          if (e.team === 'monsters') ctx.foes.push(e);
        }
      }
      for (const m of monsters) runMonster(ctx, m);
    },
  };
}

// ---------------------------------------------------------------- helpers

function stop(m: MonsterEntity): void {
  m.path = [];
  m.moveTarget = undefined;
}

function face(m: MonsterEntity, to: Vec2): void {
  m.facing = angleTo(m.pos, to);
}

function getNum(bb: Record<string, unknown>, key: string, d = 0): number {
  const v = bb[key];
  return typeof v === 'number' ? v : d;
}

/** Walk toward `dest` (A* only when a straight line is blocked). */
function goTo(ctx: Ctx, m: MonsterEntity, dest: Vec2, running: boolean): void {
  const bb = m.ai;
  m.running = running;
  const stale = !m.moveTarget || dist(m.moveTarget, dest) > 0.75 || ctx.time >= getNum(bb, 'repathAt');
  if (!stale) return;
  let path: Vec2[] | null = null;
  if (ctx.map && !lineOfSight(ctx.map, m.pos, dest))
    path = findPath(ctx.map, m.pos, dest, { radius: m.radius });
  m.path = path && path.length ? path : [{ x: dest.x, y: dest.y }];
  m.moveTarget = { x: dest.x, y: dest.y };
  bb.repathAt = ctx.time + 0.5;
}

function isEnemyAlive(e: unknown): e is Actor {
  return (
    !!e &&
    isActor(e as never) &&
    (e as Actor).alive &&
    (e as Actor).life > 0 &&
    !['dying', 'dead'].includes((e as Actor).mode)
  );
}

function enemiesOf(ctx: Ctx, m: MonsterEntity): Actor[] {
  if (m.team === 'monsters') return ctx.heroes;
  if (m.team === 'players') return ctx.foes;
  return [];
}

/** A point roughly away from `from`, walkable, at least `minGain` further away than now. */
function awayPoint(ctx: Ctx, m: MonsterEntity, from: Vec2, wantDist: number, minGain = 1.5): Vec2 | null {
  const base = angleTo(from, m.pos);
  const cur = dist(m.pos, from);
  const offsets = [0, 0.5, -0.5, 1, -1, 1.5, -1.5];
  for (const dd of [wantDist, wantDist * 0.6]) {
    for (const off of offsets) {
      const a = base + off;
      const p = { x: m.pos.x + Math.cos(a) * dd, y: m.pos.y + Math.sin(a) * dd };
      if (ctx.map && !isWalkable(ctx.map, p.x, p.y)) continue;
      if (ctx.map && !lineOfSight(ctx.map, m.pos, p)) continue;
      if (dist(p, from) >= cur + minGain) return p;
    }
  }
  return null;
}

function randomNear(ctx: Ctx, center: Vec2, radius: number): Vec2 | null {
  for (let i = 0; i < 8; i++) {
    const a = ctx.rng.float(0, Math.PI * 2);
    const r = ctx.rng.float(0.5, radius);
    const p = { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
    if (!ctx.map || isWalkable(ctx.map, p.x, p.y)) return p;
  }
  return null;
}

function chooseSkill(ctx: Ctx, m: MonsterEntity, def: MonsterDef): string | null {
  const bb = m.ai;
  const list = def.skills ?? [];
  if (
    m.mods.includes('multishot') &&
    ctx.time >= getNum(bb, 'cd_multishot') &&
    list.some((s) => DB.skills.get(s.skill)?.kind === 'missile') &&
    canUseSkill(ctx.world, m, 'm_multishot')
  ) {
    bb.cd_multishot = ctx.time + 3;
    return 'm_multishot';
  }
  const usable = list.filter((s) => canUseSkill(ctx.world, m, s.skill));
  if (usable.length) return ctx.rng.weighted(usable, (s) => s.chance).skill;
  return list.length ? null : 'attack';
}

function attackRange(m: MonsterEntity, def: MonsterDef, skill: string): number {
  return Math.max(def.attackRange, getSkillRange(m, skill));
}

function tryAttack(ctx: Ctx, m: MonsterEntity, def: MonsterDef, target: Actor): boolean {
  const bb = m.ai;
  if (ctx.time < getNum(bb, 'nextAttackTry')) return false;
  const skill = chooseSkill(ctx, m, def);
  if (!skill) return false;
  face(m, target.pos);
  const ok = startSkill(ctx.world, m, skill, { id: target.id, pos: { x: target.pos.x, y: target.pos.y } });
  if (ok) {
    stop(m);
    bb.state = 'attack';
  } else bb.nextAttackTry = ctx.time + 0.3;
  return ok;
}

// ---------------------------------------------------------------- target handling

function acquireTarget(ctx: Ctx, m: MonsterEntity, def: MonsterDef): Actor | null {
  const bb = m.ai;
  const cur = typeof bb.targetId === 'number' ? ctx.world.get(bb.targetId) : undefined;
  if (isEnemyAlive(cur) && cur.team !== m.team) {
    const limit = (m.ownerId !== undefined ? 14 : def.aggroRange) * 3;
    if (dist(m.pos, cur.pos) <= limit) {
      m.targetId = cur.id;
      return cur;
    }
  }
  bb.targetId = undefined;
  m.targetId = undefined;

  // Retaliate against whoever hurt us.
  if (m.lastHitBy !== undefined) {
    const hitter = ctx.world.get(m.lastHitBy);
    if (isEnemyAlive(hitter) && hitter.team !== m.team && hitter.team !== 'neutral') {
      return setTarget(ctx, m, hitter);
    }
  }
  // Staggered scan for new targets.
  if ((ctx.world.tick + m.id) % 5 !== 0) return null;
  const range = m.ownerId !== undefined ? 9 : def.aggroRange;
  let best: Actor | null = null;
  let bestD = Infinity;
  for (const e of enemiesOf(ctx, m)) {
    const d = dist(m.pos, e.pos);
    if (d > range || d >= bestD) continue;
    if (d > 2.5 && !lineOfSight(ctx.map, m.pos, e.pos)) continue;
    best = e;
    bestD = d;
  }
  return best ? setTarget(ctx, m, best) : null;
}

function setTarget(ctx: Ctx, m: MonsterEntity, t: Actor): Actor {
  m.ai.targetId = t.id;
  m.targetId = t.id;
  // Wake the group: leader + minions share aggro.
  const group = m.leaderId ?? m.id;
  for (const o of ctx.foes) {
    if (o === m || o.team !== m.team) continue;
    if (
      (o.leaderId === group || o.id === group) &&
      typeof o.ai.targetId !== 'number' &&
      dist(o.pos, m.pos) < 14
    ) {
      o.ai.targetId = t.id;
      o.targetId = t.id;
    }
  }
  if (m.rank === 'boss' && !m.ai.introduced) {
    m.ai.introduced = true;
    ctx.world.emit({
      type: 'bossIntro',
      id: m.id,
      lineKey: typeof m.ai.introKey === 'string' ? m.ai.introKey : undefined,
    });
  }
  return t;
}

// ---------------------------------------------------------------- per-monster driver

function runMonster(ctx: Ctx, m: MonsterEntity): void {
  if (m.life <= 0 || m.team === 'neutral') return;
  if (BUSY_MODES.has(m.mode) || m.action) return;
  const def = DB.monsters.get(m.defId);
  if (!def || def.ai === 'npc') return;
  const bb = m.ai;

  // Reviver mid-cast (owns m.mode = 'cast' while it channels).
  if (bb.state === 'revive' && continueRevive(ctx, m)) return;

  // Fleeing and leashing happen regardless of target.
  if (bb.state === 'flee') {
    if (ctx.time < getNum(bb, 'fleeUntil')) {
      runFlee(ctx, m);
      return;
    }
    bb.state = 'idle';
    m.running = false;
  }
  if (bb.state === 'return') {
    if (dist(m.pos, m.home) > 1.5) {
      goTo(ctx, m, m.home, true);
      return;
    }
    bb.state = 'idle';
    stop(m);
    m.running = false;
  }

  // Player-owned summons.
  if (m.ownerId !== undefined && m.team === 'players') {
    runSummon(ctx, m, def);
    return;
  }

  // Leash back home if dragged too far.
  const leash = def.flags.boss ? 40 : Math.max(16, def.aggroRange * 2);
  if (dist(m.pos, m.home) > leash) {
    bb.state = 'return';
    bb.targetId = undefined;
    m.targetId = undefined;
    goTo(ctx, m, m.home, true);
    return;
  }

  const target = acquireTarget(ctx, m, def);

  if (def.behavior === 'cowardly' && checkCowardice(ctx, m, target)) return;

  if (!target) {
    if (def.ai === 'reviver' && tryRevive(ctx, m)) return;
    idle(ctx, m);
    return;
  }

  if (def.ai === 'reviver' && tryRevive(ctx, m)) return;

  // Boss script.
  const script = getBossScript(def.behavior);
  if (script && runBossScript(ctx, m, def, target, script) === 'handled') return;

  engage(ctx, m, def, target);
}

function runBossScript(
  ctx: Ctx,
  m: MonsterEntity,
  def: MonsterDef,
  target: Actor | null,
  script: NonNullable<ReturnType<typeof getBossScript>>,
): 'handled' | void {
  const bb = m.ai;
  const c: BossContext = {
    world: ctx.world,
    boss: m,
    def,
    target,
    rng: ctx.rng,
    time: ctx.time,
    dt: ctx.dt,
    hpFrac: m.stats.lifeMax > 0 ? m.life / m.stats.lifeMax : 0,
    distToTarget: target ? dist(m.pos, target.pos) : Infinity,
    phase: getNum(bb, 'phase'),
    setPhase(p) {
      bb.phase = p;
      c.phase = p;
    },
    cast(skillId) {
      if (!target || !canUseSkill(ctx.world, m, skillId)) return false;
      face(m, target.pos);
      const ok = startSkill(ctx.world, m, skillId, {
        id: target.id,
        pos: { x: target.pos.x, y: target.pos.y },
      });
      if (ok) {
        stop(m);
        bb.state = 'attack';
      }
      return ok;
    },
    ready: (key) => ctx.time >= getNum(bb, `cd_${key}`),
    startCooldown: (key, sec) => {
      bb[`cd_${key}`] = ctx.time + sec;
    },
  };
  return script(c);
}

// ---------------------------------------------------------------- idle / wander / follow

function idle(ctx: Ctx, m: MonsterEntity): void {
  const bb = m.ai;
  bb.state = 'idle';
  m.running = false;
  // Minions stay close to their leader.
  const leader = m.leaderId !== undefined ? ctx.world.get(m.leaderId) : undefined;
  const anchor = leader && leader.alive ? leader.pos : m.home;
  if (anchor !== m.home && dist(m.pos, anchor) > 5) {
    goTo(ctx, m, anchor, false);
    return;
  }
  if (m.moveTarget && dist(m.pos, m.moveTarget) > 0.6) return; // still wandering
  if (ctx.time < getNum(bb, 'wanderAt')) return;
  bb.wanderAt = ctx.time + ctx.rng.float(3, 8);
  const p = randomNear(ctx, anchor, 4);
  if (p) goTo(ctx, m, p, false);
}

// ---------------------------------------------------------------- engage

function engage(ctx: Ctx, m: MonsterEntity, def: MonsterDef, target: Actor): void {
  const bb = m.ai;
  const d = dist(m.pos, target.pos);

  // Teleporting packs blink next to their prey.
  if (m.mods.includes('teleport') && d > 5 && ctx.time >= getNum(bb, 'tpAt')) {
    bb.tpAt = ctx.time + ctx.rng.float(3, 5);
    const p = randomNear(ctx, target.pos, 2.5);
    if (p && lineOfSight(ctx.map, p, target.pos)) {
      m.pos = p;
      stop(m);
      ctx.world.emit({ type: 'skillCast', casterId: m.id, skillId: 'm_teleport', targetPos: p });
      return;
    }
  }

  switch (def.ai) {
    case 'ranged':
      return rangedLike(ctx, m, def, target, 0.45);
    case 'caster':
    case 'reviver':
      return rangedLike(ctx, m, def, target, 0.3);
    case 'swarm':
      return swarm(ctx, m, def, target);
    case 'summoner':
      if (trySummon(ctx, m, def, target)) return;
      return meleeLike(ctx, m, def, target);
    case 'charger':
      m.running = true;
      return meleeLike(ctx, m, def, target);
    default:
      // melee / boss / minion
      if (def.attackRange > 3.5) return rangedLike(ctx, m, def, target, 0.3);
      return meleeLike(ctx, m, def, target);
  }
}

function inRange(m: MonsterEntity, def: MonsterDef, target: Actor, skill: string): boolean {
  return dist(m.pos, target.pos) - target.radius <= attackRange(m, def, skill);
}

function meleeLike(ctx: Ctx, m: MonsterEntity, def: MonsterDef, target: Actor): void {
  const skill = def.skills?.[0]?.skill ?? 'attack';
  if (inRange(m, def, target, skill)) {
    stop(m);
    face(m, target.pos);
    tryAttack(ctx, m, def, target);
  } else {
    m.ai.state = 'chase';
    goTo(ctx, m, target.pos, !!def.runSpeed);
  }
}

function rangedLike(ctx: Ctx, m: MonsterEntity, def: MonsterDef, target: Actor, kiteFrac: number): void {
  const bb = m.ai;
  const skill = def.skills?.[0]?.skill ?? 'attack';
  const range = attackRange(m, def, skill);
  const d = dist(m.pos, target.pos);

  if (ctx.time < getNum(bb, 'kiteUntil') && bb.kiteTo) {
    goTo(ctx, m, bb.kiteTo as Vec2, true);
    return;
  }
  if (d < range * kiteFrac && ctx.time >= getNum(bb, 'kiteCdUntil')) {
    const p = awayPoint(ctx, m, target.pos, 4);
    bb.kiteCdUntil = ctx.time + 2.5;
    if (p) {
      bb.kiteTo = p;
      bb.kiteUntil = ctx.time + 0.8;
      goTo(ctx, m, p, true);
      return;
    }
  }
  const los = lineOfSight(ctx.map, m.pos, target.pos);
  if (d - target.radius <= range && los) {
    stop(m);
    face(m, target.pos);
    tryAttack(ctx, m, def, target);
  } else {
    bb.state = 'chase';
    goTo(ctx, m, target.pos, !!def.runSpeed);
  }
}

function swarm(ctx: Ctx, m: MonsterEntity, def: MonsterDef, target: Actor): void {
  const bb = m.ai;
  const skill = def.skills?.[0]?.skill ?? 'attack';
  if (ctx.time < getNum(bb, 'flutterUntil') && bb.flutterTo) {
    goTo(ctx, m, bb.flutterTo as Vec2, true);
    return;
  }
  if (inRange(m, def, target, skill)) {
    stop(m);
    face(m, target.pos);
    if (tryAttack(ctx, m, def, target)) {
      bb.flutterUntil = ctx.time + ctx.rng.float(0.5, 1.1);
      bb.flutterTo = randomNear(ctx, target.pos, 4) ?? m.pos;
    }
    return;
  }
  // Erratic approach: aim at a jittered point around the prey.
  if (ctx.time >= getNum(bb, 'jitterAt')) {
    bb.jitterAt = ctx.time + 0.4;
    bb.jitter = { x: ctx.rng.float(-1.2, 1.2), y: ctx.rng.float(-1.2, 1.2) };
  }
  const j = (bb.jitter as Vec2 | undefined) ?? { x: 0, y: 0 };
  bb.state = 'chase';
  goTo(ctx, m, { x: target.pos.x + j.x, y: target.pos.y + j.y }, true);
}

function trySummon(ctx: Ctx, m: MonsterEntity, def: MonsterDef, target: Actor): boolean {
  const bb = m.ai;
  const sk = (def.skills ?? []).find((s) => DB.skills.get(s.skill)?.kind === 'summon');
  if (!sk || ctx.time < getNum(bb, 'summonAt') || dist(m.pos, target.pos) > def.aggroRange) return false;
  const minions = ctx.foes.filter((o) => o.leaderId === m.id).length;
  if (minions >= 4 || !canUseSkill(ctx.world, m, sk.skill)) return false;
  bb.summonAt = ctx.time + 10;
  face(m, target.pos);
  const ok = startSkill(ctx.world, m, sk.skill, { pos: { x: m.pos.x, y: m.pos.y } });
  if (ok) stop(m);
  return ok;
}

// ---------------------------------------------------------------- fleeing (cowardly families)

function leaderGone(ctx: Ctx, m: MonsterEntity): boolean {
  if (m.leaderId === undefined) return false;
  const l = ctx.world.get(m.leaderId);
  return !l || !l.alive || (isActor(l) && (l.life <= 0 || l.mode === 'dying' || l.mode === 'dead'));
}

function checkCowardice(ctx: Ctx, m: MonsterEntity, target: Actor | null): boolean {
  const bb = m.ai;
  if (bb.fled) return false;
  let reason = false;
  if (leaderGone(ctx, m)) {
    m.leaderId = undefined; // D2 Fallen: the whole pack panics when the leader dies
    reason = true;
  } else if (m.life < m.stats.lifeMax * 0.25) {
    reason = ctx.rng.chance(0.5);
  }
  if (!reason) return false;
  bb.fled = true;
  if (!target) return false;
  bb.state = 'flee';
  bb.fleeUntil = ctx.time + ctx.rng.float(5, 8);
  bb.fleeFrom = target.id;
  runFlee(ctx, m);
  return true;
}

function runFlee(ctx: Ctx, m: MonsterEntity): void {
  const bb = m.ai;
  const threat = typeof bb.fleeFrom === 'number' ? ctx.world.get(bb.fleeFrom) : undefined;
  if (!threat) {
    bb.state = 'idle';
    return;
  }
  const p = awayPoint(ctx, m, threat.pos, 6, 0.5);
  if (p) goTo(ctx, m, p, true);
  else stop(m);
}

// ---------------------------------------------------------------- reviver (Jawwa)

const REVIVE_SCAN_RANGE = 9;
const REVIVE_CAST_SEC = 0.9;

function findRemnant(ctx: Ctx, m: MonsterEntity): RemnantEntity | null {
  let best: RemnantEntity | null = null;
  let bestD = REVIVE_SCAN_RANGE;
  for (const r of ctx.remnants) {
    if (r.used || !r.alive) continue;
    const d = dist(m.pos, r.pos);
    if (d < bestD) {
      best = r;
      bestD = d;
    }
  }
  return best;
}

/** Returns true if the reviver spent its turn on reviving. */
function tryRevive(ctx: Ctx, m: MonsterEntity): boolean {
  const bb = m.ai;
  let r: RemnantEntity | null = null;
  const id = bb.reviveGoto;
  if (typeof id === 'number') {
    const e = ctx.world.get(id);
    if (e && e.kind === 'remnant' && !e.used && e.alive) r = e;
    else bb.reviveGoto = undefined;
  }
  if (!r) {
    if (ctx.time < getNum(bb, 'reviveScanAt')) return false;
    bb.reviveScanAt = ctx.time + 0.5;
    r = findRemnant(ctx, m);
    if (!r) return false;
    bb.reviveGoto = r.id;
  }
  if (dist(m.pos, r.pos) > 2.5) {
    bb.state = 'chase';
    goTo(ctx, m, r.pos, true);
    return true;
  }
  stop(m);
  face(m, r.pos);
  m.mode = 'cast';
  m.modeTime = 0;
  bb.state = 'revive';
  bb.reviveId = r.id;
  bb.reviveEndAt = ctx.time + REVIVE_CAST_SEC;
  return true;
}

function continueRevive(ctx: Ctx, m: MonsterEntity): boolean {
  const bb = m.ai;
  const e = typeof bb.reviveId === 'number' ? ctx.world.get(bb.reviveId) : undefined;
  const finish = () => {
    bb.state = 'idle';
    bb.reviveId = undefined;
    bb.reviveGoto = undefined;
    if (m.mode === 'cast') m.mode = 'idle';
  };
  if (!e || e.kind !== 'remnant' || e.used || !e.alive) {
    finish();
    return false;
  }
  if (ctx.time < getNum(bb, 'reviveEndAt')) {
    m.mode = 'cast';
    return true;
  }
  e.used = true;
  e.alive = false;
  const revived = createMonster(ctx.world, e.monsterDefId, e.pos, m.level, 'minion', {
    rng: ctx.rng,
    leaderId: m.leaderId ?? m.id,
    facing: m.facing,
  });
  if (typeof bb.targetId === 'number') {
    revived.ai.targetId = bb.targetId;
    revived.targetId = bb.targetId;
  }
  ctx.world.emit({ type: 'skillCast', casterId: m.id, skillId: 'm_revive', targetPos: { ...e.pos } });
  finish();
  return true;
}

// ---------------------------------------------------------------- player summons

function runSummon(ctx: Ctx, m: MonsterEntity, def: MonsterDef): void {
  const owner = ctx.world.get(m.ownerId as number);
  if (!isEnemyAlive(owner)) {
    m.alive = false; // summon expires with its owner
    return;
  }
  // Prefer the nearest enemy to the summon within reach of the owner's vicinity.
  const target = acquireTarget(ctx, m, def);
  if (target && dist(owner.pos, target.pos) < 16) {
    engage(ctx, m, def, target);
    return;
  }
  m.ai.targetId = undefined;
  m.targetId = undefined;
  const d = dist(m.pos, owner.pos);
  if (d > 25) {
    const p = randomNear(ctx, owner.pos, 2);
    if (p) {
      m.pos = p;
      stop(m);
    }
  } else if (d > 3.5) {
    m.ai.state = 'chase';
    goTo(ctx, m, owner.pos, d > 8);
  } else {
    m.ai.state = 'idle';
    stop(m);
  }
}
