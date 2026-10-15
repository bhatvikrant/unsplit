# Test plan: UnSplit

Unit (vitest, `npm test`): the split engine and money helpers. 13 tests: rounding
sums to the total for 500 random weights, every split method, multiple payers,
reimbursement direction, simplify-debts preserves nets.

End to end (Playwright, `npm run test:e2e`, needs the dev server and backend up):

| flow | spec | covers |
| --- | --- | --- |
| F03 create group, F01 equal split | core: sign up… | sign-up, empty state, placeholder members, 33.34/33.33/33.33, balances |
| F01 every split method | core: exact, percent… | exact must sum (save disabled until it does), percent, shares + multiple payers, adjustment, itemized derives the total |
| F05, F06 | core: expense detail | comment, edit hydrates values, history shows what changed, delete, restore from trash |
| F02, F10 | core: settle up… | payment prefilled, activity feed, search, totals, charts, CSV download |
| F11 group settings | core: group settings | simplify toggle logged, whiteboard, member removal blocked while unsettled |
| placeholder claim | core: placeholder claim | Bea signs up with the invited email and the group is already hers; she sees "You owe" |
| F04 friend + non-group | core: friend page | add friend by name, non-group expense, account name save, notification toggle, recurring empty state |
| mobile 390px | mobile | menu sheet, group + expense on a phone, no horizontal overflow |

Edge cases covered by unit tests rather than UI: 0-decimal currencies, 3-decimal
currencies, negative inputs, empty participants, items with nobody assigned,
discount larger than the items.

Not automated (manual, needs keys): Google sign-in, password reset email,
invite emails, receipt OCR, currency conversion against the live rate API.
