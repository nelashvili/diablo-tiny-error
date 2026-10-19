/**
 * Generic fire-handlers, one per SkillKind. They run at the action frame and are driven only by
 * SkillDef data (damage, weaponDamagePct, params, effects, mods, synergies).
 */
import { DB } from '../../data/db';
import { evalLevel } from '../../data/levelScaled';
import type { SkillDef, SkillKind } from '../../data/schema';
import type { Modifier } from '../stats/types';
import { angleTo, fromAngle } from '../math';
import { rollDrops } from '../loot';
import { spawnGroundItem } from '../player/inventory';
import { dealAttack, healActor } from '../sim/systems/damage';
import { addBuff, applyEffect } from '../sim/systems/effects';
import { firstBlocked, moveWithCollision, nearestStandable } from '../sim/systems/collision';
import { hostilesNear, invalidateActorGrid, queryActors } from '../sim/systems/spatial';
import { isHostile, isTargetable } from '../sim/systems/util';
import type { Actor } from '../sim/entities';
import type { Vec2 } from '../types';
import { skillParam, synergyPct } from './level';
import type { SkillFireContext } from './registry';
import { buildAttackSpec, paramEffects } from './spec';
import { spawnArea, spawnMissile, spawnSummon } from './spawn';
import { TRAIL_PREFIX } from './trail';
import { MELEE_MASTERY, wieldsMelee } from '../player/weapon';

type Handler = (ctx: SkillFireContext) => void;

const p = (ctx: SkillFireContext, name: string, fallback = 0): number =>
  skillParam(ctx.caster, ctx.skill, name, ctx.level, fallback);

/** Reach used for melee range checks at fire time (a little forgiving, like D2). */
export const MELEE_TOLERANCE = 0.8;

export function emitCast(ctx: SkillFireContext): void {
  ctx.world.emit({
    type: 'skillCast',
    casterId: ctx.caster.id,
    skillId: ctx.skill.id,
    targetPos: ctx.target.pos ?? ctx.targetActor?.pos,
    targetId: ctx.target.id,
  });
}

function impact(ctx: SkillFireContext, pos: Vec2, radius?: number): void {
  ctx.world.emit({
    type: 'skillImpact',
    skillId: ctx.skill.id,
    pos: { x: pos.x, y: pos.y },
    radius,
    vfx: ctx.skill.vfx,
  });
}

const useWeapon = (s: SkillDef): boolean => s.weaponDamagePct !== undefined || !s.damage;

// ------------------------------------------------------------------ melee

export function meleeHandler(ctx: SkillFireContext, range: number): void {
  const { world, caster, skill } = ctx;
  emitCast(ctx);
  const spec = buildAttackSpec(caster, skill, ctx.level, 'melee', { useWeapon: useWeapon(skill) });
  let targets: Actor[] = [];
  const arc = p(ctx, 'arc');
  const reach = range + MELEE_TOLERANCE;
  if (arc > 0) {
    const half = (arc * Math.PI) / 360;
    for (const a of hostilesNear(world, caster.team, caster.pos, reach)) {
      let d = angleTo(caster.pos, a.pos) - ctx.angle;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) <= half) targets.push(a);
    }
  } else {
    let primary = ctx.targetActor;
    if (primary && !(isHostile(caster, primary) && isTargetable(primary))) primary = undefined;
    if (!primary) {
      // nearest enemy roughly in front
      let best = Infinity;
      for (const a of hostilesNear(world, caster.team, caster.pos, reach)) {
        let d = angleTo(caster.pos, a.pos) - ctx.angle;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const dist = Math.hypot(a.pos.x - caster.pos.x, a.pos.y - caster.pos.y);
        if (Math.abs(d) <= 1.0 && dist < best) {
          best = dist;
          primary = a;
        }
      }
    }
    if (primary) {
      const edge = Math.hypot(primary.pos.x - caster.pos.x, primary.pos.y - caster.pos.y) - primary.radius;
      if (edge <= reach) {
        targets = [primary];
        const splash = p(ctx, 'splashRadius');
        if (splash > 0)
          for (const a of hostilesNear(world, caster.team, primary.pos, splash))
            if (a !== primary) targets.push(a);
      }
    }
  }
  for (const t of targets) dealAttack(world, caster, t, spec, { melee: true, skillId: skill.id });
  // Basic melee swings cleave: other enemies in front take part damage.
  if (skill.id === 'attack' && targets.length === 1 && wieldsMelee(caster)) {
    const half = (MELEE_MASTERY.cleaveArcDeg * Math.PI) / 360;
    const side = {
      ...spec,
      weaponDamagePct: ((spec.weaponDamagePct ?? 100) * MELEE_MASTERY.cleavePct) / 100,
    };
    for (const a of hostilesNear(world, caster.team, caster.pos, reach)) {
      if (a === targets[0]) continue;
      let d = angleTo(caster.pos, a.pos) - ctx.angle;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) <= half) dealAttack(world, caster, a, side, { melee: true, skillId: skill.id });
    }
  }
  const at = targets[0]?.pos ?? fromAngle(ctx.angle, 1.2);
  impact(ctx, targets[0] ? at : { x: caster.pos.x + (at as Vec2).x, y: caster.pos.y + (at as Vec2).y });
}

