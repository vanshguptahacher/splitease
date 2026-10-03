# SplitEase — Phase 5: Balances and Settle-Up

**Depends on:** `prd.md` (v1.1) and finished Phases 1 to 4 (`phase-4-done` tag)
**Goal:** Everyone can see, in plain words, who owes whom and how much, and can settle up safely. The balance math is exact to the paisa and runs **on the server**. Settling a payment is a small, safe, two-sided flow (the payer says "I paid", the receiver confirms). This phase also replaces the "settled" stubs from Phase 3 so leaving, removing, deleting a group and deleting an account finally respect real balances.
**Rule:** Work **one sub-phase at a time. STOP after each sub-phase**, test, and confirm before moving on. Backend (5.1 to 5.4) is built and tested **before** any screen.

> **UX stance:** nobody should have to do arithmetic. The top of the Balances tab says one thing: "You are owed ₹960", "You owe ₹240" or "All settled up". Below it, a short list of **who pays whom** (as few payments as possible), each with one button. Settling takes two taps and the app never makes the user guess what happens next.

---

## 0. Scope

### In scope
- Table: `settlements`; new activity types
- Balance engine: net balance per person, **simplified payments** (suggestions), per-group overview, home overview
- Settlement lifecycle: **create, confirm, dispute, cancel (and a 10-minute undo for the receiver)**, with methods **cash** and **other**
- Replacing the Phase 3 stubs `member_is_settled()` and `group_is_settled()`, and the unsettled part of `account_deletion_blockers()`
- Screens: Balances tab, settle-up sheets, pending payments, payment history, home totals, badges
- SQL tests (including random "property" tests) for every rule

### Out of scope (later phases)
- The **UPI** payment method: deep link, "no UPI app" handling, transaction reference (Phase 6)
- Push notifications and the "Remind" button (Phase 7). Until then, people see waiting actions through badges and the Activity tab
- Pairwise (non-simplified) debt view, changing the amount while confirming, itemized settlements (v2)
- Cloudflare Workers or any extra backend

> **Scope note:** the PRD put the confirm/dispute/cancel flow in Phase 6. It moves **here**, because without it a "cash payment" could be recorded by one person and silently wipe a debt. Phase 6 will only add the UPI method on top of this lifecycle.

---

## 1. Decisions to confirm before 5.1

