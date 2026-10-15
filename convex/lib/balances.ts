import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { groupMemberIds } from "./access";
import { simplifyDebts, type Debt } from "./split";

type Ctx = QueryCtx | MutationCtx;

export type CurrencyDebt = Debt & { currency: string };

export function scopeOf(e: { groupId?: Id<"groups">; pairKey?: string }): string {
  if (e.groupId) return `group:${e.groupId}`;
  if (e.pairKey) return `pair:${e.pairKey}`;
  throw new Error("Expense has no scope");
}

export function groupScope(groupId: Id<"groups">): string {
  return `group:${groupId}`;
}

/** Apply (sign = 1) or reverse (sign = -1) pairwise debts onto the balances table. */
export async function applyDebts(ctx: MutationCtx, scope: string, currency: string, debts: Debt[], sign: 1 | -1): Promise<void> {
  for (const d of debts) {
    if (d.amountMinor === 0) continue;
    const from = d.from as Id<"users">;
    const to = d.to as Id<"users">;
    const [low, high] = from < to ? [from, to] : [to, from];
    // amountMinor = what high owes low. `from` owes `to`.
    const delta = (from === high ? d.amountMinor : -d.amountMinor) * sign;
    const row = await ctx.db
      .query("balances")
      .withIndex("by_scope_pair_currency", (q) =>
        q.eq("scope", scope).eq("lowUserId", low).eq("highUserId", high).eq("currency", currency),
      )
      .unique();
    if (row) {
      const next = row.amountMinor + delta;
      if (next === 0) await ctx.db.delete(row._id);
      else await ctx.db.patch(row._id, { amountMinor: next });
    } else if (delta !== 0) {
      await ctx.db.insert("balances", { scope, lowUserId: low, highUserId: high, currency, amountMinor: delta });
    }
  }
}

export function rowsToDebts(rows: Doc<"balances">[]): CurrencyDebt[] {
  const out: CurrencyDebt[] = [];
  for (const r of rows) {
    if (r.amountMinor > 0) out.push({ from: r.highUserId, to: r.lowUserId, amountMinor: r.amountMinor, currency: r.currency });
    else if (r.amountMinor < 0) out.push({ from: r.lowUserId, to: r.highUserId, amountMinor: -r.amountMinor, currency: r.currency });
  }
  return out;
}

export async function scopeRows(ctx: Ctx, scope: string): Promise<Doc<"balances">[]> {
  return await ctx.db.query("balances").withIndex("by_scope", (q) => q.eq("scope", scope)).collect();
}

/** Debts in a group, per currency, simplified when the group asks for it. */
export async function groupDebts(ctx: Ctx, group: Doc<"groups">): Promise<CurrencyDebt[]> {
  const raw = rowsToDebts(await scopeRows(ctx, groupScope(group._id)));
  if (!group.simplifyDebts) return raw;
  const byCurrency = new Map<string, Debt[]>();
  for (const d of raw) {
    const list = byCurrency.get(d.currency) ?? [];
    list.push(d);
    byCurrency.set(d.currency, list);
  }
  const out: CurrencyDebt[] = [];
  for (const [currency, debts] of byCurrency) {
    for (const d of simplifyDebts(debts)) out.push({ ...d, currency });
  }
  return out;
}

/** Each member's net per currency in a group (positive = owed money). */
export function netsFromDebts(debts: CurrencyDebt[]): Map<string, Map<string, number>> {
  const nets = new Map<string, Map<string, number>>();
  const bump = (user: string, currency: string, delta: number) => {
    const m = nets.get(user) ?? new Map<string, number>();
    m.set(currency, (m.get(currency) ?? 0) + delta);
    nets.set(user, m);
  };
  for (const d of debts) {
    bump(d.from, d.currency, -d.amountMinor);
    bump(d.to, d.currency, d.amountMinor);
  }
  return nets;
}

export async function userNetInGroup(ctx: Ctx, group: Doc<"groups">, userId: Id<"users">): Promise<Record<string, number>> {
  const nets = netsFromDebts(await groupDebts(ctx, group));
  return Object.fromEntries(nets.get(userId) ?? new Map());
}

