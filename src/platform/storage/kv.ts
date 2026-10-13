/** Tiny async key-value backends: IndexedDB, localStorage, memory. */

export type BackendKind = 'indexeddb' | 'localStorage' | 'memory';

export interface KV {
  readonly kind: BackendKind;
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

const STORE = 'kv';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('idb request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('idb tx failed'));
    tx.onabort = () => reject(tx.error ?? new Error('idb tx aborted'));
  });
}

export class IdbKV implements KV {
  readonly kind = 'indexeddb' as const;
  constructor(private readonly db: IDBDatabase) {}

  static open(name: string, timeoutMs = 4000): Promise<IdbKV> {
    return new Promise((resolve, reject) => {
      const factory = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
      if (!factory) return reject(new Error('indexedDB unavailable'));
      const timer = setTimeout(() => reject(new Error('indexedDB open timed out')), timeoutMs);
      let r: IDBOpenDBRequest;
      try {
        r = factory.open(name, 1);
      } catch (e) {
        clearTimeout(timer);
        return reject(e);
      }
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
      };
      r.onsuccess = () => {
        clearTimeout(timer);
        resolve(new IdbKV(r.result));
      };
      r.onerror = () => {
        clearTimeout(timer);
        reject(r.error ?? new Error('indexedDB open failed'));
      };
      r.onblocked = () => {
        clearTimeout(timer);
        reject(new Error('indexedDB blocked'));
      };
    });
  }

  async get(key: string): Promise<unknown> {
    return req(this.db.transaction(STORE, 'readonly').objectStore(STORE).get(key));
  }

  async put(key: string, value: unknown): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    await txDone(tx);
  }

  async remove(key: string): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    await txDone(tx);
  }

  async keys(prefix: string): Promise<string[]> {
    const all = (await req(
      this.db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys(),
    )) as IDBValidKey[];
    return all.filter((k): k is string => typeof k === 'string' && k.startsWith(prefix));
  }

  close(): void {
    this.db.close();
  }
}

export class LocalStorageKV implements KV {
  readonly kind = 'localStorage' as const;
  constructor(
    private readonly ls: Storage,
    private readonly ns: string,
  ) {}

  /** Throws if localStorage is missing or not writable (Safari private mode with quota 0). */
  static probe(ns: string): LocalStorageKV {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (!ls) throw new Error('localStorage unavailable');
    const k = `${ns}:__probe`;
    ls.setItem(k, '1');
    ls.removeItem(k);
    return new LocalStorageKV(ls, ns);
  }

  async get(key: string): Promise<unknown> {
    const s = this.ls.getItem(`${this.ns}:${key}`);
    if (s === null) return undefined;
    try {
      return JSON.parse(s);
    } catch {
      return s; // corrupt: let the record validator reject it
    }
  }

  async put(key: string, value: unknown): Promise<void> {
    this.ls.setItem(`${this.ns}:${key}`, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    this.ls.removeItem(`${this.ns}:${key}`);
  }

  async keys(prefix: string): Promise<string[]> {
    const out: string[] = [];
    const p = `${this.ns}:`;
    for (let i = 0; i < this.ls.length; i++) {
      const k = this.ls.key(i);
      if (k && k.startsWith(p) && k.slice(p.length).startsWith(prefix)) out.push(k.slice(p.length));
    }
    return out;
  }
}

export class MemoryKV implements KV {
  readonly kind = 'memory' as const;
  private readonly m = new Map<string, unknown>();
  async get(key: string): Promise<unknown> {
    return this.m.get(key);
  }
  async put(key: string, value: unknown): Promise<void> {
    this.m.set(key, structuredClone(value));
  }
  async remove(key: string): Promise<void> {
    this.m.delete(key);
  }
  async keys(prefix: string): Promise<string[]> {
    return [...this.m.keys()].filter((k) => k.startsWith(prefix));
  }
}
