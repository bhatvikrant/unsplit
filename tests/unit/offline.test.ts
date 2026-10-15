import { describe, expect, it } from "vitest";
import { applyOp, buildDirectory } from "../../src/offline/overlay";
import { containsTempId, pairKeyOf, queryKey, rewriteIds, stableStringify } from "../../src/offline/ids";
import type { Op, QueryEntry } from "../../src/offline/types";

const me = { _id: "u_me", name: "Alex" };
const bea = { _id: "u_bea", name: "Bea", isPlaceholder: false };
const chris = { _id: "u_chris", name: "Chris", isPlaceholder: true };

const groupGet = {
  _id: "g1",
  name: "Trip",
  type: "trip",
  coverUrl: null,
  simplifyDebts: false,
  defaultSplit: null,
  whiteboard: "",
  inviteCode: "abc",
  lastCurrency: "USD",
  deletedAt: null,
  createdBy: "u_me",
  members: [{ ...me, isPlaceholder: false }, bea, chris],
  debts: [],
  originalDebts: [],
  memberNets: { u_me: {}, u_bea: {}, u_chris: {} },
  myNet: {},
};

const entries: QueryEntry[] = [
  { name: "users:me", args: {}, value: { ...me, defaultCurrency: "USD" }, at: 0 },
  { name: "groups:get", args: { groupId: "g1" }, value: groupGet, at: 0 },
  { name: "groups:list", args: {}, value: [{ _id: "g1", name: "Trip", type: "trip", coverUrl: null, myBalance: {}, createdAt: 1 }], at: 0 },
  { name: "friends:list", args: {}, value: [{ user: bea, balances: {}, lastActivityAt: 0 }, { user: chris, balances: {}, lastActivityAt: 0 }], at: 0 },
];

function op(fn: string, args: Record<string, unknown>, extra: Partial<Op> = {}): Op {
  return { id: `op_${fn}`, seq: 1, fn, args, me, createdAt: 1_700_000_000_000, attempts: 0, ...extra };
}

const createDinner = op(
  "expenses:create",
  {
    groupId: "g1",
    description: "Dinner",
    amountMinor: 9000,
    currency: "usd",
    date: 1_699_000_000_000,
    category: "food",
    payers: [{ userId: "u_me", paidMinor: 9000 }],
    split: { method: "equal", participants: ["u_me", "u_bea", "u_chris"] },
  },
  { tempId: "tmp_expenses_1" },
);

describe("ids", () => {
  it("finds and rewrites temp ids in values and keys", () => {
    const args = { groupId: "tmp_groups_1", split: { amounts: { tmp_users_2: 5 } } };
    expect(containsTempId(args)).toBe(true);
    const out = rewriteIds(args, { tmp_groups_1: "g9", tmp_users_2: "u9" });
    expect(out).toEqual({ groupId: "g9", split: { amounts: { u9: 5 } } });
    expect(containsTempId(out)).toBe(false);
    expect(rewriteIds("constructor", {})).toBe("constructor");
  });
  it("keys are stable across key order", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
    expect(queryKey("x:y", { limit: 5, groupId: undefined })).toBe("x:y|{\"limit\":5}");
  });
  it("pair keys sort the two ids", () => {
    expect(pairKeyOf("b", "a")).toBe("a:b");
  });
});

