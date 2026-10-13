/**
 * Soft auto-aim for gamepad and touch (D2R controller style): choose the nearest hostile in front
 * of the player, and find interactables (NPCs, items, objects) for the "use" button.
 */
import type { EntityId, Vec2 } from '../../core/types';
import type { Actor, Entity, PlayerEntity } from '../../core/sim/entities';
import type { WorldView } from '../../core/sim/world';
import { getSkillRange } from '../../core/skills/runtime';

export interface AutoTargetQuery {
  from: Vec2;
  /** Preferred aim direction (sim plane, need not be normalized). Zero = no preference. */
  facing: Vec2;
  /** Max center distance in tiles (target radius is added on top). */
  range: number;
  /** Targets beyond this half-angle (radians) from facing are ignored. Default π (all around). */
  maxAngle?: number;
  /**
   * How strongly being off-axis is penalized: score = dist * (1 + frontBias * (1 - cos θ)).
   * 0 = pure nearest. Default 0.75 (a monster straight ahead beats one slightly closer behind).
   */
  frontBias?: number;
}

const DEAD_MODES = new Set(['dying', 'dead']);

export function getLocalPlayer(view: WorldView | null | undefined): Readonly<PlayerEntity> | null {
  if (!view || view.localPlayerId == null) return null;
  const e = view.get(view.localPlayerId);
  return e && e.kind === 'player' ? (e as Readonly<PlayerEntity>) : null;
}

/** Is this entity something the local player may attack? */
export function isHostile(e: Readonly<Entity>): boolean {
  if (e.kind !== 'monster' || !e.alive) return false;
  const a = e as Readonly<Actor>;
  return a.team === 'monsters' && a.life > 0 && !DEAD_MODES.has(a.mode);
}

/** Things the "use"/tap action interacts with (talk, pick up, open). */
export function isInteractable(e: Readonly<Entity>): boolean {
  if (!e.alive) return false;
  if (e.kind === 'npc' || e.kind === 'groundItem') return true;
  if (e.kind === 'object')
    return !(e as { used?: boolean }).used || (e as { defId: string }).defId !== 'chest';
  return false;
}

/** Score candidate entities; lower is better. Returns null when nothing qualifies. */
export function pickBest(
  candidates: Iterable<Readonly<Entity>>,
  q: AutoTargetQuery,
  filter: (e: Readonly<Entity>) => boolean,
): EntityId | null {
  const maxAngle = q.maxAngle ?? Math.PI;
  const bias = q.frontBias ?? 0.75;
  const fl = Math.hypot(q.facing.x, q.facing.y);
  let best: EntityId | null = null;
  let bestScore = Infinity;
  for (const e of candidates) {
    if (!filter(e)) continue;
    const dx = e.pos.x - q.from.x;
    const dy = e.pos.y - q.from.y;
    const d = Math.hypot(dx, dy);
    if (d > q.range + e.radius) continue;
    let cos = 1;
    if (fl > 1e-9 && d > 1e-6) {
      cos = (dx * q.facing.x + dy * q.facing.y) / (d * fl);
      if (Math.acos(Math.max(-1, Math.min(1, cos))) > maxAngle) continue;
    }
    const score = d * (1 + bias * (1 - cos));
    if (score < bestScore) {
      bestScore = score;
      best = e.id;
    }
  }
  return best;
}

export function findAutoTarget(view: WorldView, q: AutoTargetQuery): EntityId | null {
  return pickBest(view.all(), q, isHostile);
}

export function findInteractTarget(view: WorldView, q: AutoTargetQuery): EntityId | null {
  return pickBest(view.all(), q, isInteractable);
}

/**
 * Search radius used for soft auto-aim: skill range plus a margin so melee heroes still lock onto
 * a monster a few steps away (the sim walks into range, like D2 click-to-attack).
 */
export function autoAimRadius(skillRange: number): number {
  return Math.max(skillRange * 1.2, skillRange + 3);
}

/** Skill range for the local player (delegates to the sim's skills runtime). */
export function skillRangeFor(view: WorldView | null | undefined, skillId: string): number {
  const p = getLocalPlayer(view);
  if (!p) return 1.5;
  try {
    return getSkillRange(p as Actor, skillId);
  } catch {
    return 1.5;
  }
}

/** Facing as a unit vector. */
export function facingVec(facing: number): Vec2 {
  return { x: Math.cos(facing), y: Math.sin(facing) };
}

export interface AimResult {
  targetId?: EntityId;
  targetPos?: Vec2;
}

/**
 * Resolve where a skill goes when the player just "presses the button": nearest hostile in front
 * within the soft-aim radius, else a point straight ahead at skill range.
 */
export function resolveAutoAim(
  view: WorldView | null | undefined,
  skillId: string,
  preferDir?: Vec2,
  finder?: (range: number, dir: Vec2) => EntityId | null,
): AimResult {
  const p = getLocalPlayer(view);
  if (!view || !p) return {};
  const range = skillRangeFor(view, skillId);
  const dir = preferDir && Math.hypot(preferDir.x, preferDir.y) > 1e-6 ? preferDir : facingVec(p.facing);
  const radius = autoAimRadius(range);
  const id = finder ? finder(radius, dir) : findAutoTarget(view, { from: p.pos, facing: dir, range: radius });
  if (id != null) return { targetId: id };
  const l = Math.hypot(dir.x, dir.y) || 1;
  const reach = Math.max(range, 1);
  return { targetPos: { x: p.pos.x + (dir.x / l) * reach, y: p.pos.y + (dir.y / l) * reach } };
}
