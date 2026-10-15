import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { formatMoney } from "./lib/money";
import { escapeHtml, layout, sendEmail, siteUrl } from "./lib/email";
import { DEFAULT_NOTIF_PREFS } from "./lib/users";

/** Recurring expenses posting in the next 24-48h with the email reminder on. */
export const upcoming = internalQuery({
  args: {},
  handler: async (ctx) => {
    const from = Date.now() + 24 * 3600_000;
    const to = Date.now() + 48 * 3600_000;
    const due = await ctx.db.query("expenses").withIndex("by_next_repeat", (q) => q.gte("nextRepeatAt", from).lt("nextRepeatAt", to)).collect();
    const out: { to: string; name: string; description: string; amountMinor: number; currency: string; when: number; expenseId: string }[] = [];
    for (const e of due) {
      if (e.deletedAt || !e.emailReminder) continue;
      const shares = await ctx.db.query("expenseShares").withIndex("by_expense", (q) => q.eq("expenseId", e._id)).collect();
      for (const s of shares) {
        const u = await ctx.db.get(s.userId);
        if (!u?.email || u.deletedAt || u.isPlaceholder) continue;
        if (!(u.notifPrefs ?? DEFAULT_NOTIF_PREFS).reminders) continue;
        out.push({ to: u.email, name: u.name ?? "there", description: e.description, amountMinor: e.amountMinor, currency: e.currency, when: e.nextRepeatAt!, expenseId: e._id });
      }
    }
    return out;
  },
});

export const recurringReminders = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!process.env.RESEND_API_KEY) return;
    const list = await ctx.runQuery(internal.reminders.upcoming, {});
    for (const r of list) {
      const amount = formatMoney(r.amountMinor, r.currency);
      await sendEmail({
        to: r.to,
        subject: `Heads up: "${r.description}" (${amount}) posts tomorrow`,
        text: `Hi ${r.name}, the recurring expense "${r.description}" for ${amount} will be added tomorrow.`,
        html: layout("A recurring expense posts tomorrow", `<p>The recurring expense <strong>${escapeHtml(r.description)}</strong> for <strong>${amount}</strong> will be added tomorrow.</p>`, `${siteUrl()}/expenses/${r.expenseId}`, "View expense"),
      });
    }
  },
});