describe("overlay: expenses", () => {
  const dir = buildDirectory(entries, [createDinner], {});

  it("adds a row to the group's list, the all-expenses list and the detail view", () => {
    const list = applyOp(createDinner, { name: "expenses:list", args: { groupId: "g1", limit: 50 } }, { items: [], nextBefore: null }, dir) as { items: { _id: string; groupName: string; mine: { paidMinor: number; owedMinor: number }; payees: unknown[] }[] };
    expect(list.items).toHaveLength(1);
    expect(list.items[0]._id).toBe("tmp_expenses_1");
    expect(list.items[0].groupName).toBe("Trip");
    expect(list.items[0].mine).toEqual({ paidMinor: 9000, owedMinor: 3000 });
    expect(list.items[0].payees).toHaveLength(3);

    const all = applyOp(createDinner, { name: "expenses:list", args: { limit: 50 } }, undefined, dir) as { items: unknown[] };
    expect(all.items).toHaveLength(1);

    const other = applyOp(createDinner, { name: "expenses:list", args: { groupId: "g2", limit: 50 } }, { items: [], nextBefore: null }, dir) as { items: unknown[] };
    expect(other.items).toHaveLength(0);

    const detail = applyOp(createDinner, { name: "expenses:get", args: { id: "tmp_expenses_1" } }, undefined, dir) as { description: string; shares: { user: { name: string } }[]; group: { name: string }; participants: unknown[] };
    expect(detail.description).toBe("Dinner");
    expect(detail.shares.map((s) => s.user.name).sort()).toEqual(["Alex", "Bea", "Chris"]);
    expect(detail.group.name).toBe("Trip");
    expect(detail.participants).toHaveLength(3);
  });

  it("updates group balances and the friend list", () => {
    const g = applyOp(createDinner, { name: "groups:get", args: { groupId: "g1" } }, groupGet, dir) as typeof groupGet;
    expect(g.myNet).toEqual({ USD: 6000 });
    expect(g.memberNets.u_bea).toEqual({ USD: -3000 });
    expect(g.debts).toHaveLength(2);

    const groups = applyOp(createDinner, { name: "groups:list", args: {} }, entries[2].value, dir) as { myBalance: Record<string, number> }[];
    expect(groups[0].myBalance).toEqual({ USD: 6000 });

    const friends = applyOp(createDinner, { name: "friends:list", args: {} }, entries[3].value, dir) as { balances: Record<string, number> }[];
    expect(friends[0].balances).toEqual({ USD: 3000 });
    expect(friends[1].balances).toEqual({ USD: 3000 });
  });

  it("simplifies group debts when the group asks for it", () => {
    const simplified = { ...groupGet, simplifyDebts: true, originalDebts: [{ from: "u_bea", to: "u_chris", amountMinor: 3000, currency: "USD" }], debts: [{ from: "u_bea", to: "u_chris", amountMinor: 3000, currency: "USD" }] };
    const g = applyOp(createDinner, { name: "groups:get", args: { groupId: "g1" } }, simplified, dir) as typeof groupGet;
    // Bea owes 3000 (chris) + 3000 (me); Chris owes 3000 (me) but is owed 3000 (bea) -> settled
    expect(g.memberNets.u_bea).toEqual({ USD: -6000 });
    expect(g.memberNets.u_chris).toEqual({});
    expect(g.debts).toEqual([{ from: "u_bea", to: "u_me", amountMinor: 6000, currency: "USD" }]);
  });

  it("delete moves the row to deleted items and reverses balances; restore undoes it", () => {
    const prev = (applyOp(createDinner, { name: "expenses:get", args: { id: "tmp_expenses_1" } }, undefined, dir) as { shares: { userId: string; paidMinor: number; owedMinor: number }[] });
    const local = { ...prev, shares: prev.shares.map((s) => ({ userId: s.userId, paidMinor: s.paidMinor, owedMinor: s.owedMinor })) };
    const remove = op("expenses:remove", { id: "tmp_expenses_1" }, { extra: { prev: local } });
    const listed = applyOp(createDinner, { name: "expenses:list", args: { groupId: "g1", limit: 50 } }, { items: [], nextBefore: null }, dir);
    const afterRemove = applyOp(remove, { name: "expenses:list", args: { groupId: "g1", limit: 50 } }, listed, dir) as { items: unknown[] };
    expect(afterRemove.items).toHaveLength(0);
    const trash = applyOp(remove, { name: "expenses:deleted", args: {} }, [], dir) as { _id: string; deletedByName: string }[];
    expect(trash[0]._id).toBe("tmp_expenses_1");
    expect(trash[0].deletedByName).toBe("Alex");
    const g1 = applyOp(createDinner, { name: "groups:get", args: { groupId: "g1" } }, groupGet, dir);
    const g2 = applyOp(remove, { name: "groups:get", args: { groupId: "g1" } }, g1, dir) as typeof groupGet;
    expect(g2.myNet).toEqual({});
    expect(g2.debts).toEqual([]);

    const restore = op("expenses:restore", { id: "tmp_expenses_1" }, { extra: { prev: { ...local, deletedAt: 5 } } });
    const g3 = applyOp(restore, { name: "groups:get", args: { groupId: "g1" } }, g2, dir) as typeof groupGet;
    expect(g3.myNet).toEqual({ USD: 6000 });
  });

  it("records a payment against a friend outside a group", () => {
    const pay = op("expenses:recordPayment", { friendId: "u_bea", payerId: "u_bea", payeeId: "u_me", amountMinor: 1200, currency: "USD", date: 1 }, { tempId: "tmp_expenses_2" });
    const row = (applyOp(pay, { name: "expenses:list", args: { friendId: "u_bea", limit: 50 } }, { items: [], nextBefore: null }, dir) as { items: { description: string; isPayment: boolean; pairKey: string }[] }).items[0];
    expect(row.description).toBe("Bea paid Alex");
    expect(row.isPayment).toBe(true);
    expect(row.pairKey).toBe("u_bea:u_me");
    const friend = applyOp(pay, { name: "friends:get", args: { friendId: "u_bea" } }, { user: bea, total: { USD: 1200 }, breakdown: [{ groupId: null, groupName: "Non-group expenses", balances: { USD: 1200 } }], pairKey: "u_bea:u_me", since: 0 }, dir) as { total: Record<string, number>; breakdown: unknown[] };
    expect(friend.total).toEqual({});
    expect(friend.breakdown).toEqual([]);
  });

  it("search and deleted filters apply to the synthesized row", () => {
    const miss = applyOp(createDinner, { name: "expenses:list", args: { search: "taxi", limit: 50 } }, { items: [], nextBefore: null }, dir) as { items: unknown[] };
    expect(miss.items).toHaveLength(0);
    const hit = applyOp(createDinner, { name: "expenses:list", args: { search: "din", limit: 50 } }, { items: [], nextBefore: null }, dir) as { items: unknown[] };
    expect(hit.items).toHaveLength(1);
    const deleted = applyOp(createDinner, { name: "expenses:list", args: { includeDeleted: true, limit: 50 } }, { items: [], nextBefore: null }, dir) as { items: unknown[] };
    expect(deleted.items).toHaveLength(0);
  });
});

