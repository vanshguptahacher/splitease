# SplitEase — Phase 4: Expenses

**Depends on:** `prd.md` (v1.1) and finished Phases 1 to 3 (`phase-3-done` tag)
**Goal:** Members can add, edit, delete (with undo) and browse shared expenses. The split math is exact to the paisa and runs **on the server**. Adding an expense is the fastest, clearest thing in the app.
**Rule:** Work **one sub-phase at a time. STOP after each sub-phase**, test, and confirm before moving on. Backend (4.1 to 4.4) is built and tested **before** any screen.

> **UX stance:** this is the screen people use every day, so it must beat Splitwise on speed and clarity. Type the amount, tap Save. Everything else (payer, people, split type, date, category) has a smart default and is changed only if needed. The user always sees **who owes whom, in plain words, before saving**.

---

## 0. Scope

### In scope
- Tables: `expenses`, `expense_splits`, `activity_log`
- Split types: **equal**, **exact amounts**, **percentages**
- Server split engine (`compute_shares`) plus a TypeScript preview mirror, proven identical by shared test vectors
- RPC functions: add, edit, delete, restore, list, detail, activity
- Screens: custom amount keypad, add/edit expense, expenses list, expense detail, activity feed
- Optimistic-concurrency (edit conflicts), idempotent saves (no duplicates), locking rules
- SQL tests for every rule

### Out of scope (later phases)
- Group balances, "who owes whom", simplify debts (Phase 5)
- UPI settle-up (Phase 6)
- Receipt photos, recurring expenses, multi-currency, charts, notifications, CSV export (Phase 7)
- Multiple payers on one expense, "split by shares", itemized splits (v2)
- Cloudflare Workers or any extra backend

---

## 1. Decisions to confirm before 4.1

| # | Decision | Recommendation (assumed if you don't change it) |
|---|----------|------------------------------------------------|
| D13 | Payers per expense | **One payer** (as in the PRD). Multi-payer is v2 |
| D14 | Who can edit or delete an expense | **The person who added it, or any admin** (matches the Phase 3 permissions table) |
| D15 | Expenses that involve someone who has **left or been removed** | **Locked**: cannot be edited or deleted ("Add a new expense to correct it"). Reason: their balance was settled when they left; changing the expense would silently create a debt for someone who is gone. The lock lifts automatically if that person rejoins |
| D16 | Amount limits | **₹0.01 minimum, ₹1,00,00,000 (1 crore) maximum** per expense |
| D17 | Date rules | Defaults to today. Not later than tomorrow (time-zone tolerance), not older than 10 years |
| D18 | Categories | Fixed list of 10: `food`, `groceries`, `travel`, `stay`, `fuel`, `shopping`, `bills`, `entertainment`, `rent`, `other`. **Optional** |
| D19 | Description | **Optional**, up to 100 characters. If empty, the list shows the category name, or "Expense" |
| D20 | Split types in v1 | Equal, exact, percent only |
| D21 | Delete behavior | **Soft delete with an Undo snackbar (8 seconds).** No "recently deleted" screen in v1 |
| D22 | Percentage precision | **2 decimals** (stored as basis points: 33.33% = 3333; 100% = 10000) |
| D23 | Quick add | **Yes:** the Groups tab "+" menu gets **Add expense** (pick group, last used preselected) |
| D24 | Reading expenses | **Through RPC functions only. Clients get no direct table access at all** (tighter than the PRD, which allowed SELECT) |

---

## 2. UX rules for this phase

1. **Fast add:** amount → Save is enough. Typing digits is not counted as taps. Defaults: payer = you, split = equally among **everyone**, date = today, no description or category needed.
2. **Big, custom number keypad**, always visible, keys at least 56dp. The amount is shown in large type with Indian digit grouping while typing.
3. **One summary row** under the amount: "Paid by **You** · Split **equally** among **5 people**". Tapping each part opens a bottom sheet to change it.
4. **Show the effect before saving**, in plain words:
   - you paid: "You paid ₹1,200. You get back ₹960."
   - someone else paid: "Rahul paid. You owe ₹240."
   - you are not part of it: "You're not part of this expense."
   - only you: "Only you. Nobody owes anyone."
5. **Never auto-change numbers silently.** If the amount changes after exact or percent values were entered, show the mismatch and let the user fix it.
6. **Undo instead of confirm** for delete (swipe or button → snackbar "Expense deleted · UNDO"). Confirm dialogs only for discarding unsaved changes.
7. **Edit uses the same screen** as add, pre-filled.
8. **Plain language everywhere:** "You owe Rahul ₹240" and "You lent ₹960", never "−240".
9. Every list has skeleton, empty and error states, pull-to-refresh and smooth scrolling.
10. Money is never shown as a float or with more than 2 decimals. **Always Indian grouping and the ₹ sign.**

---

## 3. Data model

```
groups (Phase 3)
   │ on delete cascade
   ├──< expenses >──< expense_splits >── profiles
   │         └── paid_by, created_by, deleted_by ──► profiles
   └──< activity_log
```

### `expenses`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default `gen_random_uuid()` |
| group_id | uuid FK groups | **on delete cascade** |
| description | text | optional, max 100 (trimmed, control characters removed) |
| amount_minor | bigint | paise. Check: 1 to 1,000,000,000 |
| currency | text | `INR` only in v1 (check constraint, opened up in Phase 7) |
| paid_by | uuid FK profiles | single payer; must be an active member when saved |
| split_type | text | `equal`, `exact`, `percent` |
| category | text | optional, from the fixed list |
| expense_date | date | calendar date, no time zone |
| created_by | uuid FK profiles | |
| client_request_id | uuid | unique per creator; makes "save" safe to retry |
| version | int | starts at 1, **+1 on every edit or delete/restore**; used to detect edit conflicts |
| created_at, updated_at | timestamptz | |
| deleted_at, deleted_by | timestamptz, uuid | soft delete; both set or both null |

### `expense_splits`
| Column | Type | Notes |
|--------|------|-------|
| expense_id | uuid FK expenses | **on delete cascade**; composite PK |
| user_id | uuid FK profiles | composite PK |
| share_minor | bigint | paise, >= 0 |
| percent_bp | int | only for `percent` splits (1 to 10000) so the edit screen can reload the entered percentages |

### `activity_log`
| Column | Type | Notes |
|--------|------|-------|
| id | bigint identity PK | |
| group_id | uuid FK groups | on delete cascade |
| actor_id | uuid FK profiles | |
| action | text | `expense_added`, `expense_edited`, `expense_deleted`, `expense_restored` |
| ref_id | uuid | the expense id (no FK, so history survives) |
| details | jsonb | e.g. description, amount, old amount |
| created_at | timestamptz | |

> **Foreign keys to `profiles` must NOT use `on delete cascade`.** That is what lets smart account deletion keep a "Deleted user" row when expenses still point at it (Phase 2 rules).

### Invariants (must always hold)
1. For every expense: **sum of `share_minor` = `amount_minor`**, exactly. Enforced in the functions **and** by a deferred database constraint trigger as a safety net.
2. An expense always has at least 1 participant and at most 50.
3. Payer and participants are **active members** of the group at the moment of saving.
4. Only active members of the group can read or change its expenses.
5. Clients have **no direct access** to `expenses`, `expense_splits` or `activity_log`.
6. Soft-deleted expenses never count in any list or (Phase 5) balance.
7. Every add, edit, delete and restore writes an activity entry **in the same transaction**.

---

## 4. The split engine (the heart of the phase)

All amounts are integer **paise**. Participants are sent as `[{ "user_id": "...", "value": ... }]` where `value` means:

| Split type | `value` means | Rules |
|------------|---------------|-------|
| `equal` | ignored | 1 to 50 distinct participants |
| `exact` | the person's share in paise | every value ≥ 1; **sum must equal the amount** |
| `percent` | the person's percentage in basis points (33.33% = 3333) | every value 1 to 10000; **sum must equal 10000** |

