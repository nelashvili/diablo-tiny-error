/** Missiles (move, wall/actor collision, pierce, explode, homing) and lingering areas. */
import { DB } from '../../../data/db';
import { resolveAttack } from '../../combat/resolve';
import type { AttackSpec, CombatantView } from '../../combat/types';
import { skillParam } from '../../skills/level';
import type { Actor, AreaEntity, MissileEntity } from '../entities';
import type { SimSystem, SimWorld } from '../world';
import { applyAttackResult } from './damage';
import { blocksMissilesAt } from './collision';
import { hostilesNear, queryActors } from './spatial';
import { isHostile, isTargetable, toCombatant } from './util';

const HOMING_TURN_RATE = 5; // rad/s
const scratch: Actor[] = [];

function attackerView(
  world: SimWorld,
  snap: CombatantView | undefined,
  ownerId: number,
): CombatantView | undefined {
  if (snap) return snap;
  const o = world.get(ownerId);
  return o && (o.kind === 'player' || o.kind === 'monster' || o.kind === 'merc' || o.kind === 'npc')
    ? toCombatant(o)
    : undefined;
}

function ownerActor(world: SimWorld, id: number): Actor | undefined {
  const o = world.get(id);
  return o && (o.kind === 'player' || o.kind === 'monster' || o.kind === 'merc' || o.kind === 'npc')
    ? o
    : undefined;
}

function applyPayload(
  world: SimWorld,
  snap: CombatantView | undefined,
  ownerId: number,
  target: Actor,
  spec: AttackSpec,
  skillId: string | undefined,
  pos: { x: number; y: number },
): void {
  const view = attackerView(world, snap, ownerId);
  if (!view) return;
  const res = resolveAttack(view, toCombatant(target), spec, world.combatRng);
  applyAttackResult(world, ownerActor(world, ownerId), target, res, {
    melee: false,
    skillId,
    sourceId: ownerId,
    pos,
  });
}

function skillOf(world: SimWorld, m: MissileEntity): { explode?: number; pierce: number } {
  const def = DB.missiles.get(m.defId);
  const skill = m.skillId ? DB.skills.get(m.skillId) : undefined;
  let explode = def?.explodeRadius;
  let pierce = def?.pierce ? 100 : 0;
  if (skill && skill.params) {
    const owner = ownerActor(world, m.ownerId);
    if (owner) {
      const e = skillParam(owner, skill, 'explodeRadius', m.skillLevel, -1);
      if (e >= 0) explode = e;
      pierce += skillParam(owner, skill, 'pierce', m.skillLevel);
    }
  }
  pierce += m.casterSnapshot?.stats.raw.pierce ?? 0;
  return { explode, pierce };
}

function explode(world: SimWorld, m: MissileEntity, radius: number, skip: Actor | undefined): void {
  for (const a of hostilesNear(world, m.team, m.pos, radius)) {
    if (a === skip || m.hitIds.includes(a.id)) continue;
    applyPayload(world, m.casterSnapshot, m.ownerId, a, m.payload, m.skillId, m.pos);
  }
  const skill = m.skillId ? DB.skills.get(m.skillId) : undefined;
  world.emit({
    type: 'skillImpact',
    skillId: m.skillId ?? m.defId,
    pos: { x: m.pos.x, y: m.pos.y },
    radius,
    vfx: skill?.vfx ?? DB.missiles.get(m.defId)?.vfx ?? '',
  });
}

function stepMissile(world: SimWorld, m: MissileEntity, dt: number): void {
  const map = world.level?.map;
  const speed = Math.hypot(m.velocity.x, m.velocity.y);

  if (m.homingTargetId !== undefined) {
    const t = world.get(m.homingTargetId);
    if (t && (t.kind === 'monster' || t.kind === 'player' || t.kind === 'merc') && isTargetable(t)) {
      const want = Math.atan2(t.pos.y - m.pos.y, t.pos.x - m.pos.x);
      let d = want - m.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const turn = Math.max(-HOMING_TURN_RATE * dt, Math.min(HOMING_TURN_RATE * dt, d));
      m.facing += turn;
      m.velocity.x = Math.cos(m.facing) * speed;
      m.velocity.y = Math.sin(m.facing) * speed;
    }
  }

  const dist = speed * dt;
  const n = Math.max(1, Math.ceil(dist / 0.4));
  const sx = (m.velocity.x * dt) / n;
  const sy = (m.velocity.y * dt) / n;
  const info = skillOf(world, m);
  for (let i = 0; i < n; i++) {
    m.pos.x += sx;
    m.pos.y += sy;
    m.traveled += dist / n;

    if (blocksMissilesAt(map, m.pos.x, m.pos.y)) {
      m.pos.x -= sx;
      m.pos.y -= sy;
      world.emit({ type: 'missileHit', missileId: m.id, pos: { x: m.pos.x, y: m.pos.y } });
      if (info.explode) explode(world, m, info.explode, undefined);
      m.alive = false;
      return;
    }

    queryActors(world, m.pos, m.radius, scratch);
    let victim: Actor | undefined;
    let best = Infinity;
    for (const a of scratch) {
      if (a.kind === 'npc' || !isHostile(m, a) || !isTargetable(a) || m.hitIds.includes(a.id)) continue;
      const d = Math.hypot(a.pos.x - m.pos.x, a.pos.y - m.pos.y);
      if (d < best) {
        best = d;
        victim = a;
      }
    }
    if (victim) {
      m.hitIds.push(victim.id);
      world.emit({
        type: 'missileHit',
        missileId: m.id,
        pos: { x: m.pos.x, y: m.pos.y },
        targetId: victim.id,
      });
      applyPayload(world, m.casterSnapshot, m.ownerId, victim, m.payload, m.skillId, m.pos);
      const pierces = info.pierce > 0 && (info.pierce >= 100 || world.combatRng.percent(info.pierce));
      if (info.explode && !pierces) explode(world, m, info.explode, victim);
      if (!pierces) {
        m.alive = false;
        return;
      }
    }
    if (m.traveled >= m.range) {
      m.alive = false;
      return;
    }
  }
}

function tickArea(world: SimWorld, ar: AreaEntity): void {
  for (const a of hostilesNear(world, ar.team, ar.pos, ar.radius)) {
    applyPayload(world, ar.casterSnapshot, ar.ownerId, a, ar.payload, ar.defId, ar.pos);
  }
  world.emit({
    type: 'skillImpact',
    skillId: ar.defId,
    pos: { x: ar.pos.x, y: ar.pos.y },
    radius: ar.radius,
    vfx: ar.vfx,
  });
}

export function createMissileSystem(): SimSystem {
  return {
    name: 'missiles',
    update(world, dt) {
      for (const e of world.entities.values()) {
        if (e.kind === 'missile' && e.alive) stepMissile(world, e, dt);
      }
    },
  };
}

export function createAreaSystem(): SimSystem {
  return {
    name: 'areas',
    update(world, dt) {
      for (const e of world.entities.values()) {
        if (e.kind !== 'area' || !e.alive) continue;
        e.tickTimer -= dt;
        let guard = 0;
        while (e.tickTimer <= 1e-9 && guard++ < 4) {
          tickArea(world, e);
          e.tickTimer += e.tickEverySec;
        }
        e.remainingSec -= dt;
        if (e.remainingSec <= 1e-6) e.alive = false;
      }
    },
  };
}
