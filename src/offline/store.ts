/**
 * In-memory mirror of the offline database, with change notification for
 * React. Holds the last server result of every query, the outbox of pending
 * mutations, and the temp-id → real-id map.
 *
 * Reads go through `getView`, which lays the pending outbox over the server
 * value so the UI shows what the user did even before the server has it.
 */
import { idb } from "./db";
import { queryKey, rewriteIds } from "./ids";
import { applyOp, buildDirectory, type Directory, type Query } from "./overlay";
import type { MeInfo, Op, QueryEntry } from "./types";

type Listener = () => void;
type ViewEntry = { base: unknown; opsVersion: number; value: unknown };

export class OfflineStore {
  private server = new Map<string, QueryEntry>();
  private ops: Op[] = [];
  private _idMap: Record<string, string> = {};
  private ownerId: string | null = null;
  private seq = 0;
  private listeners = new Set<Listener>();
  private views = new Map<string, ViewEntry>();
  private dir: { opsVersion: number; serverVersion: number; value: Directory } | null = null;

  /** Bumped when the outbox or the id map changes; views depend on this. */
  opsVersion = 0;
  /** Bumped when any server value changes; the name directory depends on this. */
  serverVersion = 0;
  isHydrated = false;
  readonly hydrated: Promise<void>;

  constructor() {
    this.hydrated = this.hydrate();
  }

  private async hydrate() {
    const [queries, outbox, meta] = await Promise.all([idb.getAll<QueryEntry>("queries"), idb.getAll<Op>("outbox"), idb.getAll<unknown>("meta")]);
    for (const q of queries) if (q.value && typeof q.value === "object" && "name" in q.value) this.server.set(q.key, q.value);
    this.ops = outbox.map((o) => o.value).filter((o) => o && typeof o === "object" && "fn" in o).sort((a, b) => a.seq - b.seq);
    for (const op of this.ops) this.seq = Math.max(this.seq, op.seq);
    for (const m of meta) {
      if (m.key === "idMap" && m.value && typeof m.value === "object") this._idMap = m.value as Record<string, string>;
      if (m.key === "ownerId" && typeof m.value === "string") this.ownerId = m.value;
    }
    this.isHydrated = true;
    this.opsVersion++;
    this.serverVersion++;
    this.notify();
  }

  // ---------- subscriptions ----------

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private notify() {
    for (const l of this.listeners) l();
  }

  // ---------- server values ----------

  setServerValue(name: string, args: Record<string, unknown>, value: unknown) {
    const key = queryKey(name, args);
    const prev = this.server.get(key);
    if (prev && prev.value === value) return;
    const entry: QueryEntry = { name, args, value, at: Date.now() };
    this.server.set(key, entry);
    this.serverVersion++;
    void idb.put("queries", key, entry);
    if (name === "users:me" && value && typeof value === "object" && "_id" in value) void this.setOwner((value as { _id: string })._id);
    this.notify();
  }

  getServerValue(name: string, args: Record<string, unknown>): unknown {
    return this.server.get(queryKey(name, args))?.value;
  }

  /** The signed-in user, from the cached `users.me`. */
  me(): MeInfo | null {
    const v = this.getServerValue("users:me", {}) as { _id: string; name: string; email?: string; image?: string } | null | undefined;
    if (!v) return null;
    return { _id: v._id, name: v.name, email: v.email, image: v.image };
  }

  /** The cache belongs to one account. A different account signing in on this browser starts clean. */
  async setOwner(userId: string) {
    if (this.ownerId === userId) return;
    if (this.ownerId !== null) {
      await this.wipe({ keepMe: true });
    }
    this.ownerId = userId;
    await idb.put("meta", "ownerId", userId);
  }

  // ---------- views ----------

  /** Server value with the outbox applied on top. Stable identity while nothing relevant changes. */
  getView(name: string, args: Record<string, unknown>, live: unknown): unknown {
    const key = queryKey(name, args);
    const base = live !== undefined ? live : this.server.get(key)?.value;
    const cached = this.views.get(key);
    if (cached && cached.base === base && cached.opsVersion === this.opsVersion) return cached.value;
    const value = this.ops.length === 0 ? base : this.compute({ name, args }, base);
    this.views.set(key, { base, opsVersion: this.opsVersion, value });
    return value;
  }

  private compute(q: Query, base: unknown): unknown {
    const dir = this.directory();
    let v = base;
    for (const op of this.ops) {
      try {
        v = applyOp({ ...op, args: rewriteIds(op.args, this._idMap) }, q, v, dir);
      } catch (e) {
        if (import.meta.env.DEV) console.warn("offline overlay failed", op.fn, e);
      }
    }
    return v;
  }

  directory(): Directory {
    if (this.dir && this.dir.opsVersion === this.opsVersion && this.dir.serverVersion === this.serverVersion) return this.dir.value;
    const value = buildDirectory(this.server.values(), this.ops, this._idMap);
    this.dir = { opsVersion: this.opsVersion, serverVersion: this.serverVersion, value };
    return value;
  }

  /** Read a query through the overlay without subscribing (used when preparing a mutation). */
  readView(name: string, args: Record<string, unknown>): unknown {
    return this.getView(name, rewriteIds(args, this._idMap), undefined);
  }

  entries(): Iterable<QueryEntry> {
    return this.server.values();
  }

  // ---------- outbox ----------

  get outbox(): readonly Op[] {
    return this.ops;
  }

  nextSeq(): number {
    return ++this.seq;
  }

  /** Durable first, visible second: once the UI shows a change it has already been written to disk. */
  async enqueue(op: Op) {
    await idb.put("outbox", op.id, op);
    this.ops = [...this.ops, op];
    this.opsVersion++;
    this.notify();
  }

  async updateOp(id: string, patch: Partial<Op>) {
    const i = this.ops.findIndex((o) => o.id === id);
    if (i < 0) return;
    const next = { ...this.ops[i], ...patch };
    this.ops = this.ops.map((o, j) => (j === i ? next : o));
    await idb.put("outbox", id, next);
  }

  async removeOp(id: string) {
    if (!this.ops.some((o) => o.id === id)) return;
    this.ops = this.ops.filter((o) => o.id !== id);
    this.opsVersion++;
    this.notify();
    await idb.delete("outbox", id);
  }

  // ---------- id map ----------

  get idMap(): Record<string, string> {
    return this._idMap;
  }

  /**
   * The server took an op: map its temp ids to the real ones and drop it in one step, so no
   * render shows the server's row next to the optimistic one, or a temp id still unmapped.
   */
  async complete(id: string, pairs: [string, string][]) {
    const next = { ...this._idMap };
    for (const [tmp, real] of pairs) if (tmp && real && tmp !== real) next[tmp] = real;
    this._idMap = next;
    this.ops = this.ops.filter((o) => o.id !== id);
    this.opsVersion++;
    this.notify();
    await Promise.all([idb.put("meta", "idMap", next), idb.delete("outbox", id)]);
  }

  // ---------- lifecycle ----------

  /** Forget everything (sign-out, or another account). */
  async wipe(opts: { keepMe?: boolean } = {}) {
    const me = opts.keepMe ? this.server.get(queryKey("users:me", {})) : undefined;
    this.server.clear();
    if (me) this.server.set(queryKey("users:me", {}), me);
    this.ops = [];
    this._idMap = {};
    this.ownerId = null;
    this.views.clear();
    this.dir = null;
    this.opsVersion++;
    this.serverVersion++;
    this.notify();
    await Promise.all([idb.clear("queries"), idb.clear("outbox"), idb.clear("meta")]);
    if (me) await idb.put("queries", queryKey("users:me", {}), me);
  }
}
