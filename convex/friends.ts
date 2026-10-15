import { ConvexError, v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { assertFriends, ensureFriendship, friendIdsOf, friendshipOf, pairKeyOf, requireUser, requireUserId } from "./lib/access";
import { computeUserBalances, mapToRecord } from "./lib/balances";
import { escapeHtml, layout, sendEmail, siteUrl } from "./lib/email";
import { enforceLimit } from "./lib/rateLimit";
import { formatMoney } from "./lib/money";
import { findOrCreateUser, isValidEmail, normalizeEmail, publicUser, publicUsers } from "./lib/users";
import { logActivity } from "./lib/activity";
import { idempotent } from "./lib/idempotency";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUserId(ctx);
    const ids = await friendIdsOf(ctx, me);
    const balances = await computeUserBalances(ctx, me);
    const users = await publicUsers(ctx, ids, me);
    const out = [];
    for (const u of users) {
      const f = await friendshipOf(ctx, me, u._id);
      out.push({
        user: u,
        balances: mapToRecord(balances.byFriend.get(u._id)),
        lastActivityAt: f?.lastActivityAt ?? 0,
      });
    }
    out.sort((a, b) => a.user.name.localeCompare(b.user.name));
    return out;
  },
});

export const get = query({
  args: { friendId: v.id("users") },
  handler: async (ctx, { friendId }) => {
    const me = await requireUserId(ctx);
    const friendship = await assertFriends(ctx, me, friendId);
    const user = await publicUser(ctx, await ctx.db.get(friendId), me);
    if (!user) throw new ConvexError("Friend not found");
    const balances = await computeUserBalances(ctx, me);
    const perGroup = balances.byFriendGroup.get(friendId) ?? new Map();
    const breakdown: { groupId: Id<"groups"> | null; groupName: string; balances: Record<string, number> }[] = [];
    for (const [key, m] of perGroup) {
      const rec = mapToRecord(m);
      if (Object.keys(rec).length === 0) continue;
      if (key === "none") breakdown.push({ groupId: null, groupName: "Non-group expenses", balances: rec });
      else {
        const g = await ctx.db.get(key as Id<"groups">);
        breakdown.push({ groupId: key as Id<"groups">, groupName: g?.name ?? "Group", balances: rec });
      }
    }
    return {
      user,
      total: mapToRecord(balances.byFriend.get(friendId)),
      breakdown,
      pairKey: friendship.pairKey,
      since: friendship._creationTime,
    };
  },
});

export const add = mutation({
  args: { name: v.optional(v.string()), email: v.optional(v.string()), clientKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    return await idempotent(ctx, me._id, args.clientKey, async () => {
    const email = normalizeEmail(args.email);
    const name = args.name?.trim();
    if (email && !isValidEmail(email)) throw new ConvexError("That email doesn't look right");
    if (!name && !email) throw new ConvexError("Enter a name or an email");
    if (email && email === me.email) throw new ConvexError("That's your own email");
    const friendId = await findOrCreateUser(ctx, { name, email, invitedBy: me._id });
    if (friendId === me._id) throw new ConvexError("You can't add yourself");
    const existed = await friendshipOf(ctx, me._id, friendId);
    if (existed) return { friendId, alreadyFriends: true };
    await ensureFriendship(ctx, me._id, friendId, me._id);
    await logActivity(ctx, { type: "friend_added", actorId: me._id, subjectUserId: friendId, recipients: [me._id, friendId] });
    const friend = await ctx.db.get(friendId);
    if (friend?.isPlaceholder && friend.email) {
      await enforceLimit(ctx, "inviteEmail", me._id, "Invite");
      await ctx.scheduler.runAfter(0, internal.friends.sendInviteEmail, { toUserId: friendId, byUserId: me._id });
    }
    return { friendId, alreadyFriends: false };
    });
  },
});

export const remove = mutation({
  args: { friendId: v.id("users") },
  handler: async (ctx, { friendId }) => {
    const me = await requireUserId(ctx);
    const f = await assertFriends(ctx, me, friendId);
    const balances = await computeUserBalances(ctx, me);
    const rec = mapToRecord(balances.byFriend.get(friendId));
    if (Object.keys(rec).length > 0) throw new ConvexError("Settle up before removing this friend");
    await ctx.db.delete(f._id);
  },
});

