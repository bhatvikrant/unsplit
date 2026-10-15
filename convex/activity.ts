import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/access";
import { publicUser } from "./lib/users";

export const feed = query({
  args: { limit: v.optional(v.number()), before: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const me = await requireUserId(ctx);
    const limit = Math.min(args.limit ?? 40, 100);
    const rows = await ctx.db
      .query("activityFeed")
      .withIndex("by_user", (q) => q.eq("userId", me).lt("_creationTime", args.before ?? Number.MAX_SAFE_INTEGER))
      .order("desc")
      .take(limit + 1);
    const items = [];
    for (const r of rows.slice(0, limit)) {
      const a = await ctx.db.get(r.activityId);
      if (!a) continue;
      const actor = await publicUser(ctx, await ctx.db.get(a.actorId), me);
      const group = a.groupId ? await ctx.db.get(a.groupId) : null;
      const subject = a.subjectUserId ? await publicUser(ctx, await ctx.db.get(a.subjectUserId), me) : null;
      let expense: { _id: string; description: string; deleted: boolean; myNet: number | null; currency: string } | null = null;
      if (a.expenseId) {
        const e = await ctx.db.get(a.expenseId);
        if (e) {
          const share = await ctx.db
            .query("expenseShares")
            .withIndex("by_expense", (q) => q.eq("expenseId", e._id))
            .filter((q) => q.eq(q.field("userId"), me))
            .unique();
          expense = { _id: e._id, description: e.description, deleted: Boolean(e.deletedAt), myNet: share ? share.paidMinor - share.owedMinor : null, currency: e.currency };
        }
      }
      items.push({
        _id: r._id,
        type: a.type,
        payload: a.payload as Record<string, unknown>,
        createdAt: r._creationTime,
        read: r.read,
        actor,
        subject,
        group: group ? { _id: group._id, name: group.name, deleted: Boolean(group.deletedAt) } : null,
        expense,
        isMe: a.actorId === me,
      });
    }
    return { items, nextBefore: rows.length > limit ? rows[limit - 1]._creationTime : null };
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUserId(ctx);
    const rows = await ctx.db.query("activityFeed").withIndex("by_user_read", (q) => q.eq("userId", me).eq("read", false)).take(100);
    return rows.length;
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireUserId(ctx);
    const rows = await ctx.db.query("activityFeed").withIndex("by_user_read", (q) => q.eq("userId", me).eq("read", false)).take(500);
    for (const r of rows) await ctx.db.patch(r._id, { read: true });
  },
});
