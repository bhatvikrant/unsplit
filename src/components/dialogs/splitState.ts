import { parseMoney } from "@convex/lib/money";
import type { SplitMethod, SplitSpec } from "@convex/lib/split";

export type ItemState = { id: string; name: string; amount: string; assignees: Record<string, boolean> };

export type SplitState = {
  method: SplitMethod;
  selected: Record<string, boolean>;
  exact: Record<string, string>;
  percent: Record<string, string>;
  shares: Record<string, string>;
  adjustments: Record<string, string>;
  reimbursement: Record<string, string>;
  items: ItemState[];
  tax: string;
  tip: string;
  discount: string;
};

export function emptySplit(participantIds: string[]): SplitState {
  return {
    method: "equal",
    selected: Object.fromEntries(participantIds.map((id) => [id, true])),
    exact: {},
    percent: {},
    shares: Object.fromEntries(participantIds.map((id) => [id, "1"])),
    adjustments: {},
    reimbursement: {},
    items: [],
    tax: "",
    tip: "",
    discount: "",
  };
}

let itemSeq = 0;
export function newItem(participantIds: string[]): ItemState {
  return { id: `i${Date.now()}_${itemSeq++}`, name: "", amount: "", assignees: Object.fromEntries(participantIds.map((id) => [id, true])) };
}

const num = (s: string) => (s.trim() === "" ? 0 : Number(s));

/** Form state -> the spec the server validates. Throws a message string on bad input. */
export function toSpec(s: SplitState, currency: string): SplitSpec {
  const money = (v: string, label: string) => {
    if (v.trim() === "") return 0;
    const m = parseMoney(v, currency);
    if (m === null || m < 0) throw `${label}: enter a valid amount`;
    return m;
  };
  switch (s.method) {
    case "equal":
      return { method: "equal", participants: Object.keys(s.selected).filter((id) => s.selected[id]) };
    case "exact":
      return { method: "exact", amounts: Object.fromEntries(Object.entries(s.exact).filter(([, v]) => v.trim() !== "").map(([id, v]) => [id, money(v, "Exact amount")])) };
    case "percent":
      return {
        method: "percent",
        percents: Object.fromEntries(
          Object.entries(s.percent)
            .filter(([, v]) => v.trim() !== "")
            .map(([id, v]) => {
              const n = num(v);
              if (!Number.isFinite(n) || n < 0) throw "Percentages must be positive numbers";
              return [id, Math.round(n * 100)];
            }),
        ),
      };
    case "shares":
      return {
        method: "shares",
        shares: Object.fromEntries(
          Object.entries(s.shares)
            .filter(([, v]) => v.trim() !== "" && num(v) > 0)
            .map(([id, v]) => {
              const n = num(v);
              if (!Number.isFinite(n) || n < 0) throw "Shares must be positive numbers";
              return [id, n];
            }),
        ),
      };
    case "adjustment":
      return {
        method: "adjustment",
        participants: Object.keys(s.selected).filter((id) => s.selected[id]),
        adjustments: Object.fromEntries(Object.entries(s.adjustments).filter(([, v]) => v.trim() !== "").map(([id, v]) => [id, money(v, "Adjustment")])),
      };
    case "reimbursement":
      return { method: "reimbursement", amounts: Object.fromEntries(Object.entries(s.reimbursement).filter(([, v]) => v.trim() !== "").map(([id, v]) => [id, money(v, "Amount")])) };
    case "itemized":
      return {
        method: "itemized",
        items: s.items.map((it, i) => ({
          name: it.name.trim() || `Item ${i + 1}`,
          amountMinor: money(it.amount, it.name || `Item ${i + 1}`),
          assigneeIds: Object.keys(it.assignees).filter((id) => it.assignees[id]),
        })),
        taxMinor: money(s.tax, "Tax"),
        tipMinor: money(s.tip, "Tip"),
        discountMinor: money(s.discount, "Discount"),
      };
  }
}

/** Itemized totals: items + tax + tip - discount, or null if any field is invalid. */
export function itemizedTotal(s: SplitState, currency: string): number | null {
  try {
    const spec = toSpec({ ...s, method: "itemized" }, currency);
    if (spec.method !== "itemized") return null;
    return spec.items.reduce((a, b) => a + b.amountMinor, 0) + spec.taxMinor + spec.tipMinor - spec.discountMinor;
  } catch {
    return null;
  }
}

/** Stored spec -> form state (for editing). */
export function fromSpec(spec: SplitSpec, participantIds: string[], currency: string, toText: (minor: number) => string): SplitState {
  const base = emptySplit(participantIds);
  void currency;
  switch (spec.method) {
    case "equal":
      return { ...base, method: "equal", selected: Object.fromEntries(participantIds.map((id) => [id, spec.participants.includes(id)])) };
    case "exact":
      return { ...base, method: "exact", exact: Object.fromEntries(Object.entries(spec.amounts).map(([id, v]) => [id, toText(v)])) };
    case "percent":
      return { ...base, method: "percent", percent: Object.fromEntries(Object.entries(spec.percents).map(([id, v]) => [id, String(v / 100)])) };
    case "shares":
      return { ...base, method: "shares", shares: Object.fromEntries(participantIds.map((id) => [id, spec.shares[id] !== undefined ? String(spec.shares[id]) : "0"])) };
    case "adjustment":
      return {
        ...base,
        method: "adjustment",
        selected: Object.fromEntries(participantIds.map((id) => [id, spec.participants.includes(id)])),
        adjustments: Object.fromEntries(Object.entries(spec.adjustments).map(([id, v]) => [id, toText(v)])),
      };
    case "reimbursement":
      return { ...base, method: "reimbursement", reimbursement: Object.fromEntries(Object.entries(spec.amounts).map(([id, v]) => [id, toText(v)])) };
    case "itemized":
      return {
        ...base,
        method: "itemized",
        items: spec.items.map((it, i) => ({ id: `e${i}`, name: it.name, amount: toText(it.amountMinor), assignees: Object.fromEntries(participantIds.map((id) => [id, it.assigneeIds.includes(id)])) })),
        tax: spec.taxMinor ? toText(spec.taxMinor) : "",
        tip: spec.tipMinor ? toText(spec.tipMinor) : "",
        discount: spec.discountMinor ? toText(spec.discountMinor) : "",
      };
  }
}
