import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { assertExpenseAccess, requireUserId } from "./lib/access";
import { logActivity } from "./lib/activity";
import { idempotent } from "./lib/idempotency";

export const add = mutation({
  args: { expenseId: v.id("expenses"), content: v.string(), clientKey: v.optional(v.string()) },
  handler: async (ctx, { expenseId, content, clientKey }) => {
    const me = await requireUserId(ctx);
    return await idempotent(ctx, me, clientKey, async () => {
    const e = await ctx.db.get(expenseId);
    if (!e) throw new ConvexError("Expense not found");
    await assertExpenseAccess(ctx, e, me);
    const text = content.trim();
    if (!text) throw new ConvexError("Write something first");
    if (text.length > 2000) throw new ConvexError("Comment is too long");
    const id = await ctx.db.insert("comments", { expenseId, userId: me, content: text });
    await logActivity(ctx, {
      type: "comment_added", actorId: me, groupId: e.groupId, expenseId,
      payload: { description: e.description, content: text.slice(0, 200) },
      scope: { groupId: e.groupId, pairKey: e.pairKey },
    });
    return id;
    });
  },
});

export const remove = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, { commentId }) => {
    const me = await requireUserId(ctx);
    const c = await ctx.db.get(commentId);
    if (!c) return;
    if (c.userId !== me) throw new ConvexError("You can only delete your own comments");
    await ctx.db.patch(commentId, { deletedAt: Date.now() });
  },
});
