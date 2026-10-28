/**
 * The sync engine. Every write goes through `submit`: it lands in the durable
 * outbox first, then is sent to Convex in order whenever the socket is up.
 * Online, callers wait for the server's answer (so forms can show validation
 * errors inline). Offline, or if the connection drops while waiting, callers
 * get the optimistic result straight away and the op stays queued.
 */
import { ConvexError } from "convex/values";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { ConvexReactClient } from "convex/react";
import { toast } from "sonner";
import { containsTempId, rewriteIds, tempId } from "./ids";
import { SPECS, type PrepareCtx } from "./specs";
import type { OfflineStore } from "./store";
import { OfflineError, type Op, type SyncStatus } from "./types";

type Waiter = { resolve: (v: unknown) => void; reject: (e: unknown) => void; optimistic: unknown };

/**
 * How long the socket may be down before the UI calls it offline. The socket
 * closes and reopens on every launch (the auth token is applied after the
 * first connect) and on quick reconnects; neither should flash the banner.
 * No network (`navigator.onLine` false) still shows at once.
 */
const OFFLINE_GRACE_MS = 4000;

function errorText(e: unknown): string {
  if (e instanceof ConvexError) return typeof e.data === "string" ? e.data : "Something went wrong";
  if (e instanceof Error) {
    const m = e.message.match(/Uncaught (?:ConvexError|Error): ([^\n]+)/);
    if (m) return m[1];
    return e.message.length > 200 ? "Something went wrong" : e.message;
  }
  return "Something went wrong";
}

export class SyncEngine {
  private listeners = new Set<() => void>();
  private waiters = new Map<string, Waiter>();
  private draining = false;
  private socketUp = false;
  /** The socket has been down for longer than the grace period. */
  private stale = false;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private client: ConvexReactClient;
  private store: OfflineStore;
  status: SyncStatus;

