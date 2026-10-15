/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as auth from "../auth.js";
import type * as comments from "../comments.js";
import type * as crons from "../crons.js";
import type * as expenses from "../expenses.js";
import type * as exports from "../exports.js";
import type * as files from "../files.js";
import type * as friends from "../friends.js";
import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as insights from "../insights.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_balances from "../lib/balances.js";
import type * as lib_categories from "../lib/categories.js";
import type * as lib_currencies from "../lib/currencies.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_idempotency from "../lib/idempotency.js";
import type * as lib_ids from "../lib/ids.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_passwordReset from "../lib/passwordReset.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_recurring from "../lib/recurring.js";
import type * as lib_split from "../lib/split.js";
import type * as lib_users from "../lib/users.js";
import type * as maintenance from "../maintenance.js";
import type * as notifications from "../notifications.js";
import type * as rates from "../rates.js";
import type * as receipts from "../receipts.js";
import type * as reminders from "../reminders.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  auth: typeof auth;
  comments: typeof comments;
  crons: typeof crons;
  expenses: typeof expenses;
  exports: typeof exports;
  files: typeof files;
  friends: typeof friends;
  groups: typeof groups;
  http: typeof http;
  insights: typeof insights;
  "lib/access": typeof lib_access;
  "lib/activity": typeof lib_activity;
  "lib/balances": typeof lib_balances;
  "lib/categories": typeof lib_categories;
  "lib/currencies": typeof lib_currencies;
  "lib/email": typeof lib_email;
  "lib/idempotency": typeof lib_idempotency;
  "lib/ids": typeof lib_ids;
  "lib/money": typeof lib_money;
  "lib/passwordReset": typeof lib_passwordReset;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/recurring": typeof lib_recurring;
  "lib/split": typeof lib_split;
  "lib/users": typeof lib_users;
  maintenance: typeof maintenance;
  notifications: typeof notifications;
  rates: typeof rates;
  receipts: typeof receipts;
  reminders: typeof reminders;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
