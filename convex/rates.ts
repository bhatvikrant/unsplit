import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { assertFriends, assertGroupMember, pairKeyOf, requireUserId } from "./lib/access";
import { applyDebts, scopeOf } from "./lib/balances";
import { logActivity } from "./lib/activity";
import { allocate, currencyDecimals } from "./lib/money";
import { pairwiseDebts } from "./lib/split";

const RATE_TTL_MS = 6 * 3600_000;

async function scopeExpenses(ctx: { db: Parameters<typeof assertGroupMember>[0]["db"] }, me: Id<"users">, args: { groupId?: Id<"groups">; friendId?: Id<"users"> }) {
  if (args.groupId) {
    await assertGroupMember(ctx as never, args.groupId, me);
    return await ctx.db.query("expenses").withIndex("by_group_date", (q) => q.eq("groupId", args.groupId)).collect();
  }
  if (args.friendId) {
    await assertFriends(ctx as never, me, args.friendId);
    const pk = pairKeyOf(me, args.friendId);
    return await ctx.db.query("expenses").withIndex("by_pair_date", (q) => q.eq("pairKey", pk)).collect();
  }
  throw new ConvexError("Pick a group or a friend");
}

export const scopeCurrencies = internalQuery({
  args: { groupId: v.optional(v.id("groups")), friendId: v.optional(v.id("users")), userId: v.id("users") },
  handler: async (ctx, args) => {
    const expenses = await scopeExpenses(ctx, args.userId, args);
    const totals: Record<string, { amountMinor: number; count: number }> = {};
    for (const e of expenses) {
      if (e.deletedAt) continue;
      const t = (totals[e.currency] ??= { amountMinor: 0, count: 0 });
      t.amountMinor += e.amountMinor;
      t.count += 1;
    }
    return totals;
  },
});

export const cachedRates = internalQuery({
  args: { base: v.string(), quotes: v.array(v.string()) },
  handler: async (ctx, { base, quotes }) => {
    const out: Record<string, number> = {};
    for (const q of quotes) {
      const row = await ctx.db.query("exchangeRates").withIndex("by_pair", (x) => x.eq("base", base).eq("quote", q)).unique();
      if (row && Date.now() - row.fetchedAt < RATE_TTL_MS) out[q] = row.rate;
    }
    return out;
  },
});

export const storeRates = internalMutation({
  args: { base: v.string(), rates: v.record(v.string(), v.number()) },
  handler: async (ctx, { base, rates }) => {
    for (const [quote, rate] of Object.entries(rates)) {
      const row = await ctx.db.query("exchangeRates").withIndex("by_pair", (x) => x.eq("base", base).eq("quote", quote)).unique();
      if (row) await ctx.db.patch(row._id, { rate, fetchedAt: Date.now() });
      else await ctx.db.insert("exchangeRates", { base, quote, rate, fetchedAt: Date.now() });
    }
  },
});

/** Live rates from Frankfurter (ECB reference rates). base -> quote. */
export async function fetchFrankfurter(base: string, quotes: string[]): Promise<Record<string, number>> {
  if (quotes.length === 0) return {};
  const url = `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(quotes.join(","))}`;
  const res = await fetch(url);
  if (!res.ok) throw new ConvexError(`Rate service error (${res.status})`);
  const data = (await res.json()) as { rates?: Record<string, number> };
  return data.rates ?? {};
}

/** Preview: for every currency in scope that isn't `target`, the rate and converted total. */
export const preview = action({
  args: { groupId: v.optional(v.id("groups")), friendId: v.optional(v.id("users")), target: v.string() },
  handler: async (ctx, args): Promise<{ target: string; lines: { currency: string; amountMinor: number; count: number; rate: number | null; convertedMinor: number | null }[]; unsupported: string[]; fetchedAt: number }> => {
    const userId = await requireUserId(ctx as never);
    const target = args.target.toUpperCase();
    const totals = await ctx.runQuery(internal.rates.scopeCurrencies, { groupId: args.groupId, friendId: args.friendId, userId });
    const sources = Object.keys(totals).filter((c) => c !== target);
    // Rates are stored as source -> target. Fetch from each source base to the target.
    const rates: Record<string, number> = {};
    const unsupported: string[] = [];
    for (const src of sources) {
      const cached = await ctx.runQuery(internal.rates.cachedRates, { base: src, quotes: [target] });
      if (cached[target]) { rates[src] = cached[target]; continue; }
      try {
        const live = await fetchFrankfurter(src, [target]);
        if (live[target]) {
          rates[src] = live[target];
          await ctx.runMutation(internal.rates.storeRates, { base: src, rates: { [target]: live[target] } });
        } else unsupported.push(src);
      } catch {
        unsupported.push(src);
      }
    }
    const lines = sources.map((currency) => {
      const rate = rates[currency] ?? null;
      const t = totals[currency];
      return {
        currency,
        amountMinor: t.amountMinor,
        count: t.count,
        rate,
        convertedMinor: rate ? convertMinor(t.amountMinor, currency, target, rate) : null,
      };
    });
    return { target, lines, unsupported, fetchedAt: Date.now() };
  },
});

