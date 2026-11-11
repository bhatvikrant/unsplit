import { describe, expect, it } from "vitest";
import { computeOwed } from "../../convex/lib/split";
import { editExact, emptySplit, exactFromAmounts, fromSpec, resolveExact, toSpec, type SplitState } from "../../src/components/dialogs/splitState";

const ids = ["a", "b", "c"];
const exact = (who = ids): SplitState => ({ ...emptySplit(who), method: "exact" });
const type = (s: SplitState, entries: [string, string][], who = ids) => entries.reduce((acc, [id, v]) => editExact(acc, id, v, who), s);
const amounts = (s: SplitState, total: number, who = ids, currency = "INR") => {
  const spec = toSpec(s, currency, { ids: who, totalMinor: total });
  if (spec.method !== "exact") throw new Error("not exact");
  return spec.amounts;
};
const total = (rec: Record<string, number>) => Object.values(rec).reduce((a, b) => a + b, 0);

describe("exact split auto-fill", () => {
  it("starts as an equal split of the total", () => {
    expect(amounts(exact(), 1000)).toEqual({ a: 334, b: 333, c: 333 });
  });

  it("the screenshot case: ₹89 for one of two, the other gets ₹1,236", () => {
    const s = type(exact(["a", "b"]), [["a", "89"]], ["a", "b"]);
    expect(amounts(s, 132500, ["a", "b"])).toEqual({ a: 8900, b: 123600 });
    expect(() => computeOwed(132500, toSpec(s, "INR", { ids: ["a", "b"], totalMinor: 132500 }))).not.toThrow();
  });

  it("blank people share what's left, and the last blank one takes all of it", () => {
    let s = type(exact(), [["a", "100"]]);
    expect(amounts(s, 100000)).toEqual({ a: 10000, b: 45000, c: 45000 });
    s = type(s, [["b", "250.50"]]);
    expect(amounts(s, 100000)).toEqual({ a: 10000, b: 25050, c: 64950 });
  });

  it("typing into the last blank one frees the one typed longest ago", () => {
    const s = type(exact(), [["a", "100"], ["b", "200"], ["c", "300"]]);
    expect(s.exactFixed).toEqual(["b", "c"]);
    expect(s.exact.a).toBe("");
    expect(amounts(s, 100000)).toEqual({ a: 50000, b: 20000, c: 30000 });
  });

  it("two people: whichever you type, the other one balances", () => {
    const two = ["a", "b"];
    let s = type(exact(two), [["a", "300"]], two);
    expect(amounts(s, 100000, two)).toEqual({ a: 30000, b: 70000 });
    s = type(s, [["b", "100"]], two);
    expect(amounts(s, 100000, two)).toEqual({ a: 90000, b: 10000 });
    s = type(s, [["a", "1"]], two);
    expect(amounts(s, 100000, two)).toEqual({ a: 100, b: 99900 });
  });

  it("clearing a field hands it back to auto", () => {
    let s = type(exact(), [["a", "100"], ["b", "200"]]);
    s = type(s, [["b", ""]]);
    expect(s.exactFixed).toEqual(["a"]);
    expect(amounts(s, 100000)).toEqual({ a: 10000, b: 45000, c: 45000 });
  });

  it("typing keystroke by keystroke keeps the same person fixed", () => {
    const s = type(exact(), [["a", "1"], ["a", "12"], ["a", "125"]]);
    expect(s.exactFixed).toEqual(["a"]);
    expect(amounts(s, 100000)).toEqual({ a: 12500, b: 43750, c: 43750 });
  });

  it("follows the total when it changes", () => {
    const s = type(exact(), [["a", "10"]]);
    expect(amounts(s, 4000)).toEqual({ a: 1000, b: 1500, c: 1500 });
    expect(amounts(s, 7000)).toEqual({ a: 1000, b: 3000, c: 3000 });
  });

  it("going over the total leaves the rest at 0 and the engine names the gap", () => {
    const s = type(exact(["a", "b"]), [["a", "15"]], ["a", "b"]);
    const r = resolveExact(s, ["a", "b"], 1000, "INR");
    expect(r.leftMinor).toBe(-500);
    expect(r.auto).toEqual({ b: 0 });
    expect(() => computeOwed(1000, toSpec(s, "INR", { ids: ["a", "b"], totalMinor: 1000 }))).toThrow(/don't add up/);
  });

  it("rejects amounts that aren't money", () => {
    const s = type(exact(), [["a", "12.345"]]);
    expect(() => toSpec(s, "INR", { ids, totalMinor: 1000 })).toThrow(/valid amount/);
    expect(resolveExact(s, ids, 1000, "INR").auto).toEqual({});
  });

  it("every random sequence of edits adds up exactly", () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
    for (let run = 0; run < 300; run++) {
      const who = ids.slice(0, 2 + rnd(2));
      const totalMinor = 1 + rnd(500000);
      let s = exact(who);
      for (let k = 0; k < 6; k++) {
        const id = who[rnd(who.length)];
        const v = rnd(5) === 0 ? "" : (rnd(Math.ceil(totalMinor / who.length)) / 100).toFixed(2);
        s = editExact(s, id, v, who);
        const r = resolveExact(s, who, totalMinor, "INR");
        if (r.leftMinor !== null && r.leftMinor >= 0) {
          const out = amounts(s, totalMinor, who);
          expect(total(out)).toBe(totalMinor);
          expect(Object.values(out).every((x) => Number.isInteger(x) && x >= 0)).toBe(true);
        }
        // someone always stays auto
        expect(s.exactFixed.length).toBeLessThan(who.length);
      }
    }
  });
});

describe("editing a saved exact split", () => {
  it("keeps the saved amounts and rebalances onto the last person who owes", () => {
    const s = fromSpec({ method: "exact", amounts: { a: 8900, b: 123600 } }, ["a", "b", "c"], "INR", (m) => (m / 100).toFixed(2));
    expect(s.exactFixed).toEqual(["a", "c"]);
    expect(s.exact).toEqual({ a: "89.00", c: "0.00" });
    expect(amounts(s, 132500)).toEqual({ a: 8900, b: 123600, c: 0 });
    expect(amounts(type(s, [["a", "100"]]), 132500)).toEqual({ a: 10000, b: 122500, c: 0 });
  });

  it("group members who weren't in the split stay at 0", () => {
    const s = { ...exact(["a", "b"]), ...exactFromAmounts({ a: 500, b: 500 }, ["a", "b"], (m) => String(m / 100)) };
    // "c" joined the group later: present in the form, not in the saved split
    expect(amounts(s, 1000, ["a", "b", "c"])).toEqual({ a: 500, b: 500 });
    expect(amounts(type(s, [["a", "2"]], ["a", "b", "c"]), 1000, ["a", "b", "c"])).toEqual({ a: 200, b: 800 });
  });
});