export const inviteContext = internalQuery({
  args: { toUserId: v.id("users"), byUserId: v.id("users") },
  handler: async (ctx, { toUserId, byUserId }) => {
    const to = await ctx.db.get(toUserId);
    const by = await ctx.db.get(byUserId);
    if (!to?.email || !by) return null;
    return { toEmail: to.email, toName: to.name ?? "there", byName: by.name ?? "A friend" };
  },
});

export const sendInviteEmail = internalAction({
  args: { toUserId: v.id("users"), byUserId: v.id("users") },
  handler: async (ctx, args) => {
    const c = await ctx.runQuery(internal.friends.inviteContext, args);
    if (!c) return;
    const link = `${siteUrl()}/signup?email=${encodeURIComponent(c.toEmail)}`;
    await sendEmail({
      to: c.toEmail,
      subject: `${c.byName} wants to share expenses with you on UnSplit`,
      text: `${c.byName} added you on UnSplit, a free app for splitting shared costs. Sign up with this email address to see what you share: ${link}`,
      html: layout(
        `${escapeHtml(c.byName)} added you on UnSplit`,
        `<p>${escapeHtml(c.byName)} added you as a friend on UnSplit, a free app for splitting shared costs.</p><p>Sign up with <strong>${escapeHtml(c.toEmail)}</strong> and everything they've shared with you will already be there.</p>`,
        link,
        "Join UnSplit",
      ),
    });
  },
});

export const reminderContext = internalQuery({
  args: { friendId: v.id("users") },
  handler: async (ctx, { friendId }) => {
    const me = await requireUser(ctx);
    await assertFriends(ctx, me._id, friendId);
    const friend = await ctx.db.get(friendId);
    if (!friend) throw new ConvexError("Friend not found");
    const balances = await computeUserBalances(ctx, me._id);
    const rec = mapToRecord(balances.byFriend.get(friendId));
    return { meId: me._id, meName: me.name ?? "Your friend", friendEmail: friend.email, friendName: friend.name ?? "there", balances: rec };
  },
});

export const logReminder = internalMutation({
  args: { actorId: v.id("users"), friendId: v.id("users"), sent: v.boolean() },
  handler: async (ctx, { actorId, friendId, sent }) => {
    await logActivity(ctx, { type: "reminder_sent", actorId, subjectUserId: friendId, payload: { sent }, recipients: [actorId, friendId], notify: false });
  },
});

/** Email a friend what they owe you. */
export const remind = action({
  args: { friendId: v.id("users") },
  handler: async (ctx, { friendId }): Promise<{ sent: boolean; reason?: string }> => {
    const c = await ctx.runQuery(internal.friends.reminderContext, { friendId });
    const owed = Object.entries(c.balances).filter(([, v]) => v > 0);
    if (owed.length === 0) return { sent: false, reason: "They don't owe you anything right now" };
    if (!c.friendEmail) return { sent: false, reason: "This friend has no email address" };
    if (!process.env.RESEND_API_KEY) return { sent: false, reason: "Email isn't set up on this deployment yet" };
    await enforceLimit(ctx, "reminderEmail", c.meId, "Reminder");
    await enforceLimit(ctx, "reminderToFriend", `${c.meId}:${friendId}`, "Reminder");
    const amounts = owed.map(([cur, v]) => formatMoney(v, cur)).join(" and ");
    const link = `${siteUrl()}/friends/${c.meId}`;
    const ok = await sendEmail({
      to: c.friendEmail,
      subject: `Reminder: you owe ${c.meName} ${amounts}`,
      text: `Hi ${c.friendName}, a friendly reminder that you owe ${c.meName} ${amounts} on UnSplit. ${link}`,
      html: layout(`A friendly reminder from ${escapeHtml(c.meName)}`, `<p>You currently owe ${escapeHtml(c.meName)} <strong>${escapeHtml(amounts)}</strong>.</p><p>Open UnSplit to see the details and settle up.</p>`, link, "View balance"),
    });
    await ctx.runMutation(internal.friends.logReminder, { actorId: c.meId, friendId, sent: ok });
    return { sent: ok, reason: ok ? undefined : "Email failed to send" };
  },
});

export const pairKey = query({
  args: { friendId: v.id("users") },
  handler: async (ctx, { friendId }) => {
    const me = await requireUserId(ctx);
    return pairKeyOf(me, friendId);
  },
});
