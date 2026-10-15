import { internalMutation } from "./_generated/server";

const KEEP_MS = 14 * 24 * 3600_000;

/** Cron: idempotency keys only matter for a few hours after the client sent them. */
export const pruneIdempotencyKeys = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - KEEP_MS;
    const old = await ctx.db
      .query("idempotencyKeys")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
      .take(500);
    for (const row of old) await ctx.db.delete(row._id);
    return old.length;
  },
});
