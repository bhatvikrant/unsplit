/**
 * Application-level rate limits (the @convex-dev/rate-limiter component).
 * Limits cover the actions that send email on a user's behalf: invites and
 * reminders. Each helper throws a readable ConvexError when the limit is hit,
 * so the client toast says when to try again.
 */
import { ConvexError } from "convex/values";
import { DAY, HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

/**
 * How many emails the whole app may send a day. Resend's free plan stops at 100 a day, so the
 * default leaves a little headroom; set EMAIL_DAILY_CAP higher after upgrading. Activity emails
 * (expense and group updates) get three quarters of it, so invites and reminders always fit.
 */
const EMAIL_DAILY_CAP = Math.max(1, Number(process.env.EMAIL_DAILY_CAP) || 95);
const ACTIVITY_EMAIL_DAILY_CAP = Math.max(1, Math.floor(EMAIL_DAILY_CAP * 0.75));

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // App-wide email budgets (no key), refilling steadily over a day. See lib/email.ts.
  emailDaily: { kind: "token bucket", rate: EMAIL_DAILY_CAP, period: DAY, capacity: EMAIL_DAILY_CAP },
  activityEmailDaily: { kind: "token bucket", rate: ACTIVITY_EMAIL_DAILY_CAP, period: DAY, capacity: ACTIVITY_EMAIL_DAILY_CAP },
  // Invite emails per sender (friend adds + group member adds).
  inviteEmail: { kind: "token bucket", rate: 30, period: HOUR, capacity: 10 },
  // Reminder emails per sender.
  reminderEmail: { kind: "token bucket", rate: 10, period: HOUR, capacity: 3 },
  // One reminder per sender->friend pair every 12 hours.
  reminderToFriend: { kind: "fixed window", rate: 1, period: 12 * HOUR },
});

type Name = "inviteEmail" | "reminderEmail" | "reminderToFriend";
type Ctx = Parameters<typeof rateLimiter.limit>[0];

function describe(ms: number): string {
  if (ms < MINUTE) return "a minute";
  if (ms < HOUR) return `${Math.ceil(ms / MINUTE)} minutes`;
  const h = Math.ceil(ms / HOUR);
  return h === 1 ? "an hour" : `${h} hours`;
}

/** Consumes one unit of `name` for `key`, or throws a ConvexError with a human message. */
export async function enforceLimit(ctx: Ctx, name: Name, key: string, what: string): Promise<void> {
  const { ok, retryAfter } = await rateLimiter.limit(ctx, name, { key });
  if (!ok) throw new ConvexError(`${what} limit reached. Try again in ${describe(retryAfter)}.`);
}
