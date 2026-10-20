import { describe, expect, it } from 'vitest';
import { DB } from '../../data/db';
import { Rng } from '../rng';
import { mfEffective, qualityChance, resolveTreasure, rollDrops, rollQuality } from './index';
import type { DropContext } from './index';

const ctx = (over: Partial<DropContext> = {}): DropContext => ({
  treasureClass: 'tc.a1.normal',
  monsterLevel: 10,
  magicFind: 0,
  goldFind: 0,
  players: 1,
  rank: 'normal',
  ...over,
});

describe('treasure resolution', () => {
  it('banded ids pick the highest band <= level', () => {
    expect(resolveTreasure('tc.weap', 14)?.id).toBe('tc.weap.12');
    expect(resolveTreasure('tc.weap', 1)?.id).toBe('tc.weap.1');
    expect(resolveTreasure('tc.weap', 200)?.id).toBe('tc.weap.84');
    expect(resolveTreasure('tc.a1.normal', 5)?.id).toBe('tc.a1.normal');
    expect(resolveTreasure('tc.nothing', 5)).toBeUndefined();
  });
  it('all banded equipment TCs are non-empty and only reference known items', () => {
    for (const tc of DB.treasure.values()) {
      if (!/^tc\.(weap|armo)\./.test(tc.id)) continue;
      expect(tc.entries.length, tc.id).toBeGreaterThan(0);
      for (const e of tc.entries) expect(DB.items.has(e.ref)).toBe(true);
    }
  });
});

describe('rollDrops', () => {
  it('is deterministic', () => {
    const run = () => {
      const rng = new Rng(99);
      return Array.from({ length: 20 }, () => rollDrops(ctx({ treasureClass: 'tc.a1.unique' }), rng));
    };
    expect(run()).toEqual(run());
  });

  it('normal monsters drop mostly nothing; noDrop weight is respected', () => {
    const rng = new Rng(1);
    const n = 4000;
    let empty = 0;
    for (let i = 0; i < n; i++) {
      const r = rollDrops(ctx(), rng);
      if (r.items.length === 0 && r.creditz === 0) empty++;
    }
    const tc = DB.treasure.get('tc.a1.normal')!;
    const total = tc.noDrop + tc.entries.reduce((s, e) => s + e.weight, 0);
    expect(empty / n).toBeGreaterThan((tc.noDrop / total) * 0.9);
    expect(empty / n).toBeLessThan((tc.noDrop / total) * 1.1 + 0.05);
  });

  it('entry frequencies match weights', () => {
    const rng = new Rng(2);
    const tc = DB.treasure.get('tc.a1.normal')!;
    const total = tc.noDrop + tc.entries.reduce((s, e) => s + e.weight, 0);
    let credit = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (rollDrops(ctx(), rng).creditz > 0) credit++;
    const w = tc.entries.find((e) => e.ref === 'creditz')!.weight;
    expect(credit / n).toBeGreaterThan((w / total) * 0.9);
    expect(credit / n).toBeLessThan((w / total) * 1.1);
  });

  it('item level bands keep drops appropriate', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 300; i++) {
      const r = rollDrops(ctx({ treasureClass: 'tc.boss.countDooky.normal', monsterLevel: 8 }), rng);
      for (const it of r.items) {
        const base = DB.items.get(it.base)!;
        if (base.category === 'weapon' || base.category === 'armor')
          expect(base.qlvl).toBeLessThanOrEqual(8 + 0);
        expect(it.ilvl).toBe(8);
      }
    }
  });

  it('bosses drop more than normals; rank scales creditz; goldFind helps', () => {
    const rng = new Rng(4);
    let nItems = 0;
    let bItems = 0;
    for (let i = 0; i < 300; i++) {
      nItems += rollDrops(ctx(), rng).items.length;
      bItems += rollDrops(ctx({ treasureClass: 'tc.boss.countDooky.normal', rank: 'boss' }), rng).items
        .length;
    }
    expect(bItems).toBeGreaterThan(nItems * 3);
    const sum = (c: DropContext): number => {
      const r = new Rng(5);
      let s = 0;
      for (let i = 0; i < 500; i++) s += rollDrops(c, r).creditz;
      return s;
    };
    const base = sum(ctx({ treasureClass: 'tc.a1.champion' }));
    expect(sum(ctx({ treasureClass: 'tc.a1.champion', rank: 'champion' }))).toBeGreaterThan(base * 1.3);
    expect(sum(ctx({ treasureClass: 'tc.a1.champion', goldFind: 100 }))).toBeGreaterThan(base * 1.8);
  });

  it('aliases and superunique TCs drop', () => {
    const rng = new Rng(6);
    for (const id of ['tc.a1.countDooky.normal', 'tc.a1.superunique.legend', 'tc.boss.darthMole.veteran']) {
      let any = 0;
      for (let i = 0; i < 20; i++)
        any += rollDrops(ctx({ treasureClass: id, rank: 'boss' }), rng).items.length;
      expect(any, id).toBeGreaterThan(0);
    }
  });
});

