import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { computeStats } from '../stats/compute';
import type { Modifier, StatId } from '../stats/types';
import { crushingBlowDamage, leechMultiplier, reducePhysical, rollRange } from './damage';
import { resolveAttack } from './resolve';
import type { AttackSpec, CombatantView } from './types';

const flat = (stat: StatId, value: number): Modifier => ({ stat, value, op: 'flat' });

function fighter(
  mods: Modifier[] = [],
  over: Partial<CombatantView> = {},
  base: Partial<Record<StatId, number>> = {},
): CombatantView {
  const stats = computeStats({
    level: 20,
    base: { lifeMax: 500, minDamage: 10, maxDamage: 10, attackRating: 100000, defense: 0, ...base },
    allocated: { strength: 0, dexterity: 0, vitality: 0, energy: 0 },
    modifiers: mods,
    difficulty: 'normal',
  });
  return { id: 1, level: 20, stats, moving: false, isPlayerSide: false, hasShield: false, ...over };
}

const melee: AttackSpec = { delivery: 'melee', useWeaponDamage: true, ignoreDefense: true };
const meleeRoll: AttackSpec = { delivery: 'melee', useWeaponDamage: true };
const missile: AttackSpec = { delivery: 'missile', useWeaponDamage: true, ignoreDefense: true };