// ------------------------------------------------------------------ missiles

function launch(ctx: SkillFireContext, count: number, spreadDeg: number, random: boolean): void {
  const { world, caster, skill } = ctx;
  emitCast(ctx);
  if (!skill.missile) return;
  const def = DB.missiles.get(skill.missile);
  const payload = buildAttackSpec(caster, skill, ctx.level, useWeapon(skill) ? 'missile' : 'spell', {
    useWeapon: skill.weaponDamagePct !== undefined,
  });
  const maxRange = p(ctx, 'range') || undefined;
  const homing = def?.homing || p(ctx, 'homing') > 0;
  for (let i = 0; i < count; i++) {
    let a = ctx.angle;
    if (count > 1 || spreadDeg > 0) {
      const spread = (spreadDeg * Math.PI) / 180;
      a += random
        ? (world.combatRng.next() - 0.5) * spread
        : count > 1
          ? (i / (count - 1) - 0.5) * spread
          : 0;
    }
    const start = { x: caster.pos.x + Math.cos(a) * 0.5, y: caster.pos.y + Math.sin(a) * 0.5 };
    spawnMissile(world, caster, {
      defId: skill.missile,
      pos: start,
      angle: a,
      payload,
      skillId: skill.id,
      skillLevel: ctx.level,
      homingTargetId: homing ? ctx.targetActor?.id : undefined,
      range: maxRange,
    });
  }
}

const missileHandler: Handler = (ctx) => launch(ctx, 1, 0, false);
const multiMissileHandler: Handler = (ctx) =>
  launch(ctx, Math.max(1, Math.round(p(ctx, 'missiles', 3))), p(ctx, 'spread', 40), p(ctx, 'random') > 0);

// ------------------------------------------------------------------ area family

const novaHandler: Handler = (ctx) => {
  const { world, caster } = ctx;
  emitCast(ctx);
  const radius = p(ctx, 'radius', 4);
  const spec = buildAttackSpec(caster, ctx.skill, ctx.level, useWeapon(ctx.skill) ? 'missile' : 'spell', {
    useWeapon: ctx.skill.weaponDamagePct !== undefined,
  });
  for (const a of hostilesNear(world, caster.team, caster.pos, radius))
    dealAttack(world, caster, a, spec, { skillId: ctx.skill.id });
  impact(ctx, caster.pos, radius);
};

