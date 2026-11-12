/**
 * Minimal IndexedDB wrapper. Three object stores with out-of-line keys:
 * `queries` (last server result per query), `outbox` (pending mutations) and
 * `meta` (id map, owner). Falls back to no-ops where IndexedDB is missing.
 *
 * Nothing here may hang. iOS WebKit loses the IndexedDB connection while a web
 * app sits in the background, and a transaction on that connection can then
 * never fire complete, error or abort. Every write goes through here before it
 * is sent to Convex, so one hung transaction left Save on "Saving…" forever on
 * iPhones. Each call now gives up after IDB_TIMEOUT_MS, and a connection that
 * timed out, threw or closed is dropped, so the next call opens a fresh one.
 */

export type StoreName = "queries" | "outbox" | "meta";

const DB_NAME = "unsplit-offline";
const DB_VERSION = 1;
/** A healthy write takes milliseconds; past this the connection is treated as dead. */
const IDB_TIMEOUT_MS = 2500;

let dbPromise: Promise<IDBDatabase | null> | null = null;

/** Forget the connection (if it is still the current one) so the next call reopens the database. */
function drop(db: IDBDatabase | null) {
  if (!dbPromise) return;
  const current = dbPromise;
  void current.then((d) => {
    if (dbPromise !== current || (db && d !== db)) return;
    dbPromise = null;
    try {
      d?.close();
    } catch {
      /* already closed */
    }
  });
}

/** Resolves with `fallback` if `work` hasn't settled in time, and drops the connection then. */
function bounded<T>(work: (done: (v: T) => void) => void, fallback: T, db: IDBDatabase | null): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const done = (v: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      drop(db);
      resolve(fallback);
    }, IDB_TIMEOUT_MS);
    try {
      work(done);
    } catch {
      // InvalidStateError and friends: the connection is gone.
      drop(db);
      done(fallback);
    }
  });
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  const opening = bounded<IDBDatabase | null>((done) => {
    if (typeof indexedDB === "undefined") return done(null);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of ["queries", "outbox", "meta"] as const) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        drop(db);
      };
      // Fires when the browser closes the connection itself (WebKit does this in the background).
      db.onclose = () => drop(db);
      done(db);
    };
    req.onerror = () => done(null);
    req.onblocked = () => done(null);
  }, null, null);
  dbPromise = opening;
  // No database this time (missing, blocked, timed out): try again on the next call.
  void opening.then((db) => {
    if (!db && dbPromise === opening) dbPromise = null;
  });
  return opening;
}

/**
 * Runs one request in its own transaction and resolves once the transaction
 * has committed (not on request success, which fires earlier: a reload right
 * after a write would otherwise drop it), or with undefined once it fails or
 * takes too long.
 */
function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return openDb().then((db) => {
    if (!db) return undefined;
    return bounded<T | undefined>((done) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => done(req.result);
      t.onerror = () => done(undefined);
      t.onabort = () => done(undefined);
    }, undefined, db);
  });
}

export const idb = {
  async getAll<T>(store: StoreName): Promise<{ key: string; value: T }[]> {
    const db = await openDb();
    if (!db) return [];
    return bounded<{ key: string; value: T }[]>((done) => {
      const t = db.transaction(store, "readonly");
      const s = t.objectStore(store);
      const keysReq = s.getAllKeys();
      const valsReq = s.getAll();
      t.oncomplete = () => {
        const keys = keysReq.result as string[];
        const vals = valsReq.result as T[];
        done(keys.map((key, i) => ({ key, value: vals[i] })));
      };
      t.onerror = () => done([]);
      t.onabort = () => done([]);
    }, [], db);
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
