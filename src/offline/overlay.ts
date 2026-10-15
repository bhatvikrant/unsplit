/**
 * The optimistic overlay: given a pending mutation and a cached query result,
 * return what that result will look like once the server has applied the
 * mutation. Pure functions; everything the overlay needs comes from the args
 * saved with the op, the `Directory` of names built from the cache, and the
 * previous state snapshotted when the op was queued.
 *
 * Balances are patched from the expense's own pairwise debts. In a group with
 * "simplify debts" on the server may reshuffle who pays whom, so the exact
 * arrows can differ until the sync lands; the nets are right either way.
 */
import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";
import type { PublicUser } from "@convex/lib/users";
import { nextOccurrence, type RepeatInterval } from "@convex/lib/recurring";
import { buildShares, pairwiseDebts, simplifyDebts, type Debt, type Share, type SplitSpec } from "@convex/lib/split";
import { pairKeyOf, pairUsers, rewriteIds } from "./ids";
import type { MeInfo, Op, QueryEntry } from "./types";

type ExpList = FunctionReturnType<typeof api.expenses.list>;
type ExpRow = ExpList["items"][number];
type ExpGet = FunctionReturnType<typeof api.expenses.get>;
type ExpRecurring = FunctionReturnType<typeof api.expenses.recurring>;
type ExpDeleted = FunctionReturnType<typeof api.expenses.deleted>;
type GroupList = FunctionReturnType<typeof api.groups.list>;
type GroupDeleted = FunctionReturnType<typeof api.groups.listDeleted>;
type GroupGet = FunctionReturnType<typeof api.groups.get>;
type FriendList = FunctionReturnType<typeof api.friends.list>;
type FriendGet = FunctionReturnType<typeof api.friends.get>;
type Me = FunctionReturnType<typeof api.users.me>;
type Feed = FunctionReturnType<typeof api.activity.feed>;
type GroupType = GroupList[number]["type"];
type CurrencyDebt = Debt & { currency: string };

export type Query = { name: string; args: Record<string, unknown> };

export type GroupInfo = { _id: string; name: string; type: GroupType; simplifyDebts: boolean; memberIds: string[] | null; deletedAt: number | null };
export type Directory = { users: Map<string, PublicUser>; groups: Map<string, GroupInfo> };

/** The fields of an expense the overlay works with: the document plus its shares. */
export type LocalExpense = {
  _id: string;
  _creationTime: number;
  groupId?: string;
  pairKey?: string;
  description: string;
  notes?: string;
  amountMinor: number;
  currency: string;
  date: number;
  category: string;
  splitMethod: string;
  splitSpec?: SplitSpec;
  isPayment: boolean;
  receiptId?: string;
  repeat: RepeatInterval;
  nextRepeatAt?: number;
  recurringParentId?: string;
  emailReminder: boolean;
  createdBy: string;
  updatedBy: string;
  updatedAt: number;
  deletedAt?: number;
  deletedBy?: string;
  shares: Share[];
};

// ---------- directory ----------

function placeholder(id: string, name?: string, email?: string): PublicUser {
  const n = name?.trim() || email?.trim().split("@")[0] || "Someone";
  return { _id: id as PublicUser["_id"], name: n, email: email?.trim() || undefined, isPlaceholder: true };
}