function clampAim(ctx: SkillFireContext, maxRange: number): Vec2 {
  const c = ctx.caster.pos;
  const d = Math.hypot(ctx.aim.x - c.x, ctx.aim.y - c.y);
  if (d <= maxRange || d < 1e-6) return { x: ctx.aim.x, y: ctx.aim.y };
  return { x: c.x + ((ctx.aim.x - c.x) / d) * maxRange, y: c.y + ((ctx.aim.y - c.y) / d) * maxRange };
}

const areaHandler: Handler = (ctx) => {
  const { world, caster, skill } = ctx;
  emitCast(ctx);
  const pos = clampAim(ctx, p(ctx, 'range', 14));
  const radius = p(ctx, 'radius', 2);
  const count = Math.max(1, Math.round(p(ctx, 'count', 1)));
  const scatter = p(ctx, 'scatter', 0);
  const stagger = p(ctx, 'stagger', 0);
  const payload = buildAttackSpec(caster, skill, ctx.level, 'spell');
  for (let i = 0; i < count; i++) {
    const at =
      scatter > 0
        ? {
            x: pos.x + (world.combatRng.next() * 2 - 1) * scatter,
            y: pos.y + (world.combatRng.next() * 2 - 1) * scatter,
          }
        : pos;
    spawnArea(world, caster, {
      skill,
      level: ctx.level,
      pos: at,
      radius,
      duration: p(ctx, 'duration', 0),
      tickEverySec: p(ctx, 'tickInterval', 0.5),
      delay: p(ctx, 'delay', 0) + i * stagger,
      payload,
    });
  }
};

const wallHandler: Handler = (ctx) => {
  const { caster, skill, world } = ctx;
  emitCast(ctx);
  const center = clampAim(ctx, p(ctx, 'range', 12));
  const segs = Math.max(1, Math.round(p(ctx, 'segments', 5)));
  const spacing = p(ctx, 'spacing', 0.9);
  const perp = ctx.angle + Math.PI / 2;
  const payload = buildAttackSpec(caster, skill, ctx.level, 'spell');
  for (let i = 0; i < segs; i++) {
    const off = (i - (segs - 1) / 2) * spacing;
    spawnArea(world, caster, {
      skill,
      level: ctx.level,
      pos: { x: center.x + Math.cos(perp) * off, y: center.y + Math.sin(perp) * off },
      radius: p(ctx, 'radius', 0.8),
      duration: p(ctx, 'duration', 4),
      tickEverySec: p(ctx, 'tickInterval', 0.5),
      payload,
    });
  }
};

const trailHandler: Handler = (ctx) => {
  emitCast(ctx);
  addBuff(ctx.caster, {
    id: TRAIL_PREFIX + ctx.skill.id,
    level: ctx.level,
    remainingSec: p(ctx, 'duration', 8),
    mods: [],
    sourceId: ctx.caster.id,
  });
};

const beamHandler: Handler = (ctx) => {
  const { world, caster, skill } = ctx;
  emitCast(ctx);
  const length = p(ctx, 'length', p(ctx, 'range', 8));
  const width = p(ctx, 'width', 0.8);
  let end: Vec2 = {
    x: caster.pos.x + Math.cos(ctx.angle) * length,
    y: caster.pos.y + Math.sin(ctx.angle) * length,
  };
  const wall = firstBlocked(world.level?.map, caster.pos, end, 'missile');
  if (wall) end = wall;
  const dx = end.x - caster.pos.x;
  const dy = end.y - caster.pos.y;
  const l2 = dx * dx + dy * dy || 1;
  const mid = { x: caster.pos.x + dx / 2, y: caster.pos.y + dy / 2 };
  const spec = buildAttackSpec(caster, skill, ctx.level, useWeapon(skill) ? 'missile' : 'spell', {
    useWeapon: skill.weaponDamagePct !== undefined,
  });
  const maxHits = Math.round(p(ctx, 'maxTargets', 99));
  let hits = 0;
  for (const a of hostilesNear(world, caster.team, mid, Math.sqrt(l2) / 2 + width)) {
    const t = Math.max(0, Math.min(1, ((a.pos.x - caster.pos.x) * dx + (a.pos.y - caster.pos.y) * dy) / l2));
    const cx = caster.pos.x + dx * t;
    const cy = caster.pos.y + dy * t;
    if (Math.hypot(a.pos.x - cx, a.pos.y - cy) <= width / 2 + a.radius && hits < maxHits) {
      dealAttack(world, caster, a, spec, { skillId: skill.id });
      hits++;
    }
  }
  impact(ctx, end);
};

