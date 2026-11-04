import { v } from "convex/values";
import { vOnEmailEventArgs } from "@convex-dev/resend";
import { components } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { normalizeAddress } from "./lib/email";

/** True when this address hard-bounced or reported us as spam; we never email it again. */
export const isSuppressed = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const row = await ctx.db
      .query("emailSuppressions")
      .withIndex("by_email", (q) => q.eq("email", normalizeAddress(email)))
      .first();
    return row !== null;
  },
});

/**
 * Resend delivery events, relayed by the component from the /resend-webhook route (convex/http.ts).
 * Hard bounces and spam complaints suppress the address: mailing them again hurts the sending
 * domain's reputation, and Resend can pause an account whose bounce or complaint rate climbs.
 */
export const handleEmailEvent = internalMutation({
  args: vOnEmailEventArgs,
  handler: async (ctx, { event }) => {
    let reason: string | null = null;
    if (event.type === "email.complained") reason = "complained";
    else if (event.type === "email.bounced" && event.data.bounce.type === "Permanent") {
      reason = `bounced: ${event.data.bounce.subType || event.data.bounce.message}`.slice(0, 200);
    }
    if (!reason) return;
    const recipients = Array.isArray(event.data.to) ? event.data.to : [event.data.to];
    for (const raw of recipients) {
      const email = normalizeAddress(raw);
      const existing = await ctx.db
        .query("emailSuppressions")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (!existing) await ctx.db.insert("emailSuppressions", { email, reason });
    }
  },
});

/** Daily cron: the component keeps every email until told otherwise (its tables only feed status lookups). */
export const pruneOldEmails = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(components.resend.lib.cleanupOldEmails, { olderThan: 7 * 24 * 3600_000 });
    await ctx.runMutation(components.resend.lib.cleanupAbandonedEmails, { olderThan: 28 * 24 * 3600_000 });
  },
});
