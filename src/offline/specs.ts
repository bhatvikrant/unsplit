/**
 * What the outbox knows about each mutation that can run offline: how to
 * prepare it (temp ids, snapshots the overlay needs, the value to hand back
 * right away) and how to learn real ids from the server's result.
 *
 * Mutations not listed here (file uploads, currency conversion, invite links,
 * account deletion…) need a live connection and say so when there is none.
 */
import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";
import { tempId } from "./ids";
import { localFromGet, localFromRow, type Directory, type LocalExpense } from "./overlay";
import type { MeInfo, Op } from "./types";

type ExpGet = FunctionReturnType<typeof api.expenses.get>;
type ExpList = FunctionReturnType<typeof api.expenses.list>;

export type PrepareCtx = {
  me: MeInfo;
  dir: Directory;
  /** Read a query through the overlay (server value plus pending ops). */
  read: (name: string, args: Record<string, unknown>) => unknown;
  /** Every cached expense list / recurring / deleted entry, for finding an expense by id. */
  expenseRows: () => Iterable<ExpList["items"][number]>;
};

export type Prepared = {
  args: Record<string, unknown>;
  tempId?: string;
  extra?: Record<string, unknown>;
  /** What the caller gets back while the server hasn't answered yet. */
  result: unknown;
};

export type Spec = {
  /** Shown in the "couldn't sync" toast. */
  label: string;
  /** Send `clientKey` so a replay after a reload can't double-apply. */
  clientKey?: boolean;
  prepare: (args: Record<string, unknown>, ctx: PrepareCtx) => Prepared;
  /** Temp → real id pairs learned from the server's result. */
  mapResult?: (op: Op, result: unknown) => [string, string][];
};

function findExpense(id: string, ctx: PrepareCtx): LocalExpense | null {
  const got = ctx.read("expenses:get", { id }) as ExpGet | undefined;
  if (got) return localFromGet(got);
  for (const row of ctx.expenseRows()) if (row._id === id) return localFromRow(row);
  return null;
}

const idResult = (op: Op, result: unknown): [string, string][] => (op.tempId && typeof result === "string" ? [[op.tempId, result]] : []);

export const SPECS: Record<string, Spec> = {
  "expenses:create": {
    label: "Expense",
    clientKey: true,
    prepare: (args) => {
      const id = tempId("expenses");
      return { args, tempId: id, result: id };
    },
    mapResult: idResult,
  },
  "expenses:recordPayment": {
    label: "Payment",
    clientKey: true,
    prepare: (args) => {
      const id = tempId("expenses");
      return { args, tempId: id, result: id };
    },
    mapResult: idResult,
  },
  "expenses:update": {
    label: "Expense edit",
    prepare: (args, ctx) => ({ args, extra: { prev: findExpense(String(args.id), ctx) }, result: null }),
  },
  "expenses:remove": {
    label: "Delete expense",
    prepare: (args, ctx) => ({ args, extra: { prev: findExpense(String(args.id), ctx) }, result: null }),
  },
  "expenses:restore": {
    label: "Restore expense",
    prepare: (args, ctx) => ({ args, extra: { prev: findExpense(String(args.id), ctx) }, result: null }),
  },
  "expenses:cancelRecurring": {
    label: "Stop repeating",
    prepare: (args, ctx) => ({ args, extra: { prev: findExpense(String(args.id), ctx) }, result: null }),
  },

  "groups:create": {
    label: "New group",
    clientKey: true,
    prepare: (args) => {
      const id = tempId("groups");
      const members = ((args.members ?? []) as { userId?: string; name?: string; email?: string }[]).filter((m) => !m.userId && (m.name?.trim() || m.email?.trim()));
      const newPeople = members.map((m) => ({ id: tempId("users"), name: m.name, email: m.email }));
      return { args, tempId: id, extra: { newPeople }, result: id };
    },
    mapResult: idResult,
  },
  "groups:update": { label: "Group settings", prepare: (args) => ({ args, result: null }) },
  "groups:addMember": {
    label: "Add member",
    clientKey: true,
    prepare: (args) => {
      const member = (args.member ?? {}) as { userId?: string };
      if (member.userId) return { args, result: member.userId };
      const id = tempId("users");
      return { args, tempId: id, extra: { userId: id }, result: id };
    },
    mapResult: idResult,
  },
  "groups:removeMember": { label: "Remove member", prepare: (args) => ({ args, result: null }) },
  "groups:remove": { label: "Delete group", prepare: (args) => ({ args, result: null }) },
  "groups:restore": { label: "Restore group", prepare: (args) => ({ args, result: null }) },

  "friends:add": {
    label: "Add friend",
    clientKey: true,
    prepare: (args) => {
      const id = tempId("users");
      return { args, tempId: id, result: { friendId: id, alreadyFriends: false } };
    },
    mapResult: (op, result) => {
      const r = result as { friendId?: string } | null;
      return op.tempId && r?.friendId ? [[op.tempId, r.friendId]] : [];
    },
  },
  "friends:remove": { label: "Remove friend", prepare: (args) => ({ args, result: null }) },

  "comments:add": {
    label: "Comment",
    clientKey: true,
    prepare: (args) => {
      const id = tempId("comments");
      return { args, tempId: id, result: id };
    },
    mapResult: idResult,
  },
  "comments:remove": { label: "Delete comment", prepare: (args) => ({ args, result: null }) },

  "activity:markAllRead": { label: "Mark activity read", prepare: (args) => ({ args, result: null }) },
  "users:update": { label: "Account settings", prepare: (args) => ({ args, result: null }) },
};