**Rounding rules (deterministic, identical in SQL and TypeScript):**
- **Equal:** `base = floor(amount / n)`, `remainder = amount mod n`. Sort participants by `user_id` (as lowercase uuid text order); the first `remainder` people get **+1 paisa**.
- **Percent:** each person gets `floor(amount × bp / 10000)`. The leftover paise (always between 0 and n−1) go **one each to the people with the largest fractional remainder** (`amount × bp mod 10000`); ties are broken by `user_id` order.
- **Exact:** shares are exactly what was entered; a wrong sum is rejected.
- The server **never trusts shares sent by the app**. For `equal` and `percent` it computes them itself; for `exact` it checks the sum.

### Shared test vectors (SQL and TypeScript must give identical results)

Use participants `a < b < c` (by user id). Keep these in `tests/fixtures/split-vectors.json`; Jest reads the file, and a script generates `supabase/tests/split_vectors.sql` from it, so **both sides run exactly the same cases**.

| # | Type | Amount (paise) | Input values | Expected shares (a, b, c) |
|---|------|---------------:|--------------|---------------------------|
| 1 | equal | 10000 | a, b, c | 3334, 3333, 3333 |
| 2 | equal | 1 | a, b, c | 1, 0, 0 |
| 3 | equal | 100 | a, b | 50, 50 |
| 4 | equal | 101 | a, b | 51, 50 |
| 5 | equal | 1 | a | 1 |
| 6 | equal | 1,000,000,000 | 50 people | 20,000,000 each |
| 7 | percent | 10000 | 3333, 3333, 3334 | 3333, 3333, 3334 |
| 8 | percent | 1001 | a 5000, b 5000 | 501, 500 (tie, so `a` gets the extra paisa) |
| 9 | percent | 100 | 3333, 3333, 3334 | 33, 33, 34 (largest remainder goes to `c`) |
| 10 | percent | 1 | a 10000 | 1 |
| 11 | exact | 5000 | a 2000, b 3000 | 2000, 3000 |
| 12 | exact | 5000 | a 2000, b 2999 | **error** `splits_dont_add_up` |
| 13 | exact | 5000 | a 5000, b 0 | **error** `invalid_split_value` |
| 14 | percent | 10000 | a 5000, b 4999 | **error** `splits_dont_add_up` |
| 15 | equal | 100 | a, a | **error** `duplicate_participant` |
| 16 | equal | 100 | (empty list) | **error** `no_participants` |
| 17 | equal | 100 | 51 people | **error** `too_many_participants` |
| 18 | percent | 100 | a 10001 | **error** `invalid_split_value` |

Every row must also satisfy: **shares sum exactly to the amount**.

---

## 5. Error codes and messages

RPC functions raise these exact codes (as the error message). The app maps them in `toFriendlyMessage()`.

| Code | What the user sees |
|------|--------------------|
| `not_authenticated` | "Please sign in again." |
| `not_a_member` | "You're no longer in this group." (and go back to the list) |
| `expense_not_found` | "This expense no longer exists." |
| `not_allowed` | "Only the person who added this expense or a group admin can change it." |
| `expense_locked` | "This expense includes someone who left the group, so it's locked. Add a new expense to correct it." |
| `expense_changed` | "Someone just changed this expense. We've loaded the latest version." |
| `invalid_amount` | "Enter an amount between ₹0.01 and ₹1,00,00,000." |
| `invalid_date` | "Choose a valid date." |
| `invalid_description` | "Keep the description under 100 characters." |
| `invalid_category` | "Pick a category from the list." |
| `invalid_split_type` | "Something went wrong. Please try again." |
| `no_participants` | "Pick at least one person." |
| `too_many_participants` | "A split can include at most 50 people." |
| `duplicate_participant` | "Something went wrong. Please try again." |
| `invalid_split_value` | "Check the amounts you entered for each person." |
| `splits_dont_add_up` | "The split doesn't add up to the total." |
| `payer_not_member` | "The person who paid is no longer in this group." |
| `participant_not_member` | "[Name] is no longer in this group." (the user id is sent in the error `details`; the app removes that person from the selection) |

---

## 6. Case Matrix (every case that must be handled)

> Each sub-phase lists the case IDs it must satisfy. At the end of Phase 4, walk through the whole matrix with **3 test accounts** (an admin, a member, and an outsider) on real phones.

### EA. Adding an expense

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| EA1 | Type an amount and tap Save with all defaults | Created: you paid, split equally among everyone, today, no category |
| EA2 | Description left empty | Allowed; the list shows the category name or "Expense" |
| EA3 | Description over 100 characters | Counter shown and input blocked (also blocked by the server); emojis and Hindi are fine |
| EA4 | Category not chosen | Allowed |
| EA5 | Date | Defaults to today; past dates allowed; later than tomorrow or older than 10 years blocked |
| EA6 | Double tap on Save | Exactly one expense is created |
| EA7 | Request times out but actually succeeded, user retries | **No duplicate**: the retry returns the same expense (`client_request_id`) |
| EA8 | Offline | Save disabled with an explanation; typed values stay on screen |
| EA9 | User was removed from the group while the form was open | Save returns `not_a_member`; friendly message; back to the list |
| EA10 | A selected participant left the group while the form was open | `participant_not_member`; that person is removed from the selection and the user is told |
| EA11 | The selected payer left the group | `payer_not_member`; the user must pick another payer |
| EA12 | Group has only you | Allowed (split among you); hint "Invite people to split with" |
| EA13 | Payer is not one of the participants (you paid for others) | Allowed |
| EA14 | Payer is the only participant | Allowed; preview says "Only you. Nobody owes anyone." |
| EA15 | Back button with typed data | "Discard this expense?" dialog; nothing typed means it just closes |
| EA16 | Quick add from the Groups tab | Pick group (last used preselected) → same add screen |

### EM. Amount entry

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| EM1 | Typing digits | Shown with Indian grouping live (₹12,34,567) |
| EM2 | More than 2 decimals | The third decimal digit is ignored |
| EM3 | Leading zeros, lone dot, second dot | "007" becomes 7; "." becomes "0."; only one dot allowed |
| EM4 | Empty or zero amount | Save disabled |
| EM5 | More than ₹1,00,00,000 | Blocked with the message from Section 5 |
| EM6 | ₹0.01 | Allowed |
| EM7 | Backspace and clear | Backspace removes one character; long press clears all |
| EM8 | Floating-point errors | Impossible: the typed text is converted to integer paise with string logic, never with floats |
| EM9 | Large font size or very long amount | The amount shrinks to fit; never cut off |
| EM10 | Locale | Always ₹ and Indian grouping, regardless of phone language |

### EQ. Equal split

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| EQ1 | Default | Everyone selected; each person's amount shown in the preview |
| EQ2 | ₹100 among 3 | 33.34, 33.33, 33.33 (by the rounding rule); total exactly ₹100 |
| EQ3 | Deselect people | Shares recomputed immediately |
| EQ4 | Nobody selected | Save disabled: "Pick at least one person." |
| EQ5 | ₹0.02 among 3 | Shares 1, 1, 0 paise; the person with ₹0 is shown as ₹0.00 |
| EQ6 | Payer deselected | Allowed (EA13) |
| EQ7 | 50 participants | Smooth |

### EX. Exact split

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| EX1 | Entering amounts per person | A live indicator "₹X of ₹Y assigned"; Save disabled until they match |
| EX2 | Over-assigned | Indicator turns red: "₹X over" |
| EX3 | Helper "Split the rest equally" | Divides what is left among people whose field is empty (using the same rounding rule) |
| EX4 | A person with ₹0 or empty | Treated as not part of the split (a zero value is never sent) |
| EX5 | Switching from equal to exact | Prefilled with the current equal shares so the user only adjusts |
| EX6 | Total amount changed after entering exact values | Mismatch is shown; nothing is rescaled silently |
| EX7 | Decimals | Two decimals, integer paise internally |