export function buildDirectory(entries: Iterable<QueryEntry>, ops: Op[], idMap: Record<string, string>): Directory {
  const users = new Map<string, PublicUser>();
  const groups = new Map<string, GroupInfo>();
  const addUser = (u: Partial<PublicUser> | null | undefined) => {
    if (!u || !u._id) return;
    users.set(u._id, { _id: u._id, name: u.name ?? "Someone", email: u.email, image: u.image, isPlaceholder: Boolean(u.isPlaceholder) });
  };
  for (const e of entries) {
    const v = e.value;
    if (!v) continue;
    switch (e.name) {
      case "users:me":
        addUser(v as Me);
        break;
      case "friends:list":
        for (const f of v as FriendList) addUser(f.user);
        break;
      case "friends:get":
        addUser((v as FriendGet).user);
        break;
      case "groups:list":
        for (const g of v as GroupList) if (!groups.has(g._id)) groups.set(g._id, { _id: g._id, name: g.name, type: g.type, simplifyDebts: false, memberIds: null, deletedAt: null });
        break;
      case "groups:listDeleted":
        for (const g of v as GroupDeleted) if (!groups.has(g._id)) groups.set(g._id, { _id: g._id, name: g.name, type: g.type, simplifyDebts: false, memberIds: null, deletedAt: g.deletedAt });
        break;
      case "groups:get": {
        const g = v as GroupGet;
        groups.set(g._id, { _id: g._id, name: g.name, type: g.type, simplifyDebts: g.simplifyDebts, memberIds: g.members.map((m) => m._id), deletedAt: g.deletedAt });
        for (const m of g.members) addUser(m);
        break;
      }
      case "expenses:get": {
        const x = v as ExpGet;
        for (const s of x.shares) addUser(s.user);
        for (const p of x.participants) addUser(p);
        if (x.friend) addUser(x.friend);
        break;
      }
    }
  }
  for (const raw of ops) {
    const args = rewriteIds(raw.args, idMap) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const op = { ...raw, args };
    switch (op.fn) {
      case "friends:add":
        if (op.tempId) users.set(op.tempId, placeholder(op.tempId, args.name, args.email));
        break;
      case "groups:create": {
        if (!op.tempId) break;
        const newPeople = (op.extra?.newPeople ?? []) as { id: string; name?: string; email?: string }[];
        for (const p of newPeople) users.set(p.id, placeholder(p.id, p.name, p.email));
        const picked = ((args.members ?? []) as { userId?: string }[]).map((m) => m.userId).filter((x): x is string => Boolean(x));
        const memberIds = [...new Set([op.me._id, ...picked, ...newPeople.map((p) => p.id)])];
        groups.set(op.tempId, { _id: op.tempId, name: String(args.name ?? "").trim(), type: args.type as GroupType, simplifyDebts: Boolean(args.simplifyDebts), memberIds, deletedAt: null });
        break;
      }
      case "groups:addMember": {
        const uid = (op.extra?.userId as string | undefined) ?? (args.member?.userId as string | undefined);
        if (!uid) break;
        if (op.extra?.userId) users.set(uid, placeholder(uid, args.member?.name, args.member?.email));
        const g = groups.get(args.groupId);
        if (g?.memberIds && !g.memberIds.includes(uid)) groups.set(g._id, { ...g, memberIds: [...g.memberIds, uid] });
        break;
      }
      case "groups:removeMember": {
        const g = groups.get(args.groupId);
        if (g?.memberIds) groups.set(g._id, { ...g, memberIds: g.memberIds.filter((id) => id !== args.userId) });
        break;
      }
      case "groups:update": {
        const g = groups.get(args.groupId);
        if (!g) break;
        groups.set(g._id, {
          ...g,
          name: args.name !== undefined ? String(args.name).trim() || g.name : g.name,
          type: (args.type as GroupType | undefined) ?? g.type,
          simplifyDebts: args.simplifyDebts !== undefined ? Boolean(args.simplifyDebts) : g.simplifyDebts,
        });
        break;
      }
      case "groups:remove": {
        const g = groups.get(args.groupId);
        if (g) groups.set(g._id, { ...g, deletedAt: op.createdAt });
        break;
      }
      case "groups:restore": {
        const g = groups.get(args.groupId);
        if (g) groups.set(g._id, { ...g, deletedAt: null });
        break;
      }
    }
  }
  return { users, groups };
}

// ---------- small helpers ----------

function userOf(dir: Directory, me: MeInfo, id: string): PublicUser {
  const u = dir.users.get(id);
  if (u) return u;
  if (id === me._id) return { _id: id as PublicUser["_id"], name: me.name, email: me.email, image: me.image, isPlaceholder: false };
  return { _id: id as PublicUser["_id"], name: "Someone", isPlaceholder: false };
}

function nameOf(dir: Directory, me: MeInfo, id: string): string {
  return userOf(dir, me, id).name;
}

function safeShares(total: number, payers: { userId: string; paidMinor: number }[], spec: SplitSpec): Share[] | null {
  try {
    return buildShares(total, payers, spec);
  } catch {
    return null;
  }
}

function debtsOf(e: LocalExpense): CurrencyDebt[] {
  return pairwiseDebts(e.shares).map((d) => ({ ...d, currency: e.currency }));
}

/** Merge signed debts into a list of debts, keeping one arrow per pair+currency and never a negative amount. */
function addDebts(list: CurrencyDebt[], delta: CurrencyDebt[], sign: 1 | -1): CurrencyDebt[] {
  const net = new Map<string, number>(); // "low|high|cur" -> what high owes low
  const bump = (from: string, to: string, currency: string, amount: number) => {
    const [low, high] = from < to ? [from, to] : [to, from];
    const k = `${low}|${high}|${currency}`;
    net.set(k, (net.get(k) ?? 0) + (from === high ? amount : -amount));
  };
  for (const d of list) bump(d.from, d.to, d.currency, d.amountMinor);
  for (const d of delta) bump(d.from, d.to, d.currency, d.amountMinor * sign);
  const out: CurrencyDebt[] = [];
  for (const [k, v] of net) {
    const [low, high, currency] = k.split("|");
    if (v > 0) out.push({ from: high, to: low, amountMinor: v, currency });
    else if (v < 0) out.push({ from: low, to: high, amountMinor: -v, currency });
  }
  return out;
}

