/**
 * The split engine. Pure, deterministic, shared by client (preview) and server
 * (validation + storage). Every output sums exactly to the total.
 *
 * Vocabulary:
 *   paidMinor  what a person put in (the payer(s))
 *   owedMinor  what a person's share of the cost is
 *   net        paid - owed. Positive = others owe them. Negative = they owe.
 */
import { allocate, sumMinor } from "./money";

export type SplitMethod =
  | "equal"
  | "exact"
  | "percent"
  | "shares"
  | "adjustment"
  | "reimbursement"
  | "itemized";

export const SPLIT_METHODS: SplitMethod[] = [
  "equal", "exact", "percent", "shares", "adjustment", "reimbursement", "itemized",
];

export type Payer = { userId: string; paidMinor: number };

export type ItemizedItem = { name: string; amountMinor: number; assigneeIds: string[] };

export type SplitSpec =
  | { method: "equal"; participants: string[] }
  | { method: "exact"; amounts: Record<string, number> }
  /** percents in hundredths of a percent: 3333 = 33.33 %. Must sum to 10000. */
  | { method: "percent"; percents: Record<string, number> }
  | { method: "shares"; shares: Record<string, number> }
  /** adjustments in minor units; participants is everyone in the split. */
  | { method: "adjustment"; participants: string[]; adjustments: Record<string, number> }
  /** amounts = how much each person gets back; the "payer" is who received the refund. */
  | { method: "reimbursement"; amounts: Record<string, number> }
  | {
      method: "itemized";
      items: ItemizedItem[];
      taxMinor: number;
      tipMinor: number;
      discountMinor: number;
    };

export type Share = { userId: string; paidMinor: number; owedMinor: number };

export class SplitError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = "SplitError";
  }
}

function keysOf(obj: Record<string, number>): string[] {
  return Object.keys(obj);
}