export function isSettled(net: Record<string, number>): boolean {
  return Object.values(net).every((v) => v === 0);
}

export type UserBalances = {
  /** otherUserId -> currency -> net (positive: they owe me) */
  byFriend: Map<Id<"users">, Map<string, number>>;
  /** groupId -> currency -> my net */
  byGroup: Map<Id<"groups">, Map<string, number>>;
  /** otherUserId -> groupId|"none" -> currency -> net */
  byFriendGroup: Map<Id<"users">, Map<string, Map<string, number>>>;
  /** currency -> net across everything */
  total: Map<string, number>;
};

/** Everything the dashboard, friend page and group list need, in one pass. */
export async function computeUserBalances(ctx: Ctx, userId: Id<"users">): Promise<UserBalances> {
  const byFriend = new Map<Id<"users">, Map<string, number>>();
  const byGroup = new Map<Id<"groups">, Map<string, number>>();
  const byFriendGroup = new Map<Id<"users">, Map<string, Map<string, number>>>();
  const total = new Map<string, number>();

  const add = (friend: Id<"users">, groupKey: string, currency: string, delta: number, groupId?: Id<"groups">) => {
    if (delta === 0) return;
    const f = byFriend.get(friend) ?? new Map<string, number>();
    f.set(currency, (f.get(currency) ?? 0) + delta);
    byFriend.set(friend, f);
    const fg = byFriendGroup.get(friend) ?? new Map<string, Map<string, number>>();
    const g = fg.get(groupKey) ?? new Map<string, number>();
    g.set(currency, (g.get(currency) ?? 0) + delta);
    fg.set(groupKey, g);
    byFriendGroup.set(friend, fg);
    total.set(currency, (total.get(currency) ?? 0) + delta);
    if (groupId) {
      const gm = byGroup.get(groupId) ?? new Map<string, number>();
      gm.set(currency, (gm.get(currency) ?? 0) + delta);
      byGroup.set(groupId, gm);
    }
  };

  // Groups: use the group's view (simplified or not).
  const memberships = await ctx.db.query("groupMembers").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
  for (const m of memberships) {
    const group = await ctx.db.get(m.groupId);
    if (!group || group.deletedAt) continue;
    byGroup.set(group._id, byGroup.get(group._id) ?? new Map());
    for (const d of await groupDebts(ctx, group)) {
      if (d.from === userId) add(d.to as Id<"users">, group._id, d.currency, -d.amountMinor, group._id);
      else if (d.to === userId) add(d.from as Id<"users">, group._id, d.currency, d.amountMinor, group._id);
    }
  }

  // Pair scopes (non-group expenses).
  const asLow = await ctx.db.query("balances").withIndex("by_low", (q) => q.eq("lowUserId", userId)).collect();
  const asHigh = await ctx.db.query("balances").withIndex("by_high", (q) => q.eq("highUserId", userId)).collect();
  for (const r of [...asLow, ...asHigh]) {
    if (!r.scope.startsWith("pair:")) continue;
    // amountMinor = high owes low
    if (r.lowUserId === userId) add(r.highUserId, "none", r.currency, r.amountMinor);
    else add(r.lowUserId, "none", r.currency, -r.amountMinor);
  }
  return { byFriend, byGroup, byFriendGroup, total };
}

export function mapToRecord(m: Map<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!m) return out;
  for (const [k, v] of m) if (v !== 0) out[k] = v;
  return out;
}

/** Rebuild the balances table for one scope from its live shares. Repair tool. */
export async function rebuildScope(ctx: MutationCtx, scope: string, expenses: Doc<"expenses">[]): Promise<void> {
  for (const row of await scopeRows(ctx, scope)) await ctx.db.delete(row._id);
  const { pairwiseDebts } = await import("./split");
  for (const e of expenses) {
    if (e.deletedAt) continue;
    const shares = await ctx.db.query("expenseShares").withIndex("by_expense", (q) => q.eq("expenseId", e._id)).collect();
    await applyDebts(ctx, scope, e.currency, pairwiseDebts(shares.map((s) => ({ userId: s.userId, paidMinor: s.paidMinor, owedMinor: s.owedMinor }))), 1);
  }
}

export { groupMemberIds };