describe('quality & magic find', () => {
  it('MF has diminishing returns', () => {
    expect(mfEffective(0, 'unique')).toBe(0);
    expect(mfEffective(10, 'unique')).toBe(10);
    expect(mfEffective(250, 'unique')).toBeCloseTo(125);
    expect(mfEffective(1000, 'unique')).toBeLessThan(250);
    expect(mfEffective(1000, 'set')).toBeGreaterThan(mfEffective(1000, 'unique'));
    expect(mfEffective(1000, 'rare')).toBeGreaterThan(mfEffective(1000, 'set'));
    expect(mfEffective(300, 'magic')).toBe(300);
    // doubling a big MF gives far less than double the chance
    const c = (mf: number): number => qualityChance('unique', 80, 40, mf);
    expect(c(0)).toBeLessThan(c(200));
    expect(c(400) / c(200)).toBeLessThan(1.4);
  });

  it('chance respects the D2 floor and TC modifiers', () => {
    expect(qualityChance('magic', 99, 1, 0)).toBeCloseTo(128 / 200, 5);
    expect(qualityChance('unique', 99, 1, 0)).toBeLessThanOrEqual(128 / 6400 + 1e-9 + 0.02);
    expect(qualityChance('rare', 50, 10, 0, 500)).toBeGreaterThan(qualityChance('rare', 50, 10, 0));
  });

  it('observed quality distribution follows ratios and MF', () => {
    const base = DB.items.get('templarBlade')!; // no unique or set piece: rare/magic only
    const count = (mf: number): Record<string, number> => {
      const rng = new Rng(11);
      const out: Record<string, number> = {};
      for (let i = 0; i < 20000; i++) {
        const q = rollQuality(base, 40, mf, undefined, rng);
        out[q] = (out[q] ?? 0) + 1;
      }
      return out;
    };
    const a = count(0);
    const b = count(300);
    expect(a.unique ?? 0).toBe(0);
    const expRare = qualityChance('rare', 40, base.qlvl, 0);
    expect((a.rare ?? 0) / 20000).toBeGreaterThan(expRare * 0.8);
    expect((a.rare ?? 0) / 20000).toBeLessThan(expRare * 1.2);
    expect(b.rare ?? 0).toBeGreaterThan((a.rare ?? 0) * 1.3);
    expect(a.magic ?? 0).toBeGreaterThan(a.rare ?? 0);
    expect((a.inferior ?? 0) + (a.normal ?? 0) + (a.magic ?? 0) + (a.rare ?? 0)).toBe(20000);
  });

  it('uniques only roll for bases that have one; consumables are always normal', () => {
    const rng = new Rng(12);
    const sab = DB.items.get('cadetSaber')!;
    let u = 0;
    for (let i = 0; i < 20000; i++)
      if (rollQuality(sab, 30, 400, { unique: 500, set: 0, rare: 0, magic: 0 }, rng) === 'unique') u++;
    expect(u).toBeGreaterThan(0);
    expect(rollQuality(DB.items.get('baktaStim')!, 99, 999, undefined, rng)).toBe('normal');
  });
});

