import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConvexReactClient } from "convex/react";
import { SyncEngine } from "../../src/offline/sync";
import type { OfflineStore } from "../../src/offline/store";

/**
 * The "offline" flag drives the banner. The socket closes and reopens on every
 * launch (and on quick reconnects), so only a drop that lasts past the grace
 * period counts; no network at all counts at once.
 */

type ConnState = { isWebSocketConnected: boolean; hasEverConnected: boolean; connectionRetries: number };

function fakeClient(initial: boolean) {
  let state: ConnState = { isWebSocketConnected: initial, hasEverConnected: initial, connectionRetries: 0 };
  const subs = new Set<(s: ConnState) => void>();
  const client = {
    connectionState: () => state,
    subscribeToConnectionState: (fn: (s: ConnState) => void) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    mutation: vi.fn(),
  } as unknown as ConvexReactClient;
  const set = (up: boolean) => {
    state = { isWebSocketConnected: up, hasEverConnected: state.hasEverConnected || up, connectionRetries: up ? 0 : state.connectionRetries + 1 };
    for (const fn of subs) fn(state);
  };
  return { client, set };
}

function fakeStore() {
  return { hydrated: Promise.resolve(), isHydrated: true, outbox: [], subscribe: () => () => {} } as unknown as OfflineStore;
}

let online = true;

beforeEach(() => {
  vi.useFakeTimers();
  online = true;
  vi.stubGlobal("navigator", { onLine: true });
  Object.defineProperty(navigator, "onLine", { get: () => online, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SyncEngine offline flag", () => {
  it("is not offline while the socket is still connecting on launch", async () => {
    const { client, set } = fakeClient(false);
    const engine = new SyncEngine(client, fakeStore());
    expect(engine.status.offline).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(engine.status.offline).toBe(false);
    set(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(engine.status.offline).toBe(false);
    expect(engine.status.connected).toBe(true);
  });

  it("ignores a socket drop that comes back within the grace period (the launch reconnect)", async () => {
    const { client, set } = fakeClient(true);
    const engine = new SyncEngine(client, fakeStore());
    set(false);
    expect(engine.status.offline).toBe(false);
    await vi.advanceTimersByTimeAsync(1500);
    expect(engine.status.offline).toBe(false);
    set(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(engine.status.offline).toBe(false);
  });

  it("goes offline once the socket has stayed down past the grace period, and back when it reconnects", async () => {
    const { client, set } = fakeClient(true);
    const engine = new SyncEngine(client, fakeStore());
    set(false);
    await vi.advanceTimersByTimeAsync(3999);
    expect(engine.status.offline).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(engine.status.offline).toBe(true);
    set(true);
    expect(engine.status.offline).toBe(false);
  });

  it("is offline immediately when the browser reports no network", () => {
    const { client, set } = fakeClient(true);
    const engine = new SyncEngine(client, fakeStore());
    online = false;
    set(false);
    expect(engine.status.offline).toBe(true);
    online = true;
    set(true);
    expect(engine.status.offline).toBe(false);
  });
});