describe("overlay: groups, friends, comments", () => {
  it("creates a group with placeholders and shows it everywhere", () => {
    const create = op("groups:create", { name: "Flat", type: "home", members: [{ userId: "u_bea" }, { name: "Dana", email: "dana@x.io" }], simplifyDebts: true }, { tempId: "tmp_groups_1", extra: { newPeople: [{ id: "tmp_users_1", name: "Dana", email: "dana@x.io" }] } });
    const dir = buildDirectory(entries, [create], {});
    const list = applyOp(create, { name: "groups:list", args: {} }, entries[2].value, dir) as { _id: string; name: string }[];
    expect(list[0]).toMatchObject({ _id: "tmp_groups_1", name: "Flat" });
    const get = applyOp(create, { name: "groups:get", args: { groupId: "tmp_groups_1" } }, undefined, dir) as { members: { name: string }[]; simplifyDebts: boolean; inviteCode: string };
    expect(get.members.map((m) => m.name)).toEqual(["Alex", "Bea", "Dana"]);
    expect(get.simplifyDebts).toBe(true);
    expect(get.inviteCode).toBe("");
    const friends = applyOp(create, { name: "friends:list", args: {} }, entries[3].value, dir) as { user: { name: string } }[];
    expect(friends.map((f) => f.user.name)).toEqual(["Bea", "Chris", "Dana"]);
  });

  it("an expense in an offline-created group follows the id map", () => {
    const create = op("groups:create", { name: "Flat", type: "home", members: [] }, { tempId: "tmp_groups_1", extra: { newPeople: [] } });
    const exp = op("expenses:create", { ...createDinner.args, groupId: "tmp_groups_1", split: { method: "equal", participants: ["u_me"] }, payers: [{ userId: "u_me", paidMinor: 9000 }] }, { tempId: "tmp_expenses_3" });
    const idMap = { tmp_groups_1: "g_real" };
    const dir = buildDirectory(entries, [create, exp], idMap);
    expect(dir.groups.get("tmp_groups_1")?.name).toBe("Flat");
    const rewritten = { ...exp, args: rewriteIds(exp.args, idMap) };
    const list = applyOp(rewritten, { name: "expenses:list", args: { groupId: "g_real", limit: 50 } }, { items: [], nextBefore: null }, dir) as { items: unknown[] };
    expect(list.items).toHaveLength(1);
  });

  it("group settings, members, delete and restore", () => {
    const dir = buildDirectory(entries, [], {});
    const upd = op("groups:update", { groupId: "g1", name: "Trip 2", simplifyDebts: true });
    const g = applyOp(upd, { name: "groups:get", args: { groupId: "g1" } }, groupGet, dir) as typeof groupGet;
    expect(g.name).toBe("Trip 2");
    expect(g.simplifyDebts).toBe(true);
    const add = op("groups:addMember", { groupId: "g1", member: { name: "Eve" } }, { tempId: "tmp_users_9", extra: { userId: "tmp_users_9" } });
    const dir2 = buildDirectory(entries, [add], {});
    const g2 = applyOp(add, { name: "groups:get", args: { groupId: "g1" } }, groupGet, dir2) as typeof groupGet;
    expect(g2.members.map((m) => m.name)).toContain("Eve");
    const rm = op("groups:removeMember", { groupId: "g1", userId: "u_chris" });
    const g3 = applyOp(rm, { name: "groups:get", args: { groupId: "g1" } }, groupGet, dir) as typeof groupGet;
    expect(g3.members.map((m) => m._id)).toEqual(["u_me", "u_bea"]);
    const del = op("groups:remove", { groupId: "g1" });
    expect(applyOp(del, { name: "groups:list", args: {} }, entries[2].value, dir)).toEqual([]);
    const trash = applyOp(del, { name: "groups:listDeleted", args: {} }, [], dir) as { name: string }[];
    expect(trash[0].name).toBe("Trip");
    const restore = op("groups:restore", { groupId: "g1" });
    expect(applyOp(restore, { name: "groups:listDeleted", args: {} }, trash, dir)).toEqual([]);
    const back = applyOp(restore, { name: "groups:list", args: {} }, [], dir) as { _id: string }[];
    expect(back[0]._id).toBe("g1");
  });

  it("friends and comments", () => {
    const add = op("friends:add", { name: "Finn", email: "finn@x.io" }, { tempId: "tmp_users_5" });
    const dir = buildDirectory(entries, [add], {});
    const friends = applyOp(add, { name: "friends:list", args: {} }, entries[3].value, dir) as { user: { name: string; isPlaceholder: boolean } }[];
    expect(friends.map((f) => f.user.name)).toEqual(["Bea", "Chris", "Finn"]);
    const page = applyOp(add, { name: "friends:get", args: { friendId: "tmp_users_5" } }, undefined, dir) as { user: { name: string }; total: object };
    expect(page.user.name).toBe("Finn");
    const detail = { ...groupGet, _id: "e1", comments: [] as { _id: string; content: string }[] };
    const comment = op("comments:add", { expenseId: "e1", content: "  nice  " }, { tempId: "tmp_comments_1" });
    const withComment = applyOp(comment, { name: "expenses:get", args: { id: "e1" } }, detail, dir) as { comments: { _id: string; content: string }[] };
    expect(withComment.comments).toEqual([expect.objectContaining({ _id: "tmp_comments_1", content: "nice" })]);
    const rmc = op("comments:remove", { commentId: "tmp_comments_1" });
    expect((applyOp(rmc, { name: "expenses:get", args: { id: "e1" } }, withComment, dir) as { comments: unknown[] }).comments).toEqual([]);
  });

  it("untouched queries keep their identity", () => {
    const dir = buildDirectory(entries, [createDinner], {});
    const feed = { items: [], nextBefore: null };
    expect(applyOp(createDinner, { name: "activity:feed", args: {} }, feed, dir)).toBe(feed);
    expect(applyOp(createDinner, { name: "groups:get", args: { groupId: "g2" } }, groupGet, dir)).toBe(groupGet);
  });
});
