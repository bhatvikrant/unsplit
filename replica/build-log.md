# Build log: UnSplit

| screen | date | status | notes |
| --- | --- | --- | --- |
| S01 Landing | 2026-10-15 | done | own copy, six feature cards, redirects when signed in |
| S02 Sign up | 2026-10-15 | done | email + password, Google button (needs AUTH_GOOGLE_ID/SECRET), placeholder users are claimed on sign-up |
| S03 Log in | 2026-10-15 | done | wrong-password message normalised |
| S04 Forgot / reset | 2026-10-15 | done | 8-digit code via Resend; clear error when email is not configured |
| S05 Dashboard | 2026-10-15 | done | totals row, you owe / you are owed lists, settle-up per friend, empty state |
| S06 Recent activity | 2026-10-15 | done | 19 activity types rendered, unread badge, mark read on open, paging |
| S07 All expenses | 2026-10-15 | done | month grouping, search by description/notes, paging by date cursor |
| S08 Group page | 2026-10-15 | done | balances rail with who-pays-whom and inline settle, whiteboard, invite link, export, convert, deleted banner |
| S09 Friend page | 2026-10-15 | done | per-group breakdown, reminder email, export, convert, remove when settled |
| S10 Add / edit expense | 2026-10-15 | done | seven split methods with live preview, multiple payers, category auto-suggest, receipt upload + scan, recurring, notes, scope move. Harder than expected: edit hydration vs the suggestion effect (fixed with a ref) |
| S11 Expense detail | 2026-10-15 | done | shares, items, receipt, notes, comments, change history, delete with undo toast, restore |
| S12 Settle up | 2026-10-15 | done | amount prefilled from the simplified debt, one payment per currency |
| S13 Create group | 2026-10-15 | done | type, existing friends, new people by name/email, simplify toggle |
| S14 Group settings | 2026-10-15 | done | cover, name, type, members (remove blocked while unsettled), simplify, default split, whiteboard, invite reset, delete |
| S15 Add friend | 2026-10-15 | done | name and/or email; invite email when configured |
| S16 Account | 2026-10-15 | done | avatar, name, currency, time zone, JSON backup, sign out everywhere, delete account |
| S17 Notifications | 2026-10-15 | done | eight toggles |
| S18 Group totals | 2026-10-15 | done | six metrics per currency, month or all time |
| S19 Charts | 2026-10-15 | done | by month bars, by category stacked bar + table; palette validated with the dataviz checks |
| S20 Search | 2026-10-15 | done | top bar and All expenses |
| S21 Join via link | 2026-10-15 | done | signed-out preview, sign up / log in redirect back |
| S22 Export | 2026-10-15 | done | CSV per group / friend, JSON for the account |
| S23 Currency conversion | 2026-10-15 | done | Frankfurter rates, preview, original amounts kept, logged |
| S24 Receipt scan | 2026-10-15 | done | Claude API; fills items, tax, tip, date, merchant |
| S25 Recurring list | 2026-10-15 | done | next date, stop repeating |
| S26 Deleted items | 2026-10-15 | done | expenses and groups, restore |
| S27 Not found | 2026-10-15 | done | |

Not built: offline entry (no queue). Settled friends are not auto-hidden after 30 days.
