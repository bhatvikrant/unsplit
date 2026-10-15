import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { formatMoney } from "./lib/money";
import { escapeHtml, layout, sendEmail, siteUrl } from "./lib/email";
import { DEFAULT_NOTIF_PREFS } from "./lib/users";

type PrefKey = keyof typeof DEFAULT_NOTIF_PREFS;

const PREF_FOR_TYPE: Record<string, PrefKey | null> = {
  expense_added: "expenseAdded",
  expense_updated: "expenseUpdated",
  expense_deleted: "expenseUpdated",
  expense_restored: "expenseUpdated",
  payment_recorded: "paymentRecorded",
  payment_deleted: "paymentRecorded",
  comment_added: "commentAdded",
  member_added: "addedToGroup",
  group_created: "addedToGroup",
  friend_added: "friendAdded",
  currency_converted: "expenseUpdated",
  group_updated: null,
  group_deleted: "addedToGroup",
  group_restored: null,
  member_removed: null,
  member_left: null,
  simplify_toggled: null,
  reminder_sent: null,
};

export const activityContext = internalQuery({
  args: { activityId: v.id("activities") },
  handler: async (ctx, { activityId }) => {
    const activity = await ctx.db.get(activityId);
    if (!activity) return null;
    const actor = await ctx.db.get(activity.actorId);
    const group = activity.groupId ? await ctx.db.get(activity.groupId) : null;
    const expense = activity.expenseId ? await ctx.db.get(activity.expenseId) : null;
    const feed = await ctx.db.query("activityFeed").withIndex("by_user", (q) => q.eq("userId", activity.actorId)).take(0);
    void feed;
    const recipients: { email: string; name: string; prefs: typeof DEFAULT_NOTIF_PREFS }[] = [];
    // Find everyone this activity fanned out to.
    const rows = await ctx.db
      .query("activityFeed")
      .filter((q) => q.eq(q.field("activityId"), activityId))
      .collect();
    for (const r of rows) {
      if (r.userId === activity.actorId) continue;
      const u = await ctx.db.get(r.userId);
      if (!u || !u.email || u.deletedAt || u.isPlaceholder) continue;
      recipients.push({ email: u.email, name: u.name ?? "there", prefs: u.notifPrefs ?? DEFAULT_NOTIF_PREFS });
    }
    return {
      activity,
      actorName: actor?.name ?? "Someone",
      groupName: group?.name,
      expense: expense ? { description: expense.description, amountMinor: expense.amountMinor, currency: expense.currency, id: expense._id } : null,
      recipients,
    };
  },
});

export const sendForActivity = internalAction({
  args: { activityId: v.id("activities") },
  handler: async (ctx, { activityId }) => {
    if (!process.env.RESEND_API_KEY) return;
    const c = await ctx.runQuery(internal.notifications.activityContext, { activityId });
    if (!c) return;
    const prefKey = PREF_FOR_TYPE[c.activity.type];
    if (!prefKey) return;
    const where = c.groupName ? ` in ${c.groupName}` : "";
    const amount = c.expense ? formatMoney(c.expense.amountMinor, c.expense.currency) : "";
    let subject = "";
    let body = "";
    let link = siteUrl();
    switch (c.activity.type) {
      case "expense_added":
        subject = `${c.actorName} added "${c.expense?.description}" (${amount})${where}`;
        body = `${c.actorName} added an expense${where}: <strong>${escapeHtml(c.expense?.description ?? "")}</strong> for ${amount}.`;
        link = `${siteUrl()}/expenses/${c.expense?.id}`;
        break;
      case "expense_updated":
        subject = `${c.actorName} updated "${c.expense?.description}"${where}`;
        body = `${c.actorName} changed <strong>${escapeHtml(c.expense?.description ?? "")}</strong>${where}. It is now ${amount}.`;
        link = `${siteUrl()}/expenses/${c.expense?.id}`;
        break;
      case "expense_deleted":
        subject = `${c.actorName} deleted "${c.expense?.description}"${where}`;
        body = `${c.actorName} deleted <strong>${escapeHtml(c.expense?.description ?? "")}</strong> (${amount})${where}. You can restore it from Deleted items.`;
        break;
      case "expense_restored":
        subject = `${c.actorName} restored "${c.expense?.description}"${where}`;
        body = `${c.actorName} restored <strong>${escapeHtml(c.expense?.description ?? "")}</strong>${where}.`;
        break;
      case "payment_recorded":
        subject = `${c.actorName} recorded a payment of ${amount}${where}`;
        body = `${c.actorName} recorded a payment of <strong>${amount}</strong>${where}.`;
        link = `${siteUrl()}/expenses/${c.expense?.id}`;
        break;
      case "payment_deleted":
        subject = `${c.actorName} removed a payment of ${amount}${where}`;
        body = `${c.actorName} removed a payment of ${amount}${where}.`;
        break;
      case "comment_added":
        subject = `${c.actorName} commented on "${c.expense?.description}"`;
        body = `${c.actorName} wrote: <em>${escapeHtml(String((c.activity.payload as { content?: string })?.content ?? ""))}</em>`;
        link = `${siteUrl()}/expenses/${c.expense?.id}`;
        break;
      case "member_added":
      case "group_created":
        subject = `${c.actorName} added you to ${c.groupName}`;
        body = `${c.actorName} added you to the group <strong>${escapeHtml(c.groupName ?? "")}</strong>.`;
        link = `${siteUrl()}/groups/${c.activity.groupId}`;
        break;
      case "group_deleted":
        subject = `${c.actorName} deleted ${c.groupName}`;
        body = `${c.actorName} deleted the group <strong>${escapeHtml(c.groupName ?? "")}</strong>. It can be restored from Deleted items.`;
        break;
      case "friend_added":
        subject = `${c.actorName} added you as a friend on Unsplit`;
        body = `${c.actorName} added you as a friend. You can now share expenses.`;
        link = `${siteUrl()}/friends/${c.activity.actorId}`;
        break;
      case "currency_converted":
        subject = `${c.actorName} converted expenses${where} to one currency`;
        body = `${c.actorName} converted all expenses${where} to ${escapeHtml(String((c.activity.payload as { target?: string })?.target ?? ""))}. Balances may have changed slightly.`;
        break;
      default:
        return;
    }
    for (const r of c.recipients) {
      if (!r.prefs[prefKey]) continue;
      await sendEmail({ to: r.email, subject, text: subject, html: layout(subject, body, link, "Open in Unsplit") });
    }
  },
});
