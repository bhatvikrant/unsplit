# Recon map: Splitwise (web)

Scope: the full web product. Friends, groups, expenses with every split method, settling up, balances, activity, account. Everything Splitwise gates behind Pro is in scope and free in the clone, except card transaction import (bank linking) and partner payment rails.
For: UnSplit, a free, no-paywall shared-expense tracker for the user and anyone they share costs with.
Date: 2026-10-15

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | marketing site | https://www.splitwise.com/ | core loop, platform list, feature bullets |
| 2 | Pro page | https://www.splitwise.com/pro | the gated feature list: all of it goes free in the clone |
| 3 | help center index | https://kb.splitwise.com/ | 7 categories |
| 4 | help: split methods | https://kb.splitwise.com/balances-and-expenses/what-are-different-ways-i-can-split-an-expense | equal, exact, percent, shares, adjustment, reimbursement, itemized |
| 5 | help: simplify debts | https://kb.splitwise.com/balances-and-expenses/what-is-simplify-debts | per-currency, any member can toggle, logged in activity |
| 6 | help: recurring | https://kb.splitwise.com/balances-and-expenses/how-can-i-manage-recurring-expenses | weekly / fortnightly / monthly / yearly, edit latest instance, cancel future |
| 7 | help: totals screen | https://kb.splitwise.com/balances-and-expenses/can-you-explain-the-totals-screen | six metrics, month or all-time |
| 8 | help: dashboard balances | https://kb.splitwise.com/balances-and-expenses/can-you-help-me-understand-my-dashboard-balances-on-the-web-app | total owe / owed, per-friend, multi-currency asterisk, settled friends hidden after 30 days |
| 9 | help: multiple currencies | https://kb.splitwise.com/balances-and-expenses/how-can-i-manage-a-friendship-or-group-with-multiple-currencies | balances per currency; Pro conversion converts all past expenses |
| 10 | help: permissions | https://kb.splitwise.com/groups/can-i-prevent-group-members-from-changing-expenses-or-set-permissions | no admins; anyone involved or in the group can edit/delete |
| 11 | help: export | https://kb.splitwise.com/account-issues/how-do-i-export-my-splitwise-data | spreadsheet per group/friend; JSON backup (Pro) |
| 12 | help: what is Pro | https://kb.splitwise.com/pro/what-is-splitwise-pro | free cap is 4 expenses/day; Pro list |
| 13 | help: reimbursement | https://kb.splitwise.com/balances-and-expenses/how-do-i-add-a-refund-or-reimbursement | web-only split type |
| 14 | help: non-group expenses | https://kb.splitwise.com/groups/why-do-i-have-a-non-group-expenses-group | the implicit "no group" bucket |
| 15 | public API docs | https://dev.splitwise.com/ | data model: users, groups, friends, expenses (paid_share / owed_share), comments, notifications, categories, currencies |
| 16 | App Store listing | https://apps.apple.com/us/app/splitwise/id458023433 | 4.0 stars, ~29k ratings; complaints: paywall, free limits |

No screenshots of logged-in screens were taken (no account was used). Layout
notes below come from the help center's descriptions of the web app plus the
public marketing pages. `replica/screens/` stays empty; replica-diff will use
the feature matrix only.

## Core loop

