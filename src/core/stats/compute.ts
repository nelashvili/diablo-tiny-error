/**
 * Stat pipeline: base (class/monster + allocated points) -> flat mods -> percent mods -> caps.
 *
 * HOW CALLERS PASS CLASS DATA
 *  - `base.strength/dexterity/vitality/energy`: the class STARTING attributes (allocated points are
 *    added on top via `allocated`).
 *  - `base.lifeMax/manaMax/staminaMax`: the class BASE pools at level 1 with starting attributes.
 *  - `growth` (players only): life = baseLife + (level-1)*lifePerLevel + (vit - startVit)*lifePerVit,
 *    mana = baseMana + (level-1)*manaPerLevel + (energy - startEnergy)*manaPerEnergy,
 *    stamina = baseSta + (level-1)*staminaPerLevel + (vit - startVit)*staminaPerVit.
 *    `vit`/`energy` include item bonuses (D2). Then flat `lifeMax` mods are added and % mods applied.
 *  - Without `growth` (monsters) the base values are used as-is (+ mods). `growth` presence also marks the
 *    "player side": only then do dex-derived AR/defense, the dex/level block formula and the
 *    difficulty resist penalty apply. Monster AR/defense/block/resists come from `base.*` verbatim
 *    (resist cap 100 so monsters can be immune).
 *
 * DAMAGE: physMin/physMax = weapon * (1 + ED/100 + stat bonus) + flat min/max damage (flat added AFTER ED,
 * as in D2). Heroes add STAT_FLAT_DAMAGE per str/dex/energy point above the class start (weighted by the weapon). With no weapon, players punch for 1-2 (monsters: 0 + flat; give them `minDamage/maxDamage`
 * in `base`). `raw` holds the post-modifier total of every StatId (parameterized stats: sum over params);
 * for attributes, pools, AR, defense and resists `raw` mirrors the final DerivedStats value, except
 * `blockChance`, where raw is the pre-formula (shield) total.
 */
import type { ComputeStats, DerivedStats, StatId } from './types';
import {
  attackRatingFromDex,
  attackSpeedMulFromIas,
  blockChanceFinal,
  defenseFromDex,
  finalResist,
  manaRegenPerSec,
  maxResist,
  moveSpeedMulFromFrw,
  speedMulFrom120,
} from './formulas';
import { aggregate, isParamStat, total } from './modifiers';

// prettier-ignore
const ALL_STATS: readonly StatId[] = [
  'strength', 'dexterity', 'vitality', 'energy', 'lifeMax', 'manaMax', 'staminaMax', 'lifeRegen',
  'manaRegenPct', 'lifePerKill', 'manaPerKill', 'attackRating', 'enhancedDamage', 'minDamage', 'maxDamage',
  'plasmaMin', 'plasmaMax', 'cryoMin', 'cryoMax', 'cryoLength', 'stormMin', 'stormMax', 'toxinMin',
  'toxinMax', 'toxinLength', 'magicMin', 'magicMax', 'plasmaSkillDamage', 'cryoSkillDamage',
  'stormSkillDamage', 'toxinSkillDamage', 'enemyPlasmaRes', 'enemyCryoRes', 'enemyStormRes',
  'enemyToxinRes', 'ias', 'fcr', 'crushingBlow', 'deadlyStrike', 'criticalStrike', 'lifeSteal', 'manaSteal',
  'pierce', 'knockback', 'preventHeal', 'defense', 'blockChance', 'fbr', 'fhr', 'frw', 'resPlasma',
  'resCryo', 'resStorm', 'resToxin', 'maxResPlasma', 'maxResCryo', 'maxResStorm', 'maxResToxin',
  'damageReduced', 'damageReducedPct', 'magicDamageReduced', 'thorns', 'cannotBeFrozen',
  'halfFreezeDuration', 'poisonLengthReduced', 'dodgeChance', 'avoidChance', 'evadeChance', 'magicFind',
  'goldFind', 'lightRadius', 'staminaDrainReduced', 'requirementsReduced', 'allSkills', 'classSkills',
  'treeSkills', 'singleSkill', 'chargedSkill', 'auraWhenEquipped',
];

/** Flat min/max damage per attribute point a hero raises above their class start (weapon-weighted). */
export const STAT_FLAT_DAMAGE = 0.15;