const chainHandler: Handler = (ctx) => {
  const { world, caster, skill } = ctx;
  emitCast(ctx);
  const spec = buildAttackSpec(caster, skill, ctx.level, 'spell');
  const jumps = Math.max(1, Math.round(p(ctx, 'hits', 3)));
  const jumpRange = p(ctx, 'jumpRange', 5);
  let current: Actor | undefined =
    ctx.targetActor && isHostile(caster, ctx.targetActor) ? ctx.targetActor : undefined;
  if (!current) {
    let best = Infinity;
    for (const a of hostilesNear(world, caster.team, ctx.aim, 3)) {
      const d = Math.hypot(a.pos.x - ctx.aim.x, a.pos.y - ctx.aim.y);
      if (d < best) {
        best = d;
        current = a;
      }
    }
  }
  const hit = new Set<number>();
  for (let i = 0; i < jumps && current; i++) {
    hit.add(current.id);
    dealAttack(world, caster, current, spec, { skillId: skill.id, pos: current.pos });
    impact(ctx, current.pos);
    const from: Vec2 = current.pos;
    let next: Actor | undefined;
    let best = Infinity;
    for (const a of hostilesNear(world, caster.team, from, jumpRange)) {
      if (hit.has(a.id)) continue;
      const d = Math.hypot(a.pos.x - from.x, a.pos.y - from.y);
      if (d < best) {
        best = d;
        next = a;
      }
    }
    current = next;
  }
};

// ------------------------------------------------------------------ movement

const movementHandler: Handler = (ctx) => {
  const { world, caster, skill } = ctx;
  emitCast(ctx);
  const map = world.level?.map;
  if (p(ctx, 'teleport') > 0) {
    const maxD = p(ctx, 'distance', 14);
    const d = Math.hypot(ctx.aim.x - caster.pos.x, ctx.aim.y - caster.pos.y);
    const k = d > maxD ? maxD / d : 1;
    const to = {
      x: caster.pos.x + (ctx.aim.x - caster.pos.x) * k,
      y: caster.pos.y + (ctx.aim.y - caster.pos.y) * k,
    };
    const dest = nearestStandable(map, caster.pos, to, caster.radius);
    impact(ctx, caster.pos, 1);
    caster.pos.x = dest.x;
    caster.pos.y = dest.y;
    caster.path = [];
    caster.moveTarget = undefined;
    invalidateActorGrid(world);
    impact(ctx, dest, 1);
    return;
  }
  // Leap: the action runtime already carried the caster to the landing spot; deal landing damage here.
  const radius = p(ctx, 'landRadius', 1.6);
  const spec = buildAttackSpec(
    caster,
    skill,
    ctx.level,
    useWeapon(skill) && skill.weaponDamagePct !== undefined ? 'melee' : 'spell',
    {
      useWeapon: skill.weaponDamagePct !== undefined,
    },
  );
  if (skill.weaponDamagePct !== undefined || skill.damage) {
    for (const a of hostilesNear(world, caster.team, caster.pos, radius))
      dealAttack(world, caster, a, spec, { skillId: skill.id, melee: spec.delivery === 'melee' });
  }
  impact(ctx, caster.pos, radius);
};

// ------------------------------------------------------------------ buffs & debuffs

function skillMods(ctx: SkillFireContext): Modifier[] {
  const out: Modifier[] = [];
  for (const m of ctx.skill.mods ?? [])
    out.push({
      stat: m.stat,
      op: m.op,
      value: evalLevel(m.value, ctx.level),
      param: m.param,
      source: `skill:${ctx.skill.id}`,
    });
  return out;
}

