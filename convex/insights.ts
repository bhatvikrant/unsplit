import { v } from "convex/values";
import { query } from "./_generated/server";
import { assertGroupMember, requireUserId } from "./lib/access";

/** Spending by category and by month. mode "mine" = your share; "group" = total group spend. */
export const charts = query({
  args: { groupId: v.optional(v.id("groups")), mode: v.optional(v.union(v.literal("mine"), v.literal("group"))), months: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const me = await requireUserId(ctx);
    const months = Math.min(args.months ?? 12, 36);
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCMonth(since.getUTCMonth() - (months - 1));
    const sinceMs = since.getTime();
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
      const d = new Date(ms);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    };

    if (args.groupId) {
      await assertGroupMember(ctx, args.groupId, me, { allowDeleted: true });
      const expenses = await ctx.db
        .query("expenses")
        .withIndex("by_group_date", (q) => q.eq("groupId", args.groupId).gte("date", sinceMs))
        .collect();
      for (const e of expenses) {
        if (e.deletedAt || e.isPayment) continue;
        if (mode === "group") bump(e.currency, e.category, monthKey(e.date), e.amountMinor);
        else {
          const mine = await ctx.db.query("expenseShares").withIndex("by_expense", (q) => q.eq("expenseId", e._id)).filter((q) => q.eq(q.field("userId"), me)).unique();
          if (mine && mine.owedMinor > 0) bump(e.currency, e.category, monthKey(e.date), mine.owedMinor);
        }
      }
    } else {
      const shares = await ctx.db
        .query("expenseShares")
        .withIndex("by_user_date", (q) => q.eq("userId", me).eq("deleted", false).gte("date", sinceMs))
        .collect();
      for (const s of shares) {
        if (s.owedMinor <= 0) continue;
        const e = await ctx.db.get(s.expenseId);
        if (!e || e.deletedAt || e.isPayment) continue;
        bump(e.currency, e.category, monthKey(e.date), s.owedMinor);
      }
    }
    const monthKeys: string[] = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(sinceMs);
      d.setUTCMonth(d.getUTCMonth() + i);
      monthKeys.push(monthKey(d.getTime()));
    }
    return { series, monthKeys, mode };
  },
});
