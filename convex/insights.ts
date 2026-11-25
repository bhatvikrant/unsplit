import { v } from "convex/values";
import { query } from "./_generated/server";
import { assertGroupMember, requireUserId } from "./lib/access";

/** Spending by category and by month. mode "mine" = your share; "group" = total group spend. */
export const charts = query({
  /** `tzOffset`: the viewer's `getTimezoneOffset()` in minutes, so the months are theirs, not UTC's. */
  args: { groupId: v.optional(v.id("groups")), mode: v.optional(v.union(v.literal("mine"), v.literal("group"))), months: v.optional(v.number()), tzOffset: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const me = await requireUserId(ctx);
    const months = Math.min(args.months ?? 12, 36);
    const shift = (Number.isFinite(args.tzOffset) ? (args.tzOffset as number) : 0) * 60_000;
    // The viewer's wall-clock time, read through the UTC getters.
    const since = new Date(Date.now() - shift);
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCMonth(since.getUTCMonth() - (months - 1));
    const sinceMs = since.getTime() + shift;
    const mode = args.groupId ? (args.mode ?? "group") : "mine";

    type Series = { byCategory: Record<string, number>; byMonth: Record<string, number>; total: number; count: number };
    const series: Record<string, Series> = {};
    const bump = (currency: string, category: string, month: string, amount: number) => {
      const s = (series[currency] ??= { byCategory: {}, byMonth: {}, total: 0, count: 0 });
      s.byCategory[category] = (s.byCategory[category] ?? 0) + amount;
      s.byMonth[month] = (s.byMonth[month] ?? 0) + amount;
      s.total += amount;
      s.count += 1;
    };
    const monthKey = (ms: number) => {
      const d = new Date(ms - shift);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    };

    if (args.groupId) {
      await assertGroupMember(ctx, args.groupId, me, { allowDeleted: true });
      const expenses = await ctx.db
        .query("expenses")
        .withIndex("by_group_date", (q) => q.eq("groupId", args.groupId).gte("date", sinceMs))
        .collect();
      const live = expenses.filter((e) => !e.deletedAt && !e.isPayment);
      if (mode === "group") {
        for (const e of live) bump(e.currency, e.category, monthKey(e.date), e.amountMinor);
      } else {
        // Independent reads go out together rather than one round trip per expense.
        const mine = await Promise.all(live.map((e) => ctx.db.query("expenseShares").withIndex("by_expense", (q) => q.eq("expenseId", e._id)).filter((q) => q.eq(q.field("userId"), me)).unique()));
        live.forEach((e, i) => {
          const m = mine[i];
          if (m && m.owedMinor > 0) bump(e.currency, e.category, monthKey(e.date), m.owedMinor);
        });
      }
    } else {
      const shares = await ctx.db
        .query("expenseShares")
        .withIndex("by_user_date", (q) => q.eq("userId", me).eq("deleted", false).gte("date", sinceMs))
        .collect();
      const mine = shares.filter((s) => s.owedMinor > 0);
      const docs = await Promise.all(mine.map((s) => ctx.db.get(s.expenseId)));
      mine.forEach((s, i) => {
        const e = docs[i];
        if (e && !e.deletedAt && !e.isPayment) bump(e.currency, e.category, monthKey(e.date), s.owedMinor);
      });
    }
    const monthKeys: string[] = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(since);
      d.setUTCMonth(d.getUTCMonth() + i);
      monthKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    return { series, monthKeys, mode };
  },
});
