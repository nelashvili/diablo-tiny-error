import { describe, expect, it } from 'vitest';
import { DB } from '../../data/db';
import { hasName } from '../../data/names';
import { Rng } from '../rng';
import { compareItems, describeItem } from './describe';
import { createItem, setAffinity } from './create';
import {
  canEquip,
  isTwoHanded,
  itemModifiers,
  itemRequirements,
  itemValue,
  setBonusModifiers,
  socketGem,
  split,
  stack,
  weaponInfo,
} from './helpers';
import { affixMatchesBase } from './lookup';

const REQUIRED = [
  'trainingLitesaber',
  'buckler',
  'baktaStim',
  'recallBeacon',
  'scoutBlastur',
  'javelinTrainer',
  'apprenticeStaff',
  'energyCell',
  'rejuvStim',
  'antidote',
  'thaw',
  'stamina',
  'energyCell',
];

describe('data integrity', () => {
  it('has the required base ids and class starting items', () => {
    for (const id of REQUIRED) expect(DB.items.has(id), id).toBe(true);
    for (const c of DB.classes.values())
      for (const id of c.startingItems) expect(DB.items.has(id), id).toBe(true);
  });

  it('covers every weapon and armor class in all three tiers', () => {
    const weapons = new Map<string, Set<string>>();
    for (const b of DB.items.values()) {
      const cls = b.weaponClass ?? b.armorClass;
      if (!cls) continue;
      if (!weapons.has(cls)) weapons.set(cls, new Set());
      if (b.tier) weapons.get(cls)!.add(b.tier);
    }
    for (const c of [
      'litesaber',
      'doubleLitesaber',
      'vibroAxe',
      'shockBaton',
      'vibroPike',
      'throwingDisc',
      'javelin',
      'blasturPistol',
      'blasturRifle',
      'forseStaff',
      'kyburFocus',
      'helm',
      'chest',
      'gloves',
      'belt',
      'boots',
      'shield',
    ])
      expect([...(weapons.get(c) ?? [])].sort(), c).toEqual(['elite', 'exceptional', 'normal']);
    expect(weapons.has('ring')).toBe(true);
    expect(weapons.has('amulet')).toBe(true);
  });

  it('class-only lines exist', () => {
    expect(DB.items.get('hunturRifle')?.classOnly).toBe('bountyHuntur');
    expect(DB.items.get('kyburOrb')?.classOnly).toBe('forseAdept');
    expect(DB.items.get('yediHood')?.classOnly).toBe('yediKnight');
  });

  it('every display key resolves', () => {
    for (const b of DB.items.values()) expect(hasName(b.name), b.name).toBe(true);
    for (const a of DB.affixes.values()) expect(hasName(a.name), a.name).toBe(true);
    for (const u of DB.uniques.values()) expect(hasName(u.name), u.name).toBe(true);
    for (const s of DB.sets.values()) {
      expect(hasName(s.name), s.name).toBe(true);
      for (const i of s.items) expect(hasName(i.name), i.name).toBe(true);
    }
    for (const g of DB.gems.values()) expect(hasName(g.name), g.name).toBe(true);
    for (let i = 0; i < 20; i++) {
      expect(hasName(`rare.a.${i}`)).toBe(true);
      expect(hasName(`rare.b.${i}`)).toBe(true);
    }
    const stats = new Set<string>();
    for (const a of DB.affixes.values()) for (const m of a.mods) stats.add(m.stat);
    for (const u of DB.uniques.values()) for (const m of u.mods) stats.add(m.stat);
    for (const g of DB.gems.values())
      for (const m of [...g.weapon, ...g.armor, ...g.shield]) stats.add(m.stat);
    for (const s of stats) expect(hasName(`istat.${s}`), s).toBe(true);
  });

  it('has enough affixes and valid uniques/sets/gems', () => {
    const pre = [...DB.affixes.values()].filter((a) => a.kind === 'prefix');
    const suf = [...DB.affixes.values()].filter((a) => a.kind === 'suffix');
    expect(pre.length).toBeGreaterThanOrEqual(80);
    expect(suf.length).toBeGreaterThanOrEqual(80);
    expect(DB.uniques.size).toBeGreaterThanOrEqual(12);
    expect(DB.sets.size).toBeGreaterThanOrEqual(2);
    expect(DB.gems.size).toBe(35);
    for (const u of DB.uniques.values()) expect(DB.items.has(u.base), u.id).toBe(true);
    for (const s of DB.sets.values()) for (const i of s.items) expect(DB.items.has(i.base), i.id).toBe(true);
    for (const b of DB.items.values()) if (b.category === 'gem') expect(DB.gems.has(b.id)).toBe(true);
  });

  it('treasure refs resolve', () => {
    for (const tc of DB.treasure.values())
      for (const e of tc.entries) {
        if (e.ref === 'creditz' || DB.items.has(e.ref) || DB.treasure.has(e.ref)) continue;
        expect(
          [...DB.treasure.keys()].some((k) => k.startsWith(`${e.ref}.`)),
          `${tc.id} -> ${e.ref}`,
        ).toBe(true);
      }
    for (const b of ['countDooky', 'greatSarlack', 'darthMole', 'emperorPalpitate'])
      for (const d of ['normal', 'veteran', 'legend'])
        expect(DB.treasure.has(`tc.boss.${b}.${d}`)).toBe(true);
    for (const d of ['normal', 'veteran', 'legend']) {
      expect(DB.treasure.has(`tc.a1.countDooky.${d}`)).toBe(true);
      expect(DB.treasure.has(`tc.a1.superunique.${d}`)).toBe(true);
    }
    for (const a of [1, 2, 3, 4])
      for (const r of ['normal', 'champion', 'unique']) expect(DB.treasure.has(`tc.a${a}.${r}`)).toBe(true);
  });
});

