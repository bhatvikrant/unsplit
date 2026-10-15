import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("post recurring expenses", { hours: 1 }, internal.expenses.postRecurring, {});
crons.daily("prune idempotency keys", { hourUTC: 4, minuteUTC: 0 }, internal.maintenance.pruneIdempotencyKeys, {});
crons.daily("recurring expense reminders", { hourUTC: 9, minuteUTC: 0 }, internal.reminders.recurringReminders, {});

export default crons;