### EP. Percentage split

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| EP1 | Entering percentages (2 decimals) | Live indicator "100.00% of 100%" |
| EP2 | 33.33 + 33.33 + 33.34 | Allowed; shares computed by largest remainder; sum exact |
| EP3 | Total not 100 | Save disabled: "X% left" or "X% over" |
| EP4 | A person with 0% | Treated as not part of the split |
| EP5 | Rounding | ₹10.01 at 50/50 gives 5.01 and 5.00; ₹1.00 at 33.33/33.33/33.34 gives 0.33, 0.33, 0.34 (vectors 8 and 9) |
| EP6 | Switching from equal to percent | Prefilled with equal percentages (for 3 people: 33.33, 33.33, 33.34) |

### EE. Editing

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| EE1 | Creator edits their own expense | Same screen, pre-filled; saves; version increases; activity entry written |
| EE2 | Admin edits someone else's expense | Allowed |
| EE3 | Member tries to edit someone else's expense | Edit button hidden; the server returns `not_allowed` if called anyway |
| EE4 | Two people edit the same expense | The second save returns `expense_changed`; the app reloads the latest version, explains, and the user re-applies their change |
| EE5 | Expense deleted while someone is editing | `expense_not_found`; message and back |
| EE6 | Nothing changed | Save stays disabled until the form is changed |
| EE7 | Changing the split type or participants | All old splits are replaced atomically in one transaction |
| EE8 | Expense involves someone who left or was removed | **Locked** (`expense_locked`); explanation shown; no edit or delete button |
| EE9 | Unsaved changes and back | "Discard changes?" dialog |
| EE10 | Adding a participant who has left | Not offered in the UI; rejected by the server |
| EE11 | Changing only the date, category or description | Shares come out exactly the same (the engine is deterministic) |
| EE12 | A locked expense whose member rejoins | Unlocks automatically (the lock is computed live) |

### ED. Deleting and restoring

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| ED1 | Creator deletes | Snackbar "Expense deleted · UNDO" for 8 seconds; list updates at once |
| ED2 | Admin deletes someone else's | Allowed |
| ED3 | Member deletes someone else's | Not offered; server returns `not_allowed` |
| ED4 | Undo within the window | Expense restored (version +1, activity "restored") |
| ED5 | Undo after it was already restored or edited by someone else | No error; idempotent |
| ED6 | Delete a locked expense | Blocked (`expense_locked`) |
| ED7 | Delete twice (double tap, or two admins) | Second call is a silent no-op (no extra activity entry) |
| ED8 | Offline | Delete disabled with an explanation |
| ED9 | Deleted expenses | Never in the list, and never counted in balances (Phase 5) |
| ED10 | Swiped by accident | Undo covers it |
| ED11 | App closed before Undo | Expense stays deleted (accepted in v1; admins can add it again) |
| ED12 | Group deleted | All expenses, splits and activity are removed by cascade |

### EL. List and detail

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| EL1 | Expenses tab | Grouped under date headers (Today, Yesterday, then dates), newest first; skeleton, empty state ("No expenses yet. Add the first one."), error with Retry, pull to refresh, infinite scroll (30 per page) |
| EL2 | Each row shows | Category emoji, description (or fallback), payer name, amount, and **your effect**: "you lent ₹X", "you owe ₹X", or "not involved" |
| EL3 | Payer is a deleted user | Shown as "Deleted user" |
| EL4 | Payer left the group | Name still shown |
| EL5 | Long description | Truncated with an ellipsis |
| EL6 | New expenses added while scrolling | Order stays stable (keyset pagination, no duplicates or gaps) |
| EL7 | Tap a row | Detail: amount, date, category, payer, each person's share, who added it and when, "edited by" info, and its activity trail |
| EL8 | Stale link to a deleted expense | "This expense was deleted." with Undo if the user is allowed to restore |
| EL9 | Same date | Ordered by creation time, newest first |
| EL10 | 1000 expenses | Virtualized list, smooth |
| EL11 | Dates | `expense_date` is a calendar date with no time zone; "Today" and "Yesterday" use the phone's local date |
| EL12 | Locked expense in the list or detail | Small lock badge and the explanation |

### EV. Activity

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| EV1 | Add, edit, delete, restore | Each writes one entry in the same transaction |
| EV2 | Activity tab | Recent entries from all groups you are in, e.g. "Rahul added 'Dinner' ₹1,200 · Goa Trip · 2h ago" |
| EV3 | Edit entries | Show what changed, e.g. "Rahul changed 'Dinner' ₹1,200 → ₹1,500" |
| EV4 | Your own actions | Shown as "You" |
| EV5 | Actor is a deleted user | "Deleted user" |
| EV6 | Groups you left | Their entries are hidden |
| EV7 | Pagination, empty state, error state | All present |
| EV8 | Tap an entry | Opens the expense if it still exists, otherwise the group |
| EV9 | Log entries | Cannot be edited or deleted by any client |

### EG. Interplay with groups and accounts

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| EG1 | Groups list | `last_activity_at` is available and the list is ordered by recent activity (falls back to join date) |
| EG2 | Group deleted | Cascades to expenses, splits and activity |
| EG3 | Member leaves or is removed | Their past expenses stay in history; the locking rule applies |
| EG4 | Account deletion | A profile referenced by expenses is **anonymized** ("Deleted user"), never hard-deleted (the foreign keys must not cascade) |
| EG5 | Non-member | Cannot read or change anything (every RPC rejects) |
| EG6 | Settled-balance stubs | Unchanged in Phase 4; Phase 5 replaces them |
| EG7 | Rejoining after leaving | Past expenses are visible again; the lock lifts (EE12) |

### EZ. Security

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| EZ1 | Direct select, insert, update or delete on `expenses`, `expense_splits`, `activity_log` (signed in or anonymous) | Denied |
| EZ2 | Anonymous RPC calls | Rejected; the user always comes from `auth.uid()` |
| EZ3 | Non-member calls any expense RPC | `not_a_member` |
| EZ4 | Member edits or deletes someone else's expense through the API | `not_allowed` |
| EZ5 | App sends wrong or tampered shares | Equal and percent shares are computed by the server; exact and percent sums are validated |
| EZ6 | Participant who is not in the group | `participant_not_member` |
| EZ7 | Duplicate participants | `duplicate_participant` |
| EZ8 | Zero, negative, huge, decimal or non-numeric amounts or values | Rejected (`invalid_amount`, `invalid_split_value`) |
| EZ9 | More than 50 participants | `too_many_participants` |
| EZ10 | Description with control characters or over 100 characters | Cleaned, or rejected |
| EZ11 | Date out of range | `invalid_date` |
| EZ12 | Unknown category or split type | `invalid_category`, `invalid_split_type` |
| EZ13 | A bug or a manual insert that makes shares not add up | The deferred constraint trigger rejects the transaction (`splits_dont_add_up`) |
| EZ14 | Reusing a `client_request_id` | Returns only that user's own expense; never someone else's |
| EZ15 | Function hardening | Every new function is `SECURITY DEFINER`, `search_path = ''`, execute revoked from `public` and `anon` |
| EZ16 | Races between expense writes and membership changes | Expense functions take a **shared** lock on the group row; membership functions take an **exclusive** one, so they never interleave (see Section 8.4) |
| EZ17 | Personal data in logs | None |

