import { ConvexError, v } from "convex/values";
import { internalAction, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertGroupMember, ensureFriendship, getMembership, groupMemberIds, isGroupMember, optionalUserId, requireUser, requireUserId,
} from "./lib/access";
import { computeUserBalances, groupDebts, isSettled, mapToRecord, netsFromDebts, rowsToDebts, scopeRows, groupScope, userNetInGroup } from "./lib/balances";
import { logActivity } from "./lib/activity";
import { randomCode } from "./lib/ids";
import { findOrCreateUser, isValidEmail, normalizeEmail, publicUsers } from "./lib/users";
import { escapeHtml, layout, sendEmail, siteUrl } from "./lib/email";
import { enforceLimit } from "./lib/rateLimit";
import { groupType, splitSpec } from "./schema";
import { idempotent } from "./lib/idempotency";

const memberInput = v.object({
  userId: v.optional(v.id("users")),
  name: v.optional(v.string()),
  email: v.optional(v.string()),
});

async function coverUrl(ctx: { storage: { getUrl: (id: Id<"_storage">) => Promise<string | null> } }, g: Doc<"groups">) {
  return g.coverId ? await ctx.storage.getUrl(g.coverId) : null;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUserId(ctx);
    const memberships = await ctx.db.query("groupMembers").withIndex("by_user", (q) => q.eq("userId", me)).collect();
    const balances = await computeUserBalances(ctx, me);
    const out = [];
    for (const m of memberships) {
      const g = await ctx.db.get(m.groupId);
      if (!g || g.deletedAt) continue;
      out.push({
        _id: g._id,
        name: g.name,
        type: g.type,
        coverUrl: await coverUrl(ctx, g),
        myBalance: mapToRecord(balances.byGroup.get(g._id)),
        createdAt: g._creationTime,
      });
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out;
  },
});

export const listDeleted = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUserId(ctx);
    const memberships = await ctx.db.query("groupMembers").withIndex("by_user", (q) => q.eq("userId", me)).collect();
    const out = [];
    for (const m of memberships) {
      const g = await ctx.db.get(m.groupId);
      if (!g || !g.deletedAt) continue;
      const by = g.deletedBy ? await ctx.db.get(g.deletedBy) : null;
      out.push({ _id: g._id, name: g.name, type: g.type, deletedAt: g.deletedAt, deletedByName: by?.name ?? "Someone" });
    }
    return out.sort((a, b) => b.deletedAt - a.deletedAt);
  },
});

export const get = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const me = await requireUserId(ctx);
    const g = await assertGroupMember(ctx, groupId, me, { allowDeleted: true });
    const memberIds = await groupMemberIds(ctx, groupId);
    const members = await publicUsers(ctx, memberIds, me);
    const debts = await groupDebts(ctx, g);
    const original = g.simplifyDebts ? rowsToDebts(await scopeRows(ctx, groupScope(groupId))) : debts;
    const nets = netsFromDebts(debts);
    const memberNets = Object.fromEntries(memberIds.map((id) => [id, mapToRecord(nets.get(id))]));
    return {
      _id: g._id,
      name: g.name,
      type: g.type,
      coverUrl: await coverUrl(ctx, g),
      simplifyDebts: g.simplifyDebts,
      defaultSplit: g.defaultSplit ?? null,
      whiteboard: g.whiteboard ?? "",
      inviteCode: g.inviteCode,
      lastCurrency: g.lastCurrency ?? null,
      deletedAt: g.deletedAt ?? null,
      createdBy: g.createdBy,
      members,
      debts,
      originalDebts: original,
      memberNets,
      myNet: mapToRecord(nets.get(me)),
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    type: groupType,
    members: v.array(memberInput),
    simplifyDebts: v.optional(v.boolean()),
    clientKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    return await idempotent(ctx, me._id, args.clientKey, async () => {
    const name = args.name.trim();
    if (!name || name.length > 80) throw new ConvexError("Group name must be 1 to 80 characters");
    const groupId = await ctx.db.insert("groups", {
      name,
      type: args.type,
      simplifyDebts: args.simplifyDebts ?? false,
      inviteCode: randomCode(14),
      createdBy: me._id,
      lastCurrency: me.defaultCurrency ?? "USD",
    });
    const now = Date.now();
    await ctx.db.insert("groupMembers", { groupId, userId: me._id, joinedAt: now });
    const added: Id<"users">[] = [];
    for (const m of args.members) {
      const id = await resolveMember(ctx, me._id, m);
      if (id === me._id || added.includes(id)) continue;
      await ctx.db.insert("groupMembers", { groupId, userId: id, joinedAt: now, addedBy: me._id });
      added.push(id);
    }
    for (const a of [me._id, ...added]) for (const b of added) if (a !== b) await ensureFriendship(ctx, a, b, me._id);
    await logActivity(ctx, { type: "group_created", actorId: me._id, groupId, payload: { name }, recipients: [me._id, ...added] });
    for (const id of added) await maybeEmailGroupInvite(ctx, groupId, id, me._id);
    return groupId;
    });
  },
});