describe('createItem', () => {
  it('is deterministic for a seed', () => {
    const mk = (): unknown =>
      ['trooperHelm', 'knightSaber', 'signalRing'].map((b) =>
        createItem(b, { quality: 'rare', ilvl: 60 }, new Rng(77)),
      );
    expect(mk()).toEqual(mk());
  });

  it('plain items are identified with defense, durability', () => {
    const it = createItem('buckler', {}, new Rng(1));
    expect(it.identified).toBe(true);
    expect(it.quality).toBe('normal');
    expect(it.defense).toBeGreaterThanOrEqual(8);
    expect(it.defense).toBeLessThanOrEqual(10);
    expect(it.durability?.cur).toBe(it.durability?.max);
  });

  it('magic items have 1-2 legal affixes', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 300; i++) {
      const baseId = rng.pick(['knightSaber', 'trooperHelm', 'heavyBoots', 'signalRing', 'hunturRifle']);
      const base = DB.items.get(baseId)!;
      const ilvl = rng.int(1, 85);
      const it = createItem(baseId, { quality: 'magic', ilvl }, rng);
      if (it.quality === 'normal') continue;
      expect(it.quality).toBe('magic');
      const defs = it.affixes.map((a) => DB.affixes.get(a)!);
      expect(defs.length).toBeGreaterThanOrEqual(1);
      expect(defs.filter((d) => d.kind === 'prefix').length).toBeLessThanOrEqual(1);
      expect(defs.filter((d) => d.kind === 'suffix').length).toBeLessThanOrEqual(1);
      for (const d of defs) {
        expect(d.level).toBeLessThanOrEqual(Math.max(ilvl, base.qlvl));
        expect(affixMatchesBase(d, base)).toBe(true);
      }
    }
  });

  it('rare items: 3-6 affixes, <=3 per side, unique groups, rare-flag, alvl', () => {
    const rng = new Rng(6);
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const baseId = rng.pick([
        'knightSaber',
        'trooperHelm',
        'platedBelt',
        'signalRing',
        'holoPendant',
        'battleStaff',
      ]);
      const base = DB.items.get(baseId)!;
      const ilvl = rng.int(30, 90);
      const it = createItem(baseId, { quality: 'rare', ilvl }, rng);
      const defs = it.affixes.map((a) => DB.affixes.get(a)!);
      seen.add(defs.length);
      expect(defs.length).toBeGreaterThanOrEqual(3);
      expect(defs.length).toBeLessThanOrEqual(6);
      expect(defs.filter((d) => d.kind === 'prefix').length).toBeLessThanOrEqual(3);
      expect(defs.filter((d) => d.kind === 'suffix').length).toBeLessThanOrEqual(3);
      expect(new Set(defs.map((d) => d.group)).size).toBe(defs.length);
      for (const d of defs) {
        expect(d.rare).toBe(true);
        expect(d.level).toBeLessThanOrEqual(Math.max(ilvl, base.qlvl));
        expect(affixMatchesBase(d, base)).toBe(true);
      }
      expect(it.rareName).toBeDefined();
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it('class-only affixes only land on class items', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 200; i++) {
      const it = createItem('knightSaber', { quality: 'rare', ilvl: 80 }, rng);
      for (const a of it.affixes) expect(DB.affixes.get(a)!.classOnly).toBeUndefined();
    }
    let found = false;
    for (let i = 0; i < 200 && !found; i++) {
      const it = createItem('yediHood', { quality: 'rare', ilvl: 60 }, rng);
      found = it.mods.some((m) => m.stat === 'classSkills' || m.stat === 'treeSkills');
    }
    expect(found).toBe(true);
  });

  it('unique and set selection, with rare fallback', () => {
    const u = createItem('cadetSaber', { quality: 'unique', ilvl: 30 }, new Rng(1));
    expect(u.quality).toBe('unique');
    expect(u.uniqueId).toBe('skywokkersHeirloom');
    expect(u.mods.length).toBeGreaterThan(0);
    const s = createItem('trooperHelm', { quality: 'set', ilvl: 30 }, new Rng(2));
    expect(s.quality).toBe('set');
    expect(s.setItemId).toBe('ewokzHunterHelm');
    // no unique for this base -> rare
    const f = createItem('heavyGloves', { quality: 'set', ilvl: 30 }, new Rng(3));
    expect(f.quality).toBe('rare');
    // too-low ilvl -> rare
    expect(createItem('cadetSaber', { quality: 'unique', ilvl: 1 }, new Rng(1)).quality).toBe('rare');
  });

  it('consumables ignore quality; stackables get a quantity', () => {
    const it = createItem('baktaStim', { quality: 'rare' }, new Rng(1));
    expect(it.quality).toBe('normal');
    const r = createItem('recallBeacon', { quantity: 5 }, new Rng(1));
    expect(r.quantity).toBe(5);
  });

  it('shared rolls: all-res affix gives equal values', () => {
    const rng = new Rng(8);
    for (let i = 0; i < 100; i++) {
      const it = createItem('trooperHelm', { quality: 'rare', ilvl: 80 }, rng);
      if (!it.affixes.includes('suf.allRes.3') && !it.affixes.includes('suf.allRes.2')) continue;
      const v = it.mods.filter((m) => m.source?.includes('suf.allRes')).map((m) => m.value);
      expect(new Set(v).size).toBe(1);
    }
  });
});

