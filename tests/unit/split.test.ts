import { describe, expect, it } from "vitest";
import { allocate, parseMoney, minorToDecimalString, currencyDecimals } from "../../convex/lib/money";
import { buildShares, computeOwed, pairwiseDebts, simplifyDebts, SplitError } from "../../convex/lib/split";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("money", () => {
  it("parses and formats", () => {
    expect(parseMoney("12.34", "USD")).toBe(1234);
    expect(parseMoney("$1,234.5", "USD")).toBe(123450);
    expect(parseMoney("12.345", "USD")).toBeNull();
    expect(parseMoney("1000", "JPY")).toBe(1000);
    expect(parseMoney("1.5", "JPY")).toBeNull();
    expect(parseMoney("1.234", "KWD")).toBe(1234);
    expect(minorToDecimalString(1234, "USD")).toBe("12.34");
    expect(minorToDecimalString(-5, "USD")).toBe("-0.05");
    expect(minorToDecimalString(7, "JPY")).toBe("7");
    expect(currencyDecimals("usd")).toBe(2);
  });
  it("allocates with largest remainder and always sums to total", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(1, [1, 1, 1])).toEqual([1, 0, 0]);
    expect(allocate(0, [1, 1])).toEqual([0, 0]);
    expect(allocate(100, [0, 0])).toEqual([50, 50]);
    expect(allocate(1000, [1, 2, 3])).toEqual([167, 333, 500]);
    for (let t = 0; t < 500; t++) {
      const w = [Math.random() * 10, Math.random() * 10, Math.random() * 10, 0, Math.random()];
      expect(sum(allocate(t, w))).toBe(t);
    }
  });
});

describe("computeOwed", () => {
  it("equal", () => {
    expect(computeOwed(1000, { method: "equal", participants: ["a", "b", "c"] })).toEqual({ a: 334, b: 333, c: 333 });
    expect(() => computeOwed(1000, { method: "equal", participants: [] })).toThrow(SplitError);
  });
  it("exact must sum", () => {
    expect(computeOwed(1000, { method: "exact", amounts: { a: 600, b: 400 } })).toEqual({ a: 600, b: 400 });
    expect(() => computeOwed(1000, { method: "exact", amounts: { a: 600, b: 300 } })).toThrow(/off by 100/);
  });
  it("percent must be 100.00", () => {
    expect(computeOwed(1000, { method: "percent", percents: { a: 5000, b: 2500, c: 2500 } })).toEqual({ a: 500, b: 250, c: 250 });
    expect(computeOwed(1000, { method: "percent", percents: { a: 3333, b: 3333, c: 3334 } })).toEqual({ a: 333, b: 333, c: 334 });
    expect(() => computeOwed(1000, { method: "percent", percents: { a: 5000, b: 4000 } })).toThrow(/90.00%/);
  });
  it("shares", () => {
    expect(computeOwed(1000, { method: "shares", shares: { a: 2, b: 1, c: 1 } })).toEqual({ a: 500, b: 250, c: 250 });
    expect(() => computeOwed(1000, { method: "shares", shares: { a: 0, b: 0 } })).toThrow(SplitError);
  });
  it("adjustment", () => {
    expect(computeOwed(1000, { method: "adjustment", participants: ["a", "b", "c"], adjustments: { a: 100 } })).toEqual({ a: 400, b: 300, c: 300 });
    expect(() => computeOwed(100, { method: "adjustment", participants: ["a", "b"], adjustments: { a: 200 } })).toThrow(SplitError);
  });
  it("itemized with tax and tip proportional", () => {
    const owed = computeOwed(1200, {
      method: "itemized",
      items: [
        { name: "Burger", amountMinor: 600, assigneeIds: ["a"] },
        { name: "Salad", amountMinor: 400, assigneeIds: ["b"] },
      ],
      taxMinor: 100,
      tipMinor: 100,
      discountMinor: 0,
    });
    expect(owed).toEqual({ a: 720, b: 480 });
    const shared = computeOwed(1000, {
      method: "itemized",
      items: [{ name: "Pizza", amountMinor: 1000, assigneeIds: ["a", "b", "c"] }],
      taxMinor: 0, tipMinor: 0, discountMinor: 0,
    });
    expect(sum(Object.values(shared))).toBe(1000);
    expect(() => computeOwed(1000, { method: "itemized", items: [{ name: "x", amountMinor: 1000, assigneeIds: [] }], taxMinor: 0, tipMinor: 0, discountMinor: 0 })).toThrow(/assigned/);
    expect(() => computeOwed(999, { method: "itemized", items: [{ name: "x", amountMinor: 1000, assigneeIds: ["a"] }], taxMinor: 0, tipMinor: 0, discountMinor: 0 })).toThrow(/off by/);
  });
});

describe("buildShares + debts", () => {
  it("single payer equal split", () => {
    const shares = buildShares(3000, [{ userId: "a", paidMinor: 3000 }], { method: "equal", participants: ["a", "b", "c"] });
    expect(sum(shares.map((s) => s.owedMinor))).toBe(3000);
    expect(sum(shares.map((s) => s.paidMinor))).toBe(3000);
    expect(pairwiseDebts(shares)).toEqual([
      { from: "b", to: "a", amountMinor: 1000 },
      { from: "c", to: "a", amountMinor: 1000 },
    ]);
  });
  it("multiple payers proportional attribution", () => {
    const shares = buildShares(3000, [{ userId: "a", paidMinor: 2000 }, { userId: "b", paidMinor: 1000 }], { method: "equal", participants: ["a", "b", "c"] });
    const debts = pairwiseDebts(shares);
    // nets: a +1000, b 0, c -1000 -> c owes a 1000
    expect(debts).toEqual([{ from: "c", to: "a", amountMinor: 1000 }]);
  });
  it("payers must sum to total", () => {
    expect(() => buildShares(3000, [{ userId: "a", paidMinor: 2000 }], { method: "equal", participants: ["a", "b"] })).toThrow(/off by 1000/);
  });
  it("reimbursement: receiver owes the recipients", () => {
    const shares = buildShares(3000, [{ userId: "a", paidMinor: 3000 }], { method: "reimbursement", amounts: { b: 2000, c: 1000 } });
    const debts = pairwiseDebts(shares);
    expect(debts).toEqual([
      { from: "a", to: "b", amountMinor: 2000 },
      { from: "a", to: "c", amountMinor: 1000 },
    ]);
  });
  it("simplify debts keeps nets and reduces payments", () => {
    const simplified = simplifyDebts([
      { from: "a", to: "b", amountMinor: 2000 },
      { from: "b", to: "c", amountMinor: 2000 },
    ]);
    expect(simplified).toEqual([{ from: "a", to: "c", amountMinor: 2000 }]);
    const chain = [
      { from: "a", to: "b", amountMinor: 500 },
      { from: "b", to: "c", amountMinor: 700 },
      { from: "c", to: "a", amountMinor: 200 },
      { from: "d", to: "a", amountMinor: 300 },
    ];
    const s = simplifyDebts(chain);
    const net = (ds: typeof chain) => {
      const m: Record<string, number> = {};
      for (const d of ds) { m[d.from] = (m[d.from] ?? 0) - d.amountMinor; m[d.to] = (m[d.to] ?? 0) + d.amountMinor; }
      return Object.fromEntries(Object.entries(m).filter(([, v]) => v !== 0));
    };
    expect(net(s)).toEqual(net(chain));
    expect(s.length).toBeLessThanOrEqual(chain.length);
  });
});
