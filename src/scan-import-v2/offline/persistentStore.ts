/**
 * Persistent key-value stores for the Scan Import 2.0 offline cache. Three backends, one contract:
 * memory (tests), Web Storage (localStorage — survives reload/restart), IndexedDB (browser, no extra
 * dependency). The cache logic never depends on which backend is underneath.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

export function createMemoryStore(
  seed: Map<string, string> = new Map(),
): KeyValueStore & { map: Map<string, string> } {
  return {
    map: seed,
    async get(key) {
      return seed.get(key) ?? null;
    },
    async set(key, value) {
      seed.set(key, value);
    },
    async delete(key) {
      seed.delete(key);
    },
    async keys(prefix) {
      return [...seed.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

/** Web Storage (localStorage / sessionStorage or any object with the same four members). */
export interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export function createWebStorageStore(
  storage: WebStorageLike,
  namespace = 'scan-import-v2:',
): KeyValueStore {
  const k = (key: string) => `${namespace}${key}`;
  return {
    async get(key) {
      try {
        return storage.getItem(k(key));
      } catch {
        return null;
      }
    },
    async set(key, value) {
      try {
        storage.setItem(k(key), value);
      } catch {
        /* quota or disabled storage: the cache is a convenience, never a requirement */
      }
    },
    async delete(key) {
      try {
        storage.removeItem(k(key));
      } catch {
        /* ignore */
      }
    },
    async keys(prefix) {
      const out: string[] = [];
      try {
        for (let i = 0; i < storage.length; i += 1) {
          const key = storage.key(i);
          if (key && key.startsWith(k(prefix))) out.push(key.slice(namespace.length));
        }
      } catch {
        /* ignore */
      }
      return out;
    },
  };
}

/** IndexedDB backend (browser). Opens lazily; every failure degrades to "no cache", never to an exception. */
export function createIndexedDbStore(
  dbName = 'scan-import-v2',
  storeName = 'offline-cache',
): KeyValueStore {
  let dbPromise: Promise<IDBDatabase | null> | null = null;
  const open = (): Promise<IDBDatabase | null> => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') {
          resolve(null);
          return;
        }
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(storeName))
            req.result.createObjectStore(storeName);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return dbPromise;
  };
  const run = <T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T | null> =>
    open().then(
      (db) =>
        new Promise<T | null>((resolve) => {
          if (!db) {
            resolve(null);
            return;
          }
          try {
            const tx = db.transaction(storeName, mode);
            const req = fn(tx.objectStore(storeName));
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        }),
    );
  return {
    async get(key) {
      const v = await run<unknown>('readonly', (s) => s.get(key));
      return typeof v === 'string' ? v : null;
    },
    async set(key, value) {
      await run('readwrite', (s) => s.put(value, key));
    },
    async delete(key) {
      await run('readwrite', (s) => s.delete(key));
    },
    async keys(prefix) {
      const all = (await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())) ?? [];
      return all.filter((k): k is string => typeof k === 'string' && k.startsWith(prefix));
    },
  };
}