  constructor(client: ConvexReactClient, store: OfflineStore) {
    this.client = client;
    this.store = store;
    this.status = { online: typeof navigator === "undefined" ? true : navigator.onLine, connected: false, offline: false, syncing: false, pending: 0, lastError: null };
    this.socketUp = client.connectionState().isWebSocketConnected;
    this.watchStale();
    client.subscribeToConnectionState((s) => {
      const was = this.socketUp;
      this.socketUp = s.isWebSocketConnected;
      if (was !== this.socketUp) this.watchStale();
      this.recompute();
      if (!was && this.socketUp) void this.drain();
      if (was && !this.socketUp) this.releaseWaiters();
    });
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        this.recompute();
        void this.drain();
      });
      window.addEventListener("offline", () => {
        this.recompute();
        this.releaseWaiters();
      });
    }
    store.subscribe(() => this.recompute());
    void store.hydrated.then(() => {
      this.recompute();
      void this.drain();
    });
    this.recompute();
  }

  // ---------- status ----------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Socket down: count it as offline only once it has stayed down for the grace period. Socket up: never. */
  private watchStale() {
    if (this.staleTimer) clearTimeout(this.staleTimer);
    this.staleTimer = null;
    this.stale = false;
    if (this.socketUp) return;
    this.staleTimer = setTimeout(() => {
      this.staleTimer = null;
      this.stale = true;
      this.recompute();
    }, OFFLINE_GRACE_MS);
  }

  private recompute() {
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    const connected = this.socketUp;
    const next: SyncStatus = {
      online,
      connected,
      offline: !online || (!connected && this.stale),
      syncing: this.draining && connected && this.store.outbox.length > 0,
      pending: this.store.outbox.length,
      lastError: this.status.lastError,
    };
    const s = this.status;
    if (s.online === next.online && s.connected === next.connected && s.offline === next.offline && s.syncing === next.syncing && s.pending === next.pending && s.lastError === next.lastError) return;
    this.status = next;
    for (const l of this.listeners) l();
  }

  /** Writes can be sent right now. */
  isConnected(): boolean {
    return this.status.online && this.socketUp;
  }

  // ---------- submit ----------

  async submit(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const spec = SPECS[fn];
    if (!spec) {
      if (!this.isConnected()) throw new OfflineError();
      return this.client.mutation(makeFunctionReference<"mutation">(fn) as FunctionReference<"mutation">, args);
    }
    await this.store.hydrated;
    const me = this.store.me();
    if (!me) throw new Error("Still loading your account. Try again in a moment.");
    const dir = this.store.directory();
    const ctx: PrepareCtx = {
      me,
      dir,
      read: (name, a) => this.store.readView(name, a),
      expenseRows: () => this.cachedExpenseRows(),
    };
    const prepared = spec.prepare(args, ctx);
    const op: Op = {
      id: `op_${tempId("op").slice(4)}`,
      seq: this.store.nextSeq(),
      fn,
      args: prepared.args,
      tempId: prepared.tempId,
      extra: prepared.extra,
      me,
      createdAt: Date.now(),
      attempts: 0,
    };
    await this.store.enqueue(op);
    if (!this.isConnected()) {
      void this.drain();
      return prepared.result;
    }
    return new Promise((resolve, reject) => {
      this.waiters.set(op.id, { resolve, reject, optimistic: prepared.result });
      void this.drain();
    });
  }

  private *cachedExpenseRows() {
    for (const e of this.store.entries()) {
      if (e.name === "expenses:list") {
        const v = this.store.readView(e.name, e.args) as { items: never[] } | undefined;
        if (v) yield* v.items;
      } else if (e.name === "expenses:recurring" || e.name === "expenses:deleted") {
        const v = this.store.readView(e.name, e.args) as never[] | undefined;
        if (v) yield* v;
      }
    }
  }

  /** The connection went away: callers stop waiting and get the optimistic value. The ops stay queued. */
  private releaseWaiters() {
    for (const [id, w] of this.waiters) {
      this.waiters.delete(id);
      w.resolve(w.optimistic);
    }
  }

  // ---------- drain ----------

  async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    this.recompute();
    try {
      await this.store.hydrated;
      while (this.isConnected() && this.store.outbox.length > 0) {
        const op = this.store.outbox[0];
        const args = rewriteIds(op.args, this.store.idMap);
        if (containsTempId(args) || containsTempId(op.extra?.userId)) {
          await this.fail(op, "it depends on an earlier change that didn't go through");
          continue;
        }
        const spec = SPECS[op.fn];
        const sendArgs = spec?.clientKey ? { ...args, clientKey: op.id } : args;
        await this.store.updateOp(op.id, { attempts: op.attempts + 1 });
        let result: unknown;
        try {
          result = await this.client.mutation(makeFunctionReference<"mutation">(op.fn) as FunctionReference<"mutation">, sendArgs);
        } catch (e) {
          if (!this.isConnected()) break; // transient: keep it for the next connection
          await this.fail(op, errorText(e), e);
          continue;
        }
        await this.store.complete(op.id, spec?.mapResult?.(op, result) ?? []);
        const w = this.waiters.get(op.id);
        if (w) {
          this.waiters.delete(op.id);
          w.resolve(result);
        }
        this.status = { ...this.status, lastError: null };
      }
    } finally {
      this.draining = false;
      this.recompute();
    }
  }

  private async fail(op: Op, reason: string, error?: unknown) {
    const spec = SPECS[op.fn];
    await this.store.removeOp(op.id);
    const w = this.waiters.get(op.id);
    if (w) {
      this.waiters.delete(op.id);
      w.reject(error ?? new Error(reason));
    } else {
      // Nobody is waiting (it was queued offline): say so, since the UI showed it as done.
      toast.error(`${spec?.label ?? "A change"} couldn't be synced: ${reason}`, { duration: 8000 });
    }
    this.status = { ...this.status, lastError: reason };
  }
}
