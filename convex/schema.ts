import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export const splitMethod = v.union(
  v.literal("equal"),
  v.literal("exact"),
  v.literal("percent"),
  v.literal("shares"),
  v.literal("adjustment"),
  v.literal("reimbursement"),
  v.literal("itemized"),
);

export const repeatInterval = v.union(
  v.literal("never"),
  v.literal("weekly"),
  v.literal("fortnightly"),
  v.literal("monthly"),
  v.literal("yearly"),
);

export const groupType = v.union(
  v.literal("home"),
  v.literal("trip"),
  v.literal("couple"),
  v.literal("other"),
);

export const notifPrefs = v.object({
  expenseAdded: v.boolean(),
  expenseUpdated: v.boolean(),
  commentAdded: v.boolean(),
  addedToGroup: v.boolean(),
  friendAdded: v.boolean(),
  paymentRecorded: v.boolean(),
  reminders: v.boolean(),
  monthlySummary: v.boolean(),
});

export const itemizedDetails = v.object({
  items: v.array(
    v.object({
      name: v.string(),
      amountMinor: v.number(),
      assigneeIds: v.array(v.id("users")),
    }),
  ),
  taxMinor: v.number(),
  tipMinor: v.number(),
  discountMinor: v.number(),
});

/** How the split was entered, so edit can restore the form. Shares are the truth for balances. */
export const splitSpec = v.union(
  v.object({ method: v.literal("equal"), participants: v.array(v.id("users")) }),
  v.object({ method: v.literal("exact"), amounts: v.record(v.string(), v.number()) }),
  v.object({ method: v.literal("percent"), percents: v.record(v.string(), v.number()) }),
  v.object({ method: v.literal("shares"), shares: v.record(v.string(), v.number()) }),
  v.object({
    method: v.literal("adjustment"),
    participants: v.array(v.id("users")),
    adjustments: v.record(v.string(), v.number()),
  }),
  v.object({ method: v.literal("reimbursement"), amounts: v.record(v.string(), v.number()) }),
  v.object({
    method: v.literal("itemized"),
    items: v.array(
      v.object({ name: v.string(), amountMinor: v.number(), assigneeIds: v.array(v.string()) }),
    ),
    taxMinor: v.number(),
    tipMinor: v.number(),
    discountMinor: v.number(),
  }),
);

export const activityType = v.union(
  v.literal("expense_added"),
  v.literal("expense_updated"),
  v.literal("expense_deleted"),
  v.literal("expense_restored"),
  v.literal("payment_recorded"),
  v.literal("payment_deleted"),
  v.literal("comment_added"),
  v.literal("group_created"),
  v.literal("group_updated"),
  v.literal("group_deleted"),
  v.literal("group_restored"),
  v.literal("member_added"),
  v.literal("member_removed"),
  v.literal("member_left"),
  v.literal("friend_added"),
  v.literal("simplify_toggled"),
  v.literal("currency_converted"),
  v.literal("reminder_sent"),
);

export default defineSchema({
  ...authTables,

  users: defineTable({
    ...authTables.users.validator.fields,
    defaultCurrency: v.optional(v.string()),
    timeZone: v.optional(v.string()),
    isPlaceholder: v.optional(v.boolean()),
    invitedBy: v.optional(v.id("users")),
    notifPrefs: v.optional(notifPrefs),
    avatarId: v.optional(v.id("_storage")),
    deletedAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  friendships: defineTable({
    userA: v.id("users"),
    userB: v.id("users"),
    pairKey: v.string(),
    createdBy: v.id("users"),
    lastActivityAt: v.number(),
  })
    .index("by_pair", ["pairKey"])
    .index("by_userA", ["userA"])
    .index("by_userB", ["userB"]),

  groups: defineTable({
    name: v.string(),
    type: groupType,
    coverId: v.optional(v.id("_storage")),
    simplifyDebts: v.boolean(),
    defaultSplit: v.optional(splitSpec),
    whiteboard: v.optional(v.string()),
    inviteCode: v.string(),
    createdBy: v.id("users"),
    lastCurrency: v.optional(v.string()),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("users")),
  }).index("by_invite", ["inviteCode"]),

  groupMembers: defineTable({
    groupId: v.id("groups"),
    userId: v.id("users"),
    joinedAt: v.number(),
    addedBy: v.optional(v.id("users")),
  })
    .index("by_group", ["groupId"])
    .index("by_user", ["userId"])
    .index("by_group_user", ["groupId", "userId"]),

  expenses: defineTable({
    groupId: v.optional(v.id("groups")),
    pairKey: v.optional(v.string()),
    description: v.string(),
    notes: v.optional(v.string()),
    amountMinor: v.number(),
    currency: v.string(),
    date: v.number(),
    category: v.string(),
    splitMethod,
    splitSpec: v.optional(splitSpec),
    isPayment: v.boolean(),
    receiptId: v.optional(v.id("_storage")),
    repeat: repeatInterval,
    nextRepeatAt: v.optional(v.number()),
    recurringParentId: v.optional(v.id("expenses")),
    emailReminder: v.boolean(),
    originalAmountMinor: v.optional(v.number()),
    originalCurrency: v.optional(v.string()),
    createdBy: v.id("users"),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id("users")),
  })
    .index("by_group_date", ["groupId", "date"])
    .index("by_pair_date", ["pairKey", "date"])
    .index("by_next_repeat", ["nextRepeatAt"])
    .index("by_parent", ["recurringParentId"]),

  expenseShares: defineTable({
    expenseId: v.id("expenses"),
    userId: v.id("users"),
    paidMinor: v.number(),
    owedMinor: v.number(),
    date: v.number(),
    groupId: v.optional(v.id("groups")),
    pairKey: v.optional(v.string()),
    deleted: v.boolean(),
  })
    .index("by_expense", ["expenseId"])
    .index("by_user_date", ["userId", "deleted", "date"])
    .index("by_user_group", ["userId", "groupId", "deleted"]),

  /** amountMinor = what highUserId owes lowUserId (signed). Maintained by mutations. */
  balances: defineTable({
    scope: v.string(),
    lowUserId: v.id("users"),
    highUserId: v.id("users"),
    currency: v.string(),
    amountMinor: v.number(),
  })
    .index("by_scope", ["scope"])
    .index("by_scope_pair_currency", ["scope", "lowUserId", "highUserId", "currency"])
    .index("by_low", ["lowUserId"])
    .index("by_high", ["highUserId"]),

  comments: defineTable({
    expenseId: v.id("expenses"),
    userId: v.id("users"),
    content: v.string(),
    deletedAt: v.optional(v.number()),
  }).index("by_expense", ["expenseId"]),

  activities: defineTable({
    type: activityType,
    actorId: v.id("users"),
    groupId: v.optional(v.id("groups")),
    expenseId: v.optional(v.id("expenses")),
    subjectUserId: v.optional(v.id("users")),
    payload: v.any(),
  })
    .index("by_expense", ["expenseId"])
    .index("by_group", ["groupId"]),

  activityFeed: defineTable({
    userId: v.id("users"),
    activityId: v.id("activities"),
    read: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_user_read", ["userId", "read"]),

  exchangeRates: defineTable({
    base: v.string(),
    quote: v.string(),
    rate: v.number(),
    fetchedAt: v.number(),
  }).index("by_pair", ["base", "quote"]),

  invites: defineTable({
    groupId: v.optional(v.id("groups")),
    email: v.string(),
    invitedBy: v.id("users"),
    placeholderUserId: v.optional(v.id("users")),
    token: v.string(),
    acceptedAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_email", ["email"]),
});