async function resolveMember(ctx: Parameters<typeof findOrCreateUser>[0], me: Id<"users">, m: { userId?: Id<"users">; name?: string; email?: string }): Promise<Id<"users">> {
  if (m.userId) {
    const u = await ctx.db.get(m.userId);
    if (!u || u.deletedAt) throw new ConvexError("User not found");
    return m.userId;
  }
  const email = normalizeEmail(m.email);
  if (email && !isValidEmail(email)) throw new ConvexError(`"${email}" doesn't look like an email`);
  return await findOrCreateUser(ctx, { name: m.name, email, invitedBy: me });
}

async function maybeEmailGroupInvite(ctx: MutationCtx, groupId: Id<"groups">, toUserId: Id<"users">, byUserId: Id<"users">) {
  const u = await ctx.db.get(toUserId);
  if (u?.isPlaceholder && u.email) {
    await enforceLimit(ctx, "inviteEmail", byUserId, "Invite");
    await ctx.scheduler.runAfter(0, internal.groups.sendGroupInviteEmail, { groupId, toUserId, byUserId });
  }
}

export const update = mutation({
  args: {
    groupId: v.id("groups"),
    name: v.optional(v.string()),
    type: v.optional(groupType),
    coverId: v.optional(v.union(v.id("_storage"), v.null())),
    simplifyDebts: v.optional(v.boolean()),
    defaultSplit: v.optional(v.union(splitSpec, v.null())),
    whiteboard: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUserId(ctx);
    const g = await assertGroupMember(ctx, args.groupId, me);
    const patch: Partial<Doc<"groups">> = {};
    const changed: Record<string, unknown> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name || name.length > 80) throw new ConvexError("Group name must be 1 to 80 characters");
      if (name !== g.name) { patch.name = name; changed.name = { from: g.name, to: name }; }
    }
    if (args.type !== undefined && args.type !== g.type) { patch.type = args.type; changed.type = { from: g.type, to: args.type }; }
    if (args.coverId !== undefined) {
      if (g.coverId && g.coverId !== args.coverId) await ctx.storage.delete(g.coverId);
      patch.coverId = args.coverId ?? undefined;
      changed.cover = true;
    }
    if (args.defaultSplit !== undefined) { patch.defaultSplit = args.defaultSplit ?? undefined; changed.defaultSplit = args.defaultSplit?.method ?? "equal"; }
    if (args.whiteboard !== undefined && args.whiteboard !== (g.whiteboard ?? "")) { patch.whiteboard = args.whiteboard.slice(0, 5000); changed.whiteboard = true; }
    if (args.simplifyDebts !== undefined && args.simplifyDebts !== g.simplifyDebts) {
      patch.simplifyDebts = args.simplifyDebts;
      await ctx.db.patch(g._id, patch);
      await logActivity(ctx, { type: "simplify_toggled", actorId: me, groupId: g._id, payload: { on: args.simplifyDebts, name: g.name }, scope: { groupId: g._id } });
      delete patch.simplifyDebts;
    }
    if (Object.keys(patch).length > 0) await ctx.db.patch(g._id, patch);
    if (Object.keys(changed).length > 0) {
      await logActivity(ctx, { type: "group_updated", actorId: me, groupId: g._id, payload: { changed, name: patch.name ?? g.name }, scope: { groupId: g._id } });
    }
  },
});

