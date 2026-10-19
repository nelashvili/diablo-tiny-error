/**
 * Targeting: turns the player's pending intent (attack target, pick up, talk, use object) into
 * movement until in range, then starts the skill / performs the interaction.
 */
import { pickupGroundItem } from '../../player/inventory';
import { getSkillBlockReason, getSkillRange, startSkill } from '../../skills/runtime';
import { DB } from '../../../data/db';
import { isActor, type Actor, type Entity } from '../entities';
import type { SimSystem, SimWorld } from '../world';
import { CommandHandlers } from './commandHandlers';
import { clearMovement, getIntent, navOf, setIntent } from './intent';
import { isHostile, isTargetable } from './util';

export const PICKUP_RANGE = 1.5;
export const INTERACT_RANGE = 2.4;
const REPATH_SEC = 0.4;

function chase(p: Actor, to: { x: number; y: number }, dt: number): void {
  const nav = navOf(p);
  nav.repath -= dt;
  const mt = p.moveTarget;
  if (!mt || nav.repath <= 0 || Math.hypot(mt.x - to.x, mt.y - to.y) > 1) {
    p.moveTarget = { x: to.x, y: to.y };
    p.path = [];
    nav.repath = REPATH_SEC;
  }
}

const dist = (a: Actor, e: Entity): number => Math.hypot(a.pos.x - e.pos.x, a.pos.y - e.pos.y);

function stopChase(p: Actor): void {
  p.path = [];
  p.moveTarget = undefined;
}

/**
 * After the hero's target falls, the next foe to keep swinging at: the nearest hostile already
 * fighting the hero and already within the attack's reach. Never starts a chase or a new fight.
 */
export function nextAutoTarget(world: SimWorld, p: Actor, range: number): Actor | undefined {
  let best: Actor | undefined;
  let bestD = Infinity;
  for (const e of world.entities.values()) {
    if (!isActor(e) || e.kind === 'npc' || !isTargetable(e) || !isHostile(p, e)) continue;
    if (e.targetId !== p.id) continue;
    const d = dist(p, e) - e.radius;
    if (d <= range && d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

export function interactWithObject(world: SimWorld, p: Actor, obj: Entity): void {
  if (p.kind !== 'player' || obj.kind !== 'object') return;
  // Exits route through the takeExit handler; everything else is announced via `objectUsed`
  // (chests, shrines, waypoints and quest objects are handled by their own modules).
  if (obj.defId === 'exit') {
    if (!CommandHandlers.dispatch(world, p, { type: 'takeExit', objectId: obj.id }))
      world.emit({ type: 'toast', textKey: 'toast.notAvailable' });
    return;
  }
  world.emit({ type: 'objectUsed', id: obj.id, defId: obj.defId });
}

export function createTargetingSystem(): SimSystem {
  return {
    name: 'targeting',
    update(world, dt) {
      for (const e of world.entities.values()) {
        if (e.kind !== 'player' || !e.alive) continue;
        const p = e;
        const intent = getIntent(p);
        if (!intent) continue;
        if (!isTargetable(p)) {
          setIntent(p, undefined);
          continue;
        }
        switch (intent.kind) {
          case 'skill': {
            const tgt = intent.targetId !== undefined ? world.get(intent.targetId) : undefined;
            if (intent.targetId !== undefined) {
              if (!tgt || !isActor(tgt) || !isTargetable(tgt)) {
                const next = nextAutoTarget(world, p, getSkillRange(p, intent.skillId));
                if (next) {
                  setIntent(p, { ...intent, targetId: next.id, targetPos: { x: next.pos.x, y: next.pos.y } });
                  p.targetId = next.id;
                } else {
                  setIntent(p, undefined);
                  stopChase(p);
                }
                break;
              }
            }
            if (p.action || p.mode === 'hit' || p.mode === 'block') break; // wait for the current action
            const tActor = tgt && isActor(tgt) ? tgt : undefined;
            const range = getSkillRange(p, intent.skillId);
            const d = tActor ? dist(p, tActor) - tActor.radius : 0;
            if (tActor && d > range && !intent.standStill) {
              chase(p, tActor.pos, dt);
              break;
            }
            const reason = getSkillBlockReason(world, p, intent.skillId);
            if (reason === null) {
              stopChase(p);
              startSkill(world, p, intent.skillId, { id: intent.targetId, pos: intent.targetPos });
              if (!tActor) setIntent(p, undefined); // ground-targeted skills are one-shot
            } else if (reason === 'cooldown' || reason === 'busy') {
              /* wait */
            } else {
              if (reason === 'mana') world.emit({ type: 'toast', textKey: 'toast.notEnoughMana' });
              else if (reason === 'weapon') world.emit({ type: 'toast', textKey: 'toast.wrongWeapon' });
              setIntent(p, undefined);
              stopChase(p);
            }
            break;
          }
          case 'pickup': {
            const g = world.get(intent.targetId);
            if (!g || g.kind !== 'groundItem' || !g.alive) {
              setIntent(p, undefined);
              break;
            }
            if (dist(p, g) <= PICKUP_RANGE) {
              stopChase(p);
              pickupGroundItem(world, p, g);
              setIntent(p, undefined);
            } else chase(p, g.pos, dt);
            break;
          }
          case 'talk': {
            const n = world.get(intent.npcId);
            if (!n || !isActor(n)) {
              setIntent(p, undefined);
              break;
            }
            if (dist(p, n) <= INTERACT_RANGE) {
              clearMovement(p);
              setIntent(p, undefined);
              const handled = CommandHandlers.dispatch(world, p, {
                type: 'talk',
                npcId: n.id,
                option: intent.option,
              });
              if (!handled) {
                const line = DB.npcs.get(n.defId)?.dialogue[0];
                if (line) world.emit({ type: 'dialogue', npcId: n.id, lineKey: line });
                else world.emit({ type: 'toast', textKey: 'toast.notAvailable' });
              }
            } else chase(p, n.pos, dt);
            break;
          }
          case 'object': {
            const o = world.get(intent.targetId);
            if (!o || o.kind !== 'object') {
              setIntent(p, undefined);
              break;
            }
            if (dist(p, o) <= INTERACT_RANGE) {
              clearMovement(p);
              setIntent(p, undefined);
              interactWithObject(world, p, o);
            } else chase(p, o.pos, dt);
            break;
          }
        }
      }
    },
  };
}
