import { describe, expect, it } from 'vitest';
import { STAT_FLAT_DAMAGE, computeStats } from './compute';
import {
  applyResist,
  attackSpeedMulFromIas,
  blockChanceFinal,
  combineChances,
  diminishing,
  effectiveSpeedStat,
  hitChance,
  meetsRequirements,
  moveSpeedMulFromFrw,
} from './formulas';
import { experienceForLevel, experienceToNext, levelForExperience, xpPenaltyFactor } from './xp';
import type { ClassGrowth, Modifier, StatSources } from './types';

const growth: ClassGrowth = {
  lifePerLevel: 2,
  lifePerVit: 3,
  manaPerLevel: 1.5,
  manaPerEnergy: 2,
  staminaPerLevel: 1,
  staminaPerVit: 1,
};

function src(over: Partial<StatSources> = {}, mods: Modifier[] = []): StatSources {
  return {
    level: 1,
    base: {
      strength: 25,
      dexterity: 20,
      vitality: 25,
      energy: 15,
      lifeMax: 55,
      manaMax: 15,
      staminaMax: 184,
    },
    allocated: { strength: 0, dexterity: 0, vitality: 0, energy: 0 },
    modifiers: mods,
    difficulty: 'normal',
    growth,
    ...over,
  };
}
const flat = (stat: Modifier['stat'], value: number, param?: string): Modifier => ({
  stat,
  value,
  op: 'flat',
  param,
});
const pct = (stat: Modifier['stat'], value: number): Modifier => ({ stat, value, op: 'percent' });

describe('formulas', () => {
  it('speed stats', () => {
    expect(effectiveSpeedStat(20)).toBe(17);
    expect(effectiveSpeedStat(0)).toBe(0);
    expect(effectiveSpeedStat(120)).toBe(60);
    expect(attackSpeedMulFromIas(20)).toBeCloseTo(1.17);
    expect(attackSpeedMulFromIas(10000)).toBeCloseTo(1.75); // EIAS cap
    expect(diminishing(150, 150)).toBe(75);
    expect(moveSpeedMulFromFrw(150)).toBeCloseTo(1.75);
    expect(attackSpeedMulFromIas(-30)).toBeCloseTo(0.7);
  });
  it('hit chance', () => {
    expect(hitChance(1000, 500, 20, 20)).toBeCloseTo(66.667, 2);
    expect(hitChance(100000, 0, 80, 1)).toBe(95);
    expect(hitChance(1, 100000, 1, 80)).toBe(5);
    expect(hitChance(0, 0, 1, 1)).toBe(5);
    expect(hitChance(500, 500, 1, 1)).toBe(50);
  });
  it('block', () => {
    expect(blockChanceFinal(60, 100, 30)).toBe(75);
    expect(blockChanceFinal(30, 45, 20)).toBe(22); // 30*30/40 = 22.5
    expect(blockChanceFinal(0, 100, 1)).toBe(0);
    expect(blockChanceFinal(30, 10, 20)).toBe(0);
    // A fresh hero (clvl 1, dex 20, starting shield) is not at the cap: levels 1-2 count as 3.
    expect(blockChanceFinal(30, 20, 1)).toBe(25);
    expect(blockChanceFinal(30, 20, 3)).toBe(25);
  });
  it('resist and chances', () => {
    expect(applyResist(100, 50)).toBe(50);
    expect(applyResist(100, 100)).toBe(0);
    expect(applyResist(100, -50)).toBe(150);
    expect(applyResist(100, -400)).toBe(200);
    expect(combineChances(50, 50)).toBeCloseTo(75);
    expect(combineChances(0, 0)).toBe(0);
  });
  it('requirements', () => {
    const s = { strength: 50, dexterity: 30, vitality: 20, energy: 10 };
    expect(meetsRequirements(s, 10, { level: 10, strength: 50 })).toBe(true);
    expect(meetsRequirements(s, 9, { level: 10 })).toBe(false);
    expect(meetsRequirements(s, 10, { dexterity: 31 })).toBe(false);
    expect(meetsRequirements(s, 1, {})).toBe(true);
  });
});

