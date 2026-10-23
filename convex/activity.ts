import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
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
    const expenseOf = async (id: Id<"expenses">) => {
      const e = await ctx.db.get(id);
      if (!e) return null;
      const share = await ctx.db
        .query("expenseShares")
        .withIndex("by_expense", (q) => q.eq("expenseId", e._id))
        .filter((q) => q.eq(q.field("userId"), me))
        .unique();
      return { _id: e._id, description: e.description, deleted: Boolean(e.deletedAt), myNet: share ? share.paidMinor - share.owedMinor : null, currency: e.currency };
    };
    // Rows don't depend on each other, so the page is built concurrently instead of ~6 reads × 40 rows in sequence.
    const built = await Promise.all(
      rows.slice(0, limit).map(async (r) => {
        const a = await ctx.db.get(r.activityId);
        if (!a) return null;
        const [actor, group, subject, expense] = await Promise.all([
          ctx.db.get(a.actorId).then((u) => publicUser(ctx, u, me)),
          a.groupId ? ctx.db.get(a.groupId) : null,
          a.subjectUserId ? ctx.db.get(a.subjectUserId).then((u) => publicUser(ctx, u, me)) : null,
          a.expenseId ? expenseOf(a.expenseId) : null,
        ]);
        return {
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
        };
      }),
    );
    const items = built.filter((x) => x !== null);
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
