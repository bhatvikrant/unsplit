import { allocate, parseMoney } from "@convex/lib/money";
import type { SplitMethod, SplitSpec } from "@convex/lib/split";

export type ItemState = { id: string; name: string; amount: string; assignees: Record<string, boolean> };

export type SplitState = {
  method: SplitMethod;
  selected: Record<string, boolean>;
  exact: Record<string, string>;
  /** Exact amounts the person typed, oldest first. Everyone else is auto: they split what's left equally. */
  exactFixed: string[];
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
    exactFixed: [],
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

/**
 * Who can be auto in an exact split: the people the split was set up for (an edited expense's
 * participants, or everyone in a new one). Anyone else stays at 0 until they're typed into.
 */
const autoPool = (s: SplitState, ids: string[], fixed: string[]) => ids.filter((id) => id in s.selected || fixed.includes(id));

/**
 * Type into one person's exact amount. Typing makes it fixed; clearing it makes it auto again.
 * Someone always stays auto so the amounts add up: when the last auto person is typed into,
 * the person typed into longest ago goes back to auto and takes up the difference.
 */
export function editExact(s: SplitState, id: string, value: string, ids: string[]): SplitState {
  const exact = { ...s.exact, [id]: value };
  const fixed = s.exactFixed.filter((x) => x !== id && ids.includes(x));
  if (value.trim() !== "") {
    fixed.push(id);
    if (fixed.length > 1 && fixed.length >= autoPool(s, ids, fixed).length) {
      const freed = fixed.shift()!;
      exact[freed] = "";
    }
  }
  return { ...s, exact, exactFixed: fixed };
}

export type ExactResolved = {
  /** Typed amounts in minor units; null where the text isn't a valid amount. */
  fixed: Record<string, number | null>;
  /** Auto amounts in minor units (empty until there's a total). */
  auto: Record<string, number>;
  /** total - typed; negative when the typed amounts go over the total. */
  leftMinor: number | null;
};

/** Work out every person's exact amount: the typed ones, and an equal split of what's left for the rest. */
export function resolveExact(s: SplitState, ids: string[], totalMinor: number | null, currency: string): ExactResolved {
  const fixed: Record<string, number | null> = {};
  for (const id of s.exactFixed) {
    if (!ids.includes(id)) continue;
    const m = parseMoney(s.exact[id] ?? "", currency);
    fixed[id] = m === null || m < 0 ? null : m;
  }
  const autoIds = autoPool(s, ids, s.exactFixed).filter((id) => !(id in fixed));
  if (totalMinor === null || Object.values(fixed).some((v) => v === null)) return { fixed, auto: {}, leftMinor: null };
  const leftMinor = totalMinor - Object.values(fixed).reduce<number>((a, b) => a + (b ?? 0), 0);
  const parts = allocate(Math.max(leftMinor, 0), autoIds.map(() => 1));
  return { fixed, auto: Object.fromEntries(autoIds.map((id, i) => [id, parts[i]])), leftMinor };
}

/** Exact form state from known amounts: the last person who owes something stays auto, so edits rebalance onto them. */
export function exactFromAmounts(amounts: Record<string, number>, participantIds: string[], toText: (minor: number) => string): Pick<SplitState, "exact" | "exactFixed"> {
  const autoId = [...participantIds].reverse().find((id) => (amounts[id] ?? 0) > 0);
  const fixedIds = participantIds.filter((id) => id !== autoId);
  return { exact: Object.fromEntries(fixedIds.map((id) => [id, toText(amounts[id] ?? 0)])), exactFixed: fixedIds };
}

/**
 * Form state -> the spec the server validates. Throws a message string on bad input.
 * Exact amounts need `exact` (everyone in the split and the total) to fill in the auto amounts.
 */
export function toSpec(s: SplitState, currency: string, exact?: { ids: string[]; totalMinor: number | null }): SplitSpec {
  const money = (v: string, label: string) => {
    if (v.trim() === "") return 0;
    const m = parseMoney(v, currency);
    if (m === null || m < 0) throw `${label}: enter a valid amount`;
    return m;
  };
  switch (s.method) {
    case "equal":
      return { method: "equal", participants: Object.keys(s.selected).filter((id) => s.selected[id]) };
    case "exact": {
      if (!exact) return { method: "exact", amounts: Object.fromEntries(Object.entries(s.exact).filter(([, v]) => v.trim() !== "").map(([id, v]) => [id, money(v, "Exact amount")])) };
      const r = resolveExact(s, exact.ids, exact.totalMinor, currency);
      const amounts: Record<string, number> = {};
      for (const [id, v] of Object.entries(r.fixed)) {
        if (v === null) throw "Exact amount: enter a valid amount";
        amounts[id] = v;
      }
      return { method: "exact", amounts: { ...amounts, ...r.auto } };
    }
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
      return { ...base, method: "exact", ...exactFromAmounts(spec.amounts, participantIds, toText) };
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
