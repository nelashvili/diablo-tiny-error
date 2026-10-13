import type { SkillDef } from '../schema';

/**
 * Free basic skills available to every class (no class: `classId` is empty). The 'basicAttack'
 * behavior (core/skills/behaviors.ts) picks melee or a missile from the equipped weapon class.
 */
const free: Pick<
  SkillDef,
  'classId' | 'tree' | 'reqLevel' | 'prereqs' | 'maxHardPoints' | 'manaCost' | 'leftClickable'
> = {
  // Empty classId marks a class-less free skill (see report: schema should make classId optional).
  classId: '' as unknown as SkillDef['classId'],
  tree: 'common',
  reqLevel: 1,
  prereqs: [],
  maxHardPoints: 20,
  manaCost: 0,
  leftClickable: true,
};

export default [
  {
    ...free,
    id: 'attack',
    name: 'skill.attack',
    d2Analog: 'Attack',
    description: 'skill.attack.desc',
    kind: 'meleeAttack',
    behavior: 'basicAttack',
    ui: { col: 0, row: 0, icon: 'icon.attack' },
    weaponDamagePct: 100,
    vfx: 'vfx.slash',
    anim: 'attack1',
  },
  {
    ...free,
    id: 'throw',
    name: 'skill.throw',
    d2Analog: 'Throw',
    description: 'skill.throw.desc',
    kind: 'missile',
    behavior: 'basicAttack',
    ui: { col: 1, row: 0, icon: 'icon.throw' },
    weaponDamagePct: 100,
    weaponReq: ['javelin', 'throwingDisc'],
    vfx: 'vfx.throw',
    anim: 'throw',
  },
  {
    ...free,
    id: 'kick',
    name: 'skill.kick',
    d2Analog: 'Kick',
    description: 'skill.kick.desc',
    kind: 'meleeAttack',
    ui: { col: 2, row: 0, icon: 'icon.kick' },
    damage: {
      physical: { min: { base: 3, perLevel: [0, 0, 0, 0, 0] }, max: { base: 7, perLevel: [0, 0, 0, 0, 0] } },
    },
    params: { range: 1.4, baseSec: 0.7, stunSec: 0.2 },
    vfx: 'vfx.kick',
    anim: 'kick',
  },
] satisfies SkillDef[];