export const addMember = mutation({
  args: { groupId: v.id("groups"), member: memberInput, clientKey: v.optional(v.string()) },
  handler: async (ctx, { groupId, member, clientKey }) => {
    const me = await requireUserId(ctx);
    return await idempotent(ctx, me, clientKey, async () => {
    const g = await assertGroupMember(ctx, groupId, me);
    const userId = await resolveMember(ctx, me, member);
    if (await isGroupMember(ctx, groupId, userId)) throw new ConvexError("They're already in this group");
    const existing = await groupMemberIds(ctx, groupId);
    await ctx.db.insert("groupMembers", { groupId, userId, joinedAt: Date.now(), addedBy: me });
    for (const other of existing) await ensureFriendship(ctx, other, userId, me);
    const u = await ctx.db.get(userId);
    await logActivity(ctx, { type: "member_added", actorId: me, groupId, subjectUserId: userId, payload: { name: g.name, memberName: u?.name }, scope: { groupId } });
    await maybeEmailGroupInvite(ctx, groupId, userId, me);
    return userId;
    });
  },
});

export const removeMember = mutation({
  args: { groupId: v.id("groups"), userId: v.id("users") },
  handler: async (ctx, { groupId, userId }) => {
    const me = await requireUserId(ctx);
    const g = await assertGroupMember(ctx, groupId, me);
    const m = await getMembership(ctx, groupId, userId);
    if (!m) throw new ConvexError("They're not in this group");
    if (!isSettled(await userNetInGroup(ctx, g, userId))) throw new ConvexError("They need to be settled up in this group before being removed");
    await ctx.db.delete(m._id);
    const u = await ctx.db.get(userId);
    await logActivity(ctx, {
      type: userId === me ? "member_left" : "member_removed",
      actorId: me, groupId, subjectUserId: userId,
      payload: { name: g.name, memberName: u?.name },
      recipients: [...(await groupMemberIds(ctx, groupId)), userId],
    });
  },
});

export const remove = mutation({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const me = await requireUserId(ctx);
    const g = await assertGroupMember(ctx, groupId, me);
    await ctx.db.patch(groupId, { deletedAt: Date.now(), deletedBy: me });
    await logActivity(ctx, { type: "group_deleted", actorId: me, groupId, payload: { name: g.name }, scope: { groupId } });
  },
});

export const restore = mutation({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const me = await requireUserId(ctx);
    const g = await assertGroupMember(ctx, groupId, me, { allowDeleted: true });
    if (!g.deletedAt) return;
    await ctx.db.patch(groupId, { deletedAt: undefined, deletedBy: undefined });
    await logActivity(ctx, { type: "group_restored", actorId: me, groupId, payload: { name: g.name }, scope: { groupId } });
  },
});

export const inviteInfo = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const g = await ctx.db.query("groups").withIndex("by_invite", (q) => q.eq("inviteCode", code)).unique();
    if (!g || g.deletedAt) return null;
    const me = await optionalUserId(ctx);
    const memberIds = await groupMemberIds(ctx, g._id);
    const creator = await ctx.db.get(g.createdBy);
    return {
      groupId: g._id,
      name: g.name,
      type: g.type,
      memberCount: memberIds.length,
      createdByName: creator?.name ?? "Someone",
      alreadyMember: me ? memberIds.includes(me) : false,
      signedIn: Boolean(me),
    };
  },
});

export const joinByCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const me = await requireUser(ctx);
    const g = await ctx.db.query("groups").withIndex("by_invite", (q) => q.eq("inviteCode", code)).unique();
    if (!g || g.deletedAt) throw new ConvexError("This invite link isn't valid any more");
    if (await isGroupMember(ctx, g._id, me._id)) return g._id;
    const existing = await groupMemberIds(ctx, g._id);
    await ctx.db.insert("groupMembers", { groupId: g._id, userId: me._id, joinedAt: Date.now() });
    for (const other of existing) await ensureFriendship(ctx, other, me._id, me._id);
    await logActivity(ctx, { type: "member_added", actorId: me._id, groupId: g._id, subjectUserId: me._id, payload: { name: g.name, memberName: me.name, joined: true }, scope: { groupId: g._id } });
    return g._id;
  },
});