Add a shared expense, see who owes whom, settle up. Everything else serves that.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Landing | `/` (signed out) | pitch and sign-in entry | hero, feature list, CTA | signed out only |
| S02 | Sign up | `/signup` | create account with email or Google | form, OAuth button | empty, error (taken email, weak password), loading |
| S03 | Log in | `/login` | sign in | form, OAuth button, forgot link | empty, error, loading |
| S04 | Forgot / reset password | `/forgot`, `/reset` | recover account | email form, code + new password form | sent, error, expired |
| S05 | Dashboard | `/dashboard` | home: total balance, you owe, you are owed, per-friend balances | sidebar, stat row, balance lists, add-expense / settle-up buttons | empty (no friends), filled, multi-currency asterisk, loading |
| S06 | Recent activity | `/activity` | chronological feed of everything that touched the user | activity rows with avatar / icon, unread badge | empty, filled, loading |
| S07 | All expenses | `/expenses` | every expense the user is on, grouped by month | expense row (date, category icon, description, paid-by, lent/borrowed), month headers, filters, search | empty, filled, filtered-empty, loading |
| S08 | Group page | `/groups/:id` | a group's expenses and balances | header (name, type, settings gear), add expense, settle up, expense list, right rail: balances, whiteboard, totals / charts / export links | empty, filled, settled, simplified, loading, not-a-member |
| S09 | Friend page | `/friends/:id` | one-to-one expenses with a friend, balance breakdown by group | header, balance per group, expense list, remind button, export | empty, filled, settled |
| S10 | Add / edit expense | modal from any page | create or change an expense | description, amount, currency picker, date, category picker, paid-by picker (single or multiple), split-method tabs (equal, exact, percent, shares, adjustment, reimbursement, itemized), notes, receipt upload, recurring, group picker, participants | empty, validation errors (sums don't match), loading, edit mode |
| S11 | Expense detail | `/expenses/:id` or sheet | full breakdown, comments, history | shares table, receipt image, comments thread, change log, edit / delete | filled, deleted (restore), loading |
| S12 | Settle up | modal | record a payment between two people | payer, payee, amount (defaults to full balance), currency, date, group, notes | prefilled, error |
| S13 | Create group | modal / `/groups/new` | start a group | name, type, members (email or name), invite link | empty, error |
| S14 | Group settings | `/groups/:id/settings` | edit name, type, cover, members, simplify debts, default split, whiteboard, leave, delete | form, member list (remove only if settled), toggles | filled, cannot-remove (balance), confirm delete |
| S15 | Add friend | modal | add by name and optional email, or invite | form, pending-invite state | empty, duplicate, error |
| S16 | Account settings | `/account` | profile, password, default currency, language, time zone, avatar, delete account, log out everywhere | form sections | filled, error, confirm delete |
| S17 | Notification settings | `/account/notifications` | which emails to receive | toggle list | filled |
| S18 | Group totals | `/groups/:id/totals` | spending totals per month or all time | stat cards, month picker | empty, filled |
| S19 | Charts | `/groups/:id/charts`, `/charts` | spending by category and over time | bar / donut charts, filters | empty, filled |
| S20 | Search | sidebar search, `/expenses?q=` | find any expense | search input, results list | empty results, filled |
| S21 | Join via invite link | `/join/:code` | accept an invite to a group | preview card, join button | signed out (redirect), already member, invalid link |
| S22 | Export | from group / friend settings | download CSV of a group or friend, JSON backup of the account | download buttons | ready, generating |
| S23 | Currency conversion | from group / friend page | convert all expenses to the user's default currency | confirm dialog with rate preview | nothing-to-convert, preview, done |
| S24 | Receipt scan | from add expense | upload a receipt, auto-fill items and total | upload, progress, parsed items editor | uploading, parsing, parsed, failed |
| S25 | Recurring expenses | `/expenses/recurring` | see what repeats and when next | list with next date, cancel future | empty, filled |
| S26 | Deleted items | `/trash` | restore deleted expenses and groups | list with restore | empty, filled |
| S27 | Not found / no access | any bad route | polite dead end | message, link home | — |

## Flows

```
F01 Add an expense to a group
    S08 group page -> S10 add expense (fill, pick split) -> save -> S08 updated, balances recalculated
    happy path clicks: 4 (Add expense, amount, description, Save)
    edge: split sums don't match total, zero participants, amount with 3 decimals,
          currency differs from group's last currency, recurring set, receipt attached

F02 Settle up with a friend
    S05 dashboard or S09 friend page -> S12 settle up (amount prefilled) -> save -> balance zero, payment row in list
    happy path clicks: 2
    edge: partial amount, settle in a group vs overall, multi-currency balance (one currency per payment),
          simplify debts changes who pays whom

F03 Create a group and invite people
    S05 -> S13 create group (name, type, members) -> S08 empty group -> copy invite link
    happy path clicks: 4
    edge: member with no email (placeholder user), invite link used by signed-out person (S21 -> S02 -> S08)

F04 Add a friend and share a non-group expense
    S05 -> S15 add friend -> S09 friend page -> S10 add expense with no group -> S09 updated
    happy path clicks: 5
    edge: friend already exists, friend has no email, friend later signs up with that email (merge)

F05 Review and fix a wrong expense
    S06 activity -> S11 expense detail -> edit (S10) or delete -> activity logs the change -> restore from S26 if deleted
    happy path clicks: 3
    edge: another member edited it meanwhile, editing a recurring instance (future only), deleting a payment

F06 Comment on an expense
    S11 -> type comment -> post -> everyone on the expense notified
    happy path clicks: 2

F07 Itemize a bill (manual or from a receipt)
    S10 -> split method: itemized -> add items (or S24 scan) -> assign people to items -> tax / tip / discount split proportionally -> save
    happy path clicks: 6+
    edge: item with nobody assigned, items don't sum to total, scan fails

F08 Convert a group to one currency
    S08 -> Convert to USD -> S23 preview (rate per currency, date) -> confirm -> all expenses rewritten, activity logged
    edge: nothing to convert, rate fetch fails, expenses added after conversion

F09 Recurring rent
    S10 -> repeat: monthly -> save -> instance posted each month -> S25 shows next date -> cancel future
    edge: member removed from group, amount changed (future only)

F10 Understand a group's spending
    S08 -> Totals (S18) -> Charts (S19) -> Export CSV (S22)

F11 Leave or delete a group
    S14 -> leave (blocked if balance non-zero) or delete (any member; restorable from S26)
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary, secondary, ghost, danger, link | default, hover, focus, disabled, loading | all |
| Input | text, number (money), email, password, search | default, focus, error, disabled | S02-S04, S10, S12-S17 |
| Money input | with currency picker | focus, error | S10, S12 |
| Select / combobox | currency, category, group, member | open, searching, empty | S10, S12, S13 |
| Date picker | single | open, today | S10, S12, S18 |
| Avatar | user (initials or image), group (cover / icon) | sm, md, lg | sidebar, rows, headers |
| Sidebar nav | desktop rail, mobile sheet | active item, badge count | all signed-in |
| Expense row | expense, payment, recurring badge, deleted | hover, selected | S07, S08, S09 |
| Balance line | you owe / you are owed / settled, per currency | positive, negative, zero, asterisk | S05, S08, S09 |
| Stat card | label + money | — | S05, S18 |
| Split method tabs | equal, exact, %, shares, adjust, reimburse, items | active, invalid | S10 |
| Participant list | checkbox rows with per-person input | checked, unchecked, over/under | S10 |
| Modal / dialog | form, confirm | open, loading | S10, S12, S13, S15, S23 |
| Sheet (mobile) | bottom | open | S10, S12 on mobile |
| Toast | success, error, undo | — | all |
| Empty state | icon + line + action | — | S05-S09, S18-S20, S25, S26 |
| Skeleton | row, card | — | all lists |
| Activity row | icon / avatar, rich text, time | unread | S06 |
| Comment | avatar, text, time, delete | own, others | S11 |
| Chart | bar (over time), donut (by category) | empty | S19 |
| Tabs | totals: month / all time | active | S18 |
| Dropzone | receipt upload | idle, drag-over, uploading, preview | S10, S24 |
| Toggle | simplify debts, notifications | on, off | S14, S17 |
| Category picker | grouped by parent category with icons | open, searching | S10 |

## Inferred data model

```
User       id, name, email (optional for placeholder users), avatar, defaultCurrency,
           locale, timeZone, notificationPrefs (json), createdAt
           evidence: API get_current_user, S16, help "add a friend without email"
           confidence: high

Friendship user A, user B, createdAt
           evidence: API get_friends, S09, "non-group expenses"
           confidence: high

Group      id, name, type (home | trip | couple | other), coverImage, simplifyDebts (bool),
           defaultSplit (json: method + per-member values), whiteboard (text),
           inviteCode, createdBy, deletedAt
           evidence: API group object, S13, S14, help simplify debts
           confidence: high (defaultSplit shape: medium)

GroupMember group, user, joinedAt
           evidence: API members[]; removal blocked when balance non-zero
           confidence: high

Expense    id, group (nullable = non-group), description, notes, amount (cents),
           currency, date, category, splitMethod (equal | exact | percent | shares |
           adjustment | reimbursement | itemized), isPayment (bool), receiptImage,
           repeat (never | weekly | fortnightly | monthly | yearly), nextRepeat,
           recurringParentId, emailReminder, createdBy, updatedBy, deletedAt, deletedBy
           evidence: API expense object, S10, help recurring / reimbursement
           confidence: high

ExpenseShare expense, user, paidShare (cents), owedShare (cents)
           evidence: API users[].paid_share / owed_share, net = paid - owed
           confidence: high. Multiple payers = multiple rows with paidShare > 0.

ExpenseItem expense, name, amount (cents), assignees[] (for itemized)
           evidence: S10 itemized description, Pro itemization
           confidence: medium (stored for editing; shares are the source of truth for balances)

Comment    expense, user, content, createdAt, deletedAt
           evidence: API comments
           confidence: high

Activity   actor, type (expense_added | expense_updated | expense_deleted | expense_restored |
           comment_added | group_created | group_updated | group_deleted | member_added |
           member_removed | friend_added | payment_recorded | simplify_toggled | currency_converted),
           subject refs (expense / group / user), recipients[] (who sees it), payload (diff),
           createdAt, readBy[]
           evidence: API notification types 0-15, help "recent activity" / change history
           confidence: high

Balance    derived, never stored: per (userA, userB, group, currency) sum of net shares,
           plus simplified graph per group when simplifyDebts is on
           evidence: help dashboard balances, simplify debts per currency
           confidence: high

Category   id, name, parent, icon  (seeded: ~15 parents, ~90 subcategories)
           evidence: API get_categories
           confidence: high

Currency   code, symbol  (seeded, ISO 4217, ~150)
           evidence: API get_currencies
           confidence: high

ExchangeRate base, quote, rate, fetchedAt (cached from Frankfurter)
           confidence: design choice
```

Relationships: User n-n User via Friendship; User n-n Group via GroupMember;
Group 1-n Expense (nullable); Expense 1-n ExpenseShare; Expense 1-n ExpenseItem;
Expense 1-n Comment; Expense 1-n Expense (recurring parent); Activity n-n User (recipients).

## Feature matrix

See `features.csv`. Must: 53, should: 16, could: 7, skip: 6.

## Out of scope (cannot or should not be cloned)

- Card transaction import: needs a bank aggregator (Plaid) and regulated agreements.
- Splitwise Pay and the Splitwise Card: a regulated payments product with a partner bank.
- Venmo / PayPal / Paytm in-app payment rails: partner integrations. The clone records payments; it does not move money.
- Their currency rate provider and their OCR vendor: the clone uses Frankfurter and the Claude API with the user's keys.
- Their public calculators and blog: marketing content, not product.
- Native iOS / Android apps: web only, responsive.

## Size

Screens 27, flows 11, entities 12. Hard parts: (1) the split engine with seven
methods, multiple payers, rounding to the cent and itemized tax/tip
allocation; (2) balance derivation and debt simplification per currency, live;
(3) recurring expenses with a scheduler and edit-future-only semantics; (4)
currency conversion that rewrites history safely; (5) receipt OCR and the
items editor. Size: L. A working core loop is days; full parity with every
state is weeks.
