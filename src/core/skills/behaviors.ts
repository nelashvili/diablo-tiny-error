/**
 * Built-in behaviors. `basicAttack` backs the free skills `attack` and `throw`:
 * melee, or a missile chosen by the equipped weapon class / the monster's MonsterDef.missile.
 */
import { DB } from '../../data/db';
import type { SkillDef } from '../../data/schema';
import { RANGED_WEAPON_MISSILE, UNARMED_RANGE, getEquippedWeapon } from '../player/weapon';
import type { Actor } from '../sim/entities';
import { monsterDefOf } from '../sim/systems/util';
import { emitCast, meleeHandler } from './handlers';
import { getSkillLevel } from './level';
import { registerSkillBehavior } from './registry';
import { buildAttackSpec } from './spec';
import { spawnMissile } from './spawn';

export const BASIC_RANGED_RANGE = 10;

/** Missile def id for a ranged basic attack by this actor, or undefined for melee. */
export function basicMissileFor(actor: Actor): string | undefined {
  const md = monsterDefOf(actor);
  if (md) return md.missile && md.attackRange > 2.5 ? md.missile : undefined;
  const wc = getEquippedWeapon(actor)?.weaponClass;
  return wc ? RANGED_WEAPON_MISSILE[wc] : undefined;
}

const isThrow = (s: SkillDef): boolean => s.id === 'throw';

registerSkillBehavior('basicAttack', {
  range(actor, skill) {
    const missile = basicMissileFor(actor);
    if (missile || isThrow(skill)) return BASIC_RANGED_RANGE;
    const md = monsterDefOf(actor);
    if (md) return md.attackRange;
    return getEquippedWeapon(actor)?.range ?? UNARMED_RANGE;
  },
  canUse(_world, actor, skill) {
    if (isThrow(skill)) {
      const wc = getEquippedWeapon(actor)?.weaponClass;
      return wc === 'javelin' || wc === 'throwingDisc';
    }
    return true;
  },
  fire(ctx) {
    const { world, caster, skill } = ctx;
    const missile = basicMissileFor(caster);
    if (!missile) {
      meleeHandler(ctx, ctx.range);
      return;
    }
    emitCast(ctx);
    const payload = buildAttackSpec(caster, skill, getSkillLevel(caster, skill.id) || 1, 'missile', {
      useWeapon: true,
    });
    const start = {
      x: caster.pos.x + Math.cos(ctx.angle) * 0.5,
      y: caster.pos.y + Math.sin(ctx.angle) * 0.5,
    };
    spawnMissile(world, caster, {
      defId: DB.missiles.has(missile) ? missile : 'blasturBolt',
      pos: start,
      angle: ctx.angle,
      payload,
      skillId: skill.id,
      skillLevel: ctx.level,
      range: BASIC_RANGED_RANGE + 2,
    });
  },
});
