import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { scopeParticipants } from "./access";

export type ActivityType =
  | "expense_added" | "expense_updated" | "expense_deleted" | "expense_restored"
  | "payment_recorded" | "payment_deleted" | "comment_added"
  | "group_created" | "group_updated" | "group_deleted" | "group_restored"
  | "member_added" | "member_removed" | "member_left" | "friend_added"
  | "simplify_toggled" | "currency_converted" | "reminder_sent";

export async function logActivity(
  ctx: MutationCtx,
  args: {
    type: ActivityType;
    actorId: Id<"users">;
    groupId?: Id<"groups">;
    expenseId?: Id<"expenses">;
    subjectUserId?: Id<"users">;
    payload?: Record<string, unknown>;
    recipients?: Id<"users">[];
    /** When no recipients are given, fan out to the scope's participants. */
    scope?: { groupId?: Id<"groups">; pairKey?: string };
    notify?: boolean;
  },
): Promise<Id<"activities">> {
  const activityId = await ctx.db.insert("activities", {
    type: args.type,
    actorId: args.actorId,
    groupId: args.groupId,
    expenseId: args.expenseId,
    subjectUserId: args.subjectUserId,
    payload: args.payload ?? {},
  });
  let recipients = args.recipients ?? (args.scope ? await scopeParticipants(ctx, args.scope) : []);
  recipients = [...new Set([...recipients, args.actorId])];
  for (const userId of recipients) {
    await ctx.db.insert("activityFeed", { userId, activityId, read: userId === args.actorId });
  }
  if (args.notify !== false) {
    await ctx.scheduler.runAfter(0, internal.notifications.sendForActivity, { activityId });
  }
  return activityId;
}
