/**
 * The classic Forse powers, shared by heroes and enemies:
 *  - `forsePush`: cone (or ring) shove. Knockback scales with body weight; a wall slam hurts and stuns.
 *  - `forseGrip`: lifts one or more targets; they hang helpless taking Forse damage, then drop dazed.
 *  - `forseLightning`: forking lightning from the hands into a cone. Short repeating casts, so
 *    holding the button keeps it flowing (like Plasma Stream).
 * Enemy versions add a `telegraph` param so the wind-up is announced (see runtime.startSkill).
 */
import type { SkillDef } from '../../data/schema';
import type { AttackSpec, StatusEffectSpec } from '../combat/types';
import { angleTo } from '../math';
import type { Actor } from '../sim/entities';
import { dealAttack } from '../sim/systems/damage';
import { hostilesNear } from '../sim/systems/spatial';
import { isHostile, isTargetable } from '../sim/systems/util';
import type { Vec2 } from '../types';
import { arc, elementImpact, emitCast, impact } from './handlers';
import { skillParam } from './level';
import { registerSkillBehavior, type SkillFireContext } from './registry';
import { buildAttackSpec } from './spec';

const p = (ctx: SkillFireContext, name: string, fallback = 0): number =>
  skillParam(ctx.caster, ctx.skill, name, ctx.level, fallback);

const paramRange = (fallback: number) => (actor: Actor, skill: SkillDef, level: number) =>
  skillParam(actor, skill, 'range', level, fallback);

/** Hostiles within `range` whose direction is inside a cone of `arcDeg` around `angle` (360 = ring). */
export function inCone(ctx: SkillFireContext, range: number, arcDeg: number): Actor[] {
  const { world, caster } = ctx;
  const half = (arcDeg * Math.PI) / 360;
  const out: Actor[] = [];
  for (const a of hostilesNear(world, caster.team, caster.pos, range + 0.5)) {
    const dist = Math.hypot(a.pos.x - caster.pos.x, a.pos.y - caster.pos.y) - a.radius;
    if (dist > range) continue;
    if (arcDeg < 360) {
      let d = angleTo(caster.pos, a.pos) - ctx.angle;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      // Bodies hugging the caster count even if slightly off-angle.
      if (Math.abs(d) > half && dist > 0.6) continue;
    }
    out.push(a);
  }
  out.sort(
    (a, b) =>
      Math.hypot(a.pos.x - caster.pos.x, a.pos.y - caster.pos.y) -
      Math.hypot(b.pos.x - caster.pos.x, b.pos.y - caster.pos.y),
  );
  return out;
}

const ahead = (ctx: SkillFireContext, dist: number): Vec2 => ({
  x: ctx.caster.pos.x + Math.cos(ctx.angle) * dist,
  y: ctx.caster.pos.y + Math.sin(ctx.angle) * dist,
});

/** Average of a skill's rolled damage of one type (synergies included), 0 if it has none. */
function avgDamage(spec: AttackSpec, type: keyof NonNullable<AttackSpec['skillDamage']>): number {
  const r = spec.skillDamage?.[type];
  return r ? (r.min + r.max) / 2 : 0;
}

// ------------------------------------------------------------------ Push

registerSkillBehavior('forsePush', {
  range: paramRange(4),
  fire(ctx) {
    const { world, caster, skill } = ctx;
    emitCast(ctx);
    const range = p(ctx, 'range', 4);
    const arcDeg = p(ctx, 'arc', 90);
    const spec = buildAttackSpec(caster, skill, ctx.level, 'spell');
    const slam = avgDamage(spec, 'magic') * (1 + p(ctx, 'slamPct', 100) / 100);
    spec.effects = (spec.effects ?? []).map((e) => (e.kind === 'knockback' ? { ...e, slam } : e));
    for (const a of inCone(ctx, range, arcDeg))
      dealAttack(world, caster, a, { ...spec, blockable: false }, { skillId: skill.id });
    if (arcDeg >= 360) impact(ctx, caster.pos, range);
    else impact(ctx, ahead(ctx, range * 0.5), range * 0.6);
  },
});

// ------------------------------------------------------------------ Grip

registerSkillBehavior('forseGrip', {
  range: paramRange(8),
  fire(ctx) {
    const { world, caster, skill } = ctx;
    emitCast(ctx);
    const range = p(ctx, 'range', 8);
    let primary =
      ctx.targetActor && isHostile(caster, ctx.targetActor) && isTargetable(ctx.targetActor)
        ? ctx.targetActor
        : undefined;
    if (!primary) {
      let best = 2.5;
      for (const a of hostilesNear(world, caster.team, ctx.aim, 2.5)) {
        const d = Math.hypot(a.pos.x - ctx.aim.x, a.pos.y - ctx.aim.y);
        if (d < best) {
          best = d;
          primary = a;
        }
      }
    }
    if (!primary) return;
    if (Math.hypot(primary.pos.x - caster.pos.x, primary.pos.y - caster.pos.y) > range + 1.5) return;
    const targets: Actor[] = [primary];
    const extra = Math.max(0, Math.round(p(ctx, 'targets', 1)) - 1);
    if (extra > 0) {
      const near = hostilesNear(world, caster.team, primary.pos, 3).filter((a) => a !== primary);
      near.sort(
        (a, b) =>
          Math.hypot(a.pos.x - primary.pos.x, a.pos.y - primary.pos.y) -
          Math.hypot(b.pos.x - primary.pos.x, b.pos.y - primary.pos.y),
      );
      targets.push(...near.slice(0, extra));
    }
    const base = buildAttackSpec(caster, skill, ctx.level, 'spell');
    const liftSec = p(ctx, 'liftSec', 1.5);
    const lift: StatusEffectSpec = {
      kind: 'lifted',
      durationSec: liftSec,
      magnitude: avgDamage(base, 'magic'),
    };
    const spec: AttackSpec = { delivery: 'spell', useWeaponDamage: false, blockable: false, effects: [lift] };
    for (const t of targets) {
      dealAttack(world, caster, t, spec, { skillId: skill.id });
      arc(ctx, caster.pos, t.pos);
      impact(ctx, t.pos, 0.8, 'vfx.grip.lift');
    }
  },
});

// ------------------------------------------------------------------ Lightning

registerSkillBehavior('forseLightning', {
  range: paramRange(5),
  fire(ctx) {
    const { world, caster, skill } = ctx;
    emitCast(ctx);
    const range = p(ctx, 'range', 5);
    const forks = Math.max(1, Math.round(p(ctx, 'forks', 1)));
    const spec = buildAttackSpec(caster, skill, ctx.level, 'spell');
    // The aimed target first, then the nearest others in the cone.
    let targets = inCone(ctx, range, p(ctx, 'arc', 40));
    const t0 = ctx.targetActor;
    if (t0 && targets.includes(t0)) targets = [t0, ...targets.filter((a) => a !== t0)];
    targets = targets.slice(0, forks);
    const hand = ahead(ctx, 0.45);
    for (const a of targets) {
      dealAttack(world, caster, a, spec, { skillId: skill.id });
      arc(ctx, hand, a.pos);
      impact(ctx, a.pos, undefined, elementImpact(skill));
    }
    if (targets.length === 0) {
      // Nobody in reach: crackle into the air so the cast still reads.
      const spread = ((world.combatRng.next() - 0.5) * p(ctx, 'arc', 40) * Math.PI) / 180;
      const end = {
        x: caster.pos.x + Math.cos(ctx.angle + spread) * range * 0.8,
        y: caster.pos.y + Math.sin(ctx.angle + spread) * range * 0.8,
      };
      arc(ctx, hand, end);
    }
  },
});
