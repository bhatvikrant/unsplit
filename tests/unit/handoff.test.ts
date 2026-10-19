import { afterEach, describe, expect, it } from "vitest";
import { amountText, encodePayload, parseHandoff, returnUrl, stashHandoff, takeHandoff, type Handoff } from "../../src/lib/handoff";

const good: Handoff = {
  v: 1, source: "unmoney", refs: ["t1", "t2"], description: "Dinner, Taxi", currency: "inr", date: "2026-10-12", amount: "1245.50", category: "Food",
  items: [{ ref: "t1", name: "Dinner", amount: "1200.00" }, { ref: "t2", name: "Taxi", amount: "45.50" }],
};
const hashOf = (v: unknown) => `#unmoney=${encodePayload(v)}`;

describe("parseHandoff", () => {
  it("accepts what UnMoney sends and tidies it", () => {
    expect(parseHandoff(hashOf(good))).toEqual({ ...good, currency: "INR" });
    expect(parseHandoff(hashOf({ ...good, items: undefined, notes: " Birthday " }))).toEqual({ ...good, currency: "INR", items: undefined, notes: "Birthday" });
  });
  it("refuses anything else", () => {
    expect(parseHandoff("")).toBeNull();
    expect(parseHandoff("#unmoney=zzz")).toBeNull();
    expect(parseHandoff(hashOf({ ...good, v: 2 }))).toBeNull();
    expect(parseHandoff(hashOf({ ...good, source: "other" }))).toBeNull();
    expect(parseHandoff(hashOf({ ...good, refs: [] }))).toBeNull();
    expect(parseHandoff(hashOf({ ...good, date: "12/10/2026" }))).toBeNull();
    expect(parseHandoff(hashOf({ ...good, amount: 12 }))).toBeNull();
    expect(parseHandoff(hashOf({ ...good, items: [{ ref: "t1", name: "x" }] }))).toBeNull();
  });
});

describe("amounts and the trip back", () => {
  it("writes amounts in the currency's decimals", () => {
    expect(amountText("1245.5", "INR")).toBe("1245.50");
    expect(amountText("1200", "JPY")).toBe("1200");
    expect(amountText("12.345", "USD")).toBe("12.35");
    expect(amountText("abc", "USD")).toBe("");
  });
  it("sends the expense id and the entries back to UnMoney in the hash", () => {
    const url = returnUrl(good, "k57abc");
    expect(url.startsWith("https://unmoney.vercel.app/unsplit/return#unsplit=")).toBe(true);
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(url.split("#unsplit=")[1].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));
    expect(payload).toEqual({ v: 1, expenseId: "k57abc", refs: ["t1", "t2"] });
  });
});

describe("the stash between landing and the dialog", () => {
  const store = new Map<string, string>();
  const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  const prev = (globalThis as { sessionStorage?: unknown }).sessionStorage;
  (globalThis as { sessionStorage?: unknown }).sessionStorage = fake;
  afterEach(() => { store.clear(); });
  it("hands the handoff over once", () => {
    stashHandoff(good);
    expect(takeHandoff()).toEqual(good);
    expect(takeHandoff()).toBeNull();
  });
  it("drops a stale one", () => {
    store.set("unsplit.handoff", JSON.stringify({ at: Date.now() - 2 * 60 * 60 * 1000, handoff: good }));
    expect(takeHandoff()).toBeNull();
    (globalThis as { sessionStorage?: unknown }).sessionStorage = prev;
  });
});
