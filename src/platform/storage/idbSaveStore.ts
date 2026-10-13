/**
 * SaveStore implementation. Each record keeps the latest snapshot plus up to 3 previous ones, all
 * with checksums, so a corrupt latest write is recovered from the newest valid backup.
 */
import type { AccountSave, CharacterSave, SaveStore } from '@/core/save/types';
import { defaultAccount } from '@/core/save/defaults';
import { migrateAccount, migrateCharacter } from '@/core/save/migrate';
import type { MigrateResult } from '@/core/save/migrate';
import { checksum, parseSave, stringifySave } from '@/core/save/serialize';
import { IdbKV, LocalStorageKV, MemoryKV } from './kv';
import type { BackendKind, KV } from './kv';

export const EXPORT_FILENAME = 'diablo-tiny-error-save.json';
export const EXPORT_FORMAT = 'diablo-tiny-error-save';
export const MAX_BACKUPS = 3;

const CHAR_PREFIX = 'char:';
const ACCOUNT_KEY = 'account';

interface Snap {
  data: string;
  sum: string;
}
interface Record_ {
  v: 1;
  latest: Snap;
  /** Newest first. */
  backups: Snap[];
}

export interface SaveStoreInfo {
  /** Which backend actually holds saves. 'memory' means saves vanish on reload: warn the player. */
  backend: BackendKind;
  /** True when the backend is not IndexedDB (UI should show a warning banner). */
  degraded: boolean;
  /** Result of navigator.storage.persist() (null if unsupported / not asked yet). */
  persisted: boolean | null;
  /** Human-readable notes about recoveries from backups during this session. */
  recoveries: string[];
}