| # | Decision | Recommendation (assumed if you don't change it) |
|---|----------|------------------------------------------------|
| D25 | Where the settlement lifecycle is built | **Here (Phase 5)**, methods `cash` and `other` only. Phase 6 adds `upi` |
| D26 | Who confirms a payment | **Payer records "I paid" → pending → receiver confirms.** If the **receiver** records "I received", it is confirmed immediately (the receiver is the authority on receiving money) |
| D27 | Undoing a confirmed payment | **Receiver only, within 10 minutes**, and only while both people are still in the group. After that it is final; a mistake is corrected with a new payment in the other direction |
| D28 | Which debts the app shows | **Simplified payments only** (fewest payments). No raw pairwise view in v1 |
| D29 | Paying more than you owe | **Allowed**, with a clear warning ("Priya will owe you ₹200 back") |
| D30 | Partial payments | **Allowed** |
| D31 | What blocks leaving, removing, deleting a group or deleting an account | **A non-zero balance, or any `pending` settlement involving the person.** `disputed` payments do **not** block (they don't change balances, and both sides can resolve them). *This replaces the earlier wording "pending or disputed" used in the account-deletion prompt* |
| D32 | Payment fields | Method (`cash` or `other`), optional note up to 100 characters |
| D33 | Amount limits | Same as expenses: ₹0.01 to ₹1,00,00,000 |
| D34 | Spam guards | At most **10 pending payments per person per group**, and **no second pending payment** with the same payer, receiver and amount |
| D35 | History | Settlements are **never deleted**; a cancelled payment stays visible in history |
| D36 | Until notifications exist (Phase 7) | Show **badges** ("1 payment to confirm") on the group row, the Balances tab and the Activity tab |

---

## 2. UX rules for this phase

1. **Say it in words, never as a signed number.** "You are owed ₹960", "You owe Priya ₹300", "Rahul owes you ₹300", "All settled up". Never "−300".
2. **Colors never carry meaning alone:** green with "owed", orange with "owe", always with text.
3. **One action per row.** A payment that involves you has one button: **Settle up** (you owe) or **Mark as received** (you are owed).
4. **Pre-fill the exact amount** from the suggested payment. Changing it is one tap on the same big keypad used for expenses.
5. **Always say what happens next**, e.g. "Sent to Priya. You'll be settled once she confirms."
6. **Receiver actions are one tap, with Undo.** Confirming shows "Confirmed ₹300 from Rahul · UNDO". "I didn't receive this" explains it first, then acts.
7. **Warn, don't block,** on overpayment: a clear line under the amount.
8. **Suggestions are not fixed debts.** The screen says: "Suggested payments update when expenses change."
9. **No dead ends:** "All settled up" is a proper empty state; pending items always show who has to act.
10. Everything uses the Phase 1 to 4 components: skeletons, empty and error states, snackbars with Undo, the amount keypad, Indian ₹ formatting.

---

## 3. Data model

```
groups (Phase 3)
   │ on delete cascade
   ├──< expenses >──< expense_splits (Phase 4)
   └──< settlements ──► from_user, to_user, created_by ──► profiles (no cascade)
```

### `settlements`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| group_id | uuid FK groups | **on delete cascade** |
| from_user | uuid FK profiles | the payer (the one who paid money) |
| to_user | uuid FK profiles | the receiver |
| amount_minor | bigint | paise, 1 to 1,000,000,000 |
| currency | text | `INR` only (check, opened in Phase 7) |
| method | text | `cash`, `other`, `upi` (the check allows all three; the functions accept only `cash` and `other` until Phase 6) |
| note | text | optional, max 100 |
| upi_txn_ref | text | unused until Phase 6 |
| status | text | `pending`, `confirmed`, `disputed`, `cancelled` |
| created_by | uuid FK profiles | must be the payer or the receiver |
| client_request_id | uuid | unique per creator; makes "save" safe to retry |
| created_at, updated_at, status_changed_at | timestamptz | |
| confirmed_at | timestamptz | set **only** while the status is `confirmed` (null otherwise); used for the undo window |

Constraints: `from_user <> to_user`; `created_by in (from_user, to_user)`; `(status = 'confirmed') = (confirmed_at is not null)`; unique `(created_by, client_request_id)`; **partial unique index** on `(group_id, from_user, to_user, amount_minor) where status = 'pending'` (no duplicate pending payments).

> **Foreign keys to `profiles` must NOT use `on delete cascade`** (smart account deletion keeps a "Deleted user" row when settlements still point at it).

### `activity_log` (changed)
The `action` check gets four new values: `settlement_created`, `settlement_confirmed`, `settlement_disputed`, `settlement_cancelled`.

### The balance formula
For each person in a group:

```
net = (total of expenses they paid)
    − (total of their shares in those expenses)
    + (confirmed payments they sent)
    − (confirmed payments they received)
```

- Only expenses with `deleted_at is null` count. Only settlements with status `confirmed` count.
- **net > 0** means the person is owed money. **net < 0** means they owe money.
- Because every expense's shares add up to its amount (Phase 4) and every payment has one sender and one receiver, **the nets of a group always add up to exactly 0**.

### Invariants (must always hold)
1. In every group, **the sum of all nets is exactly 0**.
2. A person who has **left or been removed** always has net 0 and no pending payments (leaving requires being settled), so only active members ever have a non-zero balance.
3. Only `confirmed` payments change balances. Pending, disputed and cancelled never do.
4. A payment is always between two **different** people who were **active members** when it was created.
5. Executing all suggested payments would bring every balance to exactly 0.
6. Clients have **no direct access** to `settlements`.
7. Every status change writes an activity entry **in the same transaction**.

---

## 4. Simplify debts (the algorithm)

Input: the nets of the group. Output: a short list of "A pays B ₹X".

1. Creditors = people with net > 0. Debtors = people with net < 0 (use the absolute value).
2. Repeat: take the **largest creditor** and the **largest debtor** (ties broken by smaller `user_id`). Create a payment `from debtor to creditor` of `min(creditor amount, debtor amount)`. Subtract it from both. Stop when nobody is left.
3. Result: at most **n − 1** payments for n people with a non-zero balance. Every payment is greater than 0, goes from a debtor to a creditor, and the output is **deterministic** (same data, same list).

> Suggestions are **not** real obligations between two people. They are the cheapest way to clear everyone. When expenses change, the suggestions can change.

### Shared test vectors (hand-calculated; members `a < b < c < d` by user id)

| # | Scenario | Expected nets | Expected suggested payments |
|---|----------|---------------|-----------------------------|
| 1 | `a` paid ₹300, equal among a, b, c | a +200, b −100, c −100 (in rupees) | b→a 100, c→a 100 |
| 2 | `a` paid ₹100 (10000 paise), equal among a, b, c | a +6666, b −3333, c −3333 (paise) | b→a 3333, c→a 3333 |
| 3 | `a` paid ₹300 for a, b (150 each); `b` paid ₹300 for a, b (150 each) | all 0 | none |
| 4 | `a` paid ₹200 for `b` only; `b` paid ₹200 for `c` only | a +200, b 0, c −200 | **c→a 200** (one payment, not two) |
| 5 | Vector 1, then confirmed payment b→a ₹100 | a +100, b 0, c −100 | c→a 100 |
| 6 | Vector 1 plus a **pending** payment b→a ₹100 | unchanged from vector 1 | unchanged from vector 1 |
| 7 | Vector 1 plus a **disputed** and a **cancelled** payment | unchanged from vector 1 | unchanged from vector 1 |
| 8 | Vector 1, then confirmed overpayment c→a ₹150 | a +50, b −100, c +50 | b→a 50, b→c 50 (tie: `a` first by id) |
| 9 | Vector 1, then the expense is soft-deleted | all 0 | none |
| 10 | `a` paid ₹400, equal among a, b, c, d | a +300, b −100, c −100, d −100 | b→a 100, c→a 100, d→a 100 |
| 11 | `a` paid ₹600 for a, b, c (200 each); `b` paid ₹300 for b, c, d (100 each) | a +400, b 0, c −300, d −100 | c→a 300, d→a 100 |
| 12 | Vector 1, then the deleted expense is restored | same as vector 1 | same as vector 1 |

Every vector must also satisfy: **sum of nets = 0**, and **applying the suggested payments leaves every net at 0**.

**Property test (random):** the SQL tests also generate several hundred random groups (random payers, split types, amounts, confirmed payments) with a fixed random seed and assert the invariants above.

---

## 5. Error codes and messages

| Code | What the user sees |
|------|--------------------|
| `not_authenticated` | "Please sign in again." |
| `not_a_member` | "You're no longer in this group." (and go back to the list) |
| `settlement_not_found` | "This payment no longer exists." |
| `settlement_not_allowed` | "You can't do that with this payment." |
| `invalid_settlement` | "Choose two different people." |
| `payer_not_member` | "[Name] is no longer in this group." |
| `receiver_not_member` | "[Name] is no longer in this group." |
| `invalid_amount` | "Enter an amount between ₹0.01 and ₹1,00,00,000." |
| `invalid_method` | "Choose how the payment was made." |
| `invalid_note` | "Keep the note under 100 characters." |
| `duplicate_pending` | "There's already a pending payment of that amount. Wait for it to be confirmed, or cancel it first." |
| `too_many_pending` | "You have too many pending payments in this group. Wait for some to be confirmed." |
| `invalid_transition` | "This payment was just updated. We've refreshed it." |
| `undo_window_passed` | "It's too late to undo this. Record a new payment to correct it." |
| `settlement_locked` | "Someone in this payment has left the group, so it can't be changed." |
| `member_not_settled` *(Phase 3, now real)* | "Settle up first, then you can do this." (the app opens the Balances tab) |
| `group_not_settled` *(Phase 3, now real)* | "Everyone needs to settle up before the group can be deleted." |
| `unsettled_balances` *(Phase 2/3, now real)* | "Settle up with your groups first, then you can delete your account." |

---

## 6. Case Matrix (every case that must be handled)

> Each sub-phase lists the case IDs it must satisfy. At the end of Phase 5, walk through the whole matrix with **4 test accounts** (a, b, c, d) on real phones, including one account that is an admin and one that is an outsider.

### BC. Balance calculation (server)

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| BC1 | Any group, any history | The sum of all nets is **exactly 0** |
| BC2 | Net formula | paid − share + confirmed sent − confirmed received |
| BC3 | Expense soft-deleted, then restored | Excluded while deleted; counted again when restored |
| BC4 | Pending, disputed or cancelled payments | Never change a balance |
| BC5 | An expense is edited (amount, split, payer, participants) | Balances change accordingly and still sum to 0 |
| BC6 | Group with no expenses | Everyone is at 0 |
| BC7 | The payer is not in the split (paid for others) | Payer is owed the full amount |
| BC8 | The payer is the only participant | Net 0 for everyone |
| BC9 | Very large totals (many expenses near the ₹1 crore limit) | No overflow (64-bit integers) |
| BC10 | A person who left or was removed | Net is always 0 (guaranteed by the leave rules; proven by tests) |
| BC11 | A person rejoins | Starts at 0 |
| BC12 | ₹100 split among 3 | Nets are +66.66, −33.33, −33.33 in paise terms with no lost paisa |
| BC13 | Caller is not an active member | `not_a_member` |
| BC14 | Reading balances | Members, suggested payments and my net come from **one call** (one database snapshot), so they always agree |

### BS. Simplified payments

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| BS1 | Number of suggested payments | At most n − 1 for n people with a non-zero balance |
| BS2 | Executing every suggested payment | Brings every balance to exactly 0 |
| BS3 | Same data twice | Identical output (deterministic ties by `user_id`) |
| BS4 | A pays B and B pays C | Collapses to one payment A→C (vector 4) |
| BS5 | Everyone settled | Empty list; the app shows "All settled up" |
| BS6 | Each payment | Amount greater than 0, from a debtor to a creditor, never between two creditors or two debtors |
| BS7 | A person with a zero balance | Never appears in a suggestion |
| BS8 | Expenses change | Suggestions may change; the screen says so |
| BS9 | 50 members and about 5,000 expenses | Balances load in well under half a second on a normal connection |
| BS10 | Random property test | Hundreds of random groups all satisfy BC1, BS1, BS2, BS6, BS7 |
| BS11 | All 12 shared vectors | Expected nets and payments exactly as listed |

### SC. Creating a payment

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| SC1 | Payer records "I paid ₹X" | Status `pending`; receiver must confirm |
| SC2 | Receiver records "I received ₹X" | Status `confirmed` at once; Undo available (ST6) |
| SC3 | Someone who is neither payer nor receiver (including an admin) tries to create it | `settlement_not_allowed` |
| SC4 | Payer and receiver are the same person | `invalid_settlement` |
| SC5 | Either person is not an active member | `payer_not_member` or `receiver_not_member` |
| SC6 | Amount below ₹0.01 or above ₹1,00,00,000, or not a whole number of paise | `invalid_amount` |
| SC7 | Method other than `cash` or `other` (including `upi` until Phase 6) | `invalid_method` |
| SC8 | Note over 100 characters, or with control characters | Rejected or cleaned |
| SC9 | Double tap, or a retry after a timeout | **Exactly one** payment (`client_request_id`) |
| SC10 | Amount **more** than owed | Allowed; the sheet shows the warning "[Name] will owe you ₹X back" (D29) |
| SC11 | Opening "Settle up" from a suggested payment | The exact suggested amount is pre-filled |
| SC12 | Amount **less** than owed | Allowed (partial payment, D30); the sheet shows what will remain |
| SC13 | Offline | Button disabled with an explanation |
| SC14 | "Record a payment" with someone who is not in the suggestions | Allowed from the Balances menu: choose person, direction, amount |
| SC15 | A pending payment with the same payer, receiver and amount already exists | `duplicate_pending` (also enforced by a unique index, so a race cannot create two) |
| SC16 | 10 pending payments already created by this person in the group | `too_many_pending` |
| SC17 | Payment where the creator is the payer, but the receiver has a pending payment to the payer | Allowed (they are different payments) |

### ST. Payment status changes

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| ST1 | Receiver confirms a pending payment | Status `confirmed`, `confirmed_at` set, balances update immediately, activity entry |
| ST2 | Receiver marks a pending payment "I didn't receive this" | Status `disputed`; balances unchanged; both people see it |
| ST3 | Receiver later confirms a disputed payment | Allowed; becomes `confirmed` |
| ST4 | Payer cancels a pending payment | Status `cancelled` |
| ST5 | Payer cancels a disputed payment | Status `cancelled` |
| ST6 | Receiver undoes a **confirmed** payment within 10 minutes | Status `cancelled`; balances revert; `confirmed_at` cleared |
| ST7 | Payer tries to confirm their own payment | `settlement_not_allowed` |
| ST8 | Receiver tries to cancel a pending or disputed payment | `settlement_not_allowed` (the receiver disputes or confirms instead) |
| ST9 | Any move that is not in the allowed list (for example confirming a cancelled payment, or disputing a confirmed one) | `invalid_transition` |
| ST10 | The same action twice (double tap) | Silent no-op: no error, no extra activity entry |
| ST11 | Confirm and cancel at the same moment | Exactly one wins; the other gets `invalid_transition` |
| ST12 | Undo after 10 minutes | `undo_window_passed` |
| ST13 | Undo of a confirmed payment when either person has since left the group | `settlement_locked` (otherwise a person who left would suddenly have a balance again) |
| ST14 | Confirming a disputed payment when either person has since left | `settlement_locked` |
| ST15 | Disputed payments and leaving | A `disputed` payment does **not** block leaving; a `pending` payment **does** |
| ST16 | Every successful change | Exactly one activity entry; none for failed or no-op calls |
| ST17 | Third person (not payer or receiver, even an admin) tries any status change | `settlement_not_allowed` |
| ST18 | Receiver-created (instantly confirmed) payment | The receiver can undo it within 10 minutes (ST6); the payer cannot change it |

### SB. Settled status and the Phase 3 / Phase 2 hooks (now real)

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| SB1 | `member_is_settled` | True only if the person's net is 0 **and** they have no `pending` payment (as payer or receiver) in that group |
| SB2 | Leaving with a non-zero balance | `member_not_settled` (Phase 3 case GM7, now real) |
| SB3 | Admin removes a member with a non-zero balance | `member_not_settled` (GM2, now real) |
| SB4 | Deleting a group with any non-zero balance or pending payment | `group_not_settled` (GE5, now real) |
| SB5 | Deleting an account | `account_deletion_blockers()` lists every group where the user is not settled, with the amount; `delete_my_account()` raises `unsettled_balances` (GD4, now real; there is no force option) |
| SB6 | Sole-admin rule | Still applies independently |
| SB7 | After settling everything | Leaving, removing, deleting the group and deleting the account all work |
| SB8 | A group where everything is settled but expenses exist | Can be deleted (the dialog warns the history is removed for everyone) |
| SB9 | A balance off by even 1 paisa | Still blocks (the rule is exactly 0) |
| SB10 | A person rejoins after leaving | Balance 0, no pending payments |
| SB11 | When a leave or remove is blocked | The app opens the group's Balances tab with the message "Settle up first" |

### SH. Payment history

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| SH1 | History list | Newest first; status chips (Waiting, Confirmed, Not received, Cancelled); infinite scroll (30 per page); skeleton, empty state, error state, pull to refresh |
| SH2 | Row text | "Rahul paid Priya ₹300 · Cash · Confirmed" |
| SH3 | Buttons | Shown only to the involved people and only when allowed (`can_confirm`, `can_dispute`, `can_cancel`, `can_undo` come from the server) |
| SH4 | Names | Former members show their name; deleted accounts show "Deleted user" |
| SH5 | Settlement detail | Amount, method, note, status, who did what and when |
| SH6 | Empty history | "No payments yet." |
| SH7 | Pagination | Stable while new payments arrive (keyset on `created_at`, `id`) |
| SH8 | Visibility | Every active member can see all of the group's payments (same transparency as expenses) |

### HO. Home overview

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| HO1 | Top card on the Groups tab | "You are owed ₹X in total" / "You owe ₹Y in total" / "All settled up", computed by the server |
| HO2 | Each group row | My balance in words ("you owe ₹300", "you're owed ₹960", "settled up") |
| HO3 | A zero balance | "settled up", not "₹0" |
| HO4 | Group rows and the group's Balances tab | Show the same number after a refresh |
| HO5 | After an expense or payment changes anything | Both are refreshed by cache invalidation |
| HO6 | Groups I left | Not counted |
| HO7 | Totals | Come from `get_my_balance_summary()`, never added up in the app |
| HO8 | Large amounts | Indian grouping, never cut off |
| HO9 | Payments waiting for **my** confirmation | A badge on the group row, on the Balances tab, and a count in the summary |
| HO10 | Net total when I am owed in one group and owe in another | Both numbers are shown separately plus the net |

### BU. Balances tab (screen)

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| BU1 | Top card | "You are owed ₹X", "You owe ₹X" or "All settled up" |
| BU2 | Suggested payments | Sentences: "You owe Priya ₹300" with **Settle up**; "Rahul owes you ₹300" with **Mark as received**; others as "Rahul pays Priya ₹300" without a button |
| BU3 | Everyone's balances | You first, then largest absolute amount; wording "gets back ₹X" / "owes ₹X" / "settled" |
| BU4 | Pending section | Items needing my action first (Confirm / I didn't receive this), then my own waiting payments (Cancel) |
| BU5 | Nothing owed | Proper empty state "All settled up" |
| BU6 | Loading, error, refresh | Skeleton, error with Retry, pull to refresh |
| BU7 | Copy under the suggestions | "Suggested payments update when expenses change." |
| BU8 | Offline | All actions disabled with an explanation |
| BU9 | I was removed or the group was deleted while the screen is open | `not_a_member` → message and back to the list |
| BU10 | After I settle, confirm or cancel | The screen updates without a manual refresh |
| BU11 | Receiver actions | Show an Undo snackbar (8 seconds) |
| BU12 | Menu | "Record a payment" (SC14) and "Payment history" |

### BG. Interplay with groups, expenses and accounts

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| BG1 | Group deleted | Cascades to settlements and activity |
| BG2 | Account deletion | A profile referenced by settlements is **anonymized**, never hard-deleted (foreign keys must not cascade) |
| BG3 | Leave or remove with a pending payment involving the person | Blocked until the payment is confirmed or cancelled |
| BG4 | An expense is edited or deleted after payments were confirmed | Balances change; no payment is touched; the person may owe or be owed something new |
| BG5 | Locked expenses (Phase 4) | Unaffected |
| BG6 | Activity feed | Shows settlement entries, e.g. "Rahul paid Priya ₹300 · waiting for confirmation" |
| BG7 | Group list ordering | A payment counts as activity (`last_activity_at`) |

### BZ. Security

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| BZ1 | Direct select, insert, update or delete on `settlements` (signed in or anonymous) | Denied |
| BZ2 | Anonymous RPC calls | Rejected; the user always comes from `auth.uid()` |
| BZ3 | Non-member calls any balance or settlement RPC | `not_a_member` |
| BZ4 | Admin or any third person creates or changes someone else's payment | `settlement_not_allowed` |
| BZ5 | Payer confirms own payment; receiver cancels a pending payment | `settlement_not_allowed` |
| BZ6 | Invalid amount, method, note or people sent straight to the API | Rejected with the codes in Section 5 |
| BZ7 | Function hardening | Every new function is `SECURITY DEFINER`, `search_path = ''`, execute revoked from `public` and `anon`; `compute_group_nets` and `compute_simplified_debts` are not callable by clients |
| BZ8 | Races | Settlement functions take a **shared** lock on the group row, then an **exclusive** lock on the settlement row (membership changes take an exclusive group lock) |
| BZ9 | Data from other groups | Never returned |
| BZ10 | Reusing a `client_request_id` | Returns only that user's own payment |
| BZ11 | Personal data in logs | None |
| BZ12 | Names in results | Only names (never email or UPI ID) |

### BD. UI and device

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| BD1 | Largest font, dark mode, 360dp width | Everything usable |
| BD2 | Offline | Banner; all writes disabled with an explanation |
| BD3 | Screen reader | Amounts read as rupees and paise; buttons labeled; status chips have text |
| BD4 | 50 members | The balances list scrolls smoothly |
| BD5 | Color | Never the only signal (text always present) |
| BD6 | Orientation | Locked to portrait |

---

## 7. Sub-phases

---

### 5.1 — Database: settlements, constraints, privileges

**Goal:** The table and its safety nets exist before any function or screen. (Cases: BZ1, BG1, BG2, SC15.)

**Tasks**
1. Confirm decisions D25 to D36 (or note your changes).
2. Migration `settlements_table`: the table, constraints, indexes and the partial unique index (SQL in Section 8.1).
3. Migration `activity_actions_settlements`: replace the `activity_log` action check with the extended list (`alter table ... drop constraint ...; add constraint ...`).
4. Row Level Security **on** with **no policies and no grants** for `anon` and `authenticated`.
5. Foreign keys to `profiles` are plain references (**no cascade**); the key to `groups` cascades.
6. Apply with `npx supabase db push` and regenerate types.
7. SQL tests: clients cannot select, insert, update or delete `settlements`; constraints reject bad amounts, `from_user = to_user`, a `created_by` that is not payer or receiver, unknown method or status, and a `confirmed` status without `confirmed_at` (and the reverse); the partial unique index rejects a second pending payment for the same payer, receiver and amount but allows it once the first is no longer pending; deleting a group cascades; deleting a profile row that a settlement references fails (proving there is no cascade).

**Acceptance**
- `npx supabase test db` passes
- In the dashboard: RLS on, zero policies, zero client privileges on `settlements`

**STOP.** Report the migrations and test output.

---

### 5.2 — Balance engine: nets, simplified payments, overview RPCs

**Goal:** Exact balances and the fewest payments, computed in the database. (Cases: BC1 to BC14, BS1 to BS11, HO1, HO7, BZ7, BZ9.)

**Tasks**
1. `tests/fixtures/balance-vectors.json` with the 12 vectors from Section 4 (fixed uuids so ordering is predictable).
2. `compute_group_nets(p_group)` returns one row per person (every active member plus anyone with expenses or confirmed payments) with their net in paise (Section 8.2).
3. `compute_simplified_debts(p_group)` implements the algorithm exactly as in Section 4 and returns `(seq, from_user, to_user, amount_minor)` in a stable order (Section 8.3).
4. Both are **internal**: execute revoked from every client role.
5. Client RPC `get_group_balances(p_group)` returns **one JSON object**: `members` (user id and net, largest first, ties by id), `payments` (the simplified list in `seq` order), `my_net_minor`, `pending_for_me` (count of pending payments waiting for my confirmation). Caller must be an active member. One call means one snapshot (BC14).
6. Client RPC `get_my_balance_summary()` returns `owed_to_me_minor`, `i_owe_minor`, `net_minor`, `groups_with_dues`, `pending_for_me`, across the groups where the caller is active.
7. Generate `supabase/tests/balance_vectors.sql` from the JSON file with a script (same pattern as Phase 4) and run all 12 vectors.
8. **Property test** in SQL: with a fixed seed, create several hundred random groups (2 to 10 members; random payers, split types, amounts, soft-deletes, restores, confirmed payments). Assert BC1, BS1, BS2, BS3 (call twice, compare), BS6 and BS7 for every group.
9. Performance check (BS9): a script that creates a group with 50 members and about 5,000 expenses and times `get_group_balances`. Record the time in the test log. If it is slow, note it for the Phase 8 hardening list (do not optimize now).

**Acceptance**
- All SQL tests pass, including the 12 vectors and the random property test
- Executing the suggested payments from vector 11 by hand brings every net to 0

**STOP.** Report the functions, test output and the performance timing.

---

### 5.3 — Settlement RPCs and the status machine

**Goal:** Every settlement rule enforced in the database. (Cases: SC1 to SC17, ST1 to ST18, SH1 to SH8, BZ2 to BZ6, BZ8, BZ10, BG6.)

**Tasks** (each function: `SECURITY DEFINER`, `search_path = ''`, user from `auth.uid()` only, execute revoked from `public` and `anon`, granted to `authenticated`)

| RPC | Rules |
|-----|-------|
| `create_settlement(p_group, p_client_request_id, p_from_user, p_to_user, p_amount_minor, p_method, p_note)` → id | Section 8.4. Shared lock on the group; caller must be an active member **and** be the payer or the receiver; idempotent on `(created_by, client_request_id)`; validates people, amount, method (`cash` or `other` only), note; both people must be active members; spam guards (D34); status is `confirmed` if the **receiver** created it, otherwise `pending`; writes the activity entry |
| `confirm_settlement(p_settlement)` | Receiver only. Allowed from `pending` or `disputed`. Already `confirmed` is a silent no-op. From `cancelled` it is `invalid_transition`. Both people must still be active (`settlement_locked`). Sets `confirmed_at` |
| `dispute_settlement(p_settlement)` | Receiver only, from `pending` only; already `disputed` is a no-op; other states are `invalid_transition` |
| `cancel_settlement(p_settlement)` | Section 8.5. The **payer** can cancel `pending` or `disputed`. The **receiver** can cancel `confirmed` only as an **undo**: within 10 minutes (`undo_window_passed`) and only while both people are still active (`settlement_locked`). Already `cancelled` is a silent no-op |
| `list_settlements(p_group, p_limit default 30, p_cursor jsonb default null)` | Active members only. Newest first, keyset pagination on `(created_at, id)`. Returns id, from_user, to_user, amount_minor, method, note, status, created_by, created_at, status_changed_at, confirmed_at and the caller's flags `can_confirm`, `can_dispute`, `can_cancel`, `can_undo` (computed with the same rules as the functions) |

**Locking order (always the same):** group row (shared) → settlement row (exclusive).

SQL tests (the heaviest file of the phase):
- The full permission table for payer, receiver, admin who is neither, member who is neither, outsider, anonymous, for every function
- Every legal transition, and every illegal pair, with the exact error code
- Idempotency of create and of each status change (no extra activity entries)
- Receiver-created payments are confirmed at once; payer-created are pending
- The 10-minute window: use a controlled clock (set `confirmed_at` in the past inside the test) to prove both sides of the limit
- `settlement_locked` when a person has left (disputed confirm and confirmed undo)
- Amount, method, note, people and spam-guard validations
- `list_settlements` flags match the rules for each role and status
- Activity entries: one per successful change, none for failures or no-ops
- Concurrency (record the results in the test log): confirm vs cancel at the same moment gives one winner; two identical pending creations at once give one row (and `duplicate_pending` for the second); a member leaving while a pending payment involving them is being created never leaves an orphan pending payment

**Acceptance**
- `npx supabase test db` passes with every function covered
- The permission and transition tables are proven by tests, not by reading code

**STOP.** Report functions, test output and the concurrency results.

---

### 5.4 — Replace the stubs and wire the integrations

**Goal:** The Phase 3 and Phase 2 rules become real. (Cases: SB1 to SB10, BG2, BG3, BG7, HO2, HO9.)

**Tasks**
1. Replace `member_is_settled(p_group, p_user)` and `group_is_settled(p_group)` with the real versions (Section 8.6). Keep the same names and signatures so Phase 3 functions need no change.
2. Fill the unsettled part of `account_deletion_blockers()`: `unsettled_groups` = every group where the caller is active and not settled, each with `id`, `name`, `my_net_minor`, `pending_count`. `delete_my_account()` already raises `unsettled_balances` when that list is not empty.
3. `list_my_groups()` gains `my_balance_minor` and `my_pending_actions` (pending payments waiting for **my** confirmation).
4. `list_activity()` includes the four settlement actions, with both people's names (server-side join; names only) and the amount, so the app can write "Rahul paid Priya ₹300 · waiting for confirmation".
5. Make a payment count toward `last_activity_at`.
6. **Re-run the Phase 3 cases against real data** (they were tested with stubs): GM2, GM7, GE5, GD4, plus the account-deletion cases (delete blocked while unsettled; allowed after settling; sole-admin still blocked; smart delete still hard-deletes an unreferenced profile and anonymizes a referenced one).

SQL tests: the full matrix SB1 to SB10, each with real expenses and payments; leave, remove, group delete and account delete with balances of exactly 0, exactly 1 paisa, and with only a pending payment; a disputed payment alone does not block.

**Acceptance**
- All SQL tests pass
- The four Phase 3 cases above pass with real balances and are marked pass in `docs/phase-3-test-log.md`

**STOP.** Report what changed, test output, and the re-run results.

---

### 5.5 — App: Balances tab (read-only)

**Goal:** The screen that explains the money. (Cases: BU1 to BU9, BU12 (menu entries only), BC14, BS5, BS8, BD1 to BD6.)

**Tasks**
1. `lib/api/settlements.ts`: wrappers for `get_group_balances`, `get_my_balance_summary`, `list_settlements`, `create_settlement`, `confirm_settlement`, `dispute_settlement`, `cancel_settlement`. **No direct table access.**
2. Query keys: `['group', id, 'balances']`, `['group', id, 'settlements']`, `['balanceSummary']`. After any expense or settlement write, invalidate these plus `['groups']` and `['activity']`.
3. `lib/money/balanceText.ts`: turns a net and a payment list into **plain-words structures** for the UI ("owed", "owe", "settled", "you owe Priya", "Rahul owes you", "Rahul pays Priya"). Pure functions with unit tests for every wording and for zero. The app **never adds or subtracts money**; it only formats numbers the server sent.
4. Map every new error code in Section 5 in `toFriendlyMessage()`.
5. **Balances tab** (the "Balances" segment in the group detail, replacing the Phase 3 placeholder): top card (BU1), suggested payments (BU2, no buttons yet except placeholders), everyone's balances (BU3), the copy line (BU7), skeleton, error, empty state "All settled up" (BU5), pull to refresh, offline banner behavior (BU8), `not_a_member` handling (BU9).
6. Names come from `get_group_members(group, true)` (Phase 3).

**Acceptance**
- BU1 to BU9 and BD cases tested with 4 accounts and the data from vectors 1, 4, 8 and 11 (recreate them with real expenses)
- The numbers on screen match the SQL results exactly
- `npm run check` passes

**STOP.** Report results case by case.

---

### 5.6 — App: settle flows

**Goal:** Pay, receive, confirm, dispute, cancel, undo. (Cases: SC1 to SC17, ST1 to ST12, ST17, ST18, BU4, BU10, BU11, BU12.)

**Tasks**
1. **Payer flow, "Settle up"** (button on "You owe Priya ₹300"): a bottom sheet with the amount pre-filled from the suggestion (SC11) and editable with the big keypad; method chips (**Cash**, **Other**); optional note; a live sentence under the amount:
   - equal to what you owe: "You'll be settled with Priya once she confirms."
   - less: "You'll still owe Priya ₹X." (SC12)
   - more: "That's ₹X more than you owe. Priya will owe you ₹X back." (SC10)
   The button reads "I paid Priya ₹300". It sends one `clientRequestId` per sheet session (SC9), is disabled while saving and offline (SC13), and afterwards shows "Sent to Priya for confirmation."
2. **Receiver flow, "Mark as received"** (button on "Rahul owes you ₹300"): the same sheet with "I received ₹300 from Rahul"; creates a payment that is confirmed at once and shows **"Confirmed ₹300 from Rahul · UNDO"** for 8 seconds (SC2, ST18). Undo calls `cancel_settlement`.
3. **Pending section** on the Balances tab (BU4):
   - for me as **receiver**: "Rahul says he paid you ₹300 (cash)" with **Confirm** and **I didn't receive this**. Confirm shows the Undo snackbar (ST1, ST6). "I didn't receive this" first shows a short explanation ("Rahul will see that you marked this as not received") and then calls `dispute_settlement` (ST2).
   - for me as **payer**: "Waiting for Priya to confirm ₹300" with **Cancel**; a disputed one reads "Priya says she didn't receive this" with **Cancel payment** (ST4, ST5).
   - a disputed payment shows the receiver a **Confirm** button too (ST3).
4. **"Record a payment"** (menu entry, SC14): choose the person, choose the direction ("I paid them" or "They paid me"), amount, method, note.
5. **Error handling:** `invalid_transition` shows the message and refreshes (ST11); `undo_window_passed` and `settlement_locked` show their messages (ST12 to ST14); `duplicate_pending` and `too_many_pending` show theirs (SC15, SC16); `payer_not_member` and `receiver_not_member` close the sheet with the message (SC5).
6. All sheets and buttons are disabled with an explanation when offline.

**Acceptance**
- SC, ST and BU cases tested with 4 accounts on real phones, including: payer pays more than owed, partial payment, receiver confirms, receiver disputes then confirms, payer cancels, receiver undoes inside the window, double tap on every button, confirm vs cancel on two phones at the same time, a person who leaves while a payment is pending
- After a full settle-up, every balance reads "settled up" on all phones

**STOP.** Report results case by case.

---

### 5.7 — App: history, home overview, badges, activity

**Goal:** Everything around the flow. (Cases: SH1 to SH8, HO1 to HO10, BG6, BG7, SB11, BU12.)

**Tasks**
1. **Payment history screen** (menu entry): infinite list from `list_settlements` with status chips and the row text from SH2, buttons driven by the server flags (SH3), a simple detail view (SH5), empty state (SH6).
2. **Home overview** on the Groups tab: a top card from `get_my_balance_summary()` (HO1, HO7, HO10), each group row showing my balance in words (HO2, HO3) and a badge when something waits for my confirmation (HO9). Show the same badge on the Balances segment of the group.
3. **Activity tab:** render the settlement entries with sentences such as "Rahul paid Priya ₹300 · waiting for confirmation", "Priya confirmed ₹300 from Rahul", "Rahul cancelled a payment of ₹300", "Priya marked a payment from Rahul as not received". "You" for your own actions; "Deleted user" for deleted accounts. Tapping opens the group's Balances tab.
4. **Blocked actions (SB11):** when leave, remove, delete group or delete account returns `member_not_settled`, `group_not_settled` or `unsettled_balances`, show the message and a button that opens the relevant Balances tab. The account-deletion screen lists the unsettled groups with amounts (from `account_deletion_blockers()`).
5. Refresh behavior: pull to refresh on every screen; invalidation after every write (HO5).

**Acceptance**
- SH, HO and the activity cases tested with 4 accounts
- Try to leave a group with a balance, remove a member with a balance, delete a group with a balance and delete an account with a balance: all four are blocked with a working "go to Balances" button; after settling, all four succeed

**STOP.** Report results case by case.

---

### 5.8 — Hardening, tests and handoff

**Goal:** Prove the matrix, lock the docs, tag the phase. (Cases: BZ1 to BZ12 and a full re-run of BC to BD.)

**Tasks**
1. **Security pass:**
   - confirm RLS is on, with no policies and no client privileges, on `settlements`
   - confirm every new function has `search_path = ''` and execute revoked from `public` and `anon`, and that `compute_group_nets` and `compute_simplified_debts` are not callable by clients
   - search the app for direct table access to `settlements` (must be none)
   - search for `service_role` (must be nowhere)
   - search for any addition, subtraction or comparison of money amounts in the app code outside of formatting and the Phase 4 preview helpers (must be none)
2. Re-run all SQL tests, Jest tests (Phase 4 vectors and balance text tests) and `npm run check`.
3. **Full manual walkthrough** of the Case Matrix (BC to BD) with 4 accounts on real phones. Record each case ID as pass, fail or note in `docs/phase-5-test-log.md`, including the concurrency results from 5.3 and the performance timing from 5.2.
4. **Money sanity checklist** (by hand, once): vectors 1, 4, 8 and 11 recreated with real expenses; a full settle-up until every balance is 0 on every phone; an overpayment and its reversal by undo; an expense edit after a confirmed payment; the same group read on two phones at once; the totals on the Groups tab compared with each group's Balances tab.
5. Re-run the cross-phase cases that depend on balances: Phase 3 GM2, GM7, GE5, GD4 and Phase 4 EG3, EG4. Update `docs/phase-3-test-log.md` and `docs/phase-4-test-log.md`.
6. Update `README.md` and `CLAUDE.md` (balance formula, settlement lifecycle, "disputed does not block", no direct table access, the app never does money math, locking order).
7. Copy `phase-5.md` into `/docs`. Run `npm run check` and `npx supabase test db`. Commit, tag `phase-5-done`, push.

**Acceptance**
- Both check commands pass
- `docs/phase-5-test-log.md` has a result for every case ID, no open failures
- Tag `phase-5-done` is pushed

**STOP.** Phase 5 is complete once this passes.

---

## 8. SQL reference

> A starting point, not gospel. Keep every rule. Put it in migration files. Revoke first, grant explicitly.

### 8.1 Table

```sql
create table public.settlements (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.groups(id) on delete cascade,
  from_user          uuid not null references public.profiles(id),     -- no cascade, on purpose
  to_user            uuid not null references public.profiles(id),     -- no cascade, on purpose
  amount_minor       bigint not null,
  currency           text not null default 'INR',
  method             text not null,
  note               text,
  upi_txn_ref        text,                                              -- Phase 6
  status             text not null default 'pending',
  created_by         uuid not null references public.profiles(id),     -- no cascade, on purpose
  client_request_id  uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  status_changed_at  timestamptz not null default now(),
  confirmed_at       timestamptz,

  constraint settlements_amount   check (amount_minor between 1 and 1000000000),
  constraint settlements_currency check (currency = 'INR'),
  constraint settlements_method   check (method in ('cash', 'other', 'upi')),
  constraint settlements_status   check (status in ('pending', 'confirmed', 'disputed', 'cancelled')),
  constraint settlements_people   check (from_user <> to_user),
  constraint settlements_creator  check (created_by in (from_user, to_user)),
  constraint settlements_note_len check (note is null or char_length(note) <= 100),
  constraint settlements_confirmed_at check ((status = 'confirmed') = (confirmed_at is not null)),
  constraint settlements_request_unique unique (created_by, client_request_id)
);

-- no duplicate pending payments (same payer, receiver, amount)
create unique index settlements_one_pending_same
  on public.settlements (group_id, from_user, to_user, amount_minor)
  where status = 'pending';

create index settlements_group_list    on public.settlements (group_id, created_at desc, id desc);
create index settlements_group_pending on public.settlements (group_id) where status = 'pending';
create index settlements_from          on public.settlements (from_user);
create index settlements_to            on public.settlements (to_user);

alter table public.settlements enable row level security;
revoke all on public.settlements from anon, authenticated;
-- No policies and no grants: all reads and writes use RPC functions.

-- activity_log: extend the allowed actions (the default constraint name may differ; check it first)
alter table public.activity_log drop constraint activity_log_action_check;
alter table public.activity_log add constraint activity_log_action_check check (action in (
  'expense_added', 'expense_edited', 'expense_deleted', 'expense_restored',
  'settlement_created', 'settlement_confirmed', 'settlement_disputed', 'settlement_cancelled'));
```

### 8.2 Net balances

```sql
create or replace function public.compute_group_nets(p_group uuid)
returns table (member_id uuid, net_minor bigint)
language sql stable security definer set search_path = '' as $$
  with paid as (
    select e.paid_by as uid, sum(e.amount_minor) as amt
      from public.expenses e
     where e.group_id = p_group and e.deleted_at is null
     group by e.paid_by
  ),
  owed as (
    select s.user_id as uid, sum(s.share_minor) as amt
      from public.expense_splits s
      join public.expenses e on e.id = s.expense_id
     where e.group_id = p_group and e.deleted_at is null
     group by s.user_id
  ),
  sent as (
    select st.from_user as uid, sum(st.amount_minor) as amt
      from public.settlements st
     where st.group_id = p_group and st.status = 'confirmed'
     group by st.from_user
  ),
  recv as (
    select st.to_user as uid, sum(st.amount_minor) as amt
      from public.settlements st
     where st.group_id = p_group and st.status = 'confirmed'
     group by st.to_user
  ),
  people as (
    select uid from paid
    union select uid from owed
    union select uid from sent
    union select uid from recv
    union select gm.user_id from public.group_members gm
           where gm.group_id = p_group and gm.status = 'active'
  )
  select p.uid,
         (coalesce(pa.amt, 0) - coalesce(ow.amt, 0) + coalesce(se.amt, 0) - coalesce(re.amt, 0))::bigint
    from people p
    left join paid pa on pa.uid = p.uid
    left join owed ow on ow.uid = p.uid
    left join sent se on se.uid = p.uid
    left join recv re on re.uid = p.uid;
$$;

revoke execute on function public.compute_group_nets(uuid) from public, anon, authenticated;
```

### 8.3 Simplified payments

```sql
create or replace function public.compute_simplified_debts(p_group uuid)
returns table (seq int, from_user uuid, to_user uuid, amount_minor bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  cred_ids uuid[];   cred_amt bigint[];
  debt_ids uuid[];   debt_amt bigint[];
  ci int;  di int;  k int;  v_pay bigint;  v_seq int := 0;
begin
  select array_agg(n.member_id order by n.net_minor desc, n.member_id),
         array_agg(n.net_minor order by n.net_minor desc, n.member_id)
    into cred_ids, cred_amt
    from public.compute_group_nets(p_group) n where n.net_minor > 0;

  select array_agg(n.member_id order by n.net_minor asc, n.member_id),
         array_agg(-n.net_minor order by n.net_minor asc, n.member_id)
    into debt_ids, debt_amt
    from public.compute_group_nets(p_group) n where n.net_minor < 0;

  loop
    ci := null; di := null;

    -- largest creditor (ties: smaller id)
    for k in 1 .. coalesce(array_length(cred_ids, 1), 0) loop
      if cred_amt[k] > 0 and (ci is null or cred_amt[k] > cred_amt[ci]
         or (cred_amt[k] = cred_amt[ci] and cred_ids[k] < cred_ids[ci])) then
        ci := k;
      end if;
    end loop;

    -- largest debtor (ties: smaller id)
    for k in 1 .. coalesce(array_length(debt_ids, 1), 0) loop
      if debt_amt[k] > 0 and (di is null or debt_amt[k] > debt_amt[di]
         or (debt_amt[k] = debt_amt[di] and debt_ids[k] < debt_ids[di])) then
        di := k;
      end if;
    end loop;

    exit when ci is null or di is null;

    v_pay := least(cred_amt[ci], debt_amt[di]);
    v_seq := v_seq + 1;
    return query select v_seq, debt_ids[di], cred_ids[ci], v_pay;

    cred_amt[ci] := cred_amt[ci] - v_pay;
    debt_amt[di] := debt_amt[di] - v_pay;
  end loop;
end;
$$;

revoke execute on function public.compute_simplified_debts(uuid) from public, anon, authenticated;
```

### 8.4 `create_settlement` (key parts)

```sql
create or replace function public.create_settlement(
  p_group uuid, p_client_request_id uuid, p_from_user uuid, p_to_user uuid,
  p_amount_minor bigint, p_method text, p_note text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  v_note     text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]]', '', 'g')), '');
  v_status   text;
  v_id       uuid;
  v_existing uuid;
  v_pending  int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  perform 1 from public.groups g where g.id = p_group for share;          -- shared group lock
  if not found or not public.is_active_member(p_group) then raise exception 'not_a_member'; end if;

  if p_client_request_id is not null then                                  -- idempotency
    select s.id into v_existing from public.settlements s
     where s.created_by = v_uid and s.client_request_id = p_client_request_id;
    if found then return v_existing; end if;
  end if;

  if p_from_user is null or p_to_user is null or p_from_user = p_to_user then
    raise exception 'invalid_settlement';
  end if;
  if v_uid not in (p_from_user, p_to_user) then raise exception 'settlement_not_allowed'; end if;
  if p_amount_minor is null or p_amount_minor < 1 or p_amount_minor > 1000000000 then
    raise exception 'invalid_amount';
  end if;
  if p_method is null or p_method not in ('cash', 'other') then              -- 'upi' is added in Phase 6
    raise exception 'invalid_method';
  end if;
  if v_note is not null and char_length(v_note) > 100 then raise exception 'invalid_note'; end if;

  if not exists (select 1 from public.group_members gm
                  where gm.group_id = p_group and gm.user_id = p_from_user and gm.status = 'active') then
    raise exception 'payer_not_member' using detail = p_from_user::text;
  end if;
  if not exists (select 1 from public.group_members gm
                  where gm.group_id = p_group and gm.user_id = p_to_user and gm.status = 'active') then
    raise exception 'receiver_not_member' using detail = p_to_user::text;
  end if;

  select count(*) into v_pending from public.settlements s
   where s.group_id = p_group and s.created_by = v_uid and s.status = 'pending';
  if v_pending >= 10 then raise exception 'too_many_pending'; end if;

  if exists (select 1 from public.settlements s
              where s.group_id = p_group and s.from_user = p_from_user and s.to_user = p_to_user
                and s.amount_minor = p_amount_minor and s.status = 'pending') then
    raise exception 'duplicate_pending';
  end if;

  -- the receiver is the authority on receiving money: their record is confirmed at once
  v_status := case when v_uid = p_to_user then 'confirmed' else 'pending' end;

  begin
    insert into public.settlements
      (group_id, from_user, to_user, amount_minor, method, note, status,
       created_by, client_request_id, confirmed_at)
    values
      (p_group, p_from_user, p_to_user, p_amount_minor, p_method, v_note, v_status,
       v_uid, p_client_request_id, case when v_status = 'confirmed' then now() end)
    returning id into v_id;
  exception when unique_violation then
    select s.id into v_existing from public.settlements s
     where s.created_by = v_uid and s.client_request_id = p_client_request_id;
    if found then return v_existing; end if;       -- a retry that raced
    raise exception 'duplicate_pending';           -- the partial unique index caught a duplicate
  end;

  insert into public.activity_log (group_id, actor_id, action, ref_id, details)
  values (p_group, v_uid, 'settlement_created', v_id,
          jsonb_build_object('from_user', p_from_user, 'to_user', p_to_user,
                             'amount_minor', p_amount_minor, 'method', p_method, 'status', v_status));
  return v_id;
end;
$$;
```

### 8.5 `cancel_settlement` (the most delicate transition)

```sql
create or replace function public.cancel_settlement(p_settlement uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_group uuid;
  v_s     public.settlements;
  v_undo  boolean := false;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select s.group_id into v_group from public.settlements s where s.id = p_settlement;
  if not found then raise exception 'settlement_not_found'; end if;

  perform 1 from public.groups g where g.id = v_group for share;           -- 1) group, shared
  if not public.is_active_member(v_group) then raise exception 'not_a_member'; end if;

  select * into v_s from public.settlements s where s.id = p_settlement for update;   -- 2) settlement, exclusive
  if not found then raise exception 'settlement_not_found'; end if;

  if v_s.status = 'cancelled' then return; end if;                          -- idempotent

  if v_s.status in ('pending', 'disputed') then
    if v_uid <> v_s.from_user then raise exception 'settlement_not_allowed'; end if;   -- only the payer withdraws
  elsif v_s.status = 'confirmed' then
    if v_uid <> v_s.to_user then raise exception 'settlement_not_allowed'; end if;     -- only the receiver undoes
    if v_s.confirmed_at < now() - interval '10 minutes' then raise exception 'undo_window_passed'; end if;
    if not exists (select 1 from public.group_members gm where gm.group_id = v_group
                    and gm.user_id = v_s.from_user and gm.status = 'active')
       or not exists (select 1 from public.group_members gm where gm.group_id = v_group
                    and gm.user_id = v_s.to_user and gm.status = 'active') then
      raise exception 'settlement_locked';
    end if;
    v_undo := true;
  else
    raise exception 'invalid_transition';
  end if;

  update public.settlements
     set status = 'cancelled', confirmed_at = null,
         status_changed_at = now(), updated_at = now()
   where id = p_settlement;

  insert into public.activity_log (group_id, actor_id, action, ref_id, details)
  values (v_group, v_uid, 'settlement_cancelled', p_settlement,
          jsonb_build_object('from_user', v_s.from_user, 'to_user', v_s.to_user,
                             'amount_minor', v_s.amount_minor, 'undo', v_undo));
end;
$$;
```

> `confirm_settlement` and `dispute_settlement` follow the same first steps (shared group lock, exclusive settlement lock, receiver-only check). **Confirm** also requires both people to be active (`settlement_locked`), because a disputed payment can outlive someone leaving the group.

### 8.6 Real "settled" checks (replace the Phase 3 stubs)

```sql
create or replace function public.member_is_settled(p_group uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select n.net_minor from public.compute_group_nets(p_group) n
                    where n.member_id = p_user), 0) = 0
     and not exists (select 1 from public.settlements s
                      where s.group_id = p_group and s.status = 'pending'
                        and (s.from_user = p_user or s.to_user = p_user));
$$;

create or replace function public.group_is_settled(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.compute_group_nets(p_group) n where n.net_minor <> 0)
     and not exists (select 1 from public.settlements s
                      where s.group_id = p_group and s.status = 'pending');
$$;
```

### 8.7 One-call group overview

```sql
create or replace function public.get_group_balances(p_group uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_active_member(p_group) then raise exception 'not_a_member'; end if;

  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', n.member_id, 'net_minor', n.net_minor)
                       order by n.net_minor desc, n.member_id)
        from public.compute_group_nets(p_group) n), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('from_user', d.from_user, 'to_user', d.to_user,
                                          'amount_minor', d.amount_minor) order by d.seq)
        from public.compute_simplified_debts(p_group) d), '[]'::jsonb),
    'my_net_minor', coalesce((
      select n.net_minor from public.compute_group_nets(p_group) n where n.member_id = v_uid), 0),
    'pending_for_me', (
      select count(*) from public.settlements s
       where s.group_id = p_group and s.status = 'pending' and s.to_user = v_uid)
  );
end;
$$;
revoke execute on function public.get_group_balances(uuid) from public, anon;
grant  execute on function public.get_group_balances(uuid) to authenticated;
```

---

## 9. Notes on choices (so they are not re-debated mid-build)

- **Balances are computed from the source rows on every read**, not stored. That makes them impossible to "drift". If it becomes slow with huge groups, a cached balance can be added in Phase 8 and checked against this function.
- **One call returns balances, suggestions and my net** so the three can never disagree.
- **Suggested payments are advice, not debts.** Settling any amount between any two people is allowed; only the nets matter.
- **Receiver-created payments confirm instantly; payer-created ones wait.** Nobody can erase their own debt by themselves.
- **Disputed does not block leaving or deleting** because it never changes balances, and both sides can end it (the receiver confirms, the payer cancels). A pending payment blocks because it still needs someone's decision.
- **The 10-minute undo** covers honest tapping mistakes without making confirmed payments editable forever. After it, corrections are new payments, which keeps history honest.
- **`settlement_locked`** exists because a disputed or recently confirmed payment can outlive someone leaving; without it a person who left could suddenly get a balance again and break the "former members are at 0" rule.
- **The partial unique index** is the real protection against duplicate pending payments; the friendly pre-check only produces a nicer message.
- **No direct table access** (same as Phase 4) keeps the Phase 8 audit short.
- **No cascade to `profiles`** keeps smart account deletion working.

---

## 10. Hooks for later phases

| Phase | What it must do for Phase 5 |
|-------|------------------------------|
| 6 | Allow method `upi` in `create_settlement` (relax the function check; the table already allows it). Add the UPI deep link, the "no UPI ID" and "no UPI app" cases, and the optional transaction reference (`upi_txn_ref`). Reuse confirm, dispute and cancel unchanged. Add a **UPI chip** to the settle-up sheet |
| 7 | Push notifications for "payment to confirm", "payment confirmed", "payment not received"; the **Remind** button; CSV/PDF export of balances and history; multi-currency (open the `INR` checks) |
| 8 | Full RLS and privilege audit including all Phase 5 functions; performance check of `compute_group_nets` on large groups (cache if needed); rate limits |

---

## 11. Phase 5 Definition of Done

- [ ] 5.1 to 5.8 completed, tested, and confirmed one by one
- [ ] The 12 shared balance vectors and the random property test pass
- [ ] Every case ID in Section 6 has a pass result in `docs/phase-5-test-log.md`
- [ ] Concurrency results recorded (confirm vs cancel, duplicate pending, leave while creating) and the 50-member / 5,000-expense timing recorded
- [ ] Sum of nets is exactly 0 in every test scenario, and applying the suggested payments always brings every balance to 0
- [ ] Clients have **no** direct access to `settlements`
- [ ] The stubs are gone: leave, remove, delete group and delete account now respect real balances (Phase 3 cases GM2, GM7, GE5, GD4 re-run and marked pass)
- [ ] The app never adds or subtracts money (search the code)
- [ ] Settle up, mark as received, confirm, dispute, cancel and undo all behave as specified on real phones
- [ ] `npm run check` and `npx supabase test db` pass
- [ ] Docs updated; tagged `phase-5-done`
- [ ] Decisions D25 to D36 have recorded answers

---

## 12. Common problems and fixes

| Problem | Fix |
|---------|-----|
| The sum of nets is not 0 | An expense's shares do not add up to its amount (Phase 4 trigger should prevent it), or a settlement was counted on only one side. Check both `sent` and `recv` use `status = 'confirmed'` |
| Suggested payments differ between two runs | Tie-breaking is not deterministic. Always order by amount then `user_id` |
| A pending payment changes a balance | The balance query is missing the `status = 'confirmed'` filter |
| A deleted expense still counts | The balance query is missing `deleted_at is null` (in both `paid` and `owed`) |
| `column reference "user_id" is ambiguous` in a function | Output column names clash with table columns. Use distinct output names (`member_id`) and table aliases |
| Balances on the Groups tab and the Balances tab differ | One of them is cached. Invalidate `['groups']`, `['balanceSummary']` and the group's `balances` key after every write |
| Undo never works / always works | The window check uses the wrong time. Use the server's `confirmed_at` and `now()`, never the phone's clock |
| Two identical payments were created | The app made a new `client_request_id` on retry, or the partial unique index is missing |
| Leaving a group is blocked but the balance looks like 0 | There is a **pending** payment involving the person. Show it in the Balances tab and let them confirm or cancel it |
| Someone who left shows a balance | A confirm or undo ran after they left. The `settlement_locked` check is missing |
| Money shows as ₹33.3333 anywhere | The app is dividing money. All amounts must be integer paise sent by the server and only formatted in the app |
| The activity feed fails after the migration | The `activity_log` action check was not extended, or its constraint name differs from `activity_log_action_check` |
| Deadlock errors | A function took locks in a different order. Always group first, then settlement |

---

## 13. Starter prompt for Claude Code

```
You are continuing SplitEase (React Native + Expo, TypeScript, Supabase). Phases 1 to 4 are done (tags phase-1-done to phase-4-done).

Read these first and follow them strictly:
- docs/prd.md
- docs/phase-5.md (the current phase: the balance formula, the algorithm, the status rules, error codes, and the Case Matrix)
- docs/phase-4.md, docs/phase-3.md and docs/phase-2.md (their rules still apply)
- CLAUDE.md

Rules:
1. Work ONLY on sub-phase 5.1 right now. Do not start 5.2 or anything else.
2. The backend (5.1 to 5.4) comes before any screen. Do not build UI until 5.5.
3. All money is integer paise. The server (Postgres functions) is the only place that calculates balances or suggested payments. The app only formats numbers; it never adds, subtracts or divides money.
4. Clients get NO direct access to settlements: RLS on, no policies, no grants. Every read and write goes through RPC functions.
5. Every new function: SECURITY DEFINER, SET search_path = '', user from auth.uid() only, execute revoked from public and anon (internal helper functions are revoked from authenticated too). Lock order is always: group row first, then the settlement row.
6. Foreign keys to profiles must NOT use ON DELETE CASCADE (smart account deletion depends on it).
7. Only confirmed settlements change balances. A pending payment blocks leaving, removing, deleting a group and deleting an account; a disputed payment does not.
8. Write the SQL tests described in the sub-phase (including the shared vectors and the random property test when you get to 5.2). A sub-phase is not done until its tests pass.
9. STOP when 5.1 is done and tell me: what you created, the exact commands you ran, the test output, and how I can verify it myself.
10. Keep every change small. Never use or ask for the service_role key. Never commit .env or secrets. Never log emails, tokens, UPI IDs or money details.
11. Every sub-phase must satisfy the case IDs it lists in docs/phase-5.md. If a case cannot be met, tell me instead of working around it.
12. Do not add libraries or services that the current sub-phase does not list. Do not build the UPI method (that is Phase 6).

Start with 5.1 now.
```

After 5.1 is confirmed, say "continue with 5.2", and so on.
