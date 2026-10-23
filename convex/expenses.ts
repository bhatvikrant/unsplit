import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertExpenseAccess, assertFriends, assertGroupMember, groupMemberIds, pairKeyOf, pairUsers, requireUser, requireUserId,
} from "./lib/access";
import { applyDebts, scopeOf } from "./lib/balances";
import { logActivity } from "./lib/activity";
import { isCategory } from "./lib/categories";
import { CURRENCY_CODES } from "./lib/currencies";
import { nextOccurrence } from "./lib/recurring";
import { buildShares, pairwiseDebts, SplitError, type Share, type SplitSpec } from "./lib/split";
import { publicUser, publicUsers, type PublicUser } from "./lib/users";
import { idempotent } from "./lib/idempotency";
import { repeatInterval, splitSpec } from "./schema";

type Ctx = QueryCtx | MutationCtx;

// ---------- shared helpers ----------

async function resolveScope(ctx: Ctx, me: Id<"users">, args: { groupId?: Id<"groups">; friendId?: Id<"users"> }) {
  if (args.groupId) {
    await assertGroupMember(ctx, args.groupId, me);
    return { groupId: args.groupId, pairKey: undefined, allowed: await groupMemberIds(ctx, args.groupId) };
  }
  if (args.friendId) {
    await assertFriends(ctx, me, args.friendId);
    return { groupId: undefined, pairKey: pairKeyOf(me, args.friendId), allowed: [me, args.friendId] };
  }
  throw new ConvexError("Pick a group or a friend");
}

function validateCommon(args: { description: string; amountMinor: number; currency: string; category: string; date: number }) {
  const description = args.description.trim();
  if (!description) throw new ConvexError("Add a description");
  if (description.length > 200) throw new ConvexError("Description is too long (200 characters max)");
  if (!Number.isInteger(args.amountMinor) || args.amountMinor <= 0) throw new ConvexError("Enter an amount greater than zero");
  const currency = args.currency.toUpperCase();
  if (!CURRENCY_CODES.has(currency)) throw new ConvexError("Unknown currency");
  if (!Number.isFinite(args.date)) throw new ConvexError("Pick a date");
  return { description, currency, category: isCategory(args.category) ? args.category : "general" };
}

function sharesOrThrow(total: number, payers: { userId: Id<"users">; paidMinor: number }[], spec: SplitSpec, allowed: Id<"users">[]): Share[] {
  const allowedSet = new Set<string>(allowed);
  try {
    const shares = buildShares(total, payers, spec);
    for (const s of shares) if (!allowedSet.has(s.userId)) throw new ConvexError("Someone in this split isn't part of the group");
    return shares;
  } catch (e) {
    if (e instanceof SplitError) throw new ConvexError(e.message);
    throw e;
  }
}

async function writeShares(ctx: MutationCtx, expense: Doc<"expenses">, shares: Share[]) {
  for (const s of shares) {
    await ctx.db.insert("expenseShares", {
      expenseId: expense._id,
      userId: s.userId as Id<"users">,
      paidMinor: s.paidMinor,
      owedMinor: s.owedMinor,
      date: expense.date,
      groupId: expense.groupId,
      pairKey: expense.pairKey,
      deleted: Boolean(expense.deletedAt),
    });
  }
  if (!expense.deletedAt) await applyDebts(ctx, scopeOf(expense), expense.currency, pairwiseDebts(shares), 1);
}

async function loadShares(ctx: Ctx, expenseId: Id<"expenses">) {
  return await ctx.db.query("expenseShares").withIndex("by_expense", (q) => q.eq("expenseId", expenseId)).collect();
}

async function clearShares(ctx: MutationCtx, expense: Doc<"expenses">) {
  const rows = await loadShares(ctx, expense._id);
  if (!expense.deletedAt) {
    await applyDebts(ctx, scopeOf(expense), expense.currency, pairwiseDebts(rows.map(toShare)), -1);
  }
  for (const r of rows) await ctx.db.delete(r._id);
  return rows;
}

function toShare(r: Doc<"expenseShares">): Share {
  return { userId: r.userId, paidMinor: r.paidMinor, owedMinor: r.owedMinor };
}

