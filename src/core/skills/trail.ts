/** Trail skills (Burning Trail): while the 'trail:<skillId>' buff is active, moving drops damaging areas. */
import { DB } from '../../data/db';
import type { Actor } from '../sim/entities';
import type { SimWorld } from '../sim/world';
import type { Vec2 } from '../types';
import { skillParam } from './level';
import { buildAttackSpec } from './spec';
import { spawnArea } from './spawn';

export const TRAIL_PREFIX = 'trail:';
const lastDrop = new WeakMap<Actor, Vec2>();

export function tickTrails(world: SimWorld, a: Actor, _dt: number): void {
  for (const b of a.buffs) {
    if (!b.id.startsWith(TRAIL_PREFIX)) continue;
    const skill = DB.skills.get(b.id.slice(TRAIL_PREFIX.length));
    if (!skill) continue;
    const last = lastDrop.get(a);
    const gap = skillParam(a, skill, 'spacing', b.level, 0.9);
    if (last && Math.hypot(a.pos.x - last.x, a.pos.y - last.y) < gap) continue;
    lastDrop.set(a, { x: a.pos.x, y: a.pos.y });
    spawnArea(world, a, {
      skill,
      level: b.level,
      pos: a.pos,
      radius: skillParam(a, skill, 'radius', b.level, 1),
      duration: skillParam(a, skill, 'areaDuration', b.level, 2),
      tickEverySec: skillParam(a, skill, 'tickInterval', b.level, 0.5),
      payload: buildAttackSpec(a, skill, b.level, 'spell'),
    });
  }
}
