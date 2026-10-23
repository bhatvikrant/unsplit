import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

export async function requireUserId(ctx: Ctx): Promise<Id<"users">> {
  const id = await getAuthUserId(ctx);
  if (!id) throw new ConvexError("You need to be signed in");
  return id;
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const id = await requireUserId(ctx);
  const user = await ctx.db.get(id);
  if (!user || user.deletedAt) throw new ConvexError("Account not found");
  return user;
}

export async function optionalUserId(ctx: Ctx): Promise<Id<"users"> | null> {
  return await getAuthUserId(ctx);
}

export function pairKeyOf(a: Id<"users">, b: Id<"users">): string {
  if (a === b) throw new ConvexError("Can't share an expense with yourself");
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function pairUsers(pairKey: string): [Id<"users">, Id<"users">] {
  const [a, b] = pairKey.split(":");
  return [a as Id<"users">, b as Id<"users">];
}

export async function getMembership(ctx: Ctx, groupId: Id<"groups">, userId: Id<"users">) {
  return await ctx.db
    .query("groupMembers")
    .withIndex("by_group_user", (q) => q.eq("groupId", groupId).eq("userId", userId))
    .unique();
}

export async function isGroupMember(ctx: Ctx, groupId: Id<"groups">, userId: Id<"users">): Promise<boolean> {
  return (await getMembership(ctx, groupId, userId)) !== null;
}

/** Group must exist and the user must be a member. Deleted groups are allowed when `allowDeleted`. */
export async function assertGroupMember(
  ctx: Ctx,
  groupId: Id<"groups">,
  userId: Id<"users">,
  opts: { allowDeleted?: boolean } = {},
): Promise<Doc<"groups">> {
  const group = await ctx.db.get(groupId);
  if (!group) throw new ConvexError("Group not found");
  if (group.deletedAt && !opts.allowDeleted) throw new ConvexError("This group was deleted");
  if (!(await isGroupMember(ctx, groupId, userId))) throw new ConvexError("You're not in this group");
  return group;
}

export async function groupMemberIds(ctx: Ctx, groupId: Id<"groups">): Promise<Id<"users">[]> {
  const rows = await ctx.db.query("groupMembers").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect();
  return rows.map((r) => r.userId);
}

export async function friendshipOf(ctx: Ctx, a: Id<"users">, b: Id<"users">) {
  return await ctx.db.query("friendships").withIndex("by_pair", (q) => q.eq("pairKey", pairKeyOf(a, b))).unique();
}

export async function assertFriends(ctx: Ctx, a: Id<"users">, b: Id<"users">): Promise<Doc<"friendships">> {
  const f = await friendshipOf(ctx, a, b);
  if (!f) throw new ConvexError("You're not friends with this person yet");
  return f;
}

export async function ensureFriendship(ctx: MutationCtx, a: Id<"users">, b: Id<"users">, createdBy: Id<"users">): Promise<Doc<"friendships">> {
  const existing = await friendshipOf(ctx, a, b);
  if (existing) return existing;
  const [userA, userB] = a < b ? [a, b] : [b, a];
  const id = await ctx.db.insert("friendships", {
    userA,
    userB,
    pairKey: pairKeyOf(a, b),
    createdBy,
    lastActivityAt: Date.now(),
  });
  return (await ctx.db.get(id))!;
}

export async function friendshipsOf(ctx: Ctx, userId: Id<"users">): Promise<Doc<"friendships">[]> {
  const [asA, asB] = await Promise.all([
    ctx.db.query("friendships").withIndex("by_userA", (q) => q.eq("userA", userId)).collect(),
    ctx.db.query("friendships").withIndex("by_userB", (q) => q.eq("userB", userId)).collect(),
  ]);
  return [...asA, ...asB];
}

/** The other person in a friendship. */
export function otherOf(f: Doc<"friendships">, userId: Id<"users">): Id<"users"> {
  return f.userA === userId ? f.userB : f.userA;
}

export async function friendIdsOf(ctx: Ctx, userId: Id<"users">): Promise<Id<"users">[]> {
  return (await friendshipsOf(ctx, userId)).map((f) => otherOf(f, userId));
}

/** Can this user see / edit this expense? Group member, or one of the pair. */
export async function assertExpenseAccess(ctx: Ctx, expense: Doc<"expenses">, userId: Id<"users">): Promise<void> {
  if (expense.groupId) {
    if (!(await isGroupMember(ctx, expense.groupId, userId))) throw new ConvexError("You don't have access to this expense");
    return;
  }
  if (expense.pairKey) {
    const [a, b] = pairUsers(expense.pairKey);
    if (a !== userId && b !== userId) throw new ConvexError("You don't have access to this expense");
    return;
  }
  throw new ConvexError("Expense has no scope");
}

/** Everyone who should see activity for an expense-like scope. */
export async function scopeParticipants(ctx: Ctx, scope: { groupId?: Id<"groups">; pairKey?: string }): Promise<Id<"users">[]> {
  if (scope.groupId) return await groupMemberIds(ctx, scope.groupId);
  if (scope.pairKey) return pairUsers(scope.pairKey);
  return [];
}