### EU. UI and device

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| EU1 | Keypad | Keys at least 56dp; works one-handed |
| EU2 | Largest font, dark mode, 360dp width | Everything usable; Save is always visible |
| EU3 | Switching between the keypad and the description keyboard | Smooth; the amount stays visible |
| EU4 | Android back | Closes an open sheet first; then asks to discard if there are changes |
| EU5 | Offline | Offline banner; all write actions disabled with an explanation |
| EU6 | Screen reader | Amounts are read as "rupees" with paise; buttons have labels |
| EU7 | Performance | Add screen opens fast; typing never lags |
| EU8 | Hindi names and emojis | Render correctly |
| EU9 | Orientation | Locked to portrait |

---

## 7. Sub-phases

---

### 4.1 — Database: tables, constraints, privileges, activity log

**Goal:** Tables and safety nets exist before any function or screen. (Cases: EZ1, EZ13, EG4.)

**Tasks**
1. Confirm decisions D13 to D24 (or note your changes).
2. Migration `expenses_tables`: `expenses`, `expense_splits`, `activity_log`, indexes (SQL in Section 8.1).
3. Migration `expense_split_sum_trigger`: the deferred constraint trigger (Section 8.2).
4. Row Level Security **enabled** on all three tables with **no policies and no grants** for `anon` and `authenticated`. Revoke everything explicitly.
5. All foreign keys to `profiles` are plain references (**no cascade**). Foreign keys to `groups` and `expenses` cascade as described in Section 3.
6. Apply with `npx supabase db push` and regenerate types.
7. SQL tests: clients cannot select, insert, update or delete any of the three tables; constraint checks reject bad amounts, split types, categories, descriptions, `percent_bp` outside 1 to 10000, and a half-set `deleted_at`/`deleted_by`; the **constraint trigger** rejects shares that do not add up and also rejects an expense with no splits (run the test with `set constraints all immediate`); deleting a group cascades to all three tables; deleting a profile row that an expense references fails (proving there is no cascade).

**Acceptance**
- `npx supabase test db` passes
- In the dashboard: RLS on, zero policies, zero client privileges on the three tables

**STOP.** Report the migrations and the test output.

---

### 4.2 — Split engine: SQL function, TypeScript mirror, shared vectors

**Goal:** One algorithm, two implementations, provably identical. (Cases: EQ1 to EQ7, EX1 to EX7, EP1 to EP6, EM1 to EM8, EZ5, EZ7, EZ8, EZ9.)

**Tasks**
1. Create `tests/fixtures/split-vectors.json` with the 18 vectors from Section 4 (use fixed uuids so ordering is predictable).
2. SQL: `public.compute_shares(p_type, p_amount, p_participants jsonb)` (Section 8.3). It validates structure, duplicates, counts and values, and returns `(user_id, share_minor, percent_bp)`. Execute is **revoked from every client role**; only other `SECURITY DEFINER` functions call it.
3. Script `scripts/gen-split-tests.ts` that generates `supabase/tests/split_vectors.sql` from the JSON file. Run `npx supabase test db`.
4. TypeScript mirror `lib/money/splits.ts`: `computeShares(type, amountMinor, participants)` with the same rounding rules and the same error codes. **No floating-point math**: use integer arithmetic only (amounts stay below 1e9, and `amount × bp` stays below 1e13, so safe integers are fine).
5. `lib/money/parse.ts`: `parseAmountToMinor(text)` (string logic, no floats) and `formatAmountInput(text)` (live Indian grouping while typing). Cases to test: "", "0", "0.", ".5" → 50, "12" → 1200, "12.3" → 1230, "12.34", "12.345" → null, "007" → 700, "10000000" → exactly the maximum, "10000000.01" → above the maximum, "1,00,000" (commas stripped).
6. `lib/money/preview.ts`: `previewForUser(userId, payerId, shares, amountMinor)` returning the plain-words sentence rules from UX rule 4 (as a structured result the UI turns into text). Unit tests for all four sentence cases.
7. Jest tests: run every vector through the TypeScript mirror; run the parser and preview tests.

**Acceptance**
- The SQL tests and the Jest tests run **the same 18 vectors** and all pass
- Changing any vector's expected value in the JSON breaks **both** test suites (prove it once, then revert)

**STOP.** Report the files, test output and the proof that both suites read the same fixture.

---

### 4.3 — Write RPCs: add, edit, delete, restore

**Goal:** Every write rule enforced in the database. (Cases: EA1 to EA14, EE1 to EE12, ED1 to ED7, EZ2 to EZ12, EZ14 to EZ16, EV1, EV9.)

**Tasks** (each function: `SECURITY DEFINER`, `search_path = ''`, user from `auth.uid()` only, execute revoked from `public` and `anon`, granted to `authenticated`)

| RPC | Rules |
|-----|-------|
| `add_expense(p_group, p_client_request_id, p_description, p_amount_minor, p_paid_by, p_split_type, p_participants, p_category, p_expense_date)` → expense id | Full code in Section 8.4. Takes a **shared** lock on the group row; caller must be an active member; **idempotent** on `(created_by, client_request_id)`; validates amount, description, category, date, split type; payer must be active; participants come from `compute_shares` and must all be active members; inserts expense, splits and the activity entry in one transaction |
| `edit_expense(p_expense, p_expected_version, ...same fields...)` → new version | Section 8.5. Shared group lock, then **exclusive** lock on the expense row. Checks in this order: caller is an active member, permission (creator or admin), not deleted, **not locked**, then the **version matches** (`expense_changed`), then the same validations as add. Replaces all splits atomically, bumps `version`, logs old and new amount |
| `delete_expense(p_expense)` | Same locks and permission checks; blocked when locked; already deleted means silent no-op (no log entry); sets `deleted_at`, `deleted_by`, bumps `version`, logs |
| `restore_expense(p_expense)` | Creator or admin; blocked when locked; not deleted means silent no-op; clears the delete fields, bumps `version`, logs |
| `expense_is_locked(p_expense)` (helper, not callable by clients) | True when the payer or any participant is **not currently an active member** of the expense's group (SQL in Section 8.6) |

**Locking order (always the same, to avoid deadlocks):** group row (shared) → expense row (exclusive).

