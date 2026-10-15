/**
 * Minimal IndexedDB wrapper. Three object stores with out-of-line keys:
 * `queries` (last server result per query), `outbox` (pending mutations) and
 * `meta` (id map, owner). Falls back to no-ops where IndexedDB is missing.
 */

export type StoreName = "queries" | "outbox" | "meta";

const DB_NAME = "unsplit-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of ["queries", "outbox", "meta"] as const) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/**
 * Runs one request in its own transaction and resolves once the transaction
 * has committed (not on request success, which fires earlier: a reload right
 * after a write would otherwise drop it).
 */
function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const t = db.transaction(store, mode);
          const req = fn(t.objectStore(store));
          t.oncomplete = () => resolve(req.result);
          t.onerror = () => resolve(undefined);
          t.onabort = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export const idb = {
  async getAll<T>(store: StoreName): Promise<{ key: string; value: T }[]> {
    const db = await openDb();
    if (!db) return [];
    return new Promise((resolve) => {
      try {
        const t = db.transaction(store, "readonly");
        const s = t.objectStore(store);
        const keysReq = s.getAllKeys();
        const valsReq = s.getAll();
        t.oncomplete = () => {
          const keys = keysReq.result as string[];
          const vals = valsReq.result as T[];
          resolve(keys.map((key, i) => ({ key, value: vals[i] })));
        };
        t.onerror = () => resolve([]);
        t.onabort = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  },
  put(store: StoreName, key: string, value: unknown): Promise<unknown> {
    return run(store, "readwrite", (s) => s.put(value, key));
  },
  delete(store: StoreName, key: string): Promise<unknown> {
    return run(store, "readwrite", (s) => s.delete(key));
  },
  clear(store: StoreName): Promise<unknown> {
    return run(store, "readwrite", (s) => s.clear());
  },
};