describe('helpers', () => {
  it('weaponInfo applies local ED and class bonuses; itemModifiers skip local stats', () => {
    const it = createItem('trainingLitesaber', {}, new Rng(1));
    it.mods.push(
      { stat: 'enhancedDamage', op: 'percent', value: 100 },
      { stat: 'ias', op: 'flat', value: 20 },
    );
    const w = weaponInfo(it)!;
    expect(w.min).toBe(4);
    expect(w.max).toBe(14);
    expect(w.strBonus).toBe(100);
    expect(weaponInfo(createItem('scoutBlastur', {}, new Rng(1)))!.dexBonus).toBe(100);
    const mods = itemModifiers(it);
    expect(mods.some((m) => m.stat === 'enhancedDamage')).toBe(false);
    expect(mods.find((m) => m.stat === 'ias')?.value).toBe(20);
    expect(weaponInfo(createItem('buckler', {}, new Rng(1)))).toBeNull();
  });

  it('armor defense% is local and shows up as total flat defense', () => {
    const it = createItem('buckler', {}, new Rng(1));
    it.defense = 10;
    it.mods.push({ stat: 'defense', op: 'percent', value: 50 });
    const d = itemModifiers(it).filter((m) => m.stat === 'defense');
    expect(d).toEqual([expect.objectContaining({ op: 'flat', value: 15 })]);
    expect(itemModifiers(it).find((m) => m.stat === 'blockChance')?.value).toBe(30);
  });

  it('socketed gems contribute per slot', () => {
    const sword = createItem('trainingLitesaber', {}, new Rng(1));
    sword.sockets = 2;
    const gem = createItem('kybur.red.perfect', {}, new Rng(2));
    expect(socketGem(sword, gem)).toBe(true);
    expect(itemModifiers(sword).some((m) => m.stat === 'plasmaMax' && m.value === 20)).toBe(true);
    const shield = createItem('buckler', {}, new Rng(1));
    shield.sockets = 1;
    socketGem(shield, createItem('kybur.red.perfect', {}, new Rng(3)));
    expect(itemModifiers(shield).some((m) => m.stat === 'resPlasma' && m.value === 34)).toBe(true);
    const full = createItem('trainingLitesaber', {}, new Rng(1));
    expect(socketGem(full, gem)).toBe(false);
  });

  it('requirements, canEquip, two-handed', () => {
    const rifle = createItem('hunturRifle', {}, new Rng(1));
    expect(isTwoHanded(rifle)).toBe(true);
    expect(itemRequirements(rifle).dexterity).toBe(40);
    const stats = { level: 20, strength: 30, dexterity: 60 };
    expect(canEquip(rifle, 'mainHand', 'bountyHuntur', stats)).toBe(true);
    expect(canEquip(rifle, 'mainHand', 'yediKnight', stats)).toBe(false);
    expect(canEquip(rifle, 'offHand', 'bountyHuntur', stats)).toBe(false);
    expect(canEquip(rifle, 'mainHand', 'bountyHuntur', { ...stats, dexterity: 10 })).toBe(false);
    const ring = createItem('signalRing', {}, new Rng(1));
    expect(canEquip(ring, 'ring2', 'yediKnight', stats)).toBe(true);
    rifle.mods.push({ stat: 'requirementsReduced', op: 'percent', value: 50 });
    expect(itemRequirements(rifle).dexterity).toBe(20);
  });

  it('stack and split', () => {
    const rng = new Rng(1);
    const a = createItem('recallBeacon', { quantity: 18 }, rng);
    const b = createItem('recallBeacon', { quantity: 5 }, rng);
    const left = stack(a, b);
    expect(a.quantity).toBe(20);
    expect(left?.quantity).toBe(3);
    const piece = split(a, 4, rng);
    expect(piece?.quantity).toBe(4);
    expect(a.quantity).toBe(16);
    expect(piece?.uid).not.toBe(a.uid);
    expect(split(a, 16, rng)).toBeNull();
    expect(stack(a, createItem('buckler', {}, rng))).not.toBeNull();
  });

  it('itemValue scales with quality; sell < buy', () => {
    const rng = new Rng(1);
    const n = createItem('knightSaber', {}, rng);
    const r = createItem('knightSaber', { quality: 'rare', ilvl: 60 }, rng);
    expect(itemValue(r, 'buy')).toBeGreaterThan(itemValue(n, 'buy'));
    expect(itemValue(n, 'sell')).toBeLessThan(itemValue(n, 'buy'));
  });
});