async function touchScope(ctx: MutationCtx, expense: { groupId?: Id<"groups">; pairKey?: string; currency: string }) {
  if (expense.groupId) await ctx.db.patch(expense.groupId, { lastCurrency: expense.currency });
  if (expense.pairKey) {
    const f = await ctx.db.query("friendships").withIndex("by_pair", (q) => q.eq("pairKey", expense.pairKey!)).unique();
    if (f) await ctx.db.patch(f._id, { lastActivityAt: Date.now() });
  }
}

export type ExpenseRow = {
  _id: Id<"expenses">;
  description: string;
  amountMinor: number;
  currency: string;
  date: number;
  category: string;
  isPayment: boolean;
  repeat: Doc<"expenses">["repeat"];
  groupId: Id<"groups"> | null;
  groupName: string | null;
  pairKey: string | null;
  payers: { userId: Id<"users">; name: string; paidMinor: number }[];
  payees: { userId: Id<"users">; name: string; owedMinor: number }[];
  mine: { paidMinor: number; owedMinor: number } | null;
  participantCount: number;
  hasReceipt: boolean;
  deletedAt: number | null;
  createdAt: number;
};

/** Names looked up while building rows. Holds promises, so rows built concurrently share one read per user or group. */
type NameCache = Map<string, Promise<string>>;

async function toRow(ctx: Ctx, e: Doc<"expenses">, me: Id<"users">, nameCache: NameCache, preloaded?: Doc<"expenseShares">[]): Promise<ExpenseRow> {
  const shares = preloaded ?? (await loadShares(ctx, e._id));
  const cached = (key: string, load: () => Promise<string>) => {
    let p = nameCache.get(key);
    if (!p) {
      p = load();
      nameCache.set(key, p);
    }
    return p;
  };
  const name = (id: Id<"users">) =>
    cached(id, async () => {
      const u = await ctx.db.get(id);
      return u?.deletedAt ? "Deleted user" : (u?.name ?? "Someone");
    });
  const gid = e.groupId;
  const [payers, payees, groupName] = await Promise.all([
    Promise.all(shares.filter((s) => s.paidMinor > 0).map(async (s) => ({ userId: s.userId, name: await name(s.userId), paidMinor: s.paidMinor }))),
    Promise.all(shares.filter((s) => s.owedMinor > 0).map(async (s) => ({ userId: s.userId, name: await name(s.userId), owedMinor: s.owedMinor }))),
    gid ? cached(`g:${gid}`, async () => (await ctx.db.get(gid))?.name ?? "Group") : null,
  ]);
  const mine = shares.find((s) => s.userId === me);
  return {
    _id: e._id,
    description: e.description,
    amountMinor: e.amountMinor,
    currency: e.currency,
    date: e.date,
    category: e.category,
    isPayment: e.isPayment,
    repeat: e.repeat,
    groupId: e.groupId ?? null,
    groupName,
    pairKey: e.pairKey ?? null,
    payers,
    payees,
    mine: mine ? { paidMinor: mine.paidMinor, owedMinor: mine.owedMinor } : null,
    participantCount: shares.filter((s) => s.owedMinor > 0 || s.paidMinor > 0).length,
    hasReceipt: Boolean(e.receiptId),
    deletedAt: e.deletedAt ?? null,
    createdAt: e._creationTime,
  };
}

function matches(e: Doc<"expenses">, q: string) {
  const s = q.toLowerCase();
  return e.description.toLowerCase().includes(s) || (e.notes ?? "").toLowerCase().includes(s);
}

// ---------- queries ----------