export const computeStats: ComputeStats = (src) => {
  const agg = aggregate(src.modifiers);
  const base = src.base;
  const g = src.growth;
  const player = g !== undefined;
  const level = Math.max(1, src.level);
  const b = (s: StatId): number => base[s] ?? 0;
  const T = (s: StatId, baseVal = b(s)): number => total(agg, s, baseVal);

  // Attributes: start + allocated, then mods.
  const attr = (s: 'strength' | 'dexterity' | 'vitality' | 'energy'): number =>
    Math.floor(total(agg, s, b(s) + src.allocated[s]));
  const strength = attr('strength');
  const dexterity = attr('dexterity');
  const vitality = attr('vitality');
  const energy = attr('energy');

  // Pools.
  let lifeBase = b('lifeMax');
  let manaBase = b('manaMax');
  let staBase = b('staminaMax');
  if (g) {
    const dVit = vitality - b('vitality');
    const dEn = energy - b('energy');
    lifeBase += (level - 1) * g.lifePerLevel + dVit * g.lifePerVit;
    manaBase += (level - 1) * g.manaPerLevel + dEn * g.manaPerEnergy;
    staBase += (level - 1) * g.staminaPerLevel + dVit * g.staminaPerVit;
  }
  const lifeMax = Math.max(1, Math.floor(T('lifeMax', lifeBase)));
  const manaMax = Math.max(0, Math.floor(T('manaMax', manaBase)));
  const staminaMax = Math.max(0, Math.floor(T('staminaMax', staBase)));
  const lifeRegen = T('lifeRegen');
  const manaRegenPct = T('manaRegenPct');

  // Attack rating & defense.
  const arBase = b('attackRating') + (player ? attackRatingFromDex(dexterity) : 0);
  const defBase = b('defense') + (player ? defenseFromDex(dexterity) : 0);
  const attackRating = Math.max(0, Math.floor(T('attackRating', arBase)));
  const defense = Math.max(0, Math.floor(T('defense', defBase)));

  // Block.
  const rawBlock = T('blockChance');
  const blockChance = player
    ? blockChanceFinal(rawBlock, dexterity, level)
    : Math.max(0, Math.min(75, rawBlock));

  // Resists.
  const res = (r: StatId, m: StatId): number => {
    const max = player ? maxResist(T(m, 0)) : 100;
    return finalResist(T(r), src.difficulty, max, player);
  };
  const resists = {
    plasma: res('resPlasma', 'maxResPlasma'),
    cryo: res('resCryo', 'maxResCryo'),
    storm: res('resStorm', 'maxResStorm'),
    toxin: res('resToxin', 'maxResToxin'),
  };

  // Weapon damage: base * (1 + ED + str/dex bonus) + flat.
  const w = src.weapon;
  const wMin = w ? w.min : player ? 1 : 0;
  const wMax = w ? w.max : player ? 2 : 0;
  const eneBonus = w?.eneBonus ?? 0;
  const statBonusPct = w
    ? (strength * w.strBonus) / 100 + (dexterity * w.dexBonus) / 100 + (energy * eneBonus) / 100
    : 0;
  const dmgMul = Math.max(0, 1 + (T('enhancedDamage', 0) + statBonusPct) / 100);
  // Heroes also hit harder by a flat amount for every point raised above the class start, so each
  // point of the weapon's attribute (strength for sabers, dexterity for blasters, energy for Forse
  // staffs and Kybur focuses) is felt at once.
  const strW = w ? w.strBonus / 100 : 1;
  const dexW = w ? w.dexBonus / 100 : 0;
  const eneW = eneBonus / 100;
  const above = (v: number, s: StatId): number => Math.max(0, v - b(s));
  const statFlat = player
    ? (above(strength, 'strength') * strW +
        above(dexterity, 'dexterity') * dexW +
        above(energy, 'energy') * eneW) *
      STAT_FLAT_DAMAGE
    : 0;
  const physMin = Math.max(0, wMin * dmgMul + T('minDamage') + statFlat);
  const physMax = Math.max(physMin, wMax * dmgMul + T('maxDamage') + statFlat);

  const range = (lo: StatId, hi: StatId): { min: number; max: number } => {
    const min = Math.max(0, T(lo));
    return { min, max: Math.max(min, T(hi)) };
  };
  const elemental: DerivedStats['elemental'] = {
    plasma: range('plasmaMin', 'plasmaMax'),
    cryo: range('cryoMin', 'cryoMax'),
    storm: range('stormMin', 'stormMax'),
    toxin: range('toxinMin', 'toxinMax'),
    magic: range('magicMin', 'magicMax'),
  };

  // Skills.
  const skillBonus: DerivedStats['skillBonus'] = {
    all: T('allSkills', 0),
    byClass: {},
    byTree: {},
    bySkill: {},
  };
  const fill = (stat: StatId, out: Record<string, number>): void => {
    for (const [k, v] of agg.param.get(stat) ?? []) out[k] = v;
  };
  fill('classSkills', skillBonus.byClass);
  fill('treeSkills', skillBonus.byTree);
  fill('singleSkill', skillBonus.bySkill);

  // Raw totals.
  const raw: Partial<Record<StatId, number>> = {};
  for (const s of ALL_STATS) {
    if (isParamStat(s)) {
      let sum = 0;
      for (const v of agg.param.get(s)?.values() ?? []) sum += v;
      raw[s] = sum;
    } else raw[s] = T(s);
  }
  Object.assign(raw, {
    strength,
    dexterity,
    vitality,
    energy,
    lifeMax,
    manaMax,
    staminaMax,
    attackRating,
    defense,
    resPlasma: resists.plasma,
    resCryo: resists.cryo,
    resStorm: resists.storm,
    resToxin: resists.toxin,
    allSkills: skillBonus.all,
  });

  return {
    strength,
    dexterity,
    vitality,
    energy,
    lifeMax,
    manaMax,
    staminaMax,
    lifeRegen,
    manaRegenPerSec: manaRegenPerSec(manaMax, manaRegenPct),
    attackRating,
    defense,
    blockChance,
    res: resists,
    physMin,
    physMax,
    elemental,
    attackSpeedMul: attackSpeedMulFromIas(T('ias')),
    castSpeedMul: speedMulFrom120(T('fcr')),
    hitRecoveryMul: speedMulFrom120(T('fhr')),
    blockSpeedMul: speedMulFrom120(T('fbr')),
    moveSpeedMul: moveSpeedMulFromFrw(T('frw')),
    raw,
    skillBonus,
  };
};
