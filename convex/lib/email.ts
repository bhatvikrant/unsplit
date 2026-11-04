/**
 * Transactional email through the @convex-dev/resend component, which queues each email,
 * batches them to Resend, retries on failure and sends idempotency keys so nothing goes out
 * twice. Every send goes through `sendEmail` below, which first checks:
 *
 * - RESEND_API_KEY is set (otherwise the email is logged and skipped, so dev keeps working),
 * - the address hasn't hard-bounced or marked us as spam (see convex/emails.ts),
 * - today's send budget (convex/lib/rateLimit.ts) has room, so the free plan's daily cap
 *   isn't blown by one busy group and invites still get through.
 *
 * Env: RESEND_API_KEY, EMAIL_FROM ("UnSplit <notifications@your.domain>"), RESEND_WEBHOOK_SECRET
 * (for bounce/complaint events), optional RESEND_TEST_MODE=1 (only Resend's test addresses
 * receive mail) and EMAIL_DAILY_CAP (default 95, the free plan allows 100 a day).
 */
import { Resend } from "@convex-dev/resend";
import { components, internal } from "../_generated/api";
import type { ActionCtx, MutationCtx } from "../_generated/server";
import { rateLimiter } from "./rateLimit";

export type EmailArgs = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /**
   * "activity" emails (expense and group updates, recurring heads-ups) only get part of the
   * daily budget; "essential" ones (invites, reminders a person sends) can use all of it.
   */
  kind: "activity" | "essential";
};

export type SendResult = "queued" | "not_configured" | "suppressed" | "over_budget";

export const resend: Resend = new Resend(components.resend, {
  testMode: process.env.RESEND_TEST_MODE === "1",
  onEmailEvent: internal.emails.handleEmailEvent,
});

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function siteUrl(): string {
  return (process.env.SITE_URL ?? "http://localhost:5173").replace(/\/$/, "");
}

export function normalizeAddress(email: string): string {
  return email.trim().toLowerCase();
}

export async function sendEmail(ctx: ActionCtx | MutationCtx, args: EmailArgs): Promise<SendResult> {
  if (!emailConfigured()) {
    console.log(`[email skipped: no RESEND_API_KEY] to=${args.to} subject=${args.subject}`);
    return "not_configured";
  }
  const to = normalizeAddress(args.to);
  if (await ctx.runQuery(internal.emails.isSuppressed, { email: to })) {
    console.log(`[email skipped: ${to} bounced or complained before] subject=${args.subject}`);
    return "suppressed";
  }
  if (args.kind === "activity") {
    const { ok } = await rateLimiter.limit(ctx, "activityEmailDaily");
    if (!ok) {
      console.warn(`[email skipped: activity budget for today is used up] subject=${args.subject}`);
      return "over_budget";
    }
  }
  const { ok } = await rateLimiter.limit(ctx, "emailDaily");
  if (!ok) {
    console.warn(`[email skipped: daily email budget is used up] subject=${args.subject}`);
    return "over_budget";
  }
  await resend.sendEmail(ctx, {
    from: process.env.EMAIL_FROM ?? "UnSplit <onboarding@resend.dev>",
    to,
    subject: args.subject,
    text: args.text,
    html: args.html ?? `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(args.text)}</pre>`,
  });
  return "queued";
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** `title` is plain text (escaped here); `bodyHtml` is HTML, so escape any user text in it first. */
export function layout(title: string, bodyHtml: string, ctaUrl?: string, ctaLabel?: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f7f7f8;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#17171c">
  <div style="max-width:520px;margin:32px auto;background:#fff;border:1px solid #e4e4e9;border-radius:14px;padding:28px">
    <div style="font-weight:700;font-size:18px;margin-bottom:16px">UnSplit</div>
    <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>
    <div style="font-size:15px;line-height:22px;color:#5f5f6b">${bodyHtml}</div>
    ${ctaUrl ? `<p style="margin-top:20px"><a href="${ctaUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600">${escapeHtml(ctaLabel ?? "Open UnSplit")}</a></p>` : ""}
    <p style="font-size:12px;color:#8a8a96;margin-top:24px">You get this email because of your UnSplit notification settings. Change them in Account → Notifications.</p>
  </div></body></html>`;
}