export const list = query({
  args: {
    groupId: v.optional(v.id("groups")),
    friendId: v.optional(v.id("users")),
    search: v.optional(v.string()),
    before: v.optional(v.number()),
    limit: v.optional(v.number()),
    includeDeleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const me = await requireUserId(ctx);
    const limit = Math.min(args.limit ?? 50, 200);
    const before = args.before ?? Number.MAX_SAFE_INTEGER;
    const search = args.search?.trim();
    const scanCap = search ? 3000 : limit * 3 + 50;
    const nameCache: NameCache = new Map();
    const sharesCache = new Map<Id<"expenses">, Doc<"expenseShares">[]>();
    let candidates: Doc<"expenses">[];
    let scanned: number;

    // Independent reads go out together (Promise.all) rather than one round trip per row.
    if (args.groupId) {
      await assertGroupMember(ctx, args.groupId, me, { allowDeleted: true });
      candidates = await ctx.db
        .query("expenses")
        .withIndex("by_group_date", (q) => q.eq("groupId", args.groupId).lt("date", before))
        .order("desc")
        .take(scanCap);
      scanned = candidates.length;
    } else {
      const shares = await ctx.db
        .query("expenseShares")
        .withIndex("by_user_date", (q) => q.eq("userId", me).eq("deleted", Boolean(args.includeDeleted)).lt("date", before))
        .order("desc")
        .take(scanCap);
      scanned = shares.length;
      const ids = [...new Set(shares.map((s) => s.expenseId))];
      candidates = (await Promise.all(ids.map((id) => ctx.db.get(id)))).filter((e): e is Doc<"expenses"> => e !== null);
      if (args.friendId) {
        const pk = pairKeyOf(me, args.friendId);
        const shared = await Promise.all(
          candidates.map(async (e) => {
            if (e.pairKey === pk) return true;
            if (!e.groupId) return false;
            const rows = await loadShares(ctx, e._id);
            sharesCache.set(e._id, rows);
            return rows.some((x) => x.userId === args.friendId);
          }),
        );
        candidates = candidates.filter((_, i) => shared[i]);
      }
    }

    const kept = candidates.filter((e) => Boolean(e.deletedAt) === Boolean(args.includeDeleted) && (!search || matches(e, search)));
    const page = kept.slice(0, limit);
    const items = await Promise.all(page.map((e) => toRow(ctx, e, me, nameCache, sharesCache.get(e._id))));
    const exhausted = scanned < scanCap && kept.length <= limit;
    return { items, nextBefore: exhausted ? null : (page[page.length - 1]?.date ?? null) };
  },
});

export const get = query({
  args: { id: v.id("expenses") },
  handler: async (ctx, { id }) => {
    const me = await requireUserId(ctx);
    const e = await ctx.db.get(id);
    if (!e) throw new ConvexError("Expense not found");
    await assertExpenseAccess(ctx, e, me);
    const shares = await loadShares(ctx, id);
    const userIds = [...new Set([...shares.map((s) => s.userId), e.createdBy, e.updatedBy])];
    const users = await publicUsers(ctx, userIds, me);
    const byId = new Map<string, PublicUser>(users.map((u) => [u._id, u]));
    const comments = [];
    for (const c of await ctx.db.query("comments").withIndex("by_expense", (q) => q.eq("expenseId", id)).collect()) {
      if (c.deletedAt) continue;
      const u = byId.get(c.userId) ?? (await publicUser(ctx, await ctx.db.get(c.userId), me));
      comments.push({ _id: c._id, content: c.content, createdAt: c._creationTime, user: u });
    }
    const history = [];
    for (const a of await ctx.db.query("activities").withIndex("by_expense", (q) => q.eq("expenseId", id)).collect()) {
      const u = byId.get(a.actorId) ?? (await publicUser(ctx, await ctx.db.get(a.actorId), me));
      history.push({ _id: a._id, type: a.type, payload: a.payload, createdAt: a._creationTime, actor: u });
    }
    const group = e.groupId ? await ctx.db.get(e.groupId) : null;
    let friend: PublicUser | null = null;
    if (e.pairKey) {
      const [a, b] = pairUsers(e.pairKey);
      friend = await publicUser(ctx, await ctx.db.get(a === me ? b : a), me);
    }
    let participants: Id<"users">[] = [];
    if (e.groupId) participants = await groupMemberIds(ctx, e.groupId);
    else if (e.pairKey) participants = pairUsers(e.pairKey);
    return {
      ...e,
      receiptUrl: e.receiptId ? await ctx.storage.getUrl(e.receiptId) : null,
      shares: shares.map((s) => ({ userId: s.userId, paidMinor: s.paidMinor, owedMinor: s.owedMinor, user: byId.get(s.userId) ?? null })),
      comments,
      history,
      group: group ? { _id: group._id, name: group.name, deletedAt: group.deletedAt ?? null } : null,
      friend,
      participants: await publicUsers(ctx, participants, me),
      createdByUser: byId.get(e.createdBy) ?? null,
      updatedByUser: byId.get(e.updatedBy) ?? null,
    };
  },
});