describe('computeStats', () => {
  it('player base: AR and defense from dex', () => {
    const s = computeStats(src());
    expect(s.attackRating).toBe(20 * 5 - 35);
    expect(s.defense).toBe(5);
    expect(s.lifeMax).toBe(55);
    expect(s.manaMax).toBe(15);
  });
  it('allocated points and growth', () => {
    const s = computeStats(
      src({ level: 10, allocated: { strength: 0, dexterity: 10, vitality: 20, energy: 5 } }),
    );
    expect(s.dexterity).toBe(30);
    expect(s.lifeMax).toBe(55 + 9 * 2 + 20 * 3);
    expect(s.manaMax).toBe(Math.floor(15 + 9 * 1.5 + 5 * 2));
    expect(s.staminaMax).toBe(184 + 9 + 20);
  });
  it('item vitality grants life', () => {
    const s = computeStats(src({}, [flat('vitality', 10)]));
    expect(s.vitality).toBe(35);
    expect(s.lifeMax).toBe(55 + 30);
  });
  it('percent life applies to total life', () => {
    const s = computeStats(src({}, [flat('lifeMax', 45), pct('lifeMax', 10)]));
    expect(s.lifeMax).toBe(110);
  });
  it('monsters use base values without growth', () => {
    const s = computeStats({
      level: 20,
      base: { lifeMax: 300, dexterity: 40, attackRating: 400, defense: 120, resCryo: 100, blockChance: 30 },
      allocated: { strength: 0, dexterity: 0, vitality: 0, energy: 0 },
      modifiers: [],
      difficulty: 'legend',
    });
    expect(s.lifeMax).toBe(300);
    expect(s.attackRating).toBe(400);
    expect(s.defense).toBe(120);
    expect(s.res.cryo).toBe(100);
    expect(s.res.plasma).toBe(0); // no penalty for monsters
    expect(s.blockChance).toBe(30);
  });
  it('AR and defense flat+percent', () => {
    const s = computeStats(
      src({}, [flat('attackRating', 100), pct('attackRating', 50), flat('defense', 95), pct('defense', 100)]),
    );
    expect(s.attackRating).toBe(Math.floor((65 + 100) * 1.5));
    expect(s.defense).toBe((5 + 95) * 2);
  });
  it('resist penalty per difficulty, caps', () => {
    const mods = [flat('resPlasma', 75), flat('resCryo', 20), flat('resStorm', 200)];
    expect(computeStats(src({}, mods)).res).toEqual({ plasma: 75, cryo: 20, storm: 75, toxin: 0 });
    const vet = computeStats(src({ difficulty: 'veteran' }, mods)).res;
    expect(vet).toEqual({ plasma: 35, cryo: -20, storm: 75, toxin: -40 });
    const leg = computeStats(src({ difficulty: 'legend' }, mods)).res;
    expect(leg.plasma).toBe(-25);
    expect(leg.toxin).toBe(-100);
    expect(leg.storm).toBe(75);
  });
  it('max resist mods up to 95', () => {
    const s = computeStats(src({}, [flat('resPlasma', 150), flat('maxResPlasma', 10)]));
    expect(s.res.plasma).toBe(85);
    const t = computeStats(src({}, [flat('resPlasma', 150), flat('maxResPlasma', 50)]));
    expect(t.res.plasma).toBe(95);
  });
  it('block formula uses dex and level', () => {
    const s = computeStats(
      src({ level: 20, base: { dexterity: 45, vitality: 25 } }, [flat('blockChance', 30)]),
    );
    expect(s.blockChance).toBe(22);
    expect(s.raw.blockChance).toBe(30);
  });
  it('weapon damage: ED and stat bonus then flat', () => {
    const weapon = { min: 10, max: 20, strBonus: 100, dexBonus: 0, speed: 1.4 };
    const s = computeStats(
      src({ weapon, base: { strength: 50, dexterity: 20, vitality: 25 } }, [
        flat('enhancedDamage', 100),
        flat('minDamage', 5),
        flat('maxDamage', 8),
      ]),
    );
    // mul = 1 + (100 + 50)/100 = 2.5
    expect(s.physMin).toBe(10 * 2.5 + 5);
    expect(s.physMax).toBe(20 * 2.5 + 8);
  });
  it('each strength point raised above the class start adds flat damage too', () => {
    const weapon = { min: 10, max: 20, strBonus: 100, dexBonus: 0, speed: 1.4 };
    const base = computeStats(src({ weapon }));
    const raised = computeStats(
      src({ weapon, allocated: { strength: 40, dexterity: 0, vitality: 0, energy: 0 } }),
    );
    // +40% from the D2 bonus plus 40 * STAT_FLAT_DAMAGE flat.
    expect(raised.physMin - base.physMin).toBeCloseTo(10 * 0.4 + 40 * STAT_FLAT_DAMAGE);
    expect(raised.physMax - base.physMax).toBeCloseTo(20 * 0.4 + 40 * STAT_FLAT_DAMAGE);
    // A pistol (dex weapon) gains nothing from strength.
    const pistol = { min: 10, max: 20, strBonus: 0, dexBonus: 100, speed: 1.4 };
    const p0 = computeStats(src({ weapon: pistol }));
    const p1 = computeStats(
      src({ weapon: pistol, allocated: { strength: 40, dexterity: 0, vitality: 0, energy: 0 } }),
    );
    expect(p1.physMin).toBe(p0.physMin);
  });
  it('Forse staffs and Kybur focuses scale with energy, not strength', () => {
    const staff = { min: 10, max: 20, strBonus: 0, dexBonus: 0, eneBonus: 100, speed: 1 };
    const alloc = (k: 'strength' | 'energy') => ({
      strength: 0,
      dexterity: 0,
      vitality: 0,
      energy: 0,
      [k]: 40,
    });
    const base = computeStats(src({ weapon: staff }));
    const ene = computeStats(src({ weapon: staff, allocated: alloc('energy') }));
    const str = computeStats(src({ weapon: staff, allocated: alloc('strength') }));
    expect(ene.physMin - base.physMin).toBeCloseTo(10 * 0.4 + 40 * STAT_FLAT_DAMAGE);
    expect(str.physMin).toBe(base.physMin);
  });
  it('dex-based weapon bonus', () => {
    const weapon = { min: 10, max: 10, strBonus: 0, dexBonus: 75, speed: 1 };
    const s = computeStats(src({ weapon, base: { dexterity: 80 } }));
    expect(s.physMin).toBeCloseTo(10 * (1 + 0.6));
  });
  it('unarmed player', () => {
    const s = computeStats(src());
    expect([s.physMin, s.physMax]).toEqual([1, 2]);
  });
  it('elemental damage and speed', () => {
    const s = computeStats(
      src({}, [flat('cryoMin', 3), flat('cryoMax', 9), flat('ias', 20), flat('fcr', 105), flat('frw', 30)]),
    );
    expect(s.elemental.cryo).toEqual({ min: 3, max: 9 });
    expect(s.attackSpeedMul).toBeCloseTo(1.17);
    expect(s.castSpeedMul).toBeCloseTo(1 + Math.floor((120 * 105) / 225) / 100);
    expect(s.moveSpeedMul).toBeCloseTo(1 + 25 / 100);
  });
  it('mana regen scales', () => {
    const base = computeStats(src({ base: { energy: 15, manaMax: 120 } }));
    expect(base.manaRegenPerSec).toBeCloseTo(1);
    const fast = computeStats(src({ base: { energy: 15, manaMax: 120 } }, [flat('manaRegenPct', 100)]));
    expect(fast.manaRegenPerSec).toBeCloseTo(2);
  });
  it('skill bonuses by scope', () => {
    const s = computeStats(
      src({}, [
        flat('allSkills', 1),
        flat('classSkills', 2, 'yediKnight'),
        flat('classSkills', 1, 'yediKnight'),
        flat('treeSkills', 3, 'combat'),
        flat('singleSkill', 4, 'whirlwind'),
      ]),
    );
    expect(s.skillBonus).toEqual({
      all: 1,
      byClass: { yediKnight: 3 },
      byTree: { combat: 3 },
      bySkill: { whirlwind: 4 },
    });
  });
  it('raw totals', () => {
    const s = computeStats(src({}, [flat('lifeSteal', 3), flat('lifeSteal', 4), flat('magicFind', 50)]));
    expect(s.raw.lifeSteal).toBe(7);
    expect(s.raw.magicFind).toBe(50);
  });
});

