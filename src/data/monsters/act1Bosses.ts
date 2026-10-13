import type { MonsterDef } from '../schema';

/**
 * Base monster rows for Act I bosses (BossDef.monster points here). Boss HP/damage are large level-1
 * values; the boss level tables scale them like any monster.
 */
const bossTc = { normal: 'tc.a1.unique', champion: 'tc.a1.unique', unique: 'tc.a1.unique' };

export default [
  {
    // Andariel analog: toxin/dark-lightning nova, spit, melee; enrages below 50% life.
    id: 'countDooky',
    name: 'mon.countDooky',
    family: 'countDooky',
    modelId: 'mon.countDooky',
    ai: 'boss',
    behavior: 'countDooky',
    life: { min: 320, max: 320 },
    defense: 120,
    attackRating: 110,
    damage: { min: 6, max: 14 },
    walkSpeed: 2.6,
    attackRange: 2,
    aggroRange: 14,
    res: { storm: 50, toxin: 100, plasma: 25, cryo: 25 },
    xp: 600,
    treasure: bossTc,
    skills: [{ skill: 'm_dookyClaw', level: 1, chance: 100 }],
    flags: { boss: true, canBeChampion: false },
    pack: { min: 1, max: 1 },
    scale: 1.5,
  },
  {
    // The Countess analog: plasma caster.
    id: 'countezz',
    name: 'mon.countezz',
    family: 'countezz',
    modelId: 'mon.countezz',
    ai: 'caster',
    life: { min: 180, max: 180 },
    defense: 80,
    attackRating: 90,
    damage: { min: 5, max: 10 },
    walkSpeed: 2.6,
    attackRange: 9,
    aggroRange: 13,
    res: { plasma: 50 },
    xp: 300,
    treasure: bossTc,
    skills: [{ skill: 'm_countessBolt', level: 1, chance: 100 }],
    missile: 'm_countessBolt',
    flags: { boss: true, canBeChampion: false },
    pack: { min: 1, max: 1 },
    scale: 1.2,
  },
  {
    // Griswold analog: heavy rusty-armored brute.
    id: 'grizzwald',
    name: 'mon.grizzwald',
    family: 'grizzwald',
    modelId: 'mon.grizzwald',
    ai: 'melee',
    life: { min: 140, max: 140 },
    defense: 150,
    attackRating: 100,
    damage: { min: 8, max: 16 },
    walkSpeed: 2.4,
    attackRange: 1.8,
    aggroRange: 11,
    res: { physical: 25 },
    xp: 260,
    treasure: bossTc,
    skills: [{ skill: 'm_slam', level: 1, chance: 100 }],
    flags: { boss: true, canBeChampion: false },
    pack: { min: 1, max: 1 },
    scale: 1.3,
  },
] satisfies MonsterDef[];