export interface PlatformSaveStore extends SaveStore {
  /** Resolves once the backend is chosen. */
  readonly ready: Promise<SaveStoreInfo>;
  info(): SaveStoreInfo;
  close(): void;
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

const isRecord = (v: unknown): v is Record_ =>
  !!v &&
  typeof v === 'object' &&
  (v as Record_).v === 1 &&
  isSnap((v as Record_).latest) &&
  Array.isArray((v as Record_).backups);

function isSnap(s: unknown): s is Snap {
  return (
    !!s &&
    typeof s === 'object' &&
    typeof (s as Snap).data === 'string' &&
    typeof (s as Snap).sum === 'string'
  );
}

const snap = (data: string): Snap => ({ data, sum: checksum(data) });

function tryRead<T>(s: unknown, migrate: (raw: unknown) => MigrateResult<T>): T | null {
  if (!isSnap(s) || checksum(s.data) !== s.sum) return null;
  try {
    const r = migrate(parseSave(s.data));
    return r.ok ? r.value : null;
  } catch {
    return null;
  }
}

export function createIdbSaveStore(dbName = 'diablo-tiny-error'): PlatformSaveStore {
  const state: SaveStoreInfo = { backend: 'memory', degraded: true, persisted: null, recoveries: [] };
  let kv: KV | null = null;

  const ready = (async (): Promise<SaveStoreInfo> => {
    try {
      const idb = await IdbKV.open(dbName);
      await idb.put('__probe', 1);
      await idb.remove('__probe');
      kv = idb;
    } catch {
      try {
        kv = LocalStorageKV.probe(dbName);
      } catch {
        kv = new MemoryKV();
      }
    }
    state.backend = kv.kind;
    state.degraded = kv.kind !== 'indexeddb';
    try {
      const storage = (globalThis as { navigator?: Navigator }).navigator?.storage;
      if (storage?.persist) state.persisted = await storage.persist();
    } catch {
      state.persisted = false;
    }
    return state;
  })();

  const backend = async (): Promise<KV> => {
    await ready;
    return kv!;
  };

  // Serialize writes so concurrent saves never interleave read-modify-write of the backup chain.
  let chain: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn, fn);
    chain = p.catch(() => undefined);
    return p;
  };

  async function writeRecord(key: string, value: unknown): Promise<void> {
    const b = await backend();
    const data = stringifySave(value);
    const prev = await b.get(key);
    let backups: Snap[] = [];
    if (isRecord(prev)) {
      backups = [prev.latest, ...prev.backups].filter(isSnap).slice(0, MAX_BACKUPS);
    }
    const rec: Record_ = { v: 1, latest: snap(data), backups };
    await b.put(key, rec);
  }

  async function readRecord<T>(
    key: string,
    migrate: (raw: unknown) => MigrateResult<T>,
    label: string,
  ): Promise<T | null> {
    const b = await backend();
    const rec = await b.get(key);
    if (rec === undefined || rec === null) return null;
    if (isRecord(rec)) {
      const latest = tryRead(rec.latest, migrate);
      if (latest) return latest;
      for (let i = 0; i < rec.backups.length; i++) {
        const v = tryRead(rec.backups[i], migrate);
        if (v) {
          state.recoveries.push(`${label}: restored from backup ${i + 1}`);
          return v;
        }
      }
    }
    state.recoveries.push(`${label}: save was unreadable`);
    return null;
  }

  const store: PlatformSaveStore = {
    ready,
    info: () => ({ ...state, recoveries: [...state.recoveries] }),
    close() {
      if (kv instanceof IdbKV) kv.close();
    },

    async listCharacters() {
      const b = await backend();
      const out = [];
      for (const k of await b.keys(CHAR_PREFIX)) {
        const c = await readRecord(k, migrateCharacter, k);
        if (c)
          out.push({ id: c.id, name: c.name, classId: c.classId, level: c.level, updatedAt: c.updatedAt });
      }
      return out.sort((a, z) => z.updatedAt - a.updatedAt);
    },

    loadCharacter(id) {
      return readRecord(CHAR_PREFIX + id, migrateCharacter, `character ${id}`);
    },

    saveCharacter(c) {
      return exclusive(async () => {
        const r = migrateCharacter(JSON.parse(stringifySave(c)));
        if (!r.ok) throw new Error(`refusing to save invalid character: ${r.error}`);
        await writeRecord(CHAR_PREFIX + c.id, r.value);
      });
    },

    deleteCharacter(id) {
      return exclusive(async () => {
        const b = await backend();
        await b.remove(CHAR_PREFIX + id);
        const acc = await readRecord(ACCOUNT_KEY, migrateAccount, 'account');
        if (acc && acc.characterIds.includes(id)) {
          await writeRecord(ACCOUNT_KEY, { ...acc, characterIds: acc.characterIds.filter((x) => x !== id) });
        }
      });
    },

    async loadAccount() {
      return (await readRecord(ACCOUNT_KEY, migrateAccount, 'account')) ?? defaultAccount();
    },

    saveAccount(a) {
      return exclusive(async () => {
        const r = migrateAccount(JSON.parse(stringifySave(a)));
        if (!r.ok) throw new Error(`refusing to save invalid account: ${r.error}`);
        await writeRecord(ACCOUNT_KEY, r.value);
      });
    },

    async exportAll() {
      const b = await backend();
      const characters: CharacterSave[] = [];
      for (const k of await b.keys(CHAR_PREFIX)) {
        const c = await readRecord(k, migrateCharacter, k);
        if (c) characters.push(c);
      }
      const account = await store.loadAccount();
      const body = stringifySave({
        format: EXPORT_FORMAT,
        version: 1,
        exportedAt: Date.now(),
        account,
        characters,
      });
      return new Blob([body], { type: 'application/json' });
    },

    async importAll(file) {
      let parsed: unknown;
      try {
        parsed = parseSave(await file.text());
      } catch {
        throw new ImportError('That file is not a valid save file.');
      }
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        (parsed as { format?: unknown }).format !== EXPORT_FORMAT
      ) {
        throw new ImportError('That file is not a Diablo Tiny Error save.');
      }
      const p = parsed as { account?: unknown; characters?: unknown };
      if (!Array.isArray(p.characters)) throw new ImportError('The save file has no characters.');
      const chars: CharacterSave[] = [];
      for (const raw of p.characters) {
        const r = migrateCharacter(raw);
        if (!r.ok) throw new ImportError(`A character in the file is damaged: ${r.error}`);
        chars.push(r.value);
      }
      let account: AccountSave | null = null;
      if (p.account !== undefined) {
        const r = migrateAccount(p.account);
        if (!r.ok) throw new ImportError(`The account data is damaged: ${r.error}`);
        account = r.value;
      }
      // All validated; now write (nothing is touched if validation failed).
      for (const c of chars) await store.saveCharacter(c);
      const current = account ?? (await store.loadAccount());
      const ids = new Set([...current.characterIds, ...chars.map((c) => c.id)]);
      await store.saveAccount({ ...current, characterIds: [...ids] });
    },
  };
  return store;
}
