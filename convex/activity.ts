import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/access";
import { publicUser } from "./lib/users";

/** Coarse buckets the Activity page can filter by. A type may sit in more than one bucket. */
export const activityKind = v.union(v.literal("expenses"), v.literal("payments"), v.literal("groups"), v.literal("people"));
const KIND_TYPES: Record<"expenses" | "payments" | "groups" | "people", ReadonlySet<Doc<"activities">["type"]>> = {
  expenses: new Set(["expense_added", "expense_updated", "expense_deleted", "expense_restored", "comment_added", "currency_converted"]),
  payments: new Set(["payment_recorded", "payment_deleted", "reminder_sent"]),
  groups: new Set(["group_created", "group_updated", "group_deleted", "group_restored", "member_added", "member_removed", "member_left", "simplify_toggled", "currency_converted"]),
  people: new Set(["friend_added", "member_added", "member_removed", "member_left", "reminder_sent"]),
};

/** How many feed rows one call may walk while looking for matches, so a narrow filter can't read unboundedly. */
const SCAN_CAP = 300;

export const feed = query({
  args: {
    limit: v.optional(v.number()),
    /** Only rows created strictly before this time (pagination cursor). */
    before: v.optional(v.number()),
    /** Only rows created at or after this time (date filter). */
    after: v.optional(v.number()),
    /** Only activity in this bucket. */
    kind: v.optional(activityKind),
  },
  handler: async (ctx, args) => {
    const me = await requireUserId(ctx);
    const limit = Math.min(args.limit ?? 40, 100);
    const wanted = args.kind ? KIND_TYPES[args.kind] : null;
    const after = args.after ?? 0;

    // Walk the feed newest-first. Without a kind filter one batch is enough; with one, keep going
    // (within SCAN_CAP) until the page is full, since the feed row doesn't carry the activity type.
    const matched: { row: Doc<"activityFeed">; activity: Doc<"activities"> }[] = [];
    let cursor = args.before ?? Number.MAX_SAFE_INTEGER;
    let scanned = 0;
    let exhausted = false;
    while (matched.length <= limit && scanned < SCAN_CAP) {
      const batch = Math.min(limit + 1, SCAN_CAP - scanned);
      const rows = await ctx.db
        .query("activityFeed")
        .withIndex("by_user", (q) => q.eq("userId", me).gte("_creationTime", after).lt("_creationTime", cursor))
        .order("desc")
        .take(batch);
      scanned += rows.length;
      const acts = await Promise.all(rows.map((r) => ctx.db.get(r.activityId)));
      rows.forEach((row, i) => {
        const activity = acts[i];
        if (activity && (!wanted || wanted.has(activity.type))) matched.push({ row, activity });
      });
      if (rows.length < batch) { exhausted = true; break; }
      cursor = rows[rows.length - 1]._creationTime;
    }

    const expenseOf = async (id: Id<"expenses">) => {
      const e = await ctx.db.get(id);
      if (!e) return null;
      const share = await ctx.db
        .query("expenseShares")
        .withIndex("by_expense", (q) => q.eq("expenseId", e._id))
        .filter((q) => q.eq(q.field("userId"), me))
        .unique();
      return { _id: e._id, description: e.description, deleted: Boolean(e.deletedAt), myNet: share ? share.paidMinor - share.owedMinor : null, amountMinor: e.amountMinor, currency: e.currency };
    };
    // Rows don't depend on each other, so the page is built concurrently instead of ~6 reads × 40 rows in sequence.
    const items = await Promise.all(
      matched.slice(0, limit).map(async ({ row: r, activity: a }) => {
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
          group: group ? { _id: group._id, name: group.name, type: group.type, deleted: Boolean(group.deletedAt) } : null,
          expense,
          isMe: a.actorId === me,
        };
      }),
    );
    // More to load when the page overflowed, or when the scan budget ran out before the feed did.
    const nextBefore = matched.length > limit ? matched[limit - 1].row._creationTime : exhausted ? null : cursor;
    return { items, nextBefore };
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