/** The owed side only. Throws SplitError on invalid input. */
export function computeOwed(totalMinor: number, spec: SplitSpec): Record<string, number> {
  if (!Number.isInteger(totalMinor)) throw new SplitError("Amount must be a whole number of minor units", "amount");
  if (totalMinor < 0) throw new SplitError("Amount can't be negative", "amount");

  switch (spec.method) {
    case "equal": {
      const ps = uniq(spec.participants);
      if (ps.length === 0) throw new SplitError("Pick at least one person to split with", "participants");
      const parts = allocate(totalMinor, ps.map(() => 1));
      return Object.fromEntries(ps.map((id, i) => [id, parts[i]]));
    }
    case "exact": {
      const ids = keysOf(spec.amounts);
      if (ids.length === 0) throw new SplitError("Enter an amount for at least one person", "participants");
      for (const id of ids) {
        const v = spec.amounts[id];
        if (!Number.isInteger(v) || v < 0) throw new SplitError("Amounts must be positive", "amounts");
      }
      const sum = sumMinor(ids.map((id) => spec.amounts[id]));
      if (sum !== totalMinor) {
        throw new SplitError(
          `Amounts add up to a different total (off by ${totalMinor - sum})`,
          "amounts",
        );
      }
      return { ...spec.amounts };
    }
    case "percent": {
      const ids = keysOf(spec.percents);
      if (ids.length === 0) throw new SplitError("Enter a percentage for at least one person", "participants");
      for (const id of ids) {
        const v = spec.percents[id];
        if (!Number.isFinite(v) || v < 0) throw new SplitError("Percentages must be positive", "percents");
      }
      const sum = sumMinor(ids.map((id) => spec.percents[id]));
      if (sum !== 10000) {
        throw new SplitError(`Percentages add up to ${(sum / 100).toFixed(2)}%, not 100%`, "percents");
      }
      const parts = allocate(totalMinor, ids.map((id) => spec.percents[id]));
      return Object.fromEntries(ids.map((id, i) => [id, parts[i]]));
    }
    case "shares": {
      const ids = keysOf(spec.shares);
      if (ids.length === 0) throw new SplitError("Give at least one person a share", "participants");
      const weights = ids.map((id) => spec.shares[id]);
      if (weights.some((w) => !Number.isFinite(w) || w < 0)) throw new SplitError("Shares must be positive", "shares");
      if (sumMinor(weights) <= 0) throw new SplitError("Total shares must be more than zero", "shares");
      const parts = allocate(totalMinor, weights);
      return Object.fromEntries(ids.map((id, i) => [id, parts[i]]));
    }
    case "adjustment": {
      const ps = uniq(spec.participants);
      if (ps.length === 0) throw new SplitError("Pick at least one person to split with", "participants");
      const adj = ps.map((id) => spec.adjustments[id] ?? 0);
      if (adj.some((a) => !Number.isInteger(a))) throw new SplitError("Adjustments must be whole amounts", "adjustments");
      const remaining = totalMinor - sumMinor(adj);
      if (remaining < 0) throw new SplitError("Adjustments add up to more than the total", "adjustments");
      const base = allocate(remaining, ps.map(() => 1));
      const out: Record<string, number> = {};
      ps.forEach((id, i) => {
        const v = base[i] + adj[i];
        if (v < 0) throw new SplitError("A person's share can't be negative", "adjustments");
        out[id] = v;
      });
      return out;
    }
    case "reimbursement": {
      // Owed side is handled in buildShares (the receiver owes the total).
      const ids = keysOf(spec.amounts);
      if (ids.length === 0) throw new SplitError("Enter who gets money back", "participants");
      const sum = sumMinor(ids.map((id) => spec.amounts[id]));
      if (ids.some((id) => !Number.isInteger(spec.amounts[id]) || spec.amounts[id] < 0)) {
        throw new SplitError("Amounts must be positive", "amounts");
      }
      if (sum !== totalMinor) throw new SplitError("Amounts must add up to the refund total", "amounts");
      return {};
    }
    case "itemized": {
      const { items, taxMinor, tipMinor, discountMinor } = spec;
      if (items.length === 0) throw new SplitError("Add at least one item", "items");
      for (const [i, it] of items.entries()) {
        if (!Number.isInteger(it.amountMinor) || it.amountMinor < 0) throw new SplitError(`Item ${i + 1} needs a valid price`, "items");
        if (uniq(it.assigneeIds).length === 0) throw new SplitError(`"${it.name || `Item ${i + 1}`}" isn't assigned to anyone`, "items");
      }
      for (const [k, v] of Object.entries({ taxMinor, tipMinor, discountMinor })) {
        if (!Number.isInteger(v) || v < 0) throw new SplitError(`${k.replace("Minor", "")} must be a positive amount`, k);
      }
      const itemsTotal = sumMinor(items.map((it) => it.amountMinor));
      const expected = itemsTotal + taxMinor + tipMinor - discountMinor;
      if (expected !== totalMinor) {
        throw new SplitError(`Items, tax and tip add up to a different total (off by ${totalMinor - expected})`, "amount");
      }
      const subtotal: Record<string, number> = {};
      for (const it of items) {
        const ids = uniq(it.assigneeIds);
        const parts = allocate(it.amountMinor, ids.map(() => 1));
        ids.forEach((id, i) => (subtotal[id] = (subtotal[id] ?? 0) + parts[i]));
      }
      const ids = Object.keys(subtotal);
      const extras = taxMinor + tipMinor - discountMinor;
      const extraParts = allocate(extras, ids.map((id) => subtotal[id]));
      const out: Record<string, number> = {};
      ids.forEach((id, i) => (out[id] = subtotal[id] + extraParts[i]));
      // Guard against a discount larger than someone's subtotal producing negatives.
      if (ids.some((id) => out[id] < 0)) throw new SplitError("Discount is larger than some people's items", "discountMinor");
      return out;
    }
  }
}

