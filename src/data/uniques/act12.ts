import type { StatId } from '../../core/stats/types';
import type { UniqueDef } from '../schema';

type M = UniqueDef['mods'][number];
const f = (stat: StatId, min: number, max: number = min, param?: string): M => ({
  stat,
  op: 'flat',
  min,
  max,
  ...(param ? { param } : {}),
});
const p = (stat: StatId, min: number, max: number = min): M => ({ stat, op: 'percent', min, max });
const allRes = (min: number, max: number = min): M[] => [
  f('resPlasma', min, max),
  f('resCryo', min, max),
  f('resStorm', min, max),
  f('resToxin', min, max),
];

const u = (
  id: string,
  base: string,
  level: number,
  reqLevel: number,
  rarity: number,
  mods: M[],
): UniqueDef => ({ id, name: `uniq.${id}`, base, level, reqLevel, rarity, mods });

export default [
  u('skywokkersHeirloom', 'cadetSaber', 12, 8, 6, [
    p('enhancedDamage', 60, 80),
    f('ias', 20),
    f('attackRating', 50, 80),
    f('lifeSteal', 3, 5),
  ]),
  u('kenobeesPatience', 'guardBlade', 15, 12, 5, [
    p('enhancedDamage', 90, 120),
    f('lifeSteal', 3, 5),
    f('resCryo', 20, 30),
    f('lightRadius', 1),
  ]),
  u('mandalorianRage', 'doubleVibroAxe', 20, 18, 4, [
    p('enhancedDamage', 120, 150),
    f('crushingBlow', 20, 30),
    f('strength', 10, 20),
    f('lifePerKill', 3, 5),
  ]),
  u('chewbakkasGrip', 'heavyGloves', 15, 12, 5, [
    f('strength', 10, 15),
    f('lifeMax', 20, 30),
    p('defense', 30, 50),
    f('ias', 10),
  ]),
  u('hansLastShot', 'huntingBlastur', 18, 14, 4, [
    p('enhancedDamage', 100, 140),
    f('ias', 20, 30),
    f('dexterity', 8, 12),
    f('minDamage', 3, 6),
  ]),
  u('landosSmoothPlate', 'trooperArmor', 20, 16, 4, [
    p('defense', 80, 120),
    ...allRes(15, 20),
    f('magicFind', 25, 40),
  ]),
  u('r2DeesDome', 'flightCap', 12, 8, 6, [
    f('lightRadius', 2),
    f('magicFind', 30, 50),
    ...allRes(10, 15),
    f('lifeMax', 15, 25),
  ]),
  u('princessLaylasBuns', 'trooperHelm', 22, 18, 3, [
    f('fcr', 20),
    f('energy', 10, 15),
    f('manaMax', 30, 40),
    f('resStorm', 25, 35),
  ]),
  u('bobaFeet', 'heavyBoots', 18, 14, 4, [
    f('frw', 30),
    p('defense', 40, 60),
    f('dexterity', 10),
    f('resPlasma', 20, 30),
  ]),
  u('jabbosBellyBand', 'utilityBelt', 16, 12, 4, [
    f('lifeMax', 30, 50),
    f('goldFind', 60, 100),
    f('defense', 15, 25),
    f('staminaMax', 20, 30),
  ]),
  u('yoduhsWalkingStick', 'gnarledRod', 20, 15, 3, [
    f('classSkills', 2, 2, 'forseAdept'),
    f('treeSkills', 1, 1, 'forseAdept.cryo'),
    f('fcr', 20),
    f('manaMax', 30, 50),
  ]),
  u('ringOfKenobee', 'signalRing', 14, 10, 5, [
    f('lifeSteal', 4, 6),
    f('dexterity', 5, 10),
    f('resStorm', 10, 20),
  ]),
  u('deflectoMirrorShield', 'deflectorShield', 18, 14, 4, [
    f('blockChance', 15, 20),
    ...allRes(15, 25),
    f('fhr', 20),
    p('defense', 40, 60),
  ]),
  u('holocrumbOfWisdom', 'holoPendant', 20, 16, 3, [
    f('allSkills', 1),
    f('energy', 10),
    f('manaMax', 30, 40),
    f('fcr', 10),
  ]),
  u('ewokzSting', 'warJavelin', 16, 12, 5, [
    p('enhancedDamage', 80, 100),
    f('toxinMin', 40, 60),
    f('toxinMax', 40, 60),
    f('toxinLength', 4),
    f('attackRating', 60, 100),
  ]),
] satisfies UniqueDef[];