export const recurring = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUserId(ctx);
    const shares = await ctx.db
      .query("expenseShares")
      .withIndex("by_user_date", (q) => q.eq("userId", me).eq("deleted", false))
      .order("desc")
      .take(2000);
    const nameCache: NameCache = new Map();
    const docs = await Promise.all([...new Set(shares.map((s) => s.expenseId))].map((id) => ctx.db.get(id)));
    const live = docs.filter((e): e is Doc<"expenses"> & { nextRepeatAt: number } => Boolean(e && !e.deletedAt && e.repeat !== "never" && e.nextRepeatAt));
    const out = await Promise.all(live.map(async (e) => ({ ...(await toRow(ctx, e, me, nameCache)), nextRepeatAt: e.nextRepeatAt, emailReminder: e.emailReminder })));
    return out.sort((a, b) => a.nextRepeatAt - b.nextRepeatAt);
  },
});

export const deleted = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUserId(ctx);
    const shares = await ctx.db
      .query("expenseShares")
      .withIndex("by_user_date", (q) => q.eq("userId", me).eq("deleted", true))
      .order("desc")
      .take(500);
    const nameCache: NameCache = new Map();
    const docs = await Promise.all([...new Set(shares.map((s) => s.expenseId))].map((id) => ctx.db.get(id)));
    const gone = docs.filter((e): e is Doc<"expenses"> => Boolean(e?.deletedAt));
    const out = await Promise.all(
      gone.map(async (e) => {
        const [row, by] = await Promise.all([toRow(ctx, e, me, nameCache), e.deletedBy ? ctx.db.get(e.deletedBy) : null]);
        return { ...row, deletedByName: by?.name ?? "Someone" };
      }),
    );
    return out.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
  },
});

// ---------- mutations ----------

const expenseInput = {
  description: v.string(),
  notes: v.optional(v.string()),
  amountMinor: v.number(),
  currency: v.string(),
  date: v.number(),
  category: v.string(),
  payers: v.array(v.object({ userId: v.id("users"), paidMinor: v.number() })),
  split: splitSpec,
  receiptId: v.optional(v.union(v.id("_storage"), v.null())),
  repeat: v.optional(repeatInterval),
  emailReminder: v.optional(v.boolean()),
};

