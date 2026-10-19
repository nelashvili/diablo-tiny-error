import type { StatId } from '../../core/stats/types';
import type { SetDef } from '../schema';

type M = SetDef['bonuses'][number][number];
const f = (stat: StatId, min: number, max: number = min): M => ({ stat, op: 'flat', min, max });
const p = (stat: StatId, min: number, max: number = min): M => ({ stat, op: 'percent', min, max });

export default [
  {
    id: 'ewokzHunter',
    name: 'set.ewokzHunter',
    items: [
      {
        id: 'ewokzHunterHelm',
        name: 'setitem.ewokzHunterHelm',
        base: 'trooperHelm',
        reqLevel: 12,
        mods: [p('defense', 30, 50), f('dexterity', 5, 8), f('lifeMax', 10, 20)],
      },
      {
        id: 'ewokzHunterVest',
        name: 'setitem.ewokzHunterVest',
        base: 'flightSuit',
        reqLevel: 10,
        mods: [p('defense', 40, 60), f('resToxin', 20, 30), f('lifeRegen', 2, 3)],
      },
      {
        id: 'ewokzHunterBoots',
        name: 'setitem.ewokzHunterBoots',
        base: 'heavyBoots',
        reqLevel: 14,
        mods: [f('frw', 20), p('defense', 30, 40), f('dexterity', 5, 8)],
      },
    ],
    bonuses: {
      2: [f('resToxin', 15), f('magicFind', 15)],
      3: [f('allSkills', 1), f('resPlasma', 20), f('resCryo', 20), f('resStorm', 20), f('lifeMax', 40)],
    },
  },
  {
    id: 'tuskinRaider',
    name: 'set.tuskinRaider',
    items: [
      {
        id: 'tuskinRaiderGloves',
        name: 'setitem.tuskinRaiderGloves',
        base: 'workGloves',
        reqLevel: 8,
        mods: [f('strength', 5, 8), f('ias', 10), p('defense', 20, 40)],
      },
      {
        id: 'tuskinRaiderBelt',
        name: 'setitem.tuskinRaiderBelt',
        base: 'utilitySash',
        reqLevel: 8,
        mods: [f('lifeMax', 15, 25), f('lifeRegen', 2, 4), p('defense', 20, 40)],
      },
      {
        id: 'tuskinRaiderShield',
        name: 'setitem.tuskinRaiderShield',
        base: 'deflectorShield',
        reqLevel: 12,
        mods: [f('blockChance', 10, 15), f('resStorm', 20, 30), p('defense', 30, 50)],
      },
    ],
    bonuses: {
      2: [f('strength', 10), f('crushingBlow', 10)],
      3: [p('enhancedDamage', 40), f('ias', 20), f('lifeSteal', 4)],
    },
  },
] satisfies SetDef[];
