import { v } from "convex/values";
import { query } from "./_generated/server";
import { assertFriends, assertGroupMember, friendIdsOf, groupMemberIds, pairKeyOf, requireUser, requireUserId } from "./lib/access";
import { minorToDecimalString } from "./lib/money";
import { categoryBySlug } from "./lib/categories";
import type { Id } from "./_generated/dataModel";

/**
 * Spreadsheet rows for a group or a friendship. One column per person with
 * the effect on their balance: positive when they paid or were paid, negative
 * when they borrowed.
 */
export const csv = query({
  args: { groupId: v.optional(v.id("groups")), friendId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const me = await requireUserId(ctx);
    let people: Id<"users">[] = [];
    let expenses = [];
    if (args.groupId) {
      await assertGroupMember(ctx, args.groupId, me, { allowDeleted: true });
      people = await groupMemberIds(ctx, args.groupId);
      expenses = await ctx.db.query("expenses").withIndex("by_group_date", (q) => q.eq("groupId", args.groupId)).order("asc").collect();
    } else if (args.friendId) {
      await assertFriends(ctx, me, args.friendId);
      people = [me, args.friendId];
      const pk = pairKeyOf(me, args.friendId);
      expenses = await ctx.db.query("expenses").withIndex("by_pair_date", (q) => q.eq("pairKey", pk)).order("asc").collect();
    } else {
      throw new Error("Pick a group or a friend");
    }
    const names: string[] = [];
    for (const id of people) names.push((await ctx.db.get(id))?.name ?? "Someone");
    const headers = ["Date", "Description", "Category", "Cost", "Currency", ...names];
    const rows: string[][] = [];
    for (const e of expenses) {
      if (e.deletedAt) continue;
      const shares = await ctx.db.query("expenseShares").withIndex("by_expense", (q) => q.eq("expenseId", e._id)).collect();
      const byUser = new Map(shares.map((s) => [s.userId, s.paidMinor - s.owedMinor]));
      rows.push([
        new Date(e.date).toISOString().slice(0, 10),
        e.description,
        e.isPayment ? "Payment" : categoryBySlug(e.category).name,
        minorToDecimalString(e.amountMinor, e.currency),
        e.currency,
        ...people.map((id) => minorToDecimalString(byUser.get(id) ?? 0, e.currency)),
      ]);
    }
    return { headers, rows };
  },
});

/** Everything about the account, for a JSON backup. */
export const json = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const memberships = await ctx.db.query("groupMembers").withIndex("by_user", (q) => q.eq("userId", me._id)).collect();
    const groups = [];
    for (const m of memberships) {
      const g = await ctx.db.get(m.groupId);
      if (!g) continue;
      const memberIds = await groupMemberIds(ctx, g._id);
      const members = [];
      for (const id of memberIds) { const u = await ctx.db.get(id); members.push({ id, name: u?.name, email: u?.email }); }
      groups.push({ id: g._id, name: g.name, type: g.type, simplifyDebts: g.simplifyDebts, whiteboard: g.whiteboard, deletedAt: g.deletedAt, members });
    }
    const friendIds = await friendIdsOf(ctx, me._id);
    const friends = [];
    for (const id of friendIds) { const u = await ctx.db.get(id); friends.push({ id, name: u?.name, email: u?.email }); }
    const shares = await ctx.db.query("expenseShares").withIndex("by_user_date", (q) => q.eq("userId", me._id)).collect();
    const seen = new Set<string>();
    const expenses = [];
    for (const s of shares) {
      if (seen.has(s.expenseId)) continue;
      seen.add(s.expenseId);
      const e = await ctx.db.get(s.expenseId);
      if (!e) continue;
      const all = await ctx.db.query("expenseShares").withIndex("by_expense", (q) => q.eq("expenseId", e._id)).collect();
      const comments = await ctx.db.query("comments").withIndex("by_expense", (q) => q.eq("expenseId", e._id)).collect();
      expenses.push({
        id: e._id, groupId: e.groupId, description: e.description, notes: e.notes, amount: minorToDecimalString(e.amountMinor, e.currency),
        currency: e.currency, date: new Date(e.date).toISOString(), category: e.category, splitMethod: e.splitMethod, isPayment: e.isPayment,
        repeat: e.repeat, deletedAt: e.deletedAt, createdBy: e.createdBy,
        shares: all.map((x) => ({ userId: x.userId, paid: minorToDecimalString(x.paidMinor, e.currency), owed: minorToDecimalString(x.owedMinor, e.currency) })),
        comments: comments.filter((c) => !c.deletedAt).map((c) => ({ userId: c.userId, content: c.content, at: new Date(c._creationTime).toISOString() })),
      });
    }
    return {
      exportedAt: new Date().toISOString(),
      user: { id: me._id, name: me.name, email: me.email, defaultCurrency: me.defaultCurrency, timeZone: me.timeZone, notifPrefs: me.notifPrefs },
      groups,
      friends,
      expenses,
    };
  },
});
