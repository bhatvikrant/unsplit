# Architecture: UnSplit (a rebuild of Splitwise's core features)

## Stack

| layer | choice | why |
| --- | --- | --- |
| web | Vite + React 19 + TypeScript + React Router 7 | SPA; all data is live through Convex so no server rendering is needed |
| styling | Tailwind 4 + shadcn/ui (Radix) + Lucide icons + Framer Motion | tokens as CSS variables; accessible primitives; open icon set |
| database + backend | Convex | one managed system for tables, functions, realtime subscriptions, file storage, cron and actions |
| auth | Convex Auth (`@convex-dev/auth`): Password + Google | lives inside Convex, no extra service; Google with the user's own OAuth client |
| email | Resend via Convex actions | invites, reminders, password reset codes, event notifications |
| OCR | Claude API (`claude-sonnet-5-5`) via a Convex action | receipt image to items and total; user's own key |
| rates | Frankfurter (api.frankfurter.app) | free, no key, ECB reference rates; cached in a table |
| files | Convex file storage | receipts, avatars, group covers |
| jobs | Convex cron (hourly) | post recurring expenses, send reminders, prune old settled-friend visibility |
| hosting | Vercel (static) + Convex cloud | `npx convex deploy` builds the frontend with the production URL |

One database. No microservices. Payments are recorded, never moved.

## Schema (Convex)

Tables: 13. Access rules: every query and mutation starts with `requireUser(ctx)`
and then one of `assertGroupMember`, `assertExpenseParticipant` or
`assertFriend`. There are no admins (matches the original: anyone in a group
or on an expense can edit it).

Money is stored as an integer in minor units (`amountMinor`) plus an ISO
4217 `currency`. A `currencyDecimals` map handles 0-decimal currencies.

```ts
// convex/schema.ts (summary; the file is the source of truth)
users            { name, email?, image?, defaultCurrency, timeZone?, isPlaceholder,
                   notifPrefs { expenseAdded, expenseUpdated, comment, addedToGroup,
                                friendAdded, paymentRecorded, reminders, monthlySummary },
                   deletedAt? }                       // Convex Auth owns this table; we extend it
friendships      { userA, userB, pairKey, createdAt, lastActivityAt }   // pairKey = sorted ids joined
groups           { name, type, coverId?, simplifyDebts, defaultSplit?, whiteboard?,
                   inviteCode, createdBy, lastCurrency?, deletedAt?, deletedBy? }
groupMembers     { groupId, userId, joinedAt }
expenses         { groupId?, pairKey?, description, notes?, amountMinor, currency, date,
                   categoryId, splitMethod, isPayment, receiptId?, repeat, nextRepeatAt?,
                   recurringParentId?, emailReminder, createdBy, updatedBy, deletedAt?, deletedBy?,
                   itemized?: { items: [{ name, amountMinor, assigneeIds }], taxMinor, tipMinor, discountMinor } }
expenseShares    { expenseId, userId, paidMinor, owedMinor, groupId?, pairKey? }
balances         { scope ("group:<id>" | "pair:<pairKey>"), lowUserId, highUserId, currency,
                   amountMinor }                      // amount highUser owes lowUser (signed), kept by mutations
comments         { expenseId, userId, content, createdAt, deletedAt? }
activities       { type, actorId, groupId?, expenseId?, subjectUserId?, payload, createdAt }
activityFeed     { userId, activityId, read, createdAt }   // fan-out, one row per recipient
categories       { parent, name, slug, icon, sort }        // seeded
exchangeRates    { base, quote, rate, fetchedAt }
invites          { groupId?, email, invitedBy, token, acceptedAt?, createdAt }
```

Indexes: `groupMembers` by_group, by_user; `expenses` by_group_date, by_pair_date,
by_next_repeat, by_parent; `expenseShares` by_expense, by_user, by_group_user;
`balances` by_scope, by_low, by_high; `friendships` by_pairKey, by_userA, by_userB;
`activityFeed` by_user_created, by_user_unread; `comments` by_expense;
`exchangeRates` by_pair; `invites` by_token, by_email; `groups` by_invite.

### The split engine (pure, shared by client and server)

`src/lib/split.ts` and `convex/lib/split.ts` are the same module. Input: total
minor, currency decimals, payers `{ userId, paidMinor }[]`, method and
per-participant values. Output: `{ userId, paidMinor, owedMinor }[]` whose
`sum(owed) == total == sum(paid)`. Rounding: largest-remainder, deterministic by
participant order, so the same input always yields the same cents.

- equal: total / n, remainder spread one cent at a time
- exact: values must sum to total
- percent: must sum to 100.00; each share = round(total * pct), remainder fixed
- shares: weight / sum(weights)
- adjustment: each gets its adjustment, the rest (total - sum(adjustments)) split equally
- reimbursement: `paid` is the receiver of the refund, `owed` is negative in effect: modelled as an expense where the refunded people are "paid" and the receiver "owes" the sum
- itemized: each item split equally among its assignees; tax, tip and discount allocated proportionally to each person's item subtotal; remainder fixed

Pairwise debts from one expense: net_i = paid_i - owed_i. Debtors (net<0) owe
creditors (net>0) in proportion to each creditor's share of the total credit.
Those pairwise amounts are what `balances` accumulates. Editing an expense
applies the negative of its old debts, then its new ones, in one mutation.

### Simplify debts

Per group, per currency, from the `balances` rows: compute each member's net,
then greedy min-cash-flow (largest creditor matched with largest debtor until
both are zero). Deterministic. Runs on read; groups are small.