describe('level-scaled drops', () => {
  const sample = (ilvl: number, n = 400) => {
    const rng = new Rng(11);
    const items = [];
    for (let i = 0; i < n; i++)
      items.push(
        ...rollDrops(
          {
            treasureClass: 'tc.equip',
            monsterLevel: ilvl,
            magicFind: 0,
            goldFind: 0,
            players: 1,
            rank: 'normal',
          },
          rng,
        ).items,
      );
    return items;
  };
  const avgQlvl = (items: { base: string }[]) =>
    items.reduce((s, it) => s + (DB.items.get(it.base)?.qlvl ?? 0), 0) / items.length;

  it('climbs with each early area level', () => {
    expect(resolveTreasure('tc.weap', 5)?.id).toBe('tc.weap.5');
    expect(avgQlvl(sample(5))).toBeGreaterThan(avgQlvl(sample(2)) + 1);
    expect(avgQlvl(sample(10))).toBeGreaterThan(avgQlvl(sample(5)) + 1.5);
  });

  it('rolls some Superior whites with a percent bonus', () => {
    const sup = sample(8).filter((it) => it.superior);
    expect(sup.length).toBeGreaterThan(10);
    for (const it of sup) {
      expect(it.quality).toBe('normal');
      const m = it.mods.find((x) => x.source === 'superior')!;
      expect(m.op).toBe('percent');
      expect(m.value).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('loot tuning', () => {
  it('normal monsters drop something well under half the time', () => {
    const rng = new Rng(7);
    let dropped = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const r = rollDrops(ctx(), rng);
      if (r.items.length || r.creditz) dropped++;
    }
    expect(dropped / n).toBeGreaterThan(0.2);
    expect(dropped / n).toBeLessThan(0.35);
  });

  it("weapon drops lean toward the killer's class", () => {
    const share = (classId: 'yediKnight' | 'bountyHuntur' | 'forseAdept', cls: string[]) => {
      const rng = new Rng(11);
      let mine = 0;
      let weapons = 0;
      for (let i = 0; i < 3000; i++)
        for (const it of rollDrops(ctx({ treasureClass: 'tc.weap', monsterLevel: 24, classId }), rng).items) {
          const wc = DB.items.get(it.base)?.weaponClass;
          if (!wc) continue;
          weapons++;
          if (cls.includes(wc)) mine++;
        }
      return mine / weapons;
    };
    const sabers = ['litesaber', 'doubleLitesaber'];
    expect(share('yediKnight', sabers)).toBeGreaterThan(share('bountyHuntur', sabers) * 3);
    const guns = ['blasturPistol', 'blasturRifle'];
    expect(share('bountyHuntur', guns)).toBeGreaterThan(share('forseAdept', guns) * 3);
  });

  it('Act I gear drops are magic about one time in four, with the odd rare', () => {
    const share = (rank: DropContext['rank'], treasureClass: string) => {
      const rng = new Rng(13);
      const q: Record<string, number> = {};
      let gear = 0;
      for (let i = 0; i < 6000; i++)
        for (const it of rollDrops(ctx({ treasureClass, rank, monsterLevel: 6 }), rng).items) {
          const c = DB.items.get(it.base)?.category;
          if (c !== 'weapon' && c !== 'armor') continue;
          gear++;
          q[it.quality] = (q[it.quality] ?? 0) + 1;
        }
      const better = (q.rare ?? 0) + (q.set ?? 0) + (q.unique ?? 0);
      return { magic: (q.magic ?? 0) / gear, better: better / gear };
    };
    const normal = share('normal', 'tc.a1.normal');
    expect(normal.magic).toBeGreaterThan(0.18);
    expect(normal.magic).toBeLessThan(0.35);
    expect(normal.better).toBeGreaterThan(0.01);
    expect(normal.better).toBeLessThan(0.06);
    const champ = share('champion', 'tc.a1.champion');
    expect(champ.magic + champ.better).toBeGreaterThan(normal.magic + normal.better + 0.1);
  });

  it('bosses always drop a rare-or-better and roll higher item levels', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 50; i++) {
      const r = rollDrops(
        ctx({ treasureClass: 'tc.boss.countDooky.normal', rank: 'boss', monsterLevel: 12 }),
        rng,
      );
      const good = r.items.filter((it) => ['rare', 'set', 'unique'].includes(it.quality));
      expect(good.length).toBeGreaterThan(0);
      for (const it of r.items) expect(it.ilvl).toBe(17);
    }
  });
});