SQL tests (the heaviest file of the phase):
- The permission table: admin, member (own and others' expenses), outsider, anonymous, for add, edit, delete, restore
- Every validation error in Section 5 with its exact code
- Idempotency: the same `client_request_id` twice returns the same id and creates one expense, one activity entry
- Version conflict: edit with a stale version fails with `expense_changed` and changes nothing
- Locked expense: after a member leaves or is removed, edit, delete and restore fail with `expense_locked`; after they rejoin it works again
- Edit replaces splits atomically; edit that changes only the description gives identical shares
- Activity entries: one per successful action, none for failed or no-op calls
- Payer or participant who is not an active member is rejected
- Concurrency (record the results in the test log): two sessions saving the same `client_request_id` at once give one expense; a member leaving while an expense that includes them is being added never produces an expense with a non-member participant

**Acceptance**
- `npx supabase test db` passes with every function covered
- The permission table is proven by tests, not by reading code

**STOP.** Report the functions, test output and the concurrency results.

---

### 4.4 — Read RPCs and group list upgrade

**Goal:** Lists and details come from the server, with the user's own effect already computed. (Cases: EL1 to EL12, EV2 to EV8, EG1, EG5.)

**Tasks**

| RPC | Rules |
|-----|-------|
| `list_expenses(p_group, p_limit default 30, p_cursor jsonb default null)` | Active members only. Non-deleted expenses ordered by `expense_date desc, created_at desc, id desc` with **keyset pagination** (`(expense_date, created_at, id) < cursor`). Returns: id, description, category, amount_minor, paid_by, expense_date, created_by, created_at, version, `participant_count`, `my_share_minor`, `my_net_minor` (what you paid minus your share), `is_locked`, `can_edit`. Also returns the cursor for the next page |
| `get_expense(p_expense)` | Active members only. Returns the expense (including deleted state), every split (`user_id`, `share_minor`, `percent_bp`), `is_locked`, `can_edit`, `can_restore`, and the last 10 activity entries for it |
| `list_activity(p_limit default 30, p_cursor jsonb default null)` | Entries from groups where the caller is **currently active**, newest first, keyset pagination. Returns group id and name, actor id and name (server-side join; name only, no UPI ID or email), action, ref id, details, created_at. Deleted users appear as "Deleted user" |
| `list_my_groups()` (update) | Adds `last_activity_at` (latest activity entry, or the join date if none) and orders by it, newest first |

Names for payers and participants in the app come from `get_group_members(p_group, true)` (includes former members), as set in Phase 3.

SQL tests: pagination gives no gaps or duplicates when new rows are inserted between pages; `my_net_minor` for payer, participant, payer-and-participant, and non-involved users; deleted expenses never appear in lists; `can_edit` and `is_locked` match the rules; outsiders get `not_a_member`; activity from groups the caller left is hidden; no email or UPI ID appears in any result.

**Acceptance**
- Tests pass
- Calling each function as two different users returns exactly what the rules say

**STOP.** Report the functions and test output.

---

### 4.5 — App foundations: keypad, hooks, error mapping

**Goal:** The reusable pieces that make the add screen fast and safe. (Cases: EM1 to EM10, EU1, EU6, EU9.)

**Tasks**
1. `AmountKeypad` component: keys 0 to 9, dot, backspace (long press clears), minimum 56dp, accessible labels. Uses `formatAmountInput` for live display and `parseAmountToMinor` for the value. Enforces EM2, EM3 and EM5 while typing.
2. `AmountDisplay`: large type with the ₹ sign, shrinks to fit (EM9), reads aloud correctly (EU6).
3. Category constants (key, label, emoji) in `lib/expenses/categories.ts`:
   `food 🍽️`, `groceries 🛒`, `travel 🚗`, `stay 🏨`, `fuel ⛽`, `shopping 🛍️`, `bills 💡`, `entertainment 🎬`, `rent 🏠`, `other 🧾`.
4. `lib/api/expenses.ts`: wrappers for `add_expense`, `edit_expense`, `delete_expense`, `restore_expense`, `list_expenses`, `get_expense`, `list_activity`. **No direct table access.**
5. Query keys: `['group', id, 'expenses']`, `['expense', id]`, `['activity']`. Hooks: `useExpenses(groupId)` (infinite query), `useExpense(id)`, `useAddExpense`, `useEditExpense`, `useDeleteExpense`, `useRestoreExpense`, `useActivity()`. After any write, invalidate the group's expenses, `['activity']` and `['groups']`.
6. Map every error code in Section 5 in `toFriendlyMessage()`. `participant_not_member` reads the user id from the error `details`.
7. A `clientRequestId` helper: one uuid per form session, reused on every retry of the same save.

**Acceptance**
- Keypad tested on a real phone with all of EM1 to EM10 (use a dev showcase screen)
- `npm run check` passes

**STOP.** Report what was built and the keypad test results.

---

### 4.6 — App: add and edit expense screen

**Goal:** The centerpiece. (Cases: EA1 to EA16, EQ1 to EQ7, EX1 to EX7, EP1 to EP6, EE1 to EE12, EU2 to EU5, EU7, EU8.)

**Layout (top to bottom):**
1. Large amount display
2. Optional description field ("What was it for?") with a counter, and a horizontal row of category chips
3. One summary row: **Paid by [You] · Split [equally] among [5 people]** (each part is tappable) and a small **Today** chip for the date
4. The **plain-words preview line** (UX rule 4), or the validation message in red
5. **Save** bar
6. The amount keypad (replaced by the system keyboard while the description is focused; the amount stays visible)

**Tasks**
1. Defaults: payer = you; split = equal among **all active members**; date = today. Save is enabled as soon as the amount is valid.
2. **Paid by sheet:** list of active members (you first).
3. **Split sheet:** three tabs, **Equal / Exact / Percent**, plus people selection.
   - Equal: checkboxes with Select all; each person's amount shown (EQ1 to EQ7).
   - Exact: one amount field per person, indicator "₹X of ₹Y assigned", the "Split the rest equally" helper, over-assigned in red (EX1 to EX7).
   - Percent: one percentage field per person (2 decimals), indicator "X% left" or "over" (EP1 to EP6).
   - Switching tabs prefills from the current shares (EX5, EP6). Changing the amount never rescales entered values (EX6).
4. **Date:** native date picker (install `@react-native-community/datetimepicker` with `npx expo install`); limits per D17.
5. **Preview** uses the TypeScript mirror from 4.2. The server result is the truth: after saving, the screen shows what the server stored.
6. **Save:** sends `clientRequestId` (EA6, EA7); disabled while saving and when offline (EA8). Handles every error code (EA9 to EA11): `not_a_member` returns to the list with a message; `participant_not_member` removes that person and tells the user; `payer_not_member` asks for a new payer.
7. **Edit mode** (route `group/[id]/expense/[expenseId]/edit`): loads `get_expense`, pre-fills everything including exact amounts and percentages, and sends `expected_version`. On `expense_changed`: show the message, reload the latest values, let the user re-apply. On `expense_locked` or `not_allowed`: show the message and close. Save disabled until something changed (EE6).
8. **Back handling:** discard dialog when there is typed or changed data (EA15, EE9); sheets close first (EU4).
9. **Quick add (D23):** the Groups tab "+" menu gets **Add expense**: a group picker (last used group preselected, stored per user and cleared on sign-out), then the same screen (EA16).
10. Group with only you shows the hint from EA12.

**Acceptance**
- EA, EQ, EX, EP, EE and EU cases tested on a real phone with 3 accounts, including: ₹100 among 3, a 51-character-over description, edit conflict between two phones, a participant who leaves while the form is open, double tap on Save, and Save after airplane mode
- The saved expense's shares match the preview exactly (the same numbers on both)

**STOP.** Report results case by case.

---

### 4.7 — App: expenses list, detail, delete and undo

**Goal:** Browse, inspect, delete and restore. (Cases: EL1 to EL12, ED1 to ED12, EE8, EE12, EG3, EG7.)

**Tasks**
1. **Expenses tab** in the group detail: infinite list grouped under date headers; rows per EL2 (category emoji, description or fallback, payer, amount, your effect in plain words); skeleton, empty state, error state, pull to refresh; a floating **+** button at the bottom.
2. **Detail screen:** amount, date, category, payer, a table of each person's share, "Added by X on date", "Edited by Y", lock banner when locked (EL12), and the activity trail from `get_expense`. Buttons Edit and Delete only when `can_edit` is true.
3. **Delete:** from the detail screen or a swipe in the list. Calls `delete_expense`, removes the row at once, shows **"Expense deleted · UNDO"** for 8 seconds. Undo calls `restore_expense` and brings the row back in the right place (ED1 to ED5, ED10). Offline: disabled with an explanation (ED8).
4. **Staleness:** `expense_not_found` shows "This expense was deleted." and, if allowed, an Undo button (EL8); `not_a_member` returns to the groups list (EA9).
5. Plain-words effect text: you paid and others share it: "you lent ₹X"; someone else paid and you share it: "you owe ₹X"; not in the split: "not involved". Payer names for deleted users read "Deleted user" (EL3).
6. Refetch on focus; pull to refresh; keyset infinite scrolling is stable while new rows arrive (EL6).
7. Test 1000 expenses for smooth scrolling (EL10; create them with a script on a test group).

**Acceptance**
- EL, ED, EE8, EE12 and EG cases tested on real phones with 3 accounts, including: member leaves and the expense locks, member rejoins and it unlocks, delete then undo, delete by an admin of someone else's expense, stale detail screen after deletion on another phone

**STOP.** Report results case by case.

---

### 4.8 — App: activity tab and group ordering

**Goal:** Transparency about who changed what. (Cases: EV1 to EV9, EG1, EG2.)

**Tasks**
1. **Activity tab:** infinite list from `list_activity` with sentences like "Rahul added 'Dinner' ₹1,200 · Goa Trip · 2h ago", "Rahul changed 'Dinner' ₹1,200 → ₹1,500", "You deleted 'Taxi' ₹350", "Priya restored 'Taxi' ₹350". "You" for your own actions (EV4), "Deleted user" for deleted accounts (EV5).
2. Tap an entry: open the expense if it still exists and is not deleted, otherwise open the group (EV8).
3. Skeleton, empty, error states, pull to refresh (EV7).
4. **Groups list** now ordered by recent activity using `last_activity_at` (EG1); optionally shows "Last expense: Dinner ₹1,200" under the name.
5. Verify group deletion removes the group's activity (EG2) and that groups you left never show up (EV6).

**Acceptance**
- EV and EG cases tested with 3 accounts

**STOP.** Report results case by case.

---

### 4.9 — Hardening, tests and handoff

**Goal:** Prove the matrix, lock the docs, tag the phase. (Cases: EZ1 to EZ17 and a full re-run of EA to EU.)

**Tasks**
1. **Security pass:**
   - confirm RLS is on, with no policies and no client privileges, on the three tables
   - confirm every new function has `search_path = ''` and execute revoked from `public` and `anon`, and that `compute_shares` and `expense_is_locked` are not callable by clients
   - search the app for direct table access to `expenses`, `expense_splits`, `activity_log` (must be none)
   - search for `service_role` (must be nowhere)
   - search for logging of amounts with names, descriptions, or user ids outside `lib/log.ts` (must be none)
2. Re-run all SQL tests, Jest tests (including the shared vectors) and `npm run check`.
3. **Full manual walkthrough** of the Case Matrix (EA to EU) with 3 accounts on real phones. Record each case ID as pass, fail or note in `docs/phase-4-test-log.md`, including the concurrency results from 4.3.
4. Money sanity checklist (do it by hand once): ₹100 among 3; ₹0.01 among 3; ₹10.01 at 50/50; an exact split of three odd amounts; a percent split of 33.33/33.33/33.34; a ₹1,00,00,000 expense; an edit that changes the split type; the same expense compared in the preview, the saved detail and the SQL result.
5. Update `README.md` and `CLAUDE.md` (money rules: integer paise only, server is the authority, no direct table access for expenses, error codes, vectors, locking order, soft delete and undo).
6. Copy `phase-4.md` into `/docs`. Run `npm run check` and `npx supabase test db`. Commit, tag `phase-4-done`, push.

**Acceptance**
- Both check commands pass
- `docs/phase-4-test-log.md` has a result for every case ID, no open failures
- Tag `phase-4-done` is pushed

**STOP.** Phase 4 is complete once this passes.

---

## 8. SQL reference

> A starting point, not gospel. Keep every rule. Put it in migration files. Revoke first, grant explicitly.

### 8.1 Tables

```sql
create table public.expenses (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.groups(id) on delete cascade,
  description        text,
  amount_minor       bigint not null,
  currency           text not null default 'INR',
  paid_by            uuid not null references public.profiles(id),   -- no cascade, on purpose
  split_type         text not null,
  category           text,
  expense_date       date not null,
  created_by         uuid not null references public.profiles(id),   -- no cascade, on purpose
  client_request_id  uuid,
  version            int  not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  deleted_by         uuid references public.profiles(id),            -- no cascade, on purpose

  constraint expenses_amount check (amount_minor between 1 and 1000000000),
  constraint expenses_currency check (currency = 'INR'),               -- relax in Phase 7
  constraint expenses_split_type check (split_type in ('equal', 'exact', 'percent')),
  constraint expenses_category check (category is null or category in
    ('food','groceries','travel','stay','fuel','shopping','bills','entertainment','rent','other')),
  constraint expenses_description_len check (description is null or char_length(description) <= 100),
  constraint expenses_deleted_pair check ((deleted_at is null) = (deleted_by is null)),
  constraint expenses_request_unique unique (created_by, client_request_id)
);
create index expenses_group_list on public.expenses (group_id, expense_date desc, created_at desc, id desc)
  where deleted_at is null;

create table public.expense_splits (
  expense_id   uuid not null references public.expenses(id) on delete cascade,
  user_id      uuid not null references public.profiles(id),          -- no cascade, on purpose
  share_minor  bigint not null check (share_minor >= 0),
  percent_bp   int check (percent_bp between 1 and 10000),
  primary key (expense_id, user_id)
);
create index expense_splits_user on public.expense_splits (user_id);

create table public.activity_log (
  id          bigint generated always as identity primary key,
  group_id    uuid not null references public.groups(id) on delete cascade,
  actor_id    uuid not null references public.profiles(id),           -- no cascade, on purpose
  action      text not null check (action in
                ('expense_added','expense_edited','expense_deleted','expense_restored')),
  ref_id      uuid,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index activity_log_group_time on public.activity_log (group_id, created_at desc);

alter table public.expenses       enable row level security;
alter table public.expense_splits enable row level security;
alter table public.activity_log   enable row level security;

revoke all on public.expenses, public.expense_splits, public.activity_log from anon, authenticated;
-- No policies and no grants: clients have no direct access. All reads and writes use RPC functions.
```

### 8.2 Safety net: the shares must add up

```sql
create or replace function public.check_expense_split_sum()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_id uuid;
begin
  if tg_table_name = 'expenses' then
    v_id := new.id;
  else
    v_id := coalesce(new.expense_id, old.expense_id);
  end if;

  -- if the expense is gone (cascade delete), nothing to check
  if exists (select 1 from public.expenses e where e.id = v_id)
     and (select coalesce(sum(s.share_minor), 0) from public.expense_splits s where s.expense_id = v_id)
         <> (select e.amount_minor from public.expenses e where e.id = v_id)
  then
    raise exception 'splits_dont_add_up';
  end if;
  return null;
end;
$$;

create constraint trigger expense_splits_sum_check
  after insert or update or delete on public.expense_splits
  deferrable initially deferred
  for each row execute function public.check_expense_split_sum();

create constraint trigger expenses_sum_check
  after insert or update of amount_minor on public.expenses
  deferrable initially deferred
  for each row execute function public.check_expense_split_sum();

revoke execute on function public.check_expense_split_sum() from public, anon, authenticated;
```

> The checks run at **commit**, so an insert of an expense followed by its splits in the same transaction is fine, and an expense with no splits (sum 0) fails. In tests, use `set constraints all immediate;` to see the error right away.

### 8.3 The split engine

```sql
create or replace function public.compute_shares(
  p_type text, p_amount bigint, p_participants jsonb
) returns table (user_id uuid, share_minor bigint, percent_bp integer)
language plpgsql immutable set search_path = '' as $$
declare
  v_count    int;
  v_distinct int;
  v_sum      bigint;
begin
  if p_participants is null
     or jsonb_typeof(p_participants) <> 'array'
     or jsonb_array_length(p_participants) = 0 then
    raise exception 'no_participants';
  end if;

  v_count := jsonb_array_length(p_participants);
  if v_count > 50 then raise exception 'too_many_participants'; end if;

  -- every element: an object with a valid uuid user_id
  if exists (
    select 1 from jsonb_array_elements(p_participants) e
    where jsonb_typeof(e) <> 'object'
       or coalesce(e ->> 'user_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'invalid_split_value';
  end if;

  select count(distinct (e ->> 'user_id')::uuid) into v_distinct
    from jsonb_array_elements(p_participants) e;
  if v_distinct <> v_count then raise exception 'duplicate_participant'; end if;

  if p_type = 'equal' then
    return query
      with p as (select (e ->> 'user_id')::uuid as uid from jsonb_array_elements(p_participants) e),
           n as (select uid, row_number() over (order by uid) as rn, count(*) over () as cnt from p)
      select n.uid,
             (p_amount / n.cnt) + case when n.rn <= (p_amount % n.cnt) then 1 else 0 end,
             null::integer
        from n;
    return;
  end if;

  if p_type = 'exact' then
    if exists (
      select 1 from jsonb_array_elements(p_participants) e
      where coalesce(jsonb_typeof(e -> 'value'), '') <> 'number'
         or coalesce(e ->> 'value', '') !~ '^[1-9][0-9]{0,9}$'
    ) then
      raise exception 'invalid_split_value';
    end if;

    select sum((e ->> 'value')::bigint) into v_sum from jsonb_array_elements(p_participants) e;
    if v_sum <> p_amount then raise exception 'splits_dont_add_up'; end if;

    return query
      select (e ->> 'user_id')::uuid, (e ->> 'value')::bigint, null::integer
        from jsonb_array_elements(p_participants) e;
    return;
  end if;

  if p_type = 'percent' then
    if exists (
      select 1 from jsonb_array_elements(p_participants) e
      where coalesce(jsonb_typeof(e -> 'value'), '') <> 'number'
         or coalesce(e ->> 'value', '') !~ '^([1-9][0-9]{0,3}|10000)$'      -- 1 to 10000
    ) then
      raise exception 'invalid_split_value';
    end if;

    select sum((e ->> 'value')::bigint) into v_sum from jsonb_array_elements(p_participants) e;
    if v_sum <> 10000 then raise exception 'splits_dont_add_up'; end if;

    return query
      with p as (select (e ->> 'user_id')::uuid as uid, (e ->> 'value')::int as bp
                   from jsonb_array_elements(p_participants) e),
           c as (select uid, bp,
                        (p_amount * bp) / 10000 as base,
                        (p_amount * bp) % 10000 as frac
                   from p),
           t as (select sum(base) as s from c),
           r as (select c.*, row_number() over (order by c.frac desc, c.uid) as rn from c)
      select r.uid,
             r.base + case when r.rn <= (p_amount - (select s from t)) then 1 else 0 end,
             r.bp
        from r;
    return;
  end if;

  raise exception 'invalid_split_type';
end;
$$;

revoke execute on function public.compute_shares(text, bigint, jsonb) from public, anon, authenticated;
```

### 8.4 `add_expense`

```sql
create or replace function public.add_expense(
  p_group uuid, p_client_request_id uuid, p_description text, p_amount_minor bigint,
  p_paid_by uuid, p_split_type text, p_participants jsonb, p_category text, p_expense_date date
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  v_desc     text := nullif(btrim(regexp_replace(coalesce(p_description, ''), '[[:cntrl:]]', '', 'g')), '');
  v_id       uuid;
  v_existing uuid;
  v_bad_user uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- SHARED lock on the group: expense writes can run together, but never at the same time as a
  -- membership change (those take an exclusive lock on the same row).
  perform 1 from public.groups g where g.id = p_group for share;
  if not found or not public.is_active_member(p_group) then
    raise exception 'not_a_member';
  end if;

  -- idempotency: the same request id from the same user returns the same expense
  if p_client_request_id is not null then
    select e.id into v_existing from public.expenses e
     where e.created_by = v_uid and e.client_request_id = p_client_request_id;
    if found then return v_existing; end if;
  end if;

  if p_amount_minor is null or p_amount_minor < 1 or p_amount_minor > 1000000000 then
    raise exception 'invalid_amount';
  end if;
  if v_desc is not null and char_length(v_desc) > 100 then raise exception 'invalid_description'; end if;
  if p_category is not null and p_category not in
     ('food','groceries','travel','stay','fuel','shopping','bills','entertainment','rent','other') then
    raise exception 'invalid_category';
  end if;
  if p_expense_date is null or p_expense_date > current_date + 1 or p_expense_date < current_date - 3650 then
    raise exception 'invalid_date';
  end if;
  if p_split_type is null or p_split_type not in ('equal', 'exact', 'percent') then
    raise exception 'invalid_split_type';
  end if;

  if not exists (select 1 from public.group_members gm
                  where gm.group_id = p_group and gm.user_id = p_paid_by and gm.status = 'active') then
    raise exception 'payer_not_member';
  end if;

  -- compute_shares validates structure, duplicates, counts and sums
  select s.user_id into v_bad_user
    from public.compute_shares(p_split_type, p_amount_minor, p_participants) s
   where not exists (select 1 from public.group_members gm
                      where gm.group_id = p_group and gm.user_id = s.user_id and gm.status = 'active')
   limit 1;
  if v_bad_user is not null then
    raise exception 'participant_not_member' using detail = v_bad_user::text;
  end if;

  begin
    insert into public.expenses
      (group_id, description, amount_minor, paid_by, split_type, category, expense_date,
       created_by, client_request_id)
    values
      (p_group, v_desc, p_amount_minor, p_paid_by, p_split_type, p_category, p_expense_date,
       v_uid, p_client_request_id)
    returning id into v_id;
  exception when unique_violation then
    -- two identical requests raced: return the one that won
    select e.id into v_existing from public.expenses e
     where e.created_by = v_uid and e.client_request_id = p_client_request_id;
    return v_existing;
  end;

  insert into public.expense_splits (expense_id, user_id, share_minor, percent_bp)
  select v_id, s.user_id, s.share_minor, s.percent_bp
    from public.compute_shares(p_split_type, p_amount_minor, p_participants) s;

  insert into public.activity_log (group_id, actor_id, action, ref_id, details)
  values (p_group, v_uid, 'expense_added', v_id,
          jsonb_build_object('description', v_desc, 'amount_minor', p_amount_minor, 'category', p_category));

  return v_id;
end;
$$;

revoke execute on function public.add_expense(uuid, uuid, text, bigint, uuid, text, jsonb, text, date)
  from public, anon;
grant execute on function public.add_expense(uuid, uuid, text, bigint, uuid, text, jsonb, text, date)
  to authenticated;
```

### 8.5 `edit_expense` (shape of the checks)

```sql
create or replace function public.edit_expense(
  p_expense uuid, p_expected_version int, p_description text, p_amount_minor bigint,
  p_paid_by uuid, p_split_type text, p_participants jsonb, p_category text, p_expense_date date
) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  v_group    uuid;
  v_exp      public.expenses;
  v_desc     text := nullif(btrim(regexp_replace(coalesce(p_description, ''), '[[:cntrl:]]', '', 'g')), '');
  v_bad_user uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select e.group_id into v_group from public.expenses e where e.id = p_expense;
  if not found then raise exception 'expense_not_found'; end if;

  perform 1 from public.groups g where g.id = v_group for share;          -- 1) group, shared
  if not public.is_active_member(v_group) then raise exception 'not_a_member'; end if;

  select * into v_exp from public.expenses e where e.id = p_expense for update;   -- 2) expense, exclusive
  if not found or v_exp.deleted_at is not null then raise exception 'expense_not_found'; end if;

  if not (v_exp.created_by = v_uid or public.is_group_admin(v_group)) then
    raise exception 'not_allowed';                                         -- permission first
  end if;
  if public.expense_is_locked(p_expense) then raise exception 'expense_locked'; end if;
  if v_exp.version <> p_expected_version then raise exception 'expense_changed'; end if;

  -- same validations as add_expense: amount, description, category, date, split type,
  -- payer is an active member, participants from compute_shares are all active members
  -- (omitted here, copy them from add_expense)

  update public.expenses
     set description = v_desc, amount_minor = p_amount_minor, paid_by = p_paid_by,
         split_type = p_split_type, category = p_category, expense_date = p_expense_date,
         version = version + 1, updated_at = now()
   where id = p_expense;

  delete from public.expense_splits where expense_id = p_expense;
  insert into public.expense_splits (expense_id, user_id, share_minor, percent_bp)
  select p_expense, s.user_id, s.share_minor, s.percent_bp
    from public.compute_shares(p_split_type, p_amount_minor, p_participants) s;

  insert into public.activity_log (group_id, actor_id, action, ref_id, details)
  values (v_group, v_uid, 'expense_edited', p_expense,
          jsonb_build_object('description', v_desc, 'amount_minor', p_amount_minor,
                             'old_amount_minor', v_exp.amount_minor));

  return v_exp.version + 1;
end;
$$;
```

> `delete_expense` and `restore_expense` use the same first steps (group shared lock, expense exclusive lock, permission, locked check). Delete on an already deleted expense and restore on a non-deleted expense are **silent no-ops** (no version bump, no log entry).

### 8.6 The lock helper

```sql
create or replace function public.expense_is_locked(p_expense uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.expenses e
    where e.id = p_expense
      and (
        not exists (select 1 from public.group_members gm
                     where gm.group_id = e.group_id and gm.user_id = e.paid_by and gm.status = 'active')
        or exists (select 1 from public.expense_splits s
                    where s.expense_id = e.id
                      and not exists (select 1 from public.group_members gm
                                       where gm.group_id = e.group_id
                                         and gm.user_id = s.user_id and gm.status = 'active'))
      )
  );
$$;
revoke execute on function public.expense_is_locked(uuid) from public, anon, authenticated;
```

---

## 9. Notes on choices (so they are not re-debated mid-build)

- **Server computes the shares** for equal and percent, so a tampered or buggy app can never create wrong money. The TypeScript mirror exists only to show a live preview.
- **Shared test vectors** are the guarantee that preview and server agree. If they ever differ, the bug is found by a test, not by a user.
- **Basis points** (integers) for percentages avoid every decimal-rounding problem.
- **Largest-remainder rounding** is the standard fair way to hand out leftover paise; ties by user id keep it deterministic.
- **`version` column** gives safe editing when two people edit at once, without locking screens.
- **`client_request_id`** is the cure for the classic "I tapped Save twice" and "bad network, retried" duplicates.
- **Soft delete + Undo** matches the UX goal (no scary confirm dialogs) and keeps history for Phase 5 and audits.
- **Locked expenses** protect people who already left; the lock is computed live, so it lifts by itself if they rejoin.
- **Shared vs exclusive group lock:** expense writes take a shared lock (they can run together), membership changes take an exclusive lock (they run alone), so an expense can never be saved with someone who is just leaving.
- **No direct table access at all** keeps the security audit in Phase 8 simple: there is nothing to misconfigure on these three tables.
- **No cascade on foreign keys to `profiles`** keeps smart account deletion working (anonymize when referenced).

---

## 10. Hooks for later phases

| Phase | What it must do for Phase 4 |
|-------|------------------------------|
| 5 | Balances are computed from non-deleted `expenses` and `expense_splits` plus confirmed settlements. Net per person = paid − share. Replace the stubs `member_is_settled` and `group_is_settled`, and the unsettled part of `account_deletion_blockers()`. Re-run the Phase 3 cases GM2, GM7, GE5 and the deletion cases against real data. `list_my_groups()` gains `my_balance_minor` |
| 6 | Settlements reference the same group and use `is_active_member()`; consider a "settle the exact amount" shortcut from the expense detail |
| 7 | Receipt photo per expense, recurring expenses, multi-currency (open up the `INR` checks), push notifications for new expenses, CSV export |
| 8 | Full RLS and privilege audit including all Phase 4 functions; consider rate limits on expense creation |

---

## 11. Phase 4 Definition of Done

- [ ] 4.1 to 4.9 completed, tested, and confirmed one by one
- [ ] The 18 shared split vectors pass in **both** SQL and Jest
- [ ] Every case ID in Section 6 has a pass result in `docs/phase-4-test-log.md`
- [ ] The concurrency results (idempotent save race, leave-while-adding race) are recorded
- [ ] Clients have **no** direct access to `expenses`, `expense_splits` or `activity_log`
- [ ] The sum-of-shares constraint trigger is proven by a test
- [ ] No floating-point money math anywhere (search the code)
- [ ] Add expense works with only an amount and Save; the preview matches what the server stored
- [ ] Edit conflicts, locked expenses, delete and undo all behave as specified
- [ ] `npm run check` and `npx supabase test db` pass
- [ ] Docs updated; tagged `phase-4-done`
- [ ] Decisions D13 to D24 have recorded answers

---

## 12. Common problems and fixes

| Problem | Fix |
|---------|-----|
| Shares are off by one paisa between preview and server | The two implementations differ in tie-breaking or sorting. Run the shared vectors; sort participants by lowercase uuid text in both |
| `column reference "user_id" is ambiguous` in `compute_shares` | Output column names clash with table columns. Use CTE aliases like `uid` and never reference columns named like the output columns |
| Validation lets a missing `value` through | `null <> 'number'` is null, not true. Wrap with `coalesce(...)` as in Section 8.3 |
| Saving the expense fails with `splits_dont_add_up` at commit | A split row was changed or deleted without the matching total change. In edit, replace all splits in the same transaction as the update |
| Duplicate expenses after a bad network | The app generated a new `client_request_id` on retry. Create it once per form session |
| Edit never conflicts / always conflicts | The app must send the version it loaded, and refresh it after a successful save |
| "permission denied for table expenses" in the app | The app is reading tables directly. Use the RPC functions only |
| Deadlock errors | A function took locks in a different order. Always group first, then expense |
| List jumps or shows duplicates while scrolling | Pagination used offsets. Use the keyset cursor `(expense_date, created_at, id)` |
| Amount typed as "1.1" becomes ₹1.10 vs ₹1.01 confusion | The parser must treat the digits after the dot as paise digits: "1.1" is 110 paise, "1.01" is 101 paise |
| Account deletion fails or leaves a stray row | A foreign key to `profiles` was created with `on delete cascade`. Remove the cascade |
| "Today" is wrong near midnight | `expense_date` is a calendar date from the phone's local date; the server only allows up to tomorrow for time-zone differences |

---

## 13. Starter prompt for Claude Code

```
You are continuing SplitEase (React Native + Expo, TypeScript, Supabase). Phases 1 to 3 are done (tags phase-1-done, phase-2-done, phase-3-done).

Read these first and follow them strictly:
- docs/prd.md
- docs/phase-4.md (the current phase: the split engine rules, error codes, and Case Matrix)
- docs/phase-3.md and docs/phase-2.md (their rules still apply)
- CLAUDE.md

Rules:
1. Work ONLY on sub-phase 4.1 right now. Do not start 4.2 or anything else.
2. The backend (4.1 to 4.4) comes before any screen. Do not build UI until 4.5.
3. All money is integer paise. No floats anywhere. The server (Postgres functions) is the source of truth; the TypeScript mirror is for preview only.
4. Clients get NO direct access to expenses, expense_splits or activity_log: RLS on, no policies, no grants. Every read and write goes through RPC functions.
5. Every new function: SECURITY DEFINER, SET search_path = '', user from auth.uid() only, execute revoked from public and anon. Lock order is always: group row first, then expense row.
6. Foreign keys to profiles must NOT use ON DELETE CASCADE (smart account deletion depends on it).
7. Write the SQL tests described in the sub-phase. A sub-phase is not done until its tests pass.
8. STOP when 4.1 is done and tell me: what you created, the exact commands you ran, the test output, and how I can verify it myself.
9. Keep every change small. Never use or ask for the service_role key. Never commit .env or secrets. Never log emails, tokens, UPI IDs or expense contents.
10. Every sub-phase must satisfy the case IDs it lists in docs/phase-4.md. If a case cannot be met, tell me instead of working around it.
11. Do not add libraries or services that the current sub-phase does not list.

Start with 4.1 now.
```

After 4.1 is confirmed, say "continue with 4.2", and so on.
