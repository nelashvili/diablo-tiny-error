// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ItemInstance } from '@/core/items/types';
import { newCharacterSave } from '@/core/save/defaults';
import { defaultSettings } from '@/core/save/defaults';
import { ImportError, createIdbSaveStore } from './idbSaveStore';
import { IdbKV } from './kv';

let n = 0;
const uniq = (): string => `test-db-${++n}`;
const it_ = (uid: string): ItemInstance => ({
  uid,
  base: 'x',
  quality: 'normal',
  ilvl: 1,
  affixes: [],
  mods: [],
  sockets: 0,
  socketed: [],
  identified: true,
});

afterEach(() => vi.unstubAllGlobals());

describe('idb save store', () => {
  it('round-trips characters and account', async () => {
    const s = createIdbSaveStore(uniq());
    const info = await s.ready;
    expect(info.backend).toBe('indexeddb');
    expect(info.degraded).toBe(false);

    const c = newCharacterSave('bountyHuntur', 'Leia', { id: 'c1', now: 100 });
    c.inventory.items.push({ item: it_('a'), x: 0, y: 0 });
    await s.saveCharacter(c);
    expect(await s.loadCharacter('c1')).toEqual(c);
    expect(await s.loadCharacter('nope')).toBeNull();

    const list = await s.listCharacters();
    expect(list).toEqual([{ id: 'c1', name: 'Leia', classId: 'bountyHuntur', level: 1, updatedAt: 100 }]);

    const acc = await s.loadAccount();
    expect(acc.settings).toEqual(defaultSettings());
    acc.settings.textScale = 1.5;
    acc.characterIds = ['c1'];
    await s.saveAccount(acc);
    expect((await s.loadAccount()).settings.textScale).toBe(1.5);

    await s.deleteCharacter('c1');
    expect(await s.loadCharacter('c1')).toBeNull();
    expect((await s.loadAccount()).characterIds).toEqual([]);
  });

  it('refuses to save invalid characters', async () => {
    const s = createIdbSaveStore(uniq());
    const c = newCharacterSave('yediKnight', 'Bad', { id: 'bad' });
    c.inventory.items.push({ item: it_('d'), x: 0, y: 0 }, { item: it_('d'), x: 1, y: 0 });
    await expect(s.saveCharacter(c)).rejects.toThrow();
  });

  it('recovers from a corrupt latest snapshot using backups (max 3 kept)', async () => {
    const db = uniq();
    const s = createIdbSaveStore(db);
    await s.ready;
    const c = newCharacterSave('yediKnight', 'Han', { id: 'h' });
    for (let lvl = 1; lvl <= 6; lvl++) {
      c.level = lvl;
      await s.saveCharacter(c);
    }
    s.close();

    const kv = await IdbKV.open(db);
    const rec = (await kv.get('char:h')) as { latest: { data: string; sum: string }; backups: unknown[] };
    expect(rec.backups).toHaveLength(3);
    rec.latest.data = rec.latest.data.slice(0, 20); // truncated write, checksum now mismatches
    await kv.put('char:h', rec);
    kv.close();

    const s2 = createIdbSaveStore(db);
    const loaded = await s2.loadCharacter('h');
    expect(loaded?.level).toBe(5); // newest backup
    expect(s2.info().recoveries.join()).toMatch(/backup 1/);

    // everything corrupt -> null, no throw
    s2.close();
    const kv2 = await IdbKV.open(db);
    await kv2.put('char:h', { v: 1, latest: { data: '{', sum: 'x' }, backups: [] });
    kv2.close();
    const s3 = createIdbSaveStore(db);
    expect(await s3.loadCharacter('h')).toBeNull();
    s3.close();
  });

  it('exports and imports with validation', async () => {
    const a = createIdbSaveStore(uniq());
    const c = newCharacterSave('forseAdept', 'Yoda', { id: 'y' });
    c.level = 30;
    await a.saveCharacter(c);
    const acc = await a.loadAccount();
    acc.settings.sfxVolume = 0.1;
    await a.saveAccount(acc);
    const blob = await a.exportAll();
    expect(blob.type).toBe('application/json');

    const b = createIdbSaveStore(uniq());
    await b.importAll(blob);
    expect((await b.loadCharacter('y'))?.level).toBe(30);
    const acc2 = await b.loadAccount();
    expect(acc2.settings.sfxVolume).toBeCloseTo(0.1);
    expect(acc2.characterIds).toContain('y');

    await expect(b.importAll(new Blob(['not json']))).rejects.toBeInstanceOf(ImportError);
    await expect(b.importAll(new Blob(['{"format":"other"}']))).rejects.toBeInstanceOf(ImportError);
    const damaged = new Blob([
      JSON.stringify({
        format: 'diablo-tiny-error-save',
        version: 1,
        characters: [{ id: 'z', classId: 'nope' }],
      }),
    ]);
    await expect(b.importAll(damaged)).rejects.toBeInstanceOf(ImportError);
    expect(await b.loadCharacter('z')).toBeNull();
  });

  it('falls back to localStorage then memory when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    });
    const s = createIdbSaveStore('ls-test');
    const info = await s.ready;
    expect(info.backend).toBe('localStorage');
    expect(info.degraded).toBe(true);
    const c = newCharacterSave('yediKnight', 'LS', { id: 'ls1' });
    await s.saveCharacter(c);
    expect((await s.loadCharacter('ls1'))?.name).toBe('LS');
    expect([...store.keys()].some((k) => k.startsWith('ls-test:char:'))).toBe(true);

    vi.stubGlobal('localStorage', undefined);
    const m = createIdbSaveStore('mem-test');
    expect((await m.ready).backend).toBe('memory');
    await m.saveCharacter(c);
    expect((await m.loadCharacter('ls1'))?.name).toBe('LS');
  });

  it('requests persistent storage when available', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { storage: { persist } });
    const s = createIdbSaveStore(uniq());
    const info = await s.ready;
    expect(persist).toHaveBeenCalled();
    expect(info.persisted).toBe(true);
  });
});