function buffDuration(ctx: SkillFireContext): number {
  const d = p(ctx, 'duration');
  return d > 0 ? d * (1 + synergyPct(ctx.caster, ctx.skill, 'duration') / 100) : Infinity;
}

const buffHandler: Handler = (ctx) => {
  const { world, caster, skill } = ctx;
  emitCast(ctx);
  const mods = skillMods(ctx);
  const dur = buffDuration(ctx);
  const give = (a: Actor): void =>
    addBuff(a, { id: skill.id, level: ctx.level, remainingSec: dur, mods, sourceId: caster.id });
  give(caster);
  const radius = p(ctx, 'radius');
  if (radius > 0) {
    for (const a of queryActors(world, caster.pos, radius))
      if (a !== caster && a.team === caster.team && isTargetable(a) && a.kind !== 'npc') give(a);
  }
  const heal = p(ctx, 'healPct');
  if (heal > 0) healActor(world, caster, (caster.stats.lifeMax * heal) / 100);
  impact(ctx, caster.pos, radius || undefined);
};

function setAi(a: Actor, key: string, value: unknown): void {
  if (a.kind === 'monster' || a.kind === 'merc') a.ai[key] = value;
}

const warcryHandler: Handler = (ctx) => {
  const { world, caster, skill } = ctx;
  emitCast(ctx);
  const radius = p(ctx, 'radius', 6);
  const dealsDamage = skill.damage !== undefined || skill.weaponDamagePct !== undefined;
  const spec = dealsDamage
    ? buildAttackSpec(caster, skill, ctx.level, 'spell', { useWeapon: skill.weaponDamagePct !== undefined })
    : undefined;
  const mods = skillMods(ctx);
  const dur = buffDuration(ctx);
  const fear = p(ctx, 'fearSec');
  const taunt = p(ctx, 'tauntSec');
  const fx = dealsDamage ? [] : paramEffects(caster, skill, ctx.level);
  for (const a of hostilesNear(world, caster.team, caster.pos, radius)) {
    if (spec)
      dealAttack(world, caster, a, { ...spec, blockable: false, ignoreDefense: true }, { skillId: skill.id });
    if (mods.length > 0 && Number.isFinite(dur))
      addBuff(a, { id: skill.id, level: ctx.level, remainingSec: dur, mods, sourceId: caster.id });
    if (fear > 0) setAi(a, 'fearUntil', world.time + fear);
    if (taunt > 0) {
      setAi(a, 'tauntId', caster.id);
      setAi(a, 'tauntUntil', world.time + taunt);
    }
  }
  if (fx.length > 0) {
    for (const a of hostilesNear(world, caster.team, caster.pos, radius))
      for (const e of fx) applyEffect(world, a, e, caster.id, caster.pos);
  }
  impact(ctx, caster.pos, radius);
};

// ------------------------------------------------------------------ summon

const summonHandler: Handler = (ctx) => {
  const { world, caster, skill } = ctx;
  emitCast(ctx);
  if (!skill.summon) return;
  const def = DB.monsters.get(skill.summon);
  if (!def) return;
  const count = Math.max(1, Math.round(p(ctx, 'count', 1)));
  const maxSummons = Math.max(count, Math.round(p(ctx, 'maxSummons', count)));
  const dur = p(ctx, 'duration');
  const level = Math.max(1, Math.round(p(ctx, 'summonLevel', caster.level)));
  // Enforce cap: dismiss the oldest.
  const mine: Actor[] = [];
  for (const e of world.entities.values())
    if (e.kind === 'monster' && e.ownerId === caster.id && e.defId === def.id && e.alive && e.life > 0)
      mine.push(e);
  while (mine.length + count > maxSummons && mine.length > 0) {
    const old = mine.shift() as Actor;
    old.life = 0;
    old.lastHitBy = undefined;
  }
  const around = p(ctx, 'atTarget') > 0 ? clampAim(ctx, p(ctx, 'range', 10)) : caster.pos;
  for (let i = 0; i < count; i++) {
    const a = ctx.angle + (i / Math.max(1, count)) * Math.PI * 2;
    const raw = { x: around.x + Math.cos(a) * 1.2, y: around.y + Math.sin(a) * 1.2 };
    const pos = nearestStandable(world.level?.map, caster.pos, raw, 0.4);
    spawnSummon(world, {
      def,
      level,
      pos,
      owner: caster,
      lifePct: p(ctx, 'lifePct', 100),
      damagePct: p(ctx, 'damagePct', 100),
      skillId: skill.id,
      expireAt: dur > 0 ? world.time + dur : undefined,
    });
  }
  impact(ctx, around, 1.5);
};