export const create = mutation({
  args: { groupId: v.optional(v.id("groups")), friendId: v.optional(v.id("users")), clientKey: v.optional(v.string()), ...expenseInput },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    return await idempotent(ctx, me._id, args.clientKey, async () => {
    const scope = await resolveScope(ctx, me._id, args);
    const common = validateCommon(args);
    const shares = sharesOrThrow(args.amountMinor, args.payers, args.split as SplitSpec, scope.allowed);
    const repeat = args.repeat ?? "never";
    const id = await ctx.db.insert("expenses", {
      groupId: scope.groupId,
      pairKey: scope.pairKey,
      description: common.description,
      notes: args.notes?.trim() || undefined,
      amountMinor: args.amountMinor,
      currency: common.currency,
      date: args.date,
      category: common.category,
      splitMethod: args.split.method,
      splitSpec: args.split,
      isPayment: false,
      receiptId: args.receiptId ?? undefined,
      repeat,
      nextRepeatAt: nextOccurrence(args.date, repeat),
      emailReminder: args.emailReminder ?? false,
      createdBy: me._id,
      updatedBy: me._id,
      updatedAt: Date.now(),
    });
    const expense = (await ctx.db.get(id))!;
    await writeShares(ctx, expense, shares);
    await touchScope(ctx, expense);
    await logActivity(ctx, {
      type: "expense_added", actorId: me._id, groupId: scope.groupId, expenseId: id,
      payload: { description: common.description, amountMinor: args.amountMinor, currency: common.currency },
      scope: { groupId: scope.groupId, pairKey: scope.pairKey },
    });
    return id;
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("expenses"),
    groupId: v.optional(v.union(v.id("groups"), v.null())),
    friendId: v.optional(v.id("users")),
    ...expenseInput,
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const old = await ctx.db.get(args.id);
    if (!old) throw new ConvexError("Expense not found");
    if (old.deletedAt) throw new ConvexError("Restore this expense before editing it");
    if (old.isPayment) throw new ConvexError("Payments can't be edited. Delete it and record a new one.");
    await assertExpenseAccess(ctx, old, me._id);

    // Moving between scopes: new scope must be one the user can write to.
    let groupId = old.groupId;
    let pairKey = old.pairKey;
    if (args.groupId !== undefined || args.friendId !== undefined) {
      const target = args.groupId ? { groupId: args.groupId } : args.friendId ? { friendId: args.friendId } : null;
      if (target) {
        const s = await resolveScope(ctx, me._id, target);
        groupId = s.groupId;
        pairKey = s.pairKey;
      }
    }
    const allowed = groupId ? await groupMemberIds(ctx, groupId) : pairUsers(pairKey!);
    const common = validateCommon(args);
    const shares = sharesOrThrow(args.amountMinor, args.payers, args.split as SplitSpec, allowed);

    const oldShares = await clearShares(ctx, old);
    if (old.receiptId && args.receiptId !== undefined && args.receiptId !== old.receiptId) await ctx.storage.delete(old.receiptId);
    const repeat = args.repeat ?? old.repeat;
    const patch: Partial<Doc<"expenses">> = {
      groupId,
      pairKey,
      description: common.description,
      notes: args.notes?.trim() || undefined,
      amountMinor: args.amountMinor,
      currency: common.currency,
      date: args.date,
      category: common.category,
      splitMethod: args.split.method,
      splitSpec: args.split,
      receiptId: args.receiptId === undefined ? old.receiptId : (args.receiptId ?? undefined),
      repeat,
      nextRepeatAt: repeat === "never" ? undefined : (repeat !== old.repeat || args.date !== old.date ? nextOccurrence(args.date, repeat) : old.nextRepeatAt),
      emailReminder: args.emailReminder ?? old.emailReminder,
      updatedBy: me._id,
      updatedAt: Date.now(),
    };
    await ctx.db.replace(args.id, { ...old, ...patch });
    const fresh = (await ctx.db.get(args.id))!;
    await writeShares(ctx, fresh, shares);
    await touchScope(ctx, fresh);

    const changed: Record<string, { from: unknown; to: unknown }> = {};
    const track = (k: string, from: unknown, to: unknown) => { if (JSON.stringify(from) !== JSON.stringify(to)) changed[k] = { from, to }; };
    track("description", old.description, fresh.description);
    track("amount", `${old.amountMinor} ${old.currency}`, `${fresh.amountMinor} ${fresh.currency}`);
    track("date", old.date, fresh.date);
    track("category", old.category, fresh.category);
    track("notes", old.notes ?? "", fresh.notes ?? "");
    track("split", old.splitMethod, fresh.splitMethod);
    track("repeat", old.repeat, fresh.repeat);
    track("scope", old.groupId ?? old.pairKey, fresh.groupId ?? fresh.pairKey);
    const oldMap = Object.fromEntries(oldShares.map((s) => [s.userId, [s.paidMinor, s.owedMinor]]));
    const newMap = Object.fromEntries(shares.map((s) => [s.userId, [s.paidMinor, s.owedMinor]]));
    track("shares", oldMap, newMap);
    await logActivity(ctx, {
      type: "expense_updated", actorId: me._id, groupId: fresh.groupId, expenseId: fresh._id,
      payload: { description: fresh.description, amountMinor: fresh.amountMinor, currency: fresh.currency, changed },
      recipients: [...new Set([...allowed, ...oldShares.map((s) => s.userId)])],
    });
  },
});

export const remove = mutation({
  args: { id: v.id("expenses") },
  handler: async (ctx, { id }) => {
    const me = await requireUserId(ctx);
    const e = await ctx.db.get(id);
    if (!e) throw new ConvexError("Expense not found");
    if (e.deletedAt) return;
    await assertExpenseAccess(ctx, e, me);
    const rows = await loadShares(ctx, id);
    await applyDebts(ctx, scopeOf(e), e.currency, pairwiseDebts(rows.map(toShare)), -1);
    for (const r of rows) await ctx.db.patch(r._id, { deleted: true });
    await ctx.db.patch(id, { deletedAt: Date.now(), deletedBy: me, nextRepeatAt: undefined });
    await logActivity(ctx, {
      type: e.isPayment ? "payment_deleted" : "expense_deleted", actorId: me, groupId: e.groupId, expenseId: id,
      payload: { description: e.description, amountMinor: e.amountMinor, currency: e.currency },
      scope: { groupId: e.groupId, pairKey: e.pairKey },
    });
  },
});

export const restore = mutation({
  args: { id: v.id("expenses") },
  handler: async (ctx, { id }) => {
    const me = await requireUserId(ctx);
    const e = await ctx.db.get(id);
    if (!e) throw new ConvexError("Expense not found");
    if (!e.deletedAt) return;
    await assertExpenseAccess(ctx, e, me);
    if (e.groupId) {
      const g = await ctx.db.get(e.groupId);
      if (g?.deletedAt) throw new ConvexError("Restore the group first");
    }
    const rows = await loadShares(ctx, id);
    await applyDebts(ctx, scopeOf(e), e.currency, pairwiseDebts(rows.map(toShare)), 1);
    for (const r of rows) await ctx.db.patch(r._id, { deleted: false });
    await ctx.db.patch(id, {
      deletedAt: undefined, deletedBy: undefined, updatedBy: me, updatedAt: Date.now(),
      nextRepeatAt: e.repeat === "never" ? undefined : nextOccurrence(e.date, e.repeat),
    });
    await logActivity(ctx, {
      type: "expense_restored", actorId: me, groupId: e.groupId, expenseId: id,
      payload: { description: e.description, amountMinor: e.amountMinor, currency: e.currency },
      scope: { groupId: e.groupId, pairKey: e.pairKey },
    });
  },
});

export const cancelRecurring = mutation({
  args: { id: v.id("expenses") },
  handler: async (ctx, { id }) => {
    const me = await requireUserId(ctx);
    const e = await ctx.db.get(id);
    if (!e) throw new ConvexError("Expense not found");
    await assertExpenseAccess(ctx, e, me);
    await ctx.db.patch(id, { repeat: "never", nextRepeatAt: undefined, updatedBy: me, updatedAt: Date.now() });
    await logActivity(ctx, {
      type: "expense_updated", actorId: me, groupId: e.groupId, expenseId: id,
      payload: { description: e.description, amountMinor: e.amountMinor, currency: e.currency, changed: { repeat: { from: e.repeat, to: "never" } } },
      scope: { groupId: e.groupId, pairKey: e.pairKey },
    });
  },
});

export const recordPayment = mutation({
  args: {
    groupId: v.optional(v.id("groups")),
    friendId: v.optional(v.id("users")),
    payerId: v.id("users"),
    payeeId: v.id("users"),
    amountMinor: v.number(),
    currency: v.string(),
    date: v.number(),
    notes: v.optional(v.string()),
    receiptId: v.optional(v.id("_storage")),
    clientKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (args.payerId === args.payeeId) throw new ConvexError("Payer and recipient must be different people");
    return await idempotent(ctx, me._id, args.clientKey, async () => {
    const scope = await resolveScope(ctx, me._id, args.groupId ? { groupId: args.groupId } : { friendId: args.friendId ?? (args.payerId === me._id ? args.payeeId : args.payerId) });
    const allowedSet = new Set<string>(scope.allowed);
    if (!allowedSet.has(args.payerId) || !allowedSet.has(args.payeeId)) throw new ConvexError("Both people need to be in this group");
    if (!Number.isInteger(args.amountMinor) || args.amountMinor <= 0) throw new ConvexError("Enter an amount greater than zero");
    const currency = args.currency.toUpperCase();
    if (!CURRENCY_CODES.has(currency)) throw new ConvexError("Unknown currency");
    const payer = await ctx.db.get(args.payerId);
    const payee = await ctx.db.get(args.payeeId);
    const id = await ctx.db.insert("expenses", {
      groupId: scope.groupId,
      pairKey: scope.pairKey,
      description: `${payer?.name ?? "Someone"} paid ${payee?.name ?? "someone"}`,
      notes: args.notes?.trim() || undefined,
      amountMinor: args.amountMinor,
      currency,
      date: args.date,
      category: "payment",
      splitMethod: "exact",
      isPayment: true,
      receiptId: args.receiptId,
      repeat: "never",
      emailReminder: false,
      createdBy: me._id,
      updatedBy: me._id,
      updatedAt: Date.now(),
    });
    const expense = (await ctx.db.get(id))!;
    await writeShares(ctx, expense, [
      { userId: args.payerId, paidMinor: args.amountMinor, owedMinor: 0 },
      { userId: args.payeeId, paidMinor: 0, owedMinor: args.amountMinor },
    ]);
    await touchScope(ctx, expense);
    await logActivity(ctx, {
      type: "payment_recorded", actorId: me._id, groupId: scope.groupId, expenseId: id,
      payload: { amountMinor: args.amountMinor, currency, payerName: payer?.name, payeeName: payee?.name, payerId: args.payerId, payeeId: args.payeeId },
      scope: { groupId: scope.groupId, pairKey: scope.pairKey },
    });
    return id;
    });
  },
});

/** Cron: post every recurring expense whose next date has arrived. The newest instance carries the recurrence. */
export const postRecurring = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("expenses")
      .withIndex("by_next_repeat", (q) => q.gt("nextRepeatAt", 0).lte("nextRepeatAt", now))
      .take(100);
    let posted = 0;
    for (const e of due) {
      if (e.deletedAt || e.repeat === "never" || !e.nextRepeatAt) continue;
      if (e.groupId) {
        const g = await ctx.db.get(e.groupId);
        if (!g || g.deletedAt) { await ctx.db.patch(e._id, { nextRepeatAt: undefined }); continue; }
      }
      const shares = await loadShares(ctx, e._id);
      // Members removed since: stop the recurrence rather than post a broken split.
      if (e.groupId) {
        const members = new Set(await groupMemberIds(ctx, e.groupId));
        if (shares.some((s) => !members.has(s.userId))) { await ctx.db.patch(e._id, { repeat: "never", nextRepeatAt: undefined }); continue; }
      }
      const date = e.nextRepeatAt;
      const newId = await ctx.db.insert("expenses", {
        groupId: e.groupId,
        pairKey: e.pairKey,
        description: e.description,
        notes: e.notes,
        amountMinor: e.amountMinor,
        currency: e.currency,
        date,
        category: e.category,
        splitMethod: e.splitMethod,
        splitSpec: e.splitSpec,
        isPayment: false,
        repeat: e.repeat,
        nextRepeatAt: nextOccurrence(date, e.repeat),
        recurringParentId: e.recurringParentId ?? e._id,
        emailReminder: e.emailReminder,
        createdBy: e.createdBy,
        updatedBy: e.createdBy,
        updatedAt: now,
      });
      const fresh = (await ctx.db.get(newId))!;
      await writeShares(ctx, fresh, shares.map(toShare));
      await ctx.db.patch(e._id, { repeat: "never", nextRepeatAt: undefined });
      await logActivity(ctx, {
        type: "expense_added", actorId: e.createdBy, groupId: e.groupId, expenseId: newId,
        payload: { description: e.description, amountMinor: e.amountMinor, currency: e.currency, recurring: true },
        scope: { groupId: e.groupId, pairKey: e.pairKey },
      });
      posted++;
    }
    return posted;
  },
});