function simplifyAll(debts: CurrencyDebt[]): CurrencyDebt[] {
  const byCurrency = new Map<string, Debt[]>();
  for (const d of debts) byCurrency.set(d.currency, [...(byCurrency.get(d.currency) ?? []), d]);
  const out: CurrencyDebt[] = [];
  for (const [currency, list] of byCurrency) for (const d of simplifyDebts(list)) out.push({ ...d, currency });
  return out;
}

function netsOf(debts: CurrencyDebt[]): Map<string, Record<string, number>> {
  const nets = new Map<string, Record<string, number>>();
  const bump = (user: string, currency: string, delta: number) => {
    const m = nets.get(user) ?? {};
    m[currency] = (m[currency] ?? 0) + delta;
    nets.set(user, m);
  };
  for (const d of debts) {
    bump(d.from, d.currency, -d.amountMinor);
    bump(d.to, d.currency, d.amountMinor);
  }
  return nets;
}

function dropZeros(rec: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec)) if (v !== 0) out[k] = v;
  return out;
}

function addRecord(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return dropZeros(out);
}

/** Change in `userId`'s net (positive = owed money) from a list of signed debts. */
function netDeltaFor(debts: CurrencyDebt[], userId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of debts) {
    if (d.from === userId) out[d.currency] = (out[d.currency] ?? 0) - d.amountMinor;
    if (d.to === userId) out[d.currency] = (out[d.currency] ?? 0) + d.amountMinor;
  }
  return out;
}

/** Change in what `friend` owes `me` (positive = they owe me) from a list of signed debts. */
function friendDelta(debts: CurrencyDebt[], me: string, friend: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of debts) {
    if (d.from === me && d.to === friend) out[d.currency] = (out[d.currency] ?? 0) - d.amountMinor;
    if (d.from === friend && d.to === me) out[d.currency] = (out[d.currency] ?? 0) + d.amountMinor;
  }
  return out;
}

function signed(debts: CurrencyDebt[], sign: 1 | -1): CurrencyDebt[] {
  return sign === 1 ? debts : debts.map((d) => ({ ...d, amountMinor: -d.amountMinor }));
}

// ---------- expense model ----------

function fromCreate(op: Op, args: Record<string, any>): LocalExpense | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  const shares = safeShares(args.amountMinor, args.payers, args.split);
  if (!shares) return null;
  const repeat = (args.repeat ?? "never") as RepeatInterval;
  return {
    _id: op.tempId!,
    _creationTime: op.createdAt,
    groupId: args.groupId || undefined,
    pairKey: args.friendId ? pairKeyOf(op.me._id, args.friendId) : undefined,
    description: String(args.description ?? "").trim(),
    notes: args.notes?.trim() || undefined,
    amountMinor: args.amountMinor,
    currency: String(args.currency).toUpperCase(),
    date: args.date,
    category: args.category,
    splitMethod: args.split.method,
    splitSpec: args.split,
    isPayment: false,
    receiptId: args.receiptId ?? undefined,
    repeat,
    nextRepeatAt: nextOccurrence(args.date, repeat),
    emailReminder: Boolean(args.emailReminder),
    createdBy: op.me._id,
    updatedBy: op.me._id,
    updatedAt: op.createdAt,
    shares,
  };
}

function fromPayment(op: Op, args: Record<string, any>, dir: Directory): LocalExpense { // eslint-disable-line @typescript-eslint/no-explicit-any
  const friendId = args.friendId ?? (args.payerId === op.me._id ? args.payeeId : args.payerId);
  return {
    _id: op.tempId!,
    _creationTime: op.createdAt,
    groupId: args.groupId || undefined,
    pairKey: args.groupId ? undefined : pairKeyOf(op.me._id, friendId),
    description: `${nameOf(dir, op.me, args.payerId)} paid ${nameOf(dir, op.me, args.payeeId)}`,
    notes: args.notes?.trim() || undefined,
    amountMinor: args.amountMinor,
    currency: String(args.currency).toUpperCase(),
    date: args.date,
    category: "payment",
    splitMethod: "exact",
    isPayment: true,
    receiptId: args.receiptId ?? undefined,
    repeat: "never",
    emailReminder: false,
    createdBy: op.me._id,
    updatedBy: op.me._id,
    updatedAt: op.createdAt,
    shares: [
      { userId: args.payerId, paidMinor: args.amountMinor, owedMinor: 0 },
      { userId: args.payeeId, paidMinor: 0, owedMinor: args.amountMinor },
    ],
  };
}

