import { describe, expect, it } from 'vitest';
import type { ItemInstance } from '../items/types';
import type { PlayerEntity } from '../sim/entities';
import {
  checksum,
  defaultAccount,
  defaultSettings,
  migrateAccount,
  migrateCharacter,
  migrateSettings,
  newCharacterSave,
  parseSave,
  playerToSave,
  saveToPlayerInit,
  stringifySave,
} from './index';

const item = (uid: string): ItemInstance => ({
  uid,
  base: 'plasmaPistol',
  quality: 'magic',
  ilvl: 5,
  affixes: [],
  mods: [],
  sockets: 0,
  socketed: [],
  identified: true,
});

describe('defaults', () => {
  it('settings defaults are sane', () => {
    const s = defaultSettings();
    expect(s.quality).toBe('auto');
    expect(s.masterVolume).toBeGreaterThan(0);
    expect(defaultAccount().characterIds).toEqual([]);
  });

  it('newCharacterSave builds a valid level 1 save', () => {
    const c = newCharacterSave('yediKnight', '  Anakin Skywalker the Great  ', { id: 'a', now: 5 });
    expect(c.name.length).toBeLessThanOrEqual(16);
    expect(c.level).toBe(1);
    expect(c.hotkeys).toHaveLength(8);
    const r = migrateCharacter(c);
    expect(r.ok).toBe(true);
  });
});

describe('serialize', () => {
  it('round-trips Uint8Array', () => {
    const v = { a: new Uint8Array([0, 1, 2, 250, 255]), b: [new Uint8Array(0), new Uint8Array([9])] };
    const back = parseSave(stringifySave(v)) as typeof v;
    expect(Array.from(back.a)).toEqual([0, 1, 2, 250, 255]);
    expect(back.b[0]).toBeInstanceOf(Uint8Array);
    expect(Array.from(back.b[1]!)).toEqual([9]);
  });
  it('checksum is stable and sensitive', () => {
    expect(checksum('abc')).toBe(checksum('abc'));
    expect(checksum('abc')).not.toBe(checksum('abd'));
  });
});

describe('migrations', () => {
  it('upgrades a fake v0 character', () => {
    const v0 = {
      version: 0,
      id: 'old',
      name: 'Oldie',
      class: 'bountyHuntur',
      level: 7,
      gold: 321,
      stats: { strength: 10, dexterity: 20, vitality: 30, energy: 5 },
      items: [{ item: item('i1'), x: 0, y: 0 }],
    };
    const r = migrateCharacter(v0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(0);
    expect(r.value.version).toBe(2);
    expect(r.value.classId).toBe('bountyHuntur');
    expect(r.value.creditz).toBe(321);
    expect(r.value.allocated.dexterity).toBe(20);
    expect(r.value.inventory.items).toHaveLength(1);
    expect(r.value.cube.w).toBe(3);
  });

  it('v1 -> v2: renamed Forse skills keep points, removed skills refund them and leave the skill bar', () => {
    const r = migrateCharacter({
      version: 1,
      id: 'f',
      classId: 'yediKnight',
      level: 20,
      skillPointsUnspent: 1,
      skills: { fearRoar: 3, shockwave: 1, twinThrow: 4, pikeMastery: 2, litesaberStrike: 5 },
      leftSkill: 'twinThrow',
      rightSkill: 'fearRoar',
      hotkeys: ['twinThrow', 'swiftStep', 'litesaberStrike', null, null, null, null, null],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.skills).toEqual({ mindTrik: 3, forseRepulse: 1, litesaberStrike: 5 });
    expect(r.value.skillPointsUnspent).toBe(7);
    expect(r.value.rightSkill).toBe('mindTrik');
    expect(r.value.leftSkill).not.toBe('twinThrow');
    expect(r.value.hotkeys.slice(0, 3)).toEqual([null, 'forseSpeed', 'litesaberStrike']);
  });

  it('repairs missing fields and bad numbers', () => {
    const r = migrateCharacter({ version: 1, id: 'x', classId: 'forseAdept', level: Number.NaN, xp: -5 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.level).toBe(1);
    expect(r.value.xp).toBe(0);
    expect(r.repairs.length).toBeGreaterThan(0);
  });

  it('rejects garbage without throwing', () => {
    for (const bad of [
      null,
      5,
      'x',
      [],
      {},
      { id: 'a', classId: 'wizard' },
      { id: 'a', classId: 'yediKnight', version: 99 },
    ]) {
      const r = migrateCharacter(bad);
      expect(r.ok).toBe(false);
    }
  });

  it('rejects duplicate item uids and non-finite numbers in items', () => {
    const c = newCharacterSave('yediKnight', 'D', { id: 'd' });
    c.inventory.items.push({ item: item('same'), x: 0, y: 0 }, { item: item('same'), x: 1, y: 0 });
    const r = migrateCharacter(c);
    expect(r.ok).toBe(false);
    const c2 = newCharacterSave('yediKnight', 'D', { id: 'd' });
    const it = item('n');
    it.ilvl = Number.POSITIVE_INFINITY;
    c2.inventory.items.push({ item: it, x: 0, y: 0 });
    expect(migrateCharacter(c2).ok).toBe(false);
  });

  it('drops malformed grid entries', () => {
    const c = newCharacterSave('yediKnight', 'D', { id: 'd' });
    (c.inventory.items as unknown[]).push(null, { x: 1 });
    const r = migrateCharacter(c);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.inventory.items).toHaveLength(0);
  });

  it('migrates account v0 and sanitizes settings', () => {
    const r = migrateAccount({ version: 0, options: { masterVolume: 9, quality: 'ultra', readAloud: true } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.settings.masterVolume).toBe(1);
    expect(r.value.settings.quality).toBe('auto');
    expect(r.value.settings.readAloud).toBe(true);
    expect(r.value.sharedStash).toHaveLength(1);
    expect(migrateSettings(undefined)).toEqual(defaultSettings());
  });

  it('older settings gain weather on and flashes unreduced; bad values fall back', () => {
    const old = migrateSettings({ screenShake: false });
    expect(old.weather).toBe(true);
    expect(old.reduceFlashes).toBe(false);
    const set = migrateSettings({ weather: false, reduceFlashes: 'yes' });
    expect(set.weather).toBe(false);
    expect(set.reduceFlashes).toBe(false);
  });
});

describe('mappers', () => {
  it('player <-> save round trip preserves data without aliasing', () => {
    const save = newCharacterSave('forseAdept', 'Luke', { id: 'p1', now: 10 });
    save.level = 12;
    save.xp = 999;
    save.skills = { forseBolt: 3 };
    save.inventory.items.push({ item: item('u1'), x: 2, y: 1 });
    save.equipment = { amulet: item('u2') };
    save.progress.normal.waypoints = ['a1.mossfields'];
    save.playTimeSec = 77;

    const init = saveToPlayerInit(save);
    init.inventory.items.length = 0; // must not alias the save
    expect(save.inventory.items).toHaveLength(1);

    const fresh = saveToPlayerInit(save);
    const player = { ...fresh } as unknown as PlayerEntity;
    const back = playerToSave(player, fresh.extra);
    expect(back).toEqual(save);
    expect(back.inventory).not.toBe(save.inventory);
  });
});