export const regenerateInvite = mutation({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const me = await requireUserId(ctx);
    await assertGroupMember(ctx, groupId, me);
    const code = randomCode(14);
    await ctx.db.patch(groupId, { inviteCode: code });
    return code;
  },
});

/** The six "totals" metrics, per currency, for a month ("YYYY-MM") or all time. */
export const totals = query({
  args: { groupId: v.id("groups"), month: v.optional(v.string()) },
  handler: async (ctx, { groupId, month }) => {
    const me = await requireUserId(ctx);
    await assertGroupMember(ctx, groupId, me, { allowDeleted: true });
    let from = -Infinity, to = Infinity;
    if (month) {
      const [y, m] = month.split("-").map(Number);
      from = Date.UTC(y, m - 1, 1) - 14 * 3600_000; // generous for time zones
      to = Date.UTC(y, m, 1) + 14 * 3600_000;
    }
    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_group_date", (q) => q.eq("groupId", groupId).gte("date", from === -Infinity ? 0 : from).lt("date", to === Infinity ? Number.MAX_SAFE_INTEGER : to))
      .collect();
    type Row = { groupSpending: number; youPaid: number; yourShare: number; paymentsMade: number; paymentsReceived: number; change: number };
    const per: Record<string, Row> = {};
    const row = (c: string) => (per[c] ??= { groupSpending: 0, youPaid: 0, yourShare: 0, paymentsMade: 0, paymentsReceived: 0, change: 0 });
    const months = new Set<string>();
    for (const e of expenses) {
      if (e.deletedAt) continue;
      const d = new Date(e.date);
      months.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
      const r = row(e.currency);
      const shares = await ctx.db.query("expenseShares").withIndex("by_expense", (q) => q.eq("expenseId", e._id)).collect();
      const mine = shares.find((s) => s.userId === me);
      if (e.isPayment) {
        if (mine) { r.paymentsMade += mine.paidMinor; r.paymentsReceived += mine.owedMinor; }
      } else {
        r.groupSpending += e.amountMinor;
        if (mine) { r.youPaid += mine.paidMinor; r.yourShare += mine.owedMinor; }
      }
    }
    for (const r of Object.values(per)) r.change = r.youPaid - r.yourShare + r.paymentsMade - r.paymentsReceived;
    return { totals: per, months: [...months].sort().reverse() };
  },
});

export const groupInviteContext = internalQuery({
  args: { groupId: v.id("groups"), toUserId: v.id("users"), byUserId: v.id("users") },
  handler: async (ctx, { groupId, toUserId, byUserId }) => {
    const g = await ctx.db.get(groupId);
    const to = await ctx.db.get(toUserId);
    const by = await ctx.db.get(byUserId);
    if (!g || !to?.email || !by) return null;
    return { toEmail: to.email, byName: by.name ?? "A friend", groupName: g.name, code: g.inviteCode };
  },
});

export const sendGroupInviteEmail = internalAction({
  args: { groupId: v.id("groups"), toUserId: v.id("users"), byUserId: v.id("users") },
  handler: async (ctx, args) => {
    const c = await ctx.runQuery(internal.groups.groupInviteContext, args);
    if (!c) return;
    const link = `${siteUrl()}/join/${c.code}?email=${encodeURIComponent(c.toEmail)}`;
    await sendEmail({
      to: c.toEmail,
      subject: `${c.byName} added you to "${c.groupName}" on Unsplit`,
      text: `${c.byName} added you to the group "${c.groupName}" on Unsplit, a free app for splitting shared costs. Sign up with this email to see it: ${link}`,
      html: layout(
        `You're in "${escapeHtml(c.groupName)}"`,
        `<p>${escapeHtml(c.byName)} added you to the group <strong>${escapeHtml(c.groupName)}</strong> on Unsplit, a free app for splitting shared costs.</p><p>Sign up with <strong>${escapeHtml(c.toEmail)}</strong> to see the expenses and balances.</p>`,
        link,
        "Open the group",
      ),
    });
  },
});