function fromUpdate(op: Op, args: Record<string, any>, prev: LocalExpense): LocalExpense | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  const shares = safeShares(args.amountMinor, args.payers, args.split);
  if (!shares) return null;
  let groupId = prev.groupId;
  let pairKey = prev.pairKey;
  if (args.groupId) {
    groupId = args.groupId;
    pairKey = undefined;
  } else if (args.friendId) {
    groupId = undefined;
    pairKey = pairKeyOf(op.me._id, args.friendId);
  }
  const repeat = (args.repeat ?? prev.repeat) as RepeatInterval;
  return {
    ...prev,
    groupId,
    pairKey,
    description: String(args.description ?? "").trim(),
    notes: args.notes?.trim() || undefined,
    amountMinor: args.amountMinor,
    currency: String(args.currency).toUpperCase(),
    date: args.date,
    category: args.category,
    splitMethod: args.split.method,
    splitSpec: args.split,
    receiptId: args.receiptId === undefined ? prev.receiptId : (args.receiptId ?? undefined),
    repeat,
    nextRepeatAt: repeat === "never" ? undefined : repeat !== prev.repeat || args.date !== prev.date ? nextOccurrence(args.date, repeat) : prev.nextRepeatAt,
    emailReminder: args.emailReminder ?? prev.emailReminder,
    updatedBy: op.me._id,
    updatedAt: op.createdAt,
    shares,
  };
}

/** Rebuild the overlay's expense model from a cached detail view. */
export function localFromGet(v: ExpGet): LocalExpense {
  return {
    _id: v._id,
    _creationTime: v._creationTime,
    groupId: v.groupId,
    pairKey: v.pairKey,
    description: v.description,
    notes: v.notes,
    amountMinor: v.amountMinor,
    currency: v.currency,
    date: v.date,
    category: v.category,
    splitMethod: v.splitMethod,
    splitSpec: v.splitSpec as SplitSpec | undefined,
    isPayment: v.isPayment,
    receiptId: v.receiptId,
    repeat: v.repeat,
    nextRepeatAt: v.nextRepeatAt,
    recurringParentId: v.recurringParentId,
    emailReminder: v.emailReminder,
    createdBy: v.createdBy,
    updatedBy: v.updatedBy,
    updatedAt: v.updatedAt,
    deletedAt: v.deletedAt,
    deletedBy: v.deletedBy,
    shares: v.shares.map((s) => ({ userId: s.userId, paidMinor: s.paidMinor, owedMinor: s.owedMinor })),
  };
}

/** Rebuild the overlay's expense model from a list row (no notes or split spec, but enough for balances). */
export function localFromRow(r: ExpRow & { nextRepeatAt?: number; emailReminder?: boolean }): LocalExpense {
  const byUser = new Map<string, Share>();
  for (const p of r.payers) byUser.set(p.userId, { userId: p.userId, paidMinor: p.paidMinor, owedMinor: 0 });
  for (const p of r.payees) {
    const s = byUser.get(p.userId) ?? { userId: p.userId, paidMinor: 0, owedMinor: 0 };
    s.owedMinor += p.owedMinor;
    byUser.set(p.userId, s);
  }
  return {
    _id: r._id,
    _creationTime: r.createdAt,
    groupId: r.groupId ?? undefined,
    pairKey: r.pairKey ?? undefined,
    description: r.description,
    amountMinor: r.amountMinor,
    currency: r.currency,
    date: r.date,
    category: r.category,
    splitMethod: r.isPayment ? "exact" : "equal",
    isPayment: r.isPayment,
    receiptId: r.hasReceipt ? ("unknown" as string) : undefined,
    repeat: r.repeat,
    nextRepeatAt: r.nextRepeatAt,
    emailReminder: r.emailReminder ?? false,
    createdBy: r.payers[0]?.userId ?? "",
    updatedBy: r.payers[0]?.userId ?? "",
    updatedAt: r.createdAt,
    deletedAt: r.deletedAt ?? undefined,
    shares: [...byUser.values()],
  };
}

