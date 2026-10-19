import { describe, expect, it } from 'vitest';
import { DB } from '../db';
import { CLASS_WEAPONS } from './_classAffinity';
import type { ClassId } from '../../core/types';

/** Normal-tier qlvls of the bases matching `pred`, sorted and de-duplicated. */
function tiers(pred: (b: { weaponClass?: string; armorClass?: string; classOnly?: ClassId }) => boolean) {
  const q = [...DB.items.values()].filter((b) => b.tier === 'normal' && pred(b)).map((b) => b.qlvl);
  return [...new Set(q)].sort((a, b) => a - b);
}

/** Largest gap between consecutive tiers up to `upTo` (counting from level 1). */
function maxGap(qlvls: number[], upTo: number): number {
  const pts = [1, ...qlvls.filter((q) => q <= upTo)];
  let gap = 0;
  for (let i = 1; i < pts.length; i++) gap = Math.max(gap, pts[i]! - pts[i - 1]!);
  return Math.max(gap, upTo - pts[pts.length - 1]!);
}

describe('equipment progression through levels 1-12', () => {
  for (const c of Object.keys(CLASS_WEAPONS) as ClassId[]) {
    it(`${c} finds a new weapon base at least every 3 levels`, () => {
      const q = tiers((b) => !!b.weaponClass && CLASS_WEAPONS[c].includes(b.weaponClass as never));
      expect(maxGap(q, 12)).toBeLessThanOrEqual(3);
    });
  }
  for (const slot of ['helm', 'chest', 'gloves', 'belt', 'boots', 'shield']) {
    it(`${slot}: a new base at least every 4 levels for everyone`, () => {
      const q = tiers((b) => b.armorClass === slot && !b.classOnly);
      expect(maxGap(q, 12)).toBeLessThanOrEqual(4);
    });
  }

  it('each newer base in a weapon class hits harder than the one before (per second)', () => {
    const byClass = new Map<string, { qlvl: number; dps: number; id: string }[]>();
    for (const b of DB.items.values()) {
      if (b.tier !== 'normal' || !b.weaponClass || !b.damage) continue;
      const dps = ((b.damage.min + b.damage.max) / 2) * (b.speed ?? 1);
      byClass.set(b.weaponClass, [...(byClass.get(b.weaponClass) ?? []), { qlvl: b.qlvl, dps, id: b.id }]);
    }
    for (const list of byClass.values()) {
      list.sort((a, b) => a.qlvl - b.qlvl);
      for (let i = 1; i < list.length; i++)
        expect(list[i]!.dps, `${list[i]!.id} vs ${list[i - 1]!.id}`).toBeGreaterThan(list[i - 1]!.dps);
    }
  });

  it('each newer armor base in a slot defends better', () => {
    const bySlot = new Map<string, { qlvl: number; def: number; id: string }[]>();
    for (const b of DB.items.values()) {
      if (b.tier !== 'normal' || !b.armorClass || !b.defense || b.classOnly) continue;
      const def = b.defense.min + b.defense.max;
      bySlot.set(b.armorClass, [...(bySlot.get(b.armorClass) ?? []), { qlvl: b.qlvl, def, id: b.id }]);
    }
    for (const list of bySlot.values()) {
      list.sort((a, b) => a.qlvl - b.qlvl);
      for (let i = 1; i < list.length; i++)
        expect(list[i]!.def, `${list[i]!.id} vs ${list[i - 1]!.id}`).toBeGreaterThan(list[i - 1]!.def);
    }
  });

  it('Act I (item level <= 10) can roll uniques for every class', () => {
    const early = [...DB.uniques.values()].filter((u) => u.level <= 10);
    const bases = early.map((u) => DB.items.get(u.base)!);
    for (const c of Object.keys(CLASS_WEAPONS) as ClassId[])
      expect(bases.some((b) => b.weaponClass && CLASS_WEAPONS[c].includes(b.weaponClass))).toBe(true);
    expect(bases.filter((b) => b.category === 'armor').length).toBeGreaterThanOrEqual(3);
  });
});