describe('resolveAttack', () => {
  it('basic hit deals weapon damage', () => {
    const r = resolveAttack(fighter(), fighter(), melee, new Rng(1));
    expect(r.outcome).toBe('hit');
    expect(r.damage.physical).toBe(10);
    expect(r.total).toBe(10);
  });
  it('is deterministic per seed', () => {
    const a = fighter([flat('lifeSteal', 10)], {}, { minDamage: 5, maxDamage: 50 });
    const x = resolveAttack(a, fighter(), melee, new Rng(7));
    const y = resolveAttack(a, fighter(), melee, new Rng(7));
    expect(x).toEqual(y);
  });
  it('misses with low AR vs high defense; ignoreDefense always hits', () => {
    const a = fighter([], {}, { attackRating: 1 });
    const d = fighter([], {}, { defense: 100000 });
    let hits = 0;
    const rng = new Rng(3);
    for (let i = 0; i < 200; i++) if (resolveAttack(a, d, meleeRoll, rng).outcome === 'hit') hits++;
    expect(hits).toBeLessThan(40); // ~5%
    expect(hits).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++) {
      expect(resolveAttack(a, d, melee, rng).outcome).toBe('hit');
    }
  });
  it('hit rate near formula', () => {
    const a = fighter([], {}, { attackRating: 1000 });
    const d = fighter([], {}, { defense: 500 });
    const rng = new Rng(11);
    let hits = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (resolveAttack(a, d, meleeRoll, rng).outcome === 'hit') hits++;
    expect(hits / n).toBeGreaterThan(0.62);
    expect(hits / n).toBeLessThan(0.71);
  });
  it('spells always hit and ignore block/dodge', () => {
    const d = fighter([flat('dodgeChance', 75), flat('blockChance', 75), flat('evadeChance', 75)], {
      hasShield: true,
      moving: true,
    });
    const spec: AttackSpec = {
      delivery: 'spell',
      useWeaponDamage: false,
      skillDamage: { plasma: { min: 20, max: 20 } },
    };
    const rng = new Rng(2);
    for (let i = 0; i < 100; i++) expect(resolveAttack(fighter(), d, spec, rng).outcome).toBe('hit');
  });
  it('block requires shield and blockable', () => {
    const d = fighter([flat('blockChance', 75)], { hasShield: true });
    const rng = new Rng(5);
    let blocked = 0;
    for (let i = 0; i < 400; i++)
      if (resolveAttack(fighter(), d, melee, rng).outcome === 'blocked') blocked++;
    expect(blocked).toBeGreaterThan(250);
    const noShield = fighter([flat('blockChance', 75)], { hasShield: false });
    for (let i = 0; i < 100; i++) expect(resolveAttack(fighter(), noShield, melee, rng).outcome).toBe('hit');
    for (let i = 0; i < 100; i++) {
      expect(resolveAttack(fighter(), d, { ...melee, blockable: false }, rng).outcome).toBe('hit');
    }
  });
  it('dodge for melee, avoid for missile, evade when moving', () => {
    const st = [flat('dodgeChance', 75), flat('avoidChance', 75), flat('evadeChance', 75)];
    const seen = (spec: AttackSpec, moving: boolean): Set<string> => {
      const rng = new Rng(9);
      const out = new Set<string>();
      for (let i = 0; i < 200; i++)
        out.add(resolveAttack(fighter(), fighter(st, { moving }), spec, rng).outcome);
      return out;
    };
    expect(seen(melee, false)).toEqual(new Set(['hit', 'dodged']));
    expect(seen(missile, false)).toEqual(new Set(['hit', 'avoided']));
    expect(seen(melee, true)).toEqual(new Set(['hit', 'evaded']));
    expect(seen(missile, true)).toEqual(new Set(['hit', 'evaded']));
  });
  it('weaponDamagePct scales weapon damage', () => {
    const r = resolveAttack(fighter(), fighter(), { ...melee, weaponDamagePct: 150 }, new Rng(1));
    expect(r.damage.physical).toBe(15);
  });
  it('skill damage with +% element skill damage, and resist', () => {
    const a = fighter([flat('plasmaSkillDamage', 50), flat('enemyPlasmaRes', 20)]);
    const d = fighter([flat('resPlasma', 50)]);
    const spec: AttackSpec = {
      delivery: 'spell',
      useWeaponDamage: false,
      skillDamage: { plasma: { min: 100, max: 100 } },
    };
    // 100 * 1.5 = 150 ; effective res 30 -> 105
    const r = resolveAttack(a, d, spec, new Rng(1));
    expect(r.damage.plasma).toBe(105);
    expect(r.damage.physical).toBeUndefined();
  });
  it('immunity at 100 res and via flags', () => {
    const spec: AttackSpec = {
      delivery: 'spell',
      useWeaponDamage: false,
      skillDamage: { storm: { min: 50, max: 50 } },
    };
    expect(resolveAttack(fighter(), fighter([flat('resStorm', 100)]), spec, new Rng(1)).total).toBe(0);
    const flagged = fighter([], { flags: { immune: { storm: true } } });
    expect(resolveAttack(fighter(), flagged, spec, new Rng(1)).total).toBe(0);
    // -enemy res can break 100 res
    const r = resolveAttack(
      fighter([flat('enemyStormRes', 50)]),
      fighter([flat('resStorm', 100)]),
      spec,
      new Rng(1),
    );
    expect(r.total).toBe(25);
  });
  it('negative resist amplifies', () => {
    const spec: AttackSpec = {
      delivery: 'spell',
      useWeaponDamage: false,
      skillDamage: { cryo: { min: 100, max: 100 } },
    };
    expect(resolveAttack(fighter(), fighter([flat('resCryo', -50)]), spec, new Rng(1)).damage.cryo).toBe(150);
  });
  it('deadly strike doubles physical only; combined crit chance', () => {
    const a = fighter([flat('deadlyStrike', 100), flat('plasmaMin', 7), flat('plasmaMax', 7)]);
    const r = resolveAttack(a, fighter(), melee, new Rng(1));
    expect(r.crit).toBe(true);
    expect(r.damage.physical).toBe(20);
    expect(r.damage.plasma).toBe(7);
    // 50% DS + 50% CS -> 75% crit
    const both = fighter([flat('deadlyStrike', 50), flat('criticalStrike', 50)]);
    const rng = new Rng(21);
    let c = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (resolveAttack(both, fighter(), melee, rng).crit) c++;
    expect(c / n).toBeGreaterThan(0.71);
    expect(c / n).toBeLessThan(0.79);
  });
  it('conversion moves physical into an element', () => {
    const spec: AttackSpec = { ...melee, convert: { to: 'plasma', pct: 40 } };
    const r = resolveAttack(fighter(), fighter(), spec, new Rng(1));
    expect(r.damage.physical).toBe(6);
    expect(r.damage.plasma).toBe(4);
  });
  it('physical DR: flat then percent, capped at 50', () => {
    expect(reducePhysical(100, 10, 20)).toBeCloseTo(72);
    expect(reducePhysical(100, 0, 90)).toBe(50);
    expect(reducePhysical(5, 10, 0)).toBe(0);
    const d = fighter([flat('damageReduced', 4), flat('damageReducedPct', 50)]);
    expect(resolveAttack(fighter(), d, melee, new Rng(1)).damage.physical).toBe(3);
  });
  it('magic damage reduction flat', () => {
    const a = fighter([flat('magicMin', 20), flat('magicMax', 20)], {}, { minDamage: 0, maxDamage: 0 });
    const r = resolveAttack(a, fighter([flat('magicDamageReduced', 5)]), melee, new Rng(1));
    expect(r.damage.magic).toBe(15);
  });
  it('crushing blow sets flag', () => {
    const r = resolveAttack(fighter([flat('crushingBlow', 100)]), fighter(), melee, new Rng(1));
    expect(r.crushed).toBe(true);
    expect(resolveAttack(fighter(), fighter(), melee, new Rng(1)).crushed).toBe(false);
    expect(crushingBlowDamage(400, 'normal')).toBe(100);
    expect(crushingBlowDamage(400, 'boss')).toBe(50);
    expect(crushingBlowDamage(400, 'player')).toBe(40);
  });
  it('cryo chill with length, freeze immunity, half freeze', () => {
    const a = fighter([flat('cryoMin', 10), flat('cryoMax', 10), flat('cryoLength', 4)]);
    const r = resolveAttack(a, fighter(), melee, new Rng(1));
    expect(r.effects).toEqual([{ kind: 'chill', durationSec: 4, magnitude: 50 }]);
    expect(resolveAttack(a, fighter([flat('cannotBeFrozen', 1)]), melee, new Rng(1)).effects).toEqual([]);
    const half = resolveAttack(a, fighter([flat('halfFreezeDuration', 1)]), melee, new Rng(1));
    expect(half.effects[0]?.durationSec).toBe(2);
    expect(resolveAttack(a, fighter([flat('resCryo', 100)]), melee, new Rng(1)).effects).toEqual([]);
  });
  it('toxin is a DoT effect, not instant damage', () => {
    const a = fighter([flat('toxinMin', 100), flat('toxinMax', 100), flat('toxinLength', 5)]);
    const r = resolveAttack(a, fighter([flat('resToxin', 50)]), melee, new Rng(1));
    expect(r.damage.toxin).toBeUndefined();
    expect(r.effects).toEqual([{ kind: 'toxin', durationSec: 5, magnitude: 50 }]);
    const pl = resolveAttack(a, fighter([flat('poisonLengthReduced', 50)]), melee, new Rng(1));
    expect(pl.effects).toEqual([{ kind: 'toxin', durationSec: 2.5, magnitude: 50 }]);
  });
  it('spec effects pass through', () => {
    const spec: AttackSpec = { ...melee, effects: [{ kind: 'stun', durationSec: 1 }] };
    expect(resolveAttack(fighter(), fighter(), spec, new Rng(1)).effects).toEqual([
      { kind: 'stun', durationSec: 1 },
    ]);
  });
  it('leech from instant damage', () => {
    const a = fighter([flat('lifeSteal', 10), flat('manaSteal', 5)]);
    const r = resolveAttack(a, fighter(), melee, new Rng(1));
    expect(r.lifeStolen).toBeCloseTo(1);
    expect(r.manaStolen).toBeCloseTo(0.5);
    expect(leechMultiplier('normal')).toBe(1);
    expect(leechMultiplier('veteran')).toBeCloseTo(0.67);
    expect(leechMultiplier('legend')).toBe(0.5);
  });
  it('knockback effect', () => {
    const r = resolveAttack(fighter([flat('knockback', 1)]), fighter(), melee, new Rng(1));
    expect(r.effects.some((e) => e.kind === 'knockback')).toBe(true);
  });
  it('rollRange handles zero and swapped bounds', () => {
    const rng = new Rng(1);
    expect(rollRange(rng, 0, 0)).toBe(0);
    const v = rollRange(rng, 9, 3);
    expect(v).toBeGreaterThanOrEqual(3);
    expect(v).toBeLessThanOrEqual(9);
  });
});