function toRow(e: LocalExpense, dir: Directory, me: MeInfo): ExpRow {
  const mine = e.shares.find((s) => s.userId === me._id);
  return {
    _id: e._id as ExpRow["_id"],
    description: e.description,
    amountMinor: e.amountMinor,
    currency: e.currency,
    date: e.date,
    category: e.category,
    isPayment: e.isPayment,
    repeat: e.repeat,
    groupId: (e.groupId ?? null) as ExpRow["groupId"],
    groupName: e.groupId ? (dir.groups.get(e.groupId)?.name ?? "Group") : null,
    pairKey: e.pairKey ?? null,
    payers: e.shares.filter((s) => s.paidMinor > 0).map((s) => ({ userId: s.userId as ExpRow["payers"][number]["userId"], name: nameOf(dir, me, s.userId), paidMinor: s.paidMinor })),
    payees: e.shares.filter((s) => s.owedMinor > 0).map((s) => ({ userId: s.userId as ExpRow["payees"][number]["userId"], name: nameOf(dir, me, s.userId), owedMinor: s.owedMinor })),
    mine: mine ? { paidMinor: mine.paidMinor, owedMinor: mine.owedMinor } : null,
    participantCount: e.shares.filter((s) => s.owedMinor > 0 || s.paidMinor > 0).length,
    hasReceipt: Boolean(e.receiptId),
    deletedAt: e.deletedAt ?? null,
    createdAt: e._creationTime,
  };
}

function toGet(e: LocalExpense, dir: Directory, me: MeInfo, base: ExpGet | undefined): ExpGet {
  const { shares, ...doc } = e;
  const group = e.groupId ? dir.groups.get(e.groupId) : undefined;
  const participants = e.groupId ? (group?.memberIds ?? [...new Set(shares.map((s) => s.userId))]) : e.pairKey ? pairUsers(e.pairKey) : [];
  const other = e.pairKey ? pairUsers(e.pairKey).find((id) => id !== me._id) : undefined;
  return {
    ...doc,
    receiptUrl: e.receiptId && base?.receiptId === e.receiptId ? base.receiptUrl : null,
    shares: shares.map((s) => ({ userId: s.userId, paidMinor: s.paidMinor, owedMinor: s.owedMinor, user: userOf(dir, me, s.userId) })),
    comments: base?.comments ?? [],
    history: base?.history ?? [],
    group: e.groupId ? { _id: e.groupId, name: group?.name ?? "Group", deletedAt: group?.deletedAt ?? null } : null,
    friend: other ? userOf(dir, me, other) : null,
    participants: participants.map((id) => userOf(dir, me, id)),
    createdByUser: userOf(dir, me, e.createdBy),
    updatedByUser: userOf(dir, me, e.updatedBy),
  } as unknown as ExpGet;
}

function listMatches(args: Record<string, unknown>, e: LocalExpense, me: string): boolean {
  const a = args as { groupId?: string; friendId?: string; search?: string; before?: number; includeDeleted?: boolean };
  if (Boolean(a.includeDeleted) !== Boolean(e.deletedAt)) return false;
  if (a.before !== undefined && !(e.date < a.before)) return false;
  const q = a.search?.trim().toLowerCase();
  if (q && !e.description.toLowerCase().includes(q) && !(e.notes ?? "").toLowerCase().includes(q)) return false;
  if (a.groupId) return e.groupId === a.groupId;
  const mine = e.shares.some((s) => s.userId === me && (s.paidMinor > 0 || s.owedMinor > 0));
  if (!mine) return false;
  if (a.friendId) return e.pairKey === pairKeyOf(me, a.friendId) || (Boolean(e.groupId) && e.shares.some((s) => s.userId === a.friendId));
  return true;
}

function upsertSorted<T extends { _id: string }>(list: T[], item: T, cmp: (a: T, b: T) => number): T[] {
  const rest = list.filter((x) => x._id !== item._id);
  let i = 0;
  while (i < rest.length && cmp(rest[i], item) <= 0) i++;
  return [...rest.slice(0, i), item, ...rest.slice(i)];
}

const byDateDesc = (a: { date: number }, b: { date: number }) => b.date - a.date;

// ---------- expense writes ----------

/**
 * Apply an expense transition (prev → next; either may be null for create /
 * unknown) to whichever query is being viewed. Covers the lists, the detail
 * page and every balance that the expense's shares touch.
 */