describe('set bonuses', () => {
  it('apply per piece count', () => {
    const rng = new Rng(1);
    const mk = (base: string, id: string) =>
      createItem(base, { quality: 'set', ilvl: 40, setItemId: id }, rng);
    const a = mk('trooperHelm', 'ewokzHunterHelm');
    const b = mk('flightSuit', 'ewokzHunterVest');
    const c = mk('heavyBoots', 'ewokzHunterBoots');
    expect(setBonusModifiers([a])).toEqual([]);
    expect(setBonusModifiers([a, b]).length).toBe(2);
    expect(setBonusModifiers([a, b, c]).length).toBe(2 + 5);
  });
});

describe('describeItem', () => {
  const ctxLow = { stats: { level: 1, strength: 5, dexterity: 5 }, classId: 'forseAdept' as const };

  it('names by quality', () => {
    const rng = new Rng(3);
    expect(describeItem(createItem('trainingLitesaber', {}, rng)).name).toBe('Training Litesaber');
    const inf = describeItem(createItem('trainingLitesaber', { quality: 'inferior' }, rng));
    expect(inf.name).toBe('Crude Training Litesaber');
    const magic = createItem('knightSaber', { quality: 'magic', ilvl: 40 }, rng);
    const dm = describeItem(magic);
    expect(dm.name).toContain('Knight Saber');
    const rare = describeItem(createItem('knightSaber', { quality: 'rare', ilvl: 40 }, rng));
    expect(rare.baseName).toBe('Knight Saber');
    expect(rare.name).not.toContain('rare.');
    const uni = describeItem(createItem('cadetSaber', { quality: 'unique', ilvl: 30 }, rng));
    expect(uni.name).toBe("Skywokker's Heirloom");
    expect(uni.baseName).toBe('Cadet Saber');
  });

  it('lists damage, speed, requirements with fail styles, mods in text', () => {
    const rng = new Rng(3);
    const it = createItem('cadetSaber', { quality: 'unique', ilvl: 30 }, rng);
    const d = describeItem(it, ctxLow);
    expect(d.lines[0]!.text).toMatch(/^One-Hand Damage: \d+ to \d+$/);
    expect(d.lines.some((l) => l.text.startsWith('Attack Speed'))).toBe(true);
    expect(d.lines.find((l) => l.text.startsWith('Required Dexterity'))!.style).toBe('reqFail');
    expect(d.lines.find((l) => l.text.startsWith('Required Level'))!.style).toBe('reqFail');
    expect(d.lines.some((l) => /Enhanced Damage/.test(l.text) && l.style === 'mod')).toBe(true);
    const ok = describeItem(it, { stats: { level: 50, strength: 50, dexterity: 50 } });
    expect(ok.lines.find((l) => l.text.startsWith('Required Dexterity'))!.style).toBe('req');
    const classLine = describeItem(createItem('hunturRifle', {}, rng), ctxLow).lines.find((l) =>
      l.text.includes('Only'),
    );
    expect(classLine?.text).toBe('(Bounty Huntur Only)');
    expect(classLine?.style).toBe('reqFail');
  });

  it('merges paired damage, all resists and shows sockets / set bonuses', () => {
    const rng = new Rng(3);
    const it = createItem('buckler', {}, rng);
    it.mods = [
      { stat: 'resPlasma', op: 'flat', value: 10 },
      { stat: 'resCryo', op: 'flat', value: 10 },
      { stat: 'resStorm', op: 'flat', value: 10 },
      { stat: 'resToxin', op: 'flat', value: 10 },
      { stat: 'plasmaMin', op: 'flat', value: 2 },
      { stat: 'plasmaMax', op: 'flat', value: 9 },
      { stat: 'classSkills', op: 'flat', value: 2, param: 'yediKnight' },
      { stat: 'defense', op: 'percent', value: 30 },
    ];
    it.sockets = 2;
    socketGem(it, createItem('kybur.red.chipped', {}, rng));
    const text = describeItem(it).lines.map((l) => l.text);
    expect(text).toContain('All Resistances +10');
    expect(text).toContain('Adds 2-9 Plasma Damage');
    expect(text).toContain('+2 to Yedi Knight Skill Levels');
    expect(text).toContain('+30% Enhanced Defense');
    expect(text).toContain('Socketed (1/2)');
    expect(text).toContain('Empty Socket');
    const set = createItem('trooperHelm', { quality: 'set', ilvl: 30, setItemId: 'ewokzHunterHelm' }, rng);
    const st = describeItem(set).lines.filter((l) => l.style === 'set');
    expect(st.length).toBeGreaterThanOrEqual(4);
  });

  it('compareItems reports better/worse deltas', () => {
    const rng = new Rng(3);
    const a = createItem('trainingLitesaber', {}, rng);
    const b = createItem('trainingLitesaber', {}, rng);
    a.mods.push(
      { stat: 'enhancedDamage', op: 'percent', value: 100 },
      { stat: 'ias', op: 'flat', value: 20 },
    );
    b.mods.push({ stat: 'fhr', op: 'flat', value: 10 });
    const lines = compareItems(a, b);
    expect(lines.find((l) => l.text.includes('Damage per second'))!.style).toBe('better');
    expect(lines.find((l) => l.text.includes('Attack Speed'))!.style).toBe('better');
    expect(lines.find((l) => l.text.includes('Hit Recovery'))!.style).toBe('worse');
    expect(compareItems(a, undefined).length).toBeGreaterThan(0);
  });
});

describe('class sets', () => {
  it('set pieces lean toward the sets tailored for the hero', () => {
    expect(setAffinity({ forClass: 'yediKnight' }, 'yediKnight')).toBeGreaterThan(1);
    expect(setAffinity({ forClass: 'yediKnight' }, 'forseAdept')).toBeLessThan(1);
    expect(setAffinity({}, 'forseAdept')).toBe(1);
    expect(setAffinity({ forClass: 'yediKnight' }, undefined)).toBe(1);
  });
});
