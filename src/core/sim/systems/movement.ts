/**
 * Movement: joystick steering, path following (findPath on moveTo), walk/run speeds,
 * wall collision with sliding, and soft actor separation.
 */
import { DB } from '../../../data/db';
import { findPath } from '../../world/pathfinding';
import type { Actor } from '../entities';
import { isActor } from '../entities';
import type { SimSystem, SimWorld } from '../world';
import { moveWithCollision } from './collision';
import { getSlowFactor } from './effects';
import { getMoveDir, navOf } from './intent';
import { queryActors, rebuildActorGrid } from './spatial';
import { isTargetable, setMode } from './util';

export const PLAYER_WALK_SPEED = 4.0;
export const PLAYER_RUN_SPEED = 6.0;
const STUCK_GIVE_UP_SEC = 0.6;

/** Base tiles/second for an actor (before moveSpeedMul and slows). */
export function baseSpeed(a: Actor, running: boolean): number {
  if (a.kind === 'player' || a.kind === 'merc') {
    return running ? PLAYER_RUN_SPEED : PLAYER_WALK_SPEED;
  }
  const md = DB.monsters.get(a.defId);
  const walk = md?.walkSpeed ?? PLAYER_WALK_SPEED;
  return running ? (md?.runSpeed ?? walk * 1.5) : walk;
}

function canMove(a: Actor): boolean {
  if (a.action) return false;
  return a.mode === 'idle' || a.mode === 'walk' || a.mode === 'run';
}

function stepActor(world: SimWorld, a: Actor, dt: number): void {
  const map = world.level?.map;
  const nav = navOf(a);
  const dir = getMoveDir(a);
  // No stamina: players run for as long as they like.
  const wantRun = a.running;

  let moved = 0;
  const mul = a.stats.moveSpeedMul * getSlowFactor(a);

  if (dir) {
    const len = Math.min(1, Math.hypot(dir.x, dir.y));
    const speed = baseSpeed(a, wantRun) * mul * len;
    const l = Math.hypot(dir.x, dir.y) || 1;
    const vx = dir.x / l;
    const vy = dir.y / l;
    moved = moveWithCollision(map, a.pos, vx * speed * dt, vy * speed * dt, a.radius);
    if (moved > 0) a.facing = Math.atan2(vy, vx);
  } else {
    if (a.moveTarget && a.path.length === 0) {
      const d = Math.hypot(a.moveTarget.x - a.pos.x, a.moveTarget.y - a.pos.y);
      if (d > 0.12) {
        const p = map ? findPath(map, a.pos, a.moveTarget, { radius: a.radius }) : null;
        if (p && p.length > 0) {
          a.path = p.map((q) => ({ x: q.x, y: q.y }));
          const first = a.path[0];
          if (first && Math.hypot(first.x - a.pos.x, first.y - a.pos.y) < 0.2 && a.path.length > 1)
            a.path.shift();
        } else a.path = [{ x: a.moveTarget.x, y: a.moveTarget.y }];
      } else a.moveTarget = undefined;
    }
    if (a.path.length > 0) {
      const speed = baseSpeed(a, wantRun) * mul;
      let remaining = speed * dt;
      let guard = 0;
      while (remaining > 1e-6 && a.path.length > 0 && guard++ < 6) {
        const tgt = a.path[0] as { x: number; y: number };
        const dx = tgt.x - a.pos.x;
        const dy = tgt.y - a.pos.y;
        const d = Math.hypot(dx, dy);
        if (d <= remaining + 1e-6) {
          const got = moveWithCollision(map, a.pos, dx, dy, a.radius);
          moved += got;
          remaining -= d;
          if (d > 1e-6) a.facing = Math.atan2(dy, dx);
          a.path.shift();
          if (got < d * 0.5) break;
        } else {
          const got = moveWithCollision(map, a.pos, (dx / d) * remaining, (dy / d) * remaining, a.radius);
          moved += got;
          a.facing = Math.atan2(dy, dx);
          remaining = 0;
        }
      }
      if (a.path.length === 0) a.moveTarget = undefined;
      // Blocked? give up after a moment.
      if (moved < speed * dt * 0.2) {
        nav.stuck += dt;
        if (nav.stuck > STUCK_GIVE_UP_SEC) {
          a.path = [];
          a.moveTarget = undefined;
          nav.stuck = 0;
        }
      } else nav.stuck = 0;
    }
  }

  if (moved > 1e-4) {
    setMode(a, wantRun ? 'run' : 'walk');
  } else if (a.mode === 'walk' || a.mode === 'run') {
    setMode(a, 'idle');
  }
}

/** Push overlapping actors apart (players and npcs are immovable by others). */
function separate(world: SimWorld): void {
  const map = world.level?.map;
  const near: Actor[] = [];
  for (const e of world.entities.values()) {
    if (!isActor(e) || !e.alive || !isTargetable(e) || e.kind === 'npc') continue;
    const a: Actor = e;
    queryActors(world, a.pos, a.radius + 0.2, near);
    for (const b of near) {
      if (b.id <= a.id || !isTargetable(b)) continue;
      let dx = a.pos.x - b.pos.x;
      let dy = a.pos.y - b.pos.y;
      let d = Math.hypot(dx, dy);
      const minD = (a.radius + b.radius) * 0.9;
      if (d >= minD) continue;
      if (d < 1e-4) {
        dx = a.id % 2 ? 1 : -1;
        dy = b.id % 2 ? 1 : -1;
        d = Math.hypot(dx, dy);
      }
      const push = (minD - d) * 0.35;
      const wa = a.kind === 'player' || a.kind === 'merc' ? 0 : 1;
      const wb = b.kind === 'player' || b.kind === 'merc' || b.kind === 'npc' ? 0 : 1;
      const wsum = wa + wb;
      if (wsum === 0) continue;
      const ux = dx / d;
      const uy = dy / d;
      if (wa)
        moveWithCollision(map, a.pos, ux * push * (wa / wsum) * 2, uy * push * (wa / wsum) * 2, a.radius);
      if (wb)
        moveWithCollision(map, b.pos, -ux * push * (wb / wsum) * 2, -uy * push * (wb / wsum) * 2, b.radius);
    }
  }
}

export function createMovementSystem(): SimSystem {
  return {
    name: 'movement',
    update(world, dt) {
      for (const e of world.entities.values()) {
        if (!isActor(e) || !e.alive) continue;
        const a: Actor = e;
        if (a.kind === 'npc') continue;
        if (!isTargetable(a)) continue;
        if (canMove(a)) stepActor(world, a, dt);
      }
      rebuildActorGrid(world);
      separate(world);
      rebuildActorGrid(world);
    },
  };
}
