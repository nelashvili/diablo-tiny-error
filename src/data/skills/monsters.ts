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
    id: 'm_dookyToxin',
    kind: 'missile',
    d2Analog: 'Andariel Poison Spit',
    anim: 'cast',
    vfx: 'vfx.cast.toxin',
    damage: { toxin: { min: 10, max: 20 } },
    element: 'toxin',
    effects: [{ kind: 'toxin', durationSec: 6, magnitude: 30 }],
    missile: 'm_toxinSpit',
    cooldownSec: 8,
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
