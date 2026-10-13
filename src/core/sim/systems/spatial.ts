/**
 * Uniform spatial hash of actors, rebuilt lazily (once per tick after movement, or whenever the
 * entity count changed). Queries return candidates by edge distance; callers filter state.
 */
import type { Team, Vec2 } from '../../types';
import { isActor, type Actor } from '../entities';
import type { SimWorld } from '../world';
import { isHostile, isTargetable } from './util';

/** Targetable enemies of `team` whose edge is within `radius` of `pos` (npcs excluded). */
export function hostilesNear(
  world: SimWorld,
  team: Team,
  pos: Vec2,
  radius: number,
  out: Actor[] = [],
): Actor[] {
  queryActors(world, pos, radius, out);
  let n = 0;
  for (let i = 0; i < out.length; i++) {
    const a = out[i] as Actor;
    if (a.kind !== 'npc' && isHostile({ team }, a) && isTargetable(a)) out[n++] = a;
  }
  out.length = n;
  return out;
}

const CELL = 4;

interface Grid {
  tick: number;
  size: number;
  cells: Map<number, Actor[]>;
}

const grids = new WeakMap<SimWorld, Grid>();

const key = (cx: number, cy: number): number => (cx + 4096) * 8192 + (cy + 4096);

export function rebuildActorGrid(world: SimWorld): void {
  let g = grids.get(world);
  if (!g) {
    g = { tick: -1, size: -1, cells: new Map() };
    grids.set(world, g);
  }
  for (const arr of g.cells.values()) arr.length = 0;
  for (const e of world.entities.values()) {
    if (!isActor(e) || !e.alive) continue;
    const k = key(Math.floor(e.pos.x / CELL), Math.floor(e.pos.y / CELL));
    let arr = g.cells.get(k);
    if (!arr) g.cells.set(k, (arr = []));
    arr.push(e);
  }
  g.tick = world.tick;
  g.size = world.entities.size;
}

function ensureGrid(world: SimWorld): Grid {
  let g = grids.get(world);
  if (!g || g.tick !== world.tick || g.size !== world.entities.size) {
    rebuildActorGrid(world);
    g = grids.get(world) as Grid;
  }
  return g;
}

/** Force a rebuild on next query (call after teleporting many actors). */
export function invalidateActorGrid(world: SimWorld): void {
  const g = grids.get(world);
  if (g) g.size = -1;
}

/**
 * Actors whose edge is within `radius` of `pos` (center distance <= radius + actor.radius).
 * Fills and returns `out` (cleared first).
 */
export function queryActors(world: SimWorld, pos: Vec2, radius: number, out: Actor[] = []): Actor[] {
  out.length = 0;
  const g = ensureGrid(world);
  // Margin: positions may have drifted a little since the grid was built, and radii vary.
  const reach = radius + 2.5;
  const x0 = Math.floor((pos.x - reach) / CELL);
  const x1 = Math.floor((pos.x + reach) / CELL);
  const y0 = Math.floor((pos.y - reach) / CELL);
  const y1 = Math.floor((pos.y + reach) / CELL);
  for (let cy = y0; cy <= y1; cy++)
    for (let cx = x0; cx <= x1; cx++) {
      const arr = g.cells.get(key(cx, cy));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i] as Actor;
        if (!a.alive) continue;
        const dx = a.pos.x - pos.x;
        const dy = a.pos.y - pos.y;
        const rr = radius + a.radius;
        if (dx * dx + dy * dy <= rr * rr) out.push(a);
      }
    }
  return out;
}
