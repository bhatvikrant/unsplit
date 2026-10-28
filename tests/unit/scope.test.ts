import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defaultScope, lastScope, rememberScope } from "../../src/lib/scope";

// node has no localStorage; a map stands in for the browser's
const store = new Map<string, string>();
const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
const g = globalThis as { localStorage?: unknown };
let prev: unknown;
beforeAll(() => {
  prev = g.localStorage;
  g.localStorage = fake;
});
afterAll(() => {
  g.localStorage = prev;
});
beforeEach(() => store.clear());

describe("defaultScope", () => {
  it("starts on the scope used last, while it still exists", () => {
    rememberScope({ kind: "group", id: "g2" });
    expect(lastScope()).toEqual({ kind: "group", id: "g2" });
    expect(defaultScope(["g1", "g2"], ["f1"])).toEqual({ kind: "group", id: "g2" });
    rememberScope({ kind: "friend", id: "f1" });
    expect(defaultScope(["g1", "g2"], ["f1"])).toEqual({ kind: "friend", id: "f1" });
    expect(defaultScope(["g1", "g2"], [])).toBeNull();
  });
  it("starts on the only group or friend there is", () => {
    expect(defaultScope(["g1"], [])).toEqual({ kind: "group", id: "g1" });
    expect(defaultScope([], ["f1"])).toEqual({ kind: "friend", id: "f1" });
    expect(defaultScope(["g1"], ["f1"])).toBeNull();
    expect(defaultScope([], [])).toBeNull();
  });
  it("ignores what it cannot read", () => {
    localStorage.setItem("unsplit.lastScope", "nonsense");
    expect(lastScope()).toBeNull();
  });
});