/** Full share rows (paid + owed), validated. */
export function buildShares(totalMinor: number, payers: Payer[], spec: SplitSpec): Share[] {
  if (payers.length === 0) throw new SplitError("Pick who paid", "payers");
  for (const p of payers) {
    if (!Number.isInteger(p.paidMinor) || p.paidMinor < 0) throw new SplitError("Paid amounts must be positive", "payers");
  }
  const paidSum = sumMinor(payers.map((p) => p.paidMinor));
  if (paidSum !== totalMinor) {
    throw new SplitError(`Payments add up to a different total (off by ${totalMinor - paidSum})`, "payers");
  }
  const byUser = new Map<string, Share>();
  const get = (id: string) => {
    let s = byUser.get(id);
    if (!s) {
      s = { userId: id, paidMinor: 0, owedMinor: 0 };
      byUser.set(id, s);
    }
    return s;
  };

  if (spec.method === "reimbursement") {
    // Receiver(s) of the refund are the "payers" (they hold the money) and owe it all.
    computeOwed(totalMinor, spec);
    for (const p of payers) get(p.userId).owedMinor += p.paidMinor;
    for (const [id, v] of Object.entries(spec.amounts)) get(id).paidMinor += v;
    return [...byUser.values()].filter((s) => s.paidMinor !== 0 || s.owedMinor !== 0);
  }

  const owed = computeOwed(totalMinor, spec);
  for (const p of payers) get(p.userId).paidMinor += p.paidMinor;
  for (const [id, v] of Object.entries(owed)) get(id).owedMinor += v;
  return [...byUser.values()].filter((s) => s.paidMinor !== 0 || s.owedMinor !== 0);
}

export type Debt = { from: string; to: string; amountMinor: number };

/**
 * Who owes whom for one expense. Debtors (net < 0) owe creditors (net > 0)
 * in proportion to each creditor's share of the total credit.
 */
export function pairwiseDebts(shares: Share[]): Debt[] {
  const nets = shares.map((s) => ({ id: s.userId, net: s.paidMinor - s.owedMinor }));
  const creditors = nets.filter((n) => n.net > 0);
  const debtors = nets.filter((n) => n.net < 0);
  if (creditors.length === 0 || debtors.length === 0) return [];
  const out: Debt[] = [];
  for (const d of debtors) {
    const parts = allocate(-d.net, creditors.map((c) => c.net));
    creditors.forEach((c, i) => {
      if (parts[i] > 0) out.push({ from: d.id, to: c.id, amountMinor: parts[i] });
    });
  }
  return out;
}

/**
 * Debt simplification: minimise the number of payments without changing
 * anyone's net. Greedy largest-creditor / largest-debtor matching.
 * Input: debts in ONE currency. Output: the simplified list.
 */
export function simplifyDebts(debts: Debt[]): Debt[] {
  const net = new Map<string, number>();
  for (const d of debts) {
    net.set(d.from, (net.get(d.from) ?? 0) - d.amountMinor);
    net.set(d.to, (net.get(d.to) ?? 0) + d.amountMinor);
  }
  const creditors = [...net.entries()].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const debtors = [...net.entries()].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  creditors.sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
  debtors.sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
  const out: Debt[] = [];
  let i = 0, j = 0;
  while (i < creditors.length && j < debtors.length) {
    const c = creditors[i], d = debtors[j];
    const amt = Math.min(c.v, d.v);
    if (amt > 0) out.push({ from: d.id, to: c.id, amountMinor: amt });
    c.v -= amt;
    d.v -= amt;
    if (c.v === 0) i++;
    if (d.v === 0) j++;
  }
  return out;
}

/** Net per user from a list of debts. */
export function netFromDebts(debts: Debt[]): Map<string, number> {
  const net = new Map<string, number>();
  for (const d of debts) {
    net.set(d.from, (net.get(d.from) ?? 0) - d.amountMinor);
    net.set(d.to, (net.get(d.to) ?? 0) + d.amountMinor);
  }
  return net;
}

export function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