// ------------------------------------------------------------------ utility

const utilityHandler: Handler = (ctx) => {
  const { world, caster, skill } = ctx;
  emitCast(ctx);
  const heal = p(ctx, 'healPct');
  if (heal > 0) healActor(world, caster, (caster.stats.lifeMax * heal) / 100);
  const mana = p(ctx, 'manaPct');
  if (mana > 0)
    caster.mana = Math.min(caster.stats.manaMax, caster.mana + (caster.stats.manaMax * mana) / 100);

  const pullR = p(ctx, 'pullRadius');
  if (pullR > 0) {
    const dist = p(ctx, 'pullDist', 3);
    for (const a of hostilesNear(world, caster.team, caster.pos, pullR)) {
      const dx = caster.pos.x - a.pos.x;
      const dy = caster.pos.y - a.pos.y;
      const l = Math.hypot(dx, dy);
      if (l < 1.2) continue;
      const m = Math.min(dist, l - 1);
      moveWithCollision(world.level?.map, a.pos, (dx / l) * m, (dy / l) * m, a.radius);
      a.path = [];
    }
    invalidateActorGrid(world);
  }

  const remR = p(ctx, 'remnantRadius');
  if (remR > 0) {
    const chance = p(ctx, 'remnantChance', 100);
    for (const e of [...world.entities.values()]) {
      if (e.kind !== 'remnant' || e.used || !e.alive) continue;
      if (Math.hypot(e.pos.x - caster.pos.x, e.pos.y - caster.pos.y) > remR) continue;
      e.used = true;
      e.alive = false;
      const rh = p(ctx, 'remnantHealPct');
      if (rh > 0) healActor(world, caster, (caster.stats.lifeMax * rh) / 100);
      const md = DB.monsters.get(e.monsterDefId);
      if (md && world.lootRng.percent(chance)) {
        const res = rollDrops(
          {
            treasureClass: md.treasure.normal,
            monsterLevel: caster.level,
            magicFind: caster.stats.raw.magicFind ?? 0,
            goldFind: caster.stats.raw.goldFind ?? 0,
            players: 1,
            rank: 'normal',
          },
          world.lootRng,
        );
        for (const it of res.items) spawnGroundItem(world, it, e.pos);
      }
    }
  }

  if (skill.mods || skill.damage || p(ctx, 'radius') > 0) warcryHandler(ctx);
};

const passiveHandler: Handler = () => undefined;

export const KIND_HANDLERS: Record<SkillKind, Handler> = {
  meleeAttack: (ctx) => meleeHandler(ctx, ctx.range),
  missile: missileHandler,
  multiMissile: multiMissileHandler,
  nova: novaHandler,
  area: areaHandler,
  beam: beamHandler,
  chain: chainHandler,
  wall: wallHandler,
  trail: trailHandler,
  movement: movementHandler,
  whirl: () => undefined, // driven by the action runtime
  buff: buffHandler,
  aura: buffHandler,
  warcry: warcryHandler,
  summon: summonHandler,
  utility: utilityHandler,
  passive: passiveHandler,
};
