import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, requireUserId } from "./lib/access";
import { computeUserBalances } from "./lib/balances";
import { CURRENCY_CODES } from "./lib/currencies";
import { DEFAULT_NOTIF_PREFS, publicUser } from "./lib/users";
import { notifPrefs } from "./schema";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const id = await getAuthUserId(ctx);
    if (!id) return null;
    const u = await ctx.db.get(id);
    if (!u || u.deletedAt) return null;
    const pub = (await publicUser(ctx, u, id))!;
    return {
      ...pub,
      defaultCurrency: u.defaultCurrency ?? "USD",
      timeZone: u.timeZone,
      notifPrefs: u.notifPrefs ?? DEFAULT_NOTIF_PREFS,
      createdAt: u._creationTime,
    };
  },
});

export const update = mutation({
  args: {
    name: v.optional(v.string()),
    defaultCurrency: v.optional(v.string()),
    timeZone: v.optional(v.string()),
    notifPrefs: v.optional(notifPrefs),
    avatarId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 1 || name.length > 80) throw new ConvexError("Name must be 1 to 80 characters");
      patch.name = name;
    }
    if (args.defaultCurrency !== undefined) {
      const c = args.defaultCurrency.toUpperCase();
      if (!CURRENCY_CODES.has(c)) throw new ConvexError("Unknown currency");
      patch.defaultCurrency = c;
    }
    if (args.timeZone !== undefined) patch.timeZone = args.timeZone;
    if (args.notifPrefs !== undefined) patch.notifPrefs = args.notifPrefs;
    if (args.avatarId !== undefined) {
      if (user.avatarId && user.avatarId !== args.avatarId) await ctx.storage.delete(user.avatarId);
      patch.avatarId = args.avatarId ?? undefined;
    }
    await ctx.db.patch(user._id, patch);
  },
});

/** Anonymise the account. Shares stay so everyone else's balances stay right. */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const balances = await computeUserBalances(ctx, user._id);
    for (const m of balances.byFriend.values()) {
      for (const amount of m.values()) {
        if (amount !== 0) throw new ConvexError("Settle up with everyone before deleting your account");
      }
    }
    const memberships = await ctx.db.query("groupMembers").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
    for (const m of memberships) await ctx.db.delete(m._id);
    const asA = await ctx.db.query("friendships").withIndex("by_userA", (q) => q.eq("userA", user._id)).collect();
    const asB = await ctx.db.query("friendships").withIndex("by_userB", (q) => q.eq("userB", user._id)).collect();
    for (const f of [...asA, ...asB]) await ctx.db.delete(f._id);
    const feed = await ctx.db.query("activityFeed").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
    for (const row of feed) await ctx.db.delete(row._id);
    const sessions = await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", user._id)).collect();
    for (const s of sessions) {
      const tokens = await ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", s._id)).collect();
      for (const t of tokens) await ctx.db.delete(t._id);
      await ctx.db.delete(s._id);
    }
    const accounts = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", user._id)).collect();
    for (const a of accounts) await ctx.db.delete(a._id);
    if (user.avatarId) await ctx.storage.delete(user.avatarId);
    await ctx.db.patch(user._id, {
      deletedAt: Date.now(),
      name: "Deleted user",
      email: undefined,
      image: undefined,
      avatarId: undefined,
      phone: undefined,
    });
  },
});

export const signOutEverywhere = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const sessions = await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).collect();
    for (const s of sessions) {
      const tokens = await ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", s._id)).collect();
      for (const t of tokens) await ctx.db.delete(t._id);
      await ctx.db.delete(s._id);
    }
  },
});