## API (Convex functions)

| function | does | who | flow |
| --- | --- | --- | --- |
| `users.me` q | current user with prefs | self | all |
| `users.update` m | name, currency, time zone, prefs, avatar | self | S16, S17 |
| `users.deleteAccount` m | anonymise, leave groups (blocked if any balance non-zero) | self | S16 |
| `friends.list` q | friends with balances per currency | self | S05, S09 |
| `friends.add` m | by name (+ optional email): finds or creates placeholder, creates friendship, invites by email | self | F04 |
| `friends.get` q | friend, balance by group | friend | S09 |
| `friends.remove` m | only if settled everywhere | friend | S09 |
| `friends.remind` a | email the friend their balance | friend | S09 |
| `groups.list` q | my groups with my balance in each | member | sidebar |
| `groups.get` q | group, members, balances, simplified debts | member | S08 |
| `groups.create` m | name, type, members (ids or new placeholders / emails) | self | F03 |
| `groups.update` m | name, type, cover, simplifyDebts, defaultSplit, whiteboard | member | S14 |
| `groups.addMember` m | by user id, name or email | member | S14 |
| `groups.removeMember` m | blocked if balance non-zero | member | S14 |
| `groups.leave` m | same rule | member | F11 |
| `groups.delete` / `restore` m | soft delete; activity | member | F11, S26 |
| `groups.joinByCode` m | invite link | signed-in | S21 |
| `groups.totals` q | the six metrics by month / all time | member | S18 |
| `expenses.list` q | paginated, by group / pair / all, month-grouped on client, optional search | participant | S07-S09 |
| `expenses.get` q | expense, shares, items, comments, history | participant | S11 |
| `expenses.create` m | validates with the split engine; writes shares, balances, activity, feed fan-out | member / friend | F01 |
| `expenses.update` m | reverses old debts, applies new; recurring: future only | participant | F05, F09 |
| `expenses.delete` / `restore` m | reverses / reapplies; activity | participant | F05 |
| `expenses.cancelRecurring` m | repeat = never on the latest instance | participant | F09 |
| `expenses.recurring` q | upcoming instances | self | S25 |
| `expenses.search` q | substring over my expenses | self | S20 |
| `payments.create` m | a payment is an expense with `isPayment`, payer paid, payee owed | participant | F02 |
| `comments.add` / `remove` m | on an expense; activity | participant | F06 |
| `activity.feed` q | paginated feed; `markRead` m | self | S06 |
| `insights.charts` q | by category and by month | self / member | S19 |
| `exports.csv` q | rows for a group or friend | member | S22 |
| `exports.json` q | full account | self | S22 |
| `rates.convert` a | fetch rates, preview; `rates.apply` m rewrites expenses, logs activity | member | F08 |
| `receipts.scan` a | storage id to parsed `{ items, total, tax, tip, merchant, date }` | self | S24 |
| `files.uploadUrl` m | storage upload URL | self | S10, S14, S16 |
| `invites.send` a | Resend email with join link | member | F03, F04 |

Webhooks in: none (no payment processor). Webhooks out: none.
Jobs (Convex cron): `postRecurring` hourly; `sendReminders` daily; `summaries` monthly.

## The parts that bite

- **Rounding:** every split goes through one function with largest-remainder rounding; the server re-validates what the client sends and refuses sums that do not match.
- **Multiple payers:** pairwise attribution is proportional to credit; documented and tested.
- **Balances table drift:** only mutations touch it, each applying a signed delta inside one transaction. A `balances.rebuild` internal mutation recomputes from shares for repair.
- **Recurring:** the cron clones the parent with `date = nextRepeatAt`, advances `nextRepeatAt` by the interval in the creator's time zone, and links `recurringParentId`. Editing the latest instance updates the template for the future, never the past.
- **Currency conversion rewrites history:** preview first, confirm, log a `currency_converted` activity with the rates used, and keep `originalAmountMinor` / `originalCurrency` on each converted expense so it is auditable.
- **Placeholder users:** a friend added by name has no login. When someone signs up with that email, the Convex Auth `createOrUpdateUser` hook claims the placeholder instead of creating a new user.
- **Authorization:** no admins, but every function checks membership. A second user must get nothing back from another pair's or group's data.
- **Email deliverability:** Resend from the user's own verified domain; without a key the app still works, invites fall back to copyable links.
- **File uploads:** 10 MB limit, image types only, served through Convex storage URLs.
- **Deletion:** account deletion anonymises the user and keeps shares so other people's balances stay correct.

## Build order

1. **Vertical slice:** S02/S03 auth, S05 dashboard, S13 create group, S10 add expense (equal split), S08 group page with balances, S12 settle up. Tables: users, groups, groupMembers, expenses, expenseShares, balances.
2. **Must-haves:** every split method and multiple payers (S10), friends and non-group expenses (S09, S15), all expenses and search (S07, S20), expense detail with comments and history (S11), activity feed (S06), group settings with simplify debts and default split (S14), delete / restore (S26), recurring (S25 + cron), categories, receipts, totals (S18), account settings (S16), invite links (S21), responsive layout.
3. **Should-haves:** charts (S19), CSV and JSON export (S22), currency conversion (S23), receipt OCR (S24), email invites / reminders / notifications, notification prefs (S17), whiteboard, reimbursement split, delete account.
4. **Could-haves:** cover images, category auto-suggest, recurring email reminder, settled-friend hiding, log out everywhere.