describe('xp', () => {
  it('table spot checks', () => {
    expect(experienceForLevel(1)).toBe(0);
    expect(experienceForLevel(2)).toBe(500);
    expect(experienceForLevel(3)).toBe(1500);
    expect(experienceForLevel(10)).toBe(57715);
    expect(experienceForLevel(12)).toBe(72144 + 18036);
    expect(experienceForLevel(75)).toBeGreaterThan(experienceForLevel(74));
    expect(experienceForLevel(100)).toBe(experienceForLevel(75));
    expect(experienceForLevel(0)).toBe(0);
  });
  it('monotonic', () => {
    for (let l = 2; l <= 75; l++) expect(experienceForLevel(l)).toBeGreaterThan(experienceForLevel(l - 1));
  });
  it('level lookup', () => {
    expect(levelForExperience(0)).toBe(1);
    expect(levelForExperience(499)).toBe(1);
    expect(levelForExperience(500)).toBe(2);
    expect(levelForExperience(1e12)).toBe(75);
    for (let l = 1; l <= 75; l++) expect(levelForExperience(experienceForLevel(l))).toBe(l);
    expect(experienceToNext(0)).toBe(500);
    expect(experienceToNext(1e12)).toBe(0);
  });
  it('penalty factor', () => {
    expect(xpPenaltyFactor(10, 1)).toBe(1);
    expect(xpPenaltyFactor(30, 40)).toBe(1);
    expect(xpPenaltyFactor(30, 30)).toBe(1);
    expect(xpPenaltyFactor(30, 25)).toBeCloseTo(0.75);
    expect(xpPenaltyFactor(70, 1)).toBe(0.05);
  });
});
