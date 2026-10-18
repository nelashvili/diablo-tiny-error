import type { MonsterDef } from '../schema';

const none = { normal: 'tc.a1.normal' };

/**
 * Player summons (never drop loot or give XP: see core/sim/systems/death). Stats are at level 1;
 * the summoning skill scales life/damage via lifePct/damagePct and the summon level.
 */
export default [
  {
    // Valkyrie analog: a sturdy melee bodyguard droyd.
    id: 'battleDroyd',
    name: 'mon.battleDroyd',
    family: 'battleDroyd',
    modelId: 'mon.battleDroyd',
    ai: 'melee',
    life: { min: 70, max: 80 },
    defense: 60,
    attackRating: 60,
    damage: { min: 4, max: 9 },
    walkSpeed: 3.2,
    runSpeed: 4.4,
    attackRange: 1.5,
    aggroRange: 9,
    res: { plasma: 30, cryo: 30, storm: 30, toxin: 30 },
    xp: 0,
    treasure: none,
    skills: [{ skill: 'm_slam', level: 1, chance: 100 }],
    flags: { droyd: true, noRemnant: true },
    pack: { min: 1, max: 1 },
  },
  {
    // Decoy analog: a hologram that draws enemy attention and fires back weakly.
    id: 'holoDecoy',
    name: 'mon.holoDecoy',
    family: 'holoDecoy',
    modelId: 'mon.holoDecoy',
    ai: 'ranged',
    life: { min: 40, max: 50 },
    defense: 30,
    attackRating: 30,
    damage: { min: 1, max: 4 },
    walkSpeed: 0,
    attackRange: 9,
    aggroRange: 10,
    res: {},
    xp: 0,
    treasure: none,
    skills: [{ skill: 'm_blastur', level: 1, chance: 100 }],
    missile: 'm_blasturBolt',
    flags: { noRemnant: true },
    pack: { min: 1, max: 1 },
  },
  {
    // Hydra analog: a stationary plasma turret.
    id: 'blasturTurret',
    name: 'mon.blasturTurret',
    family: 'blasturTurret',
    modelId: 'mon.blasturTurret',
    ai: 'ranged',
    life: { min: 999, max: 999 },
    defense: 999,
    attackRating: 80,
    damage: { min: 4, max: 10 },
    walkSpeed: 0,
    attackRange: 10,
    aggroRange: 11,
    res: { physical: 100, plasma: 100, cryo: 100, storm: 100, toxin: 100, magic: 100 },
    xp: 0,
    treasure: none,
    skills: [{ skill: 'm_blastur', level: 1, chance: 100 }],
    missile: 'turretBolt',
    flags: { droyd: true, noRemnant: true },
    pack: { min: 1, max: 1 },
  },
] satisfies MonsterDef[];