export function convertMinor(amountMinor: number, from: string, to: string, rate: number): number {
  const value = (amountMinor / 10 ** currencyDecimals(from)) * rate;
  return Math.round(value * 10 ** currencyDecimals(to));
}

/** Rewrite every expense in scope into `target` using the given rates. Logged, auditable, reversible by editing. */
export const apply = mutation({
  args: { groupId: v.optional(v.id("groups")), friendId: v.optional(v.id("users")), target: v.string(), rates: v.record(v.string(), v.number()) },
  handler: async (ctx, args) => {
    const me = await requireUserId(ctx);
    const target = args.target.toUpperCase();
    const expenses = await scopeExpenses(ctx, me, args);
    let converted = 0;
    for (const e of expenses) {
      if (e.currency === target) continue;
      const rate = args.rates[e.currency];
      if (!rate || rate <= 0) continue;
      const newTotal = convertMinor(e.amountMinor, e.currency, target, rate);
      const shares = await ctx.db.query("expenseShares").withIndex("by_expense", (q) => q.eq("expenseId", e._id)).collect();
      const paid = allocate(newTotal, shares.map((s) => s.paidMinor));
      const owed = allocate(newTotal, shares.map((s) => s.owedMinor));
      // Zero-weight rows must stay zero.
      shares.forEach((s, i) => { if (s.paidMinor === 0) paid[i] = 0; if (s.owedMinor === 0) owed[i] = 0; });
      fixSum(paid, newTotal, shares.map((s) => s.paidMinor));
      fixSum(owed, newTotal, shares.map((s) => s.owedMinor));
      if (!e.deletedAt) {
        await applyDebts(ctx, scopeOf(e), e.currency, pairwiseDebts(shares.map((s) => ({ userId: s.userId, paidMinor: s.paidMinor, owedMinor: s.owedMinor }))), -1);
      }
      const newShares = shares.map((s, i) => ({ userId: s.userId, paidMinor: paid[i], owedMinor: owed[i] }));
      for (const [i, s] of shares.entries()) await ctx.db.patch(s._id, { paidMinor: paid[i], owedMinor: owed[i] });
      if (!e.deletedAt) await applyDebts(ctx, scopeOf(e), target, pairwiseDebts(newShares), 1);
      const patch: Partial<Doc<"expenses">> = {
        amountMinor: newTotal,
        currency: target,
        originalAmountMinor: e.originalAmountMinor ?? e.amountMinor,
        originalCurrency: e.originalCurrency ?? e.currency,
        updatedBy: me,
        updatedAt: Date.now(),
      };
      if (e.splitSpec && (e.splitSpec.method === "exact" || e.splitSpec.method === "adjustment" || e.splitSpec.method === "reimbursement" || e.splitSpec.method === "itemized")) {
        // Entered-amount specs no longer match; fall back to the resulting exact owed amounts.
        patch.splitSpec = { method: "exact", amounts: Object.fromEntries(newShares.filter((s) => s.owedMinor > 0).map((s) => [s.userId, s.owedMinor])) };
        patch.splitMethod = "exact";
      }
      await ctx.db.patch(e._id, patch);
      converted++;
    }
    if (converted > 0) {
      const groupId = args.groupId;
      const pairKey = args.friendId ? pairKeyOf(me, args.friendId) : undefined;
      if (groupId) await ctx.db.patch(groupId, { lastCurrency: target });
      await logActivity(ctx, {
        type: "currency_converted", actorId: me, groupId,
        payload: { target, rates: args.rates, converted },
        scope: { groupId, pairKey },
      });
    }
    return converted;
  },
});

function fixSum(parts: number[], total: number, weights: number[]) {
  let diff = total - parts.reduce((a, b) => a + b, 0);
  if (diff === 0) return;
  const order = weights.map((w, i) => ({ w, i })).filter((x) => x.w > 0).sort((a, b) => b.w - a.w);
  let k = 0;
  while (diff !== 0 && order.length > 0) {
    const i = order[k % order.length].i;
    const step = diff > 0 ? 1 : -1;
    if (parts[i] + step >= 0) { parts[i] += step; diff -= step; }
    k++;
    if (k > 10_000) break;
  }
}
