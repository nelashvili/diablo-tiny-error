import type { LevelScaled, SkillDef } from '../schema';

/**
 * Monster-only skills (ids prefixed m_). They have no class; `classId` is the empty string so class
 * UIs never list them (SkillDef.classId is typed non-optional, see contract request in the report).
 * Damage is mostly "use the monster's own damage range" (weaponDamagePct); monsters scale via
 * their stats, not skill levels.
 */

interface Spec {
  id: string;
  kind: SkillDef['kind'];
  d2Analog: string;
  anim: SkillDef['anim'];
  vfx: string;
  weaponDamagePct?: LevelScaled;
  damage?: SkillDef['damage'];
  params?: SkillDef['params'];
  effects?: SkillDef['effects'];
  missile?: string;
  summon?: string;
  cooldownSec?: LevelScaled;
  element?: SkillDef['element'];
  behavior?: string;
}

function mk(p: Spec): SkillDef {
  return {
    tree: 'monster',
    name: `skill.${p.id}`,
    description: `skill.${p.id}.desc`,
    reqLevel: 1,
    prereqs: [],
    ui: { col: 0, row: 0, icon: 'monster' },
    maxHardPoints: 20,
    manaCost: 0,
    leftClickable: false,
    ...p,
  };
}

export default [
  mk({
    id: 'm_claw',
    kind: 'meleeAttack',
    d2Analog: 'Monster Attack',
    anim: 'attack1',
    vfx: 'vfx.hit.claw',
    weaponDamagePct: 100,
  }),
  mk({
    id: 'm_slam',
    kind: 'meleeAttack',
    d2Analog: 'Zombie Smash',
    anim: 'attack2',
    vfx: 'vfx.hit.slam',
    weaponDamagePct: 120,
  }),
  mk({
    id: 'm_wraithTouch',
    kind: 'meleeAttack',
    d2Analog: 'Ghost Touch',
    anim: 'attack1',
    vfx: 'vfx.hit.wraith',
    weaponDamagePct: 0,
    damage: { magic: { min: 3, max: 6 } },
    element: 'magic',
  }),
  mk({
    id: 'm_blastur',
    kind: 'missile',
    d2Analog: 'Skeleton Archer Arrow',
    anim: 'throw',
    vfx: 'vfx.muzzle.red',
    weaponDamagePct: 100,
    missile: 'm_blasturBolt',
  }),
  mk({
    id: 'm_multishot',
    kind: 'multiMissile',
    d2Analog: 'Multishot',
    anim: 'throw',
    vfx: 'vfx.muzzle.red',
    weaponDamagePct: 70,
    missile: 'm_blasturBolt',
    params: { missiles: 5, spreadDeg: 40 },
    cooldownSec: 2,
  }),
  mk({
    id: 'm_quillSpike',
    kind: 'missile',
    d2Analog: 'Quill Rat Spike',
    anim: 'throw',
    vfx: 'vfx.muzzle.quill',
    weaponDamagePct: 100,
    missile: 'm_quill',
  }),
  mk({
    id: 'm_stormBolt',
    kind: 'missile',
    d2Analog: 'Fallen Shaman Firebolt',
    anim: 'cast',
    vfx: 'vfx.cast.storm',
    damage: { storm: { min: 2, max: 6 } },
    element: 'storm',
    missile: 'm_stormBolt',
    cooldownSec: 1.2,
  }),
  mk({
    id: 'm_nightBolt',
    kind: 'missile',
    d2Analog: 'Dark Shaman Bolt',
    anim: 'cast',
    vfx: 'vfx.cast.plasma',
    damage: { plasma: { min: 4, max: 9 } },
    element: 'plasma',
    missile: 'm_darkBolt',
    cooldownSec: 1.6,
  }),
  mk({
    id: 'm_dookyNova',
    kind: 'nova',
    d2Analog: 'Andariel Poison Nova',
    anim: 'cast',
    vfx: 'vfx.nova.darkStorm',
    damage: { storm: { min: 6, max: 14 } },
    element: 'storm',
    params: { radius: 7 },
    cooldownSec: 6,
  }),
  mk({
    id: 'm_dookyClaw',
    kind: 'meleeAttack',
    d2Analog: 'Andariel Attack',
    anim: 'attack1',
    vfx: 'vfx.hit.claw',
    weaponDamagePct: 100,
    effects: [{ kind: 'toxin', durationSec: 4, magnitude: 20 }],
  }),
  // ---------------------------------------------------------------- enemy Forse powers
  // Every one is telegraphed (hands glow, `telegraph`), interrupted by hit stun, and capped on heroes
  // (core/sim/systems/effects: PLAYER_MAX_KNOCKBACK, PLAYER_MAX_LIFT_SEC).
  mk({
    id: 'm_forseLightning',
    kind: 'beam',
    behavior: 'forseLightning',
    d2Analog: 'Force Lightning (enemy)',
    anim: 'cast',
    vfx: 'vfx.arc.sythLightning',
    damage: { storm: { min: 3, max: 8 } },
    element: 'storm',
    params: { range: 5.5, arc: 50, forks: 2, telegraph: 1, baseSec: 1.1, fireAt: 0.6 },
    cooldownSec: 3.5,
  }),
  mk({
    id: 'm_forsePush',
    kind: 'warcry',
    behavior: 'forsePush',
    d2Analog: 'Force Push (enemy)',
    anim: 'cast',
    vfx: 'vfx.forsePush.syth',
    damage: { magic: { min: 2, max: 5 } },
    element: 'magic',
    params: { range: 4, arc: 70, knockback: 3, slamPct: 50, telegraph: 1, baseSec: 0.9, fireAt: 0.6 },
    cooldownSec: 6,
  }),
  mk({
    id: 'm_forsePull',
    kind: 'utility',
    d2Analog: 'Force Pull (enemy)',
    anim: 'cast',
    vfx: 'vfx.beam.syth',
    params: { range: 9, pullRadius: 9, pullDist: 6, telegraph: 1, baseSec: 0.9, fireAt: 0.6 },
    cooldownSec: 10,
  }),
  mk({
    id: 'm_forseGrip',
    kind: 'beam',
    behavior: 'forseGrip',
    d2Analog: 'Force Grip (enemy)',
    anim: 'cast',
    vfx: 'vfx.grip.syth',
    damage: { magic: { min: 6, max: 10 } },
    element: 'magic',
    params: { range: 7, liftSec: 1.2, targets: 1, telegraph: 1, baseSec: 1.0, fireAt: 0.6 },
    cooldownSec: 14,
  }),
  mk({
    id: 'm_saberThrow',
    kind: 'missile',
    d2Analog: 'Saber Throw (enemy)',
    anim: 'throw',
    vfx: 'vfx.throw',
    weaponDamagePct: 100,
    missile: 'm_saberThrow',
    params: { range: 8, telegraph: 1, baseSec: 1, fireAt: 0.55 },
    cooldownSec: 7,
  }),
  mk({
    id: 'm_countessBolt',
    kind: 'missile',
    d2Analog: 'Countess Firebolt',
    anim: 'cast',
    vfx: 'vfx.cast.plasma',
    damage: { plasma: { min: 6, max: 14 } },
    element: 'plasma',
    missile: 'm_countessBolt',
    cooldownSec: 1.4,
  }),
] satisfies SkillDef[];