function afterExpenseWrite(q: Query, base: unknown, dir: Directory, me: MeInfo, id: string, prev: LocalExpense | null, next: LocalExpense | null): unknown {
  const myId = me._id;
  const live = (e: LocalExpense | null) => (e && !e.deletedAt ? debtsOf(e) : []);
  const delta = [...signed(live(prev), -1), ...signed(live(next), 1)];
  const scopeGroup = next?.groupId ?? prev?.groupId;

  switch (q.name) {
    case "expenses:list": {
      const v = base as ExpList | undefined;
      const existed = Boolean(v?.items.some((x) => x._id === id));
      const belongs = next ? listMatches(q.args, next, myId) : false;
      if (!v) {
        if (!belongs || q.args.before !== undefined) return base;
        return { items: [toRow(next!, dir, me)], nextBefore: null } satisfies ExpList;
      }
      if (belongs && (existed || q.args.before === undefined)) return { ...v, items: upsertSorted(v.items, toRow(next!, dir, me), byDateDesc) };
      if (existed) return { ...v, items: v.items.filter((x) => x._id !== id) };
      return base;
    }
    case "expenses:get": {
      if (q.args.id !== id) return base;
      if (!next) return base;
      return toGet(next, dir, me, base as ExpGet | undefined);
    }
    case "expenses:recurring": {
      const v = (base as ExpRecurring | undefined) ?? [];
      const keep = next && !next.deletedAt && next.repeat !== "never" && next.nextRepeatAt;
      if (keep) return upsertSorted(v, { ...toRow(next, dir, me), nextRepeatAt: next.nextRepeatAt!, emailReminder: next.emailReminder }, (a, b) => a.nextRepeatAt - b.nextRepeatAt);
      return v.some((x) => x._id === id) ? v.filter((x) => x._id !== id) : base;
    }
    case "expenses:deleted": {
      const v = (base as ExpDeleted | undefined) ?? [];
      if (next?.deletedAt) return upsertSorted(v, { ...toRow(next, dir, me), deletedByName: next.deletedBy === myId ? me.name : nameOf(dir, me, next.deletedBy ?? "") }, (a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
      return v.some((x) => x._id === id) ? v.filter((x) => x._id !== id) : base;
    }
    case "groups:get": {
      const v = base as GroupGet | undefined;
      if (!v || !scopeGroup || q.args.groupId !== scopeGroup || delta.length === 0) return base;
      const original = addDebts(v.originalDebts, delta, 1);
      const debts = v.simplifyDebts ? simplifyAll(original) : original;
      const nets = netsOf(debts);
      const memberNets: Record<string, Record<string, number>> = {};
      for (const m of v.members) memberNets[m._id] = dropZeros(nets.get(m._id) ?? {});
      return { ...v, originalDebts: original, debts, memberNets, myNet: dropZeros(nets.get(myId) ?? {}) };
    }
    case "groups:list": {
      const v = base as GroupList | undefined;
      if (!v || !scopeGroup || delta.length === 0) return base;
      const mine = netDeltaFor(delta, myId);
      return v.map((g) => (g._id === scopeGroup ? { ...g, myBalance: addRecord(g.myBalance, mine) } : g));
    }
    case "friends:list": {
      const v = base as FriendList | undefined;
      if (!v || delta.length === 0) return base;
      return v.map((f) => {
        const d = friendDelta(delta, myId, f.user._id);
        return Object.keys(d).length ? { ...f, balances: addRecord(f.balances, d) } : f;
      });
    }
    case "friends:get": {
      const v = base as FriendGet | undefined;
      if (!v || delta.length === 0) return base;
      const d = friendDelta(delta, myId, String(q.args.friendId));
      if (Object.keys(d).length === 0) return base;
      const key = scopeGroup ?? null;
      let found = false;
      let breakdown = v.breakdown.map((b) => {
        if (b.groupId !== key) return b;
        found = true;
        return { ...b, balances: addRecord(b.balances, d) };
      });
      if (!found) breakdown = [...breakdown, { groupId: key as FriendGet["breakdown"][number]["groupId"], groupName: key ? (dir.groups.get(key)?.name ?? "Group") : "Non-group expenses", balances: dropZeros(d) }];
      breakdown = breakdown.filter((b) => Object.keys(b.balances).length > 0);
      return { ...v, total: addRecord(v.total, d), breakdown };
    }
    default:
      return base;
  }
}

// ---------- the reducer ----------

export function applyOp(op: Op, q: Query, base: unknown, dir: Directory): unknown {
  const me = op.me;
  const args = op.args as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const prev = (op.extra?.prev as LocalExpense | null | undefined) ?? null;

  switch (op.fn) {
    case "expenses:create": {
      const e = fromCreate(op, args);
      return e ? afterExpenseWrite(q, base, dir, me, e._id, null, e) : base;
    }
    case "expenses:recordPayment": {
      const e = fromPayment(op, args, dir);
      return afterExpenseWrite(q, base, dir, me, e._id, null, e);
    }
    case "expenses:update": {
      if (!prev) return base;
      const e = fromUpdate(op, args, prev);
      return e ? afterExpenseWrite(q, base, dir, me, prev._id, prev, e) : base;
    }
    case "expenses:remove": {
      if (!prev || prev.deletedAt) return base;
      return afterExpenseWrite(q, base, dir, me, prev._id, prev, { ...prev, deletedAt: op.createdAt, deletedBy: me._id, nextRepeatAt: undefined });
    }
    case "expenses:restore": {
      if (!prev || !prev.deletedAt) return base;
      return afterExpenseWrite(q, base, dir, me, prev._id, prev, { ...prev, deletedAt: undefined, deletedBy: undefined, updatedBy: me._id, updatedAt: op.createdAt, nextRepeatAt: prev.repeat === "never" ? undefined : nextOccurrence(prev.date, prev.repeat) });
    }
    case "expenses:cancelRecurring": {
      if (!prev) return base;
      return afterExpenseWrite(q, base, dir, me, prev._id, prev, { ...prev, repeat: "never", nextRepeatAt: undefined, updatedBy: me._id, updatedAt: op.createdAt });
    }

    case "groups:create": {
      const gid = op.tempId!;
      const info = dir.groups.get(gid);
      if (!info) return base;
      switch (q.name) {
        case "groups:list": {
          const v = (base as GroupList | undefined) ?? [];
          if (v.some((g) => g._id === gid)) return base;
          return [{ _id: gid as GroupList[number]["_id"], name: info.name, type: info.type, coverUrl: null, myBalance: {}, createdAt: op.createdAt }, ...v];
        }
        case "groups:get": {
          if (q.args.groupId !== gid) return base;
          const members = (info.memberIds ?? [me._id]).map((id) => userOf(dir, me, id));
          const memberNets: Record<string, Record<string, number>> = {};
          for (const m of members) memberNets[m._id] = {};
          const meState = dir.users.get(me._id);
          void meState;
          const v: GroupGet = {
            _id: gid as GroupGet["_id"],
            name: info.name,
            type: info.type,
            coverUrl: null,
            simplifyDebts: info.simplifyDebts,
            defaultSplit: null,
            whiteboard: "",
            inviteCode: "",
            lastCurrency: null,
            deletedAt: null,
            createdBy: me._id as GroupGet["createdBy"],
            members,
            debts: [],
            originalDebts: [],
            memberNets,
            myNet: {},
          };
          return v;
        }
        case "friends:list": {
          const v = (base as FriendList | undefined) ?? [];
          const have = new Set(v.map((f) => f.user._id as string));
          const added = (info.memberIds ?? []).filter((id) => id !== me._id && !have.has(id));
          if (added.length === 0) return base;
          return [...v, ...added.map((id) => ({ user: userOf(dir, me, id), balances: {}, lastActivityAt: op.createdAt }))].sort((a, b) => a.user.name.localeCompare(b.user.name));
        }
        default:
          return base;
      }
    }
    case "groups:update": {
      const gid = String(args.groupId);
      if (q.name === "groups:get") {
        const v = base as GroupGet | undefined;
        if (!v || q.args.groupId !== gid) return base;
        const next: GroupGet = { ...v };
        if (args.name !== undefined && String(args.name).trim()) next.name = String(args.name).trim();
        if (args.type !== undefined) next.type = args.type as GroupType;
        if (args.coverId === null) next.coverUrl = null;
        if (args.defaultSplit !== undefined) next.defaultSplit = args.defaultSplit as GroupGet["defaultSplit"];
        if (args.whiteboard !== undefined) next.whiteboard = String(args.whiteboard).slice(0, 5000);
        if (args.simplifyDebts !== undefined && Boolean(args.simplifyDebts) !== v.simplifyDebts) {
          next.simplifyDebts = Boolean(args.simplifyDebts);
          next.debts = next.simplifyDebts ? simplifyAll(v.originalDebts) : v.originalDebts;
        }
        return next;
      }
      if (q.name === "groups:list") {
        const v = base as GroupList | undefined;
        if (!v) return base;
        return v.map((g) => (g._id === gid ? { ...g, name: args.name !== undefined && String(args.name).trim() ? String(args.name).trim() : g.name, type: (args.type as GroupType | undefined) ?? g.type, coverUrl: args.coverId === null ? null : g.coverUrl } : g));
      }
      return base;
    }
    case "groups:addMember": {
      const gid = String(args.groupId);
      const uid = (op.extra?.userId as string | undefined) ?? (args.member?.userId as string | undefined);
      if (!uid) return base;
      if (q.name === "groups:get") {
        const v = base as GroupGet | undefined;
        if (!v || q.args.groupId !== gid || v.members.some((m) => m._id === uid)) return base;
        return { ...v, members: [...v.members, userOf(dir, me, uid)], memberNets: { ...v.memberNets, [uid]: {} } };
      }
      if (q.name === "friends:list") {
        const v = base as FriendList | undefined;
        if (!v || uid === me._id || v.some((f) => f.user._id === uid)) return base;
        return [...v, { user: userOf(dir, me, uid), balances: {}, lastActivityAt: op.createdAt }].sort((a, b) => a.user.name.localeCompare(b.user.name));
      }
      return base;
    }
    case "groups:removeMember": {
      const gid = String(args.groupId);
      const uid = String(args.userId);
      if (q.name === "groups:get") {
        const v = base as GroupGet | undefined;
        if (!v || q.args.groupId !== gid) return base;
        return { ...v, members: v.members.filter((m) => m._id !== uid) };
      }
      if (q.name === "groups:list" && uid === me._id) {
        const v = base as GroupList | undefined;
        return v ? v.filter((g) => g._id !== gid) : base;
      }
      return base;
    }
    case "groups:remove":
    case "groups:restore": {
      const gid = String(args.groupId);
      const deleting = op.fn === "groups:remove";
      const info = dir.groups.get(gid);
      if (q.name === "groups:get") {
        const v = base as GroupGet | undefined;
        if (!v || q.args.groupId !== gid) return base;
        return { ...v, deletedAt: deleting ? op.createdAt : null };
      }
      if (q.name === "groups:list") {
        const v = base as GroupList | undefined;
        if (!v) return base;
        if (deleting) return v.filter((g) => g._id !== gid);
        if (v.some((g) => g._id === gid) || !info) return base;
        return [{ _id: gid as GroupList[number]["_id"], name: info.name, type: info.type, coverUrl: null, myBalance: {}, createdAt: op.createdAt }, ...v];
      }
      if (q.name === "groups:listDeleted") {
        const v = (base as GroupDeleted | undefined) ?? [];
        if (!deleting) return v.filter((g) => g._id !== gid);
        if (v.some((g) => g._id === gid) || !info) return base;
        return [{ _id: gid as GroupDeleted[number]["_id"], name: info.name, type: info.type, deletedAt: op.createdAt, deletedByName: me.name }, ...v];
      }
      return base;
    }

    case "friends:add": {
      const fid = op.tempId!;
      if (q.name === "friends:list") {
        const v = (base as FriendList | undefined) ?? [];
        if (v.some((f) => f.user._id === fid)) return base;
        return [...v, { user: userOf(dir, me, fid), balances: {}, lastActivityAt: op.createdAt }].sort((a, b) => a.user.name.localeCompare(b.user.name));
      }
      if (q.name === "friends:get" && q.args.friendId === fid) {
        const v: FriendGet = { user: userOf(dir, me, fid), total: {}, breakdown: [], pairKey: pairKeyOf(me._id, fid), since: op.createdAt };
        return v;
      }
      return base;
    }
    case "friends:remove": {
      if (q.name !== "friends:list") return base;
      const v = base as FriendList | undefined;
      return v ? v.filter((f) => f.user._id !== args.friendId) : base;
    }

    case "comments:add": {
      if (q.name !== "expenses:get" || q.args.id !== args.expenseId) return base;
      const v = base as ExpGet | undefined;
      if (!v) return base;
      const text = String(args.content ?? "").trim();
      if (!text) return base;
      return { ...v, comments: [...v.comments, { _id: op.tempId as ExpGet["comments"][number]["_id"], content: text, createdAt: op.createdAt, user: userOf(dir, me, me._id) }] };
    }
    case "comments:remove": {
      if (q.name !== "expenses:get") return base;
      const v = base as ExpGet | undefined;
      if (!v || !v.comments.some((c) => c._id === args.commentId)) return base;
      return { ...v, comments: v.comments.filter((c) => c._id !== args.commentId) };
    }

    case "activity:markAllRead": {
      if (q.name === "activity:unreadCount") return 0;
      if (q.name === "activity:feed") {
        const v = base as Feed | undefined;
        if (!v || v.items.every((i) => i.read)) return base;
        return { ...v, items: v.items.map((i) => (i.read ? i : { ...i, read: true })) };
      }
      return base;
    }

    case "users:update": {
      if (q.name !== "users:me") return base;
      const v = base as Me | undefined;
      if (!v) return base;
      const next = { ...v };
      if (args.name !== undefined && String(args.name).trim()) next.name = String(args.name).trim();
      if (args.defaultCurrency !== undefined) next.defaultCurrency = String(args.defaultCurrency).toUpperCase();
      if (args.timeZone !== undefined) next.timeZone = args.timeZone;
      if (args.notifPrefs !== undefined) next.notifPrefs = args.notifPrefs;
      if (args.avatarId === null) next.image = undefined;
      return next;
    }

    default:
      return base;
  }
}
