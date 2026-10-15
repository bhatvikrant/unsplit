import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Run `work` once per (user, key). The offline outbox sends its op id as the
 * key, so a mutation replayed after a reload mid-sync returns the first run's
 * result instead of creating a second expense, group, friend or comment.
 * Without a key this is a plain call.
 */
export async function idempotent<T>(
  ctx: MutationCtx,
  userId: Id<"users">,
  key: string | undefined,
  work: () => Promise<T>,
): Promise<T> {
  if (!key) return await work();
  const hit = await ctx.db
    .query("idempotencyKeys")
    .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
    .unique();
  if (hit) return hit.result as T;
  const result = await work();
  await ctx.db.insert("idempotencyKeys", {
    userId,
    key,
    result: result ?? null,
  });
  return result;
}
