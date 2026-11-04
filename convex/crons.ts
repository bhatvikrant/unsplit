import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("post recurring expenses", { hours: 1 }, internal.expenses.postRecurring, {});
crons.daily("prune idempotency keys", { hourUTC: 4, minuteUTC: 0 }, internal.maintenance.pruneIdempotencyKeys, {});
crons.daily("recurring expense reminders", { hourUTC: 9, minuteUTC: 0 }, internal.reminders.recurringReminders, {});
// The Resend component keeps every email it sent; drop them once they're old.
crons.daily("prune sent emails", { hourUTC: 4, minuteUTC: 15 }, internal.emails.pruneOldEmails, {});

export default crons;
