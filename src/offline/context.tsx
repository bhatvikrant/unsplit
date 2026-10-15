/**
 * React bindings for the offline layer. `useQuery` and `useMutation` are
 * drop-in replacements for the ones in `convex/react`: reads come from the
 * last known server value with pending changes laid over it, and writes go
 * through the durable outbox.
 */
import { useConvexAuth as useTokenAuth } from "@convex-dev/auth/react";
import { useAction as useConvexAction, useQuery as useConvexQuery } from "convex/react";
import { getFunctionName, type FunctionReference, type FunctionReturnType, type OptionalRestArgs } from "convex/server";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { containsTempId, rewriteIds, stableStringify } from "./ids";
import type { OfflineStore } from "./store";
import type { SyncEngine } from "./sync";
import { OfflineError, type SyncStatus } from "./types";

type Offline = { store: OfflineStore; engine: SyncEngine };

const Ctx = createContext<Offline | null>(null);

export function useOffline(): Offline {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOffline must be used inside OfflineProvider");
  return v;
}

export function OfflineProvider({ store, engine, fallback, children }: { store: OfflineStore; engine: SyncEngine; fallback: ReactNode; children: ReactNode }) {
  const [hydrated, setHydrated] = useState(store.isHydrated);
  useEffect(() => {
    let alive = true;
    void store.hydrated.then(() => alive && setHydrated(true));
    return () => {
      alive = false;
    };
  }, [store]);
  // Signed out: nothing cached may outlive the session on this browser.
  const { isLoading, isAuthenticated } = useTokenAuth();
  useEffect(() => {
    if (hydrated && !isLoading && !isAuthenticated) void store.wipe();
  }, [hydrated, isLoading, isAuthenticated, store]);
  const value = useMemo(() => ({ store, engine }), [store, engine]);
  if (!hydrated) return <>{fallback}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

type Args<Q extends FunctionReference<"query">> = OptionalRestArgs<Q> | ["skip"];

/** Like `useQuery` from convex/react, but answers from the offline cache when the server can't be reached. */
export function useQuery<Q extends FunctionReference<"query">>(query: Q, ...args: Args<Q>): FunctionReturnType<Q> | undefined {
  const { store } = useOffline();
  const name = getFunctionName(query);
  const raw = args[0];
  const skip = raw === "skip";
  const rawKey = skip ? "skip" : stableStringify(raw ?? {});
  const opsVersion = useSyncExternalStore(store.subscribe, () => store.opsVersion);
  // Temp ids are rewritten to real ones as soon as the server hands them back.
  const mapped = useMemo(
    () => (skip ? undefined : rewriteIds((raw ?? {}) as Record<string, unknown>, store.idMap)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawKey, opsVersion, store],
  );
  const hasTemp = mapped !== undefined && containsTempId(mapped);
  // Convex never sees temp ids; those views come purely from the overlay.
  const live = useConvexQuery(query, ...((skip || hasTemp ? ["skip"] : [mapped]) as unknown as OptionalRestArgs<Q>));
  useEffect(() => {
    if (mapped !== undefined && live !== undefined) store.setServerValue(name, mapped, live);
  }, [store, name, mapped, live]);
  const snapshot = useCallback(() => (mapped === undefined ? undefined : store.getView(name, mapped, live)), [store, name, mapped, live]);
  return useSyncExternalStore(store.subscribe, snapshot) as FunctionReturnType<Q> | undefined;
}

/** Like `useMutation` from convex/react, but works offline: the change is queued and shown right away. */
export function useMutation<M extends FunctionReference<"mutation">>(mutation: M): (...args: OptionalRestArgs<M>) => Promise<FunctionReturnType<M>> {
  const { engine } = useOffline();
  const name = getFunctionName(mutation);
  return useCallback((...args: OptionalRestArgs<M>) => engine.submit(name, (args[0] ?? {}) as Record<string, unknown>) as Promise<FunctionReturnType<M>>, [engine, name]);
}

/** Actions always need the server; offline they fail fast with a readable message instead of hanging. */
export function useAction<A extends FunctionReference<"action">>(action: A): (...args: OptionalRestArgs<A>) => Promise<FunctionReturnType<A>> {
  const { engine } = useOffline();
  const run = useConvexAction(action);
  return useCallback(
    (...args: OptionalRestArgs<A>) => {
      if (!engine.isConnected()) return Promise.reject(new OfflineError());
      return run(...args) as Promise<FunctionReturnType<A>>;
    },
    [engine, run],
  );
}

export function useOfflineStatus(): SyncStatus {
  const { engine } = useOffline();
  return useSyncExternalStore(engine.subscribe, () => engine.status);
}

/** Returns a function that throws an OfflineError when there is no connection; for one-off reads like exports. */
export function useRequireOnline(): () => void {
  const { engine } = useOffline();
  return useCallback(() => {
    if (!engine.isConnected()) throw new OfflineError();
  }, [engine]);
}
