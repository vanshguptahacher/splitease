# SplitEase — Product Requirements Document (PRD)

**Version:** 1.1
**Owner:** Vansh (THOR)
**Platform:** Android (Play Store), built with React Native + Expo
**Backend:** Supabase (Postgres, Auth, Row Level Security, Storage)
**Status:** Fresh rebuild from scratch (previous attempts discarded)

> Note: The SplitEase Telegram bot is a **separate product**. It is NOT part of this PRD. Do not mix the two codebases. A bot/app sync may come in v2.

---

## 1. Overview

SplitEase is an expense-splitting app (a Splitwise alternative) made for Indian users. Friends, family and roommates add shared expenses to a group, the app calculates who owes whom, and people settle up using **UPI** directly from the app.

**Why this app exists**
- Practice project to build and ship a production-quality mobile app.
- Real users from day one: a family beta group.
- Differentiator: UPI-first settle-up flow (Splitwise handles this poorly for India).

## 2. Goals and Non-Goals

### 2.1 Goals (v1)
1. A clean, stable, good-looking app with no glitches in the core flow.
2. Correct money math. Balances must always be accurate to the paisa.
3. UPI deep-link settle-up flow.
4. Secure by default (RLS on every table, no data leaks between groups).
5. Published on the Google Play Store.

### 2.2 Non-Goals (v1)
- iOS release
- Telegram bot integration or sync
- Real payment processing / money holding (the app never touches money; UPI apps do)
- Bank account linking
- Web app
- Premium / paid plans
- Cloudflare Workers or any extra backend layer (added later, see Phase 7 and Section 16)

## 3. Target Users

| User | Description | Main need |
|------|-------------|-----------|
| Family members | Parents, siblings, relatives sharing household / trip costs | Simple UI, no confusion |
| Friends | Trips, dinners, outings | Quick expense entry, easy settle-up |
| Roommates | Rent, groceries, bills | Recurring-style tracking, clear balances |

**Primary persona:** a non-technical Indian smartphone user who already uses UPI daily. The app must be understandable without any tutorial.

## 4. Tech Stack and Architecture

| Layer | Choice | Notes |
|-------|--------|-------|
| App | React Native + Expo (TypeScript, native Android project generated with `expo prebuild`) | Fresh Expo project, no code copied from old attempts |
| Navigation | Expo Router | File-based routing |
| UI library | React Native Paper (Material 3) | Do not hand-design components from scratch |
| State / data | TanStack Query + Supabase JS client | Server state via Query, minimal local state |
| Forms | React Hook Form + Zod | Validation for all inputs |
| Backend | Supabase only | Postgres + RLS + SQL functions (RPC). All writes to money and group data go through RPC functions. **No FastAPI and no Cloudflare Workers in v1.** |
| Auth | Supabase Auth (Google Sign-In + email) | Phone OTP is optional later (SMS cost) |
| Storage | Supabase Storage | Avatars, receipt photos (Phase 7) |
| Build / release | `npx expo prebuild --platform android` + local Gradle build (AAB), manual upload to Play Console | Play Store internal testing → production |
| Error tracking | Sentry (free tier) | Added in Phase 8 |

**Architecture rules (server is the source of truth):**
1. All business logic that affects money (split calculation, validation, balances, simplification) runs **on the server, inside Postgres functions (RPC)**.
2. The app **cannot write directly** to money or group tables. `INSERT/UPDATE/DELETE` is revoked for clients; the only write path is calling an RPC function, which validates everything.
3. The app reads data through RLS-protected `SELECT` queries and RPC read functions (e.g. balances).
4. `/lib/money` in the app is a **preview-only mirror** of the server logic (so the user sees live totals while typing). The server result always wins.
5. UI components never calculate money themselves.

### 4.1 Suggested folder structure
```
/app                # Expo Router screens
/components         # Reusable UI components
/lib
  /supabase         # client, typed queries
  /money            # preview-only mirror of server split/balance logic (unit tested)
  /upi              # UPI deep-link builder
/hooks              # React Query hooks
/types              # Generated Supabase types
/supabase
  /migrations       # SQL migrations (schema, RLS, privileges, RPC functions)
/tests
```

## 5. Core User Flows

1. **Onboarding:** Open app → sign in with Google/email → set name and (optional) UPI ID → land on Groups screen.
2. **Create group:** Tap "+" → name the group → pick currency (INR default) → group created, user is admin → share invite link/code.
3. **Join group:** Open invite link or enter code → join as member.
4. **Add expense:** Open group → "Add expense" → enter description, amount, who paid, who shares, split type → save → balances update.
5. **View balances:** Group screen shows "You owe / You are owed" summary and per-person balances.
6. **Settle up:** Tap "Settle up" with a person → app shows simplified amount → "Pay via UPI" opens UPI app → user returns and taps "I paid" → receiver confirms → balance updates.

## 6. Feature Requirements by Phase

The project is built in **9 phases**. Each phase is split into sub-phases. **Work stops after each sub-phase** so the app can be run and tested before moving on.

**MVP = Phases 1–6 + 8 + 9. Phase 7 is optional and may be moved to v2.**

---

### Phase 1 — Project Setup
**Goal:** A clean running app skeleton connected to Supabase.

- 1.1 Create new Expo project (TypeScript), set up folder structure, ESLint, Prettier.
- 1.2 Create Supabase project, add env variables, connect client, verify a test query.
- 1.3 Install and configure Expo Router + React Native Paper theme (light + dark, brand colors, typography).
- 1.4 Build base layout components: screen wrapper, app bar, loading state, empty state, error state.
- 1.5 Run on a real Android phone and emulator. Confirm no warnings or errors.

**Acceptance:** App launches on a real phone, shows a themed placeholder home screen, Supabase connection verified, zero console errors.

---

### Phase 2 — Auth and Profile
**Goal:** Users can sign in and have a profile.

- 2.1 Supabase Auth setup: Google Sign-In and email login.
- 2.2 `profiles` table + trigger to auto-create a profile on signup + RLS.
- 2.3 Auth flow screens: welcome, sign in, sign up, error handling.
- 2.4 Session persistence and protected routes (logged-out users cannot see app screens).
- 2.5 Profile screen: edit name, avatar, UPI ID (validated format `name@bank`).
- 2.6 Logout and delete-account flow (required by Play Store policy).

**Acceptance:** A user can sign up, close and reopen the app and still be logged in, edit their profile, log out and delete their account. A user can only read/edit their own profile.

---

### Phase 3 — Groups and Members
**Goal:** Users can create groups and invite others.

- 3.1 Tables: `groups`, `group_members`, `invites` with RLS (only members can SELECT). Direct INSERT/UPDATE/DELETE is revoked; writes happen through RPC functions: `create_group`, `join_group` (validates invite code and expiry), `create_invite`, `revoke_invite`, `remove_member`, `leave_group`, `delete_group`.
- 3.2 Create group screen and groups list screen (with empty state).
- 3.3 Group detail screen shell (tabs: Expenses, Balances, Members).
- 3.4 Invite system: generate invite code/link with expiry; join via link or code.
- 3.5 Members list; admin can remove members; members can leave a group (only if their balance is settled, otherwise show a warning).
- 3.6 Edit group name; delete group (admin only, with confirmation).

**Acceptance:** Two different accounts can be in the same group; a third account that is not a member cannot see or query that group's data.

---

### Phase 4 — Expenses
**Goal:** Members can add, edit and delete shared expenses.

- 4.1 Tables: `expenses`, `expense_splits` with RLS (members can SELECT only). **Revoke INSERT/UPDATE/DELETE** on both tables from `anon` and `authenticated`.
- 4.2 Server-side RPC functions (`SECURITY DEFINER`): `add_expense`, `edit_expense`, `delete_expense`. They compute and validate the split on the server (see Section 8), check membership and permissions, write the activity log, and are the **only** way to change expense data. Add SQL tests. Also build `/lib/money` as a preview-only mirror for the UI, with unit tests and a parity test against the server results.
- 4.3 Add expense screen: description, amount, date, category, payer (single payer in v1), participants. The screen calls `add_expense`; it never inserts into tables directly.
- 4.4 Split types: **Equal**, **Exact amounts**, **Percentages**. Live validation that splits add up to the total.
- 4.5 Expense list in the group (grouped by date, shows who paid and your share).
- 4.6 Expense detail, edit and delete (soft delete). Only the creator or group admin can edit/delete.
- 4.7 Activity log entry for each add/edit/delete.

**Acceptance:** Every split type produces shares that sum **exactly** to the total amount. No rounding drift. Editing an expense updates balances correctly. A direct insert/update/delete on `expenses` or `expense_splits` from the client fails.

---

### Phase 5 — Balances and Settle-Up
**Goal:** Everyone can see who owes whom, in the simplest form.

- 5.1 Balance calculation in a Postgres function (`get_group_balances`): net balance per member per group. The app only reads the result.
- 5.2 "Simplify debts" algorithm to minimise the number of payments (see Section 8.3), implemented server-side as `get_simplified_debts`.
- 5.3 Balances tab: your summary at the top ("You owe ₹X" / "You are owed ₹Y"), then per-person list.
- 5.4 Home screen overview: total across all groups.
- 5.5 Settlement table + manual "Record a payment" (cash / other) so balances can be cleared without UPI. Done through RPC `record_settlement`; direct writes to `settlements` are revoked.
- 5.6 SQL tests and unit tests covering edge cases (see Section 13).

**Acceptance:** For any set of expenses and settlements, the sum of all balances in a group is exactly 0. Simplified payments, if all executed, bring every balance to 0.

---

### Phase 6 — UPI Payments
**Goal:** One-tap UPI settle-up.

- 6.1 UPI deep-link builder in `/lib/upi` (see Section 9).
- 6.2 "Pay via UPI" button on settle-up screen; requires receiver's UPI ID (if missing, show "Ask [name] to add their UPI ID").
- 6.3 Handle the case where no UPI app is installed.
- 6.4 Payment confirmation flow: payer taps "I paid" (status `pending`) → receiver gets a prompt to "Confirm received" (status `confirmed`) or "Dispute". Implemented via RPC `create_settlement`, `confirm_settlement`, `dispute_settlement`, `cancel_settlement`; the function checks that only the receiver can confirm and that status transitions are valid.
- 6.5 Optional field for UPI transaction reference ID for record keeping.
- 6.6 Settlement history screen.

**Acceptance:** On a real phone, tapping "Pay via UPI" opens the UPI app with receiver, amount and note pre-filled. Balance only updates after the receiver confirms (or the payer cancels).

---

### Phase 7 — Extra Features (OPTIONAL, can move to v2)
Each item is independent. Build one at a time.

Items that need server-side secrets or scheduled jobs (7.1 push sending, 7.2 reminders, 7.4 receipt AI) use **Supabase Edge Functions** or **Cloudflare Workers**. Workers are added only at this stage, not in v1. Even then, Workers must not bypass the RPC functions or use the `service_role` key to write money data without the same validation.

- 7.1 Push notifications (new expense added, payment requested, payment confirmed).
- 7.2 Reminders: "Remind" button for a person who owes you.
- 7.3 Export group expenses to CSV/PDF.
- 7.4 Receipt photo attached to an expense (Supabase Storage).
- 7.5 Multi-currency support with manual exchange rate per expense.
- 7.6 Recurring expenses (e.g. monthly rent).
- 7.7 Charts: spending by category and by month.

---

### Phase 8 — Security and Polish
**Goal:** Production-grade quality.

- 8.1 **RLS and privilege audit:** test every table with a non-member account; confirm no read/write access. Confirm that direct writes to money and group tables are blocked for every logged-in user.
- 8.2 Input validation on client (Zod) and server (DB constraints, check constraints on amounts).
- 8.3 Error handling: friendly messages, retry buttons, no raw error text shown to users.
- 8.4 Offline handling: clear "No internet" state, queue or block writes safely (no silent data loss).
- 8.5 Performance: list virtualization (FlatList/FlashList), image sizing, avoid unnecessary re-renders.
- 8.6 UI polish pass: spacing, consistent typography, animations, dark mode check, small-screen check.
- 8.7 Sentry integration, app icon, splash screen.
- 8.8 Accessibility basics: touch targets, contrast, font scaling.

**Acceptance:** No critical or high-severity issues from the RLS test checklist. App feels smooth on a low-end Android device.

---

### Phase 9 — Testing and Play Store Release
**Goal:** Ship it.

- 9.1 Full manual test pass against the test checklist (Section 13).
- 9.2 Family beta via Google Play **Internal testing** track; collect feedback and fix bugs.
- 9.3 Play Store listing: name, short and full description, screenshots, feature graphic, icon.
- 9.4 Privacy policy page (hosted publicly) and Data Safety form in Play Console.
- 9.5 Account deletion URL/flow as required by Play policy.
- 9.6 Generate the Android project with `npx expo prebuild --platform android`, create a signed release AAB with Gradle (`./gradlew bundleRelease`), upload it to Play Console, submit for review, staged rollout. Keep the upload keystore backed up safely (never commit it to git).

**Acceptance:** App approved and live on the Play Store.

## 7. Data Model

> All money is stored as **integers in the smallest unit (paise)**. Never use floats for money.
>
> Tables holding money and group data are **read-only for clients**. Writes happen only through RPC functions (see Section 10).

### `profiles`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | = `auth.users.id` |
| name | text | required |
| avatar_url | text | nullable |
| upi_id | text | nullable, format validated |
| created_at | timestamptz | default now() |

### `groups`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | required |
| currency | text | default `INR` |
| created_by | uuid FK profiles | |
| created_at | timestamptz | |

### `group_members`
| Column | Type | Notes |
|--------|------|-------|
| group_id | uuid FK groups | composite PK |
| user_id | uuid FK profiles | composite PK |
| role | text | `admin` or `member` |
| joined_at | timestamptz | |

### `invites`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| group_id | uuid FK groups | |
| code | text unique | short random code |
| created_by | uuid FK profiles | |
| expires_at | timestamptz | |
| revoked | boolean | default false |

### `expenses`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| group_id | uuid FK groups | |
| description | text | required |
| amount_minor | bigint | > 0, check constraint |
| currency | text | |
| paid_by | uuid FK profiles | must be a group member |
| split_type | text | `equal`, `exact`, `percent` |
| category | text | nullable |
| expense_date | date | |
| created_by | uuid FK profiles | |
| created_at | timestamptz | |
| deleted_at | timestamptz | soft delete |

### `expense_splits`
| Column | Type | Notes |
|--------|------|-------|
| expense_id | uuid FK expenses | composite PK |
| user_id | uuid FK profiles | composite PK |
| share_minor | bigint | >= 0; sum per expense must equal `expenses.amount_minor` |

### `settlements`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| group_id | uuid FK groups | |
| from_user | uuid FK profiles | payer |
| to_user | uuid FK profiles | receiver |
| amount_minor | bigint | > 0 |
| method | text | `upi`, `cash`, `other` |
| upi_txn_ref | text | nullable |
| status | text | `pending`, `confirmed`, `disputed`, `cancelled` |
| created_at | timestamptz | |
| confirmed_at | timestamptz | nullable |

### `activity_log`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| group_id | uuid FK groups | |
| actor_id | uuid FK profiles | |
| action | text | e.g. `expense_added`, `settlement_confirmed` |
| ref_id | uuid | related record |
| created_at | timestamptz | |

## 8. Money and Balance Logic (Critical)

### 8.1 Rules
- The **server (Postgres functions) is the source of truth** for every calculation below. The TypeScript module in `/lib/money` only mirrors them for live preview.
- All amounts are integers in paise. Convert to rupees only for display.
- Every split must sum **exactly** to the expense total.
- Soft-deleted expenses are excluded from balances.
- Only `confirmed` settlements affect balances.

### 8.2 Split calculation
- **Equal:** `base = floor(total / n)`, `remainder = total % n`. Give 1 extra paisa to the first `remainder` participants in a deterministic order (e.g. sorted by user id). Shares then sum exactly to the total.
- **Exact:** user enters each share; validate that sum equals total.
- **Percent:** percentages must sum to 100. Compute shares with floor, then distribute the leftover paise deterministically (largest fractional remainder first).

### 8.3 Balance and simplification
**Net balance per user** = (total they paid) − (total of their shares) + (settlements they paid, confirmed) − (settlements they received, confirmed).

- Positive balance → the user is owed money. Negative → the user owes money.
- The sum of all net balances in a group must be exactly **0**.

**Simplify debts (greedy):**
1. Split users into creditors (balance > 0) and debtors (balance < 0).
2. Repeatedly take the largest creditor and the largest debtor.
3. Create a payment of `min(creditor, |debtor|)` from debtor to creditor.
4. Subtract it from both, remove anyone at 0, repeat until none remain.

This produces at most `n − 1` payments for `n` people.

## 9. UPI Payment Spec

**Deep link format:**
```
upi://pay?pa=<receiver_upi_id>&pn=<receiver_name>&am=<amount_in_rupees>&cu=INR&tn=<note>
```
- `am` uses a decimal with 2 places (e.g. `250.00`).
- URL-encode all values. Note example: `SplitEase - <group name>`.
- Open via `Linking.openURL`. Check `Linking.canOpenURL` first and show a fallback message if no app handles it.

**Important limitation:** UPI apps do not reliably report payment success back to the calling app. So the app **must not assume** payment succeeded. It uses the two-step human confirmation flow (payer "I paid" → receiver "Confirm").

**Android config:** add the `upi` scheme under `queries` in the manifest (via Expo config) so `canOpenURL` works on Android 11+.

## 10. Security Requirements

1. **RLS enabled on every table.** No table without policies.
2. Group data is visible only to members (check through `group_members`).
3. Only the expense creator or a group admin can edit or delete an expense.
4. Users can edit only their own profile.
5. Settlement can only be confirmed by the receiver.
6. Invite codes are random, expire, and can be revoked.
7. Supabase **service role key is never shipped in the app**. Only the anon key is used on the client.
8. Secrets live in local env files (git-ignored), never committed to git. The release keystore and its passwords are also never committed.
9. DB check constraints: amounts > 0, valid enums. Split sums are enforced inside the RPC functions, with a constraint trigger as a second safety net.
10. Rate-limit or throttle invite-code attempts.
11. Do not log sensitive data (UPI IDs, emails) to Sentry or console.
12. **Clients cannot write to money or group tables directly.** `REVOKE INSERT, UPDATE, DELETE` on `expenses`, `expense_splits`, `settlements`, `activity_log`, `groups`, `group_members` and `invites` from `anon` and `authenticated`. Only RPC functions write.
13. Every RPC function is `SECURITY DEFINER` with `SET search_path = ''`, uses fully qualified names, derives the user from `auth.uid()` (never from a parameter), and rejects the call if `auth.uid()` is null.
14. `REVOKE EXECUTE` on all functions from `PUBLIC` and `anon`; grant to `authenticated` only where needed.
15. Each function validates: group membership, role or ownership, amount > 0, split sum equals total, payer and participants are members, and valid settlement status transitions.

## 11. UX and UI Guidelines

- **Use a ready UI library** (React Native Paper). No custom-designed components unless necessary.
- Pick **one reference design** (e.g. Splitwise's layout) and follow its structure; customise colors and branding only.
- Brand: clean, friendly, green/teal primary color, rounded cards, plenty of spacing.
- Amount display: `₹1,234.50`, positive balances in green, negative in red/orange, always with a text label (not color alone).
- Every list has: loading skeleton, empty state with a clear action, error state with retry.
- Add-expense must be completable in under 15 seconds for the equal-split case.
- Support light and dark mode.
- Minimum touch target 48dp.
- Language: English in v1; Hindi localization is a possible v2 item.

## 12. Non-Functional Requirements

| Area | Requirement |
|------|-------------|
| Performance | Cold start under 3 seconds on a mid-range Android phone; lists scroll at ~60fps |
| Reliability | No crashes in core flows; crash-free sessions above 99% |
| Compatibility | Android 8.0+ (API 26+) |
| Data accuracy | Balances always correct to the paisa |
| Privacy | Data stored only in Supabase; account deletion removes personal data |
| Maintainability | TypeScript strict mode; money logic unit tested |

## 13. Testing Plan

### 13.1 Money logic tests (mandatory: SQL tests for server functions + unit tests for the TS mirror)
- Equal split with remainder (e.g. ₹100 among 3 → 33.34 / 33.33 / 33.33).
- Percent split that does not divide evenly.
- Exact split validation (sum mismatch rejected).
- Balances sum to exactly 0 for random generated data.
- Simplify algorithm clears all balances.
- Settlement confirmed vs pending vs disputed effects.
- Edit and delete of an expense recalculates correctly.
- Parity: the TS preview gives the same numbers as the server functions for the same inputs.

### 13.2 Manual test checklist (before each phase is marked done)
- Run on a real device, not only emulator.
- Test with 2–3 accounts at the same time.
- Test with no internet and with slow internet.
- Test logout/login and app restart in the middle of flows.

### 13.3 Security tests (Phase 8)
- Log in as a non-member and try to read/write another group's data through the Supabase client.
- Try to edit another user's profile, expense or settlement.
- Try expired and revoked invite codes.
- Try direct INSERT/UPDATE/DELETE on `expenses`, `expense_splits` and `settlements` using a valid logged-in user's token; all must fail.
- Call RPC functions as a non-member, with wrong amounts and with mismatched splits; all must be rejected.

## 14. Release Plan

1. **Internal testing** (family beta) via Play Console.
2. Fix issues from feedback; at least one full week of use before moving on.
3. Prepare store listing, privacy policy, Data Safety form, account deletion flow.
4. Production release with **staged rollout** (10% → 50% → 100%).
5. Monitor Sentry and Play Console crash reports for the first two weeks.

## 15. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Previous 3 attempts failed due to piled-up errors | Build in small sub-phases; run on device after each; stop and fix before continuing |
| Money rounding bugs | Integer paise only; unit tests; sum-to-zero invariant |
| UPI result cannot be verified | Two-step manual confirmation flow |
| RLS misconfiguration leaking data | Dedicated RLS test pass in Phase 8 |
| Someone tampers with data using the public API key | Direct writes revoked; RPC-only writes with server-side validation |
| Scope creep | Phase 7 is optional; new ideas go to a v2 list, not into current phases |
| Play Store rejection | Prepare privacy policy, data safety, account deletion early |

## 16. Future Scope (v2 and later)
- Cloudflare Workers layer (cron reminders, push sending, receipt-AI proxy, invite landing page, rate limiting) as features need server-side secrets or scheduling
- Telegram bot sync with the app
- iOS release
- Recurring expenses, charts, multi-currency (if not done in Phase 7)
- Multiple payers on one expense
- Hindi language support
- Friend-to-friend (non-group) expenses
- Premium features

## 17. Rules for the AI Coding Assistant (Claude Code)

1. Follow the phases and sub-phases in order. **Stop after each sub-phase** and wait for confirmation that it was tested.
2. Never skip ahead or add features that are not in the current sub-phase.
3. Keep every change small. After each change, the app must still run.
4. Money logic lives on the server in Postgres functions (authoritative). `/lib/money` is a preview-only mirror with unit tests; never calculate money inside components.
5. Every new table must come with RLS policies in the same migration. If it holds money or group data, also revoke INSERT/UPDATE/DELETE for clients and write through RPC functions.
6. Use integers (paise) for all money values.
7. Do not use the Supabase service role key in the client app.
8. Do not copy code from the old failed attempts.
9. If an error appears, fix the root cause before moving on; do not stack new code on top of a broken build.
10. At the end of each sub-phase, summarise what was done and list exactly how to test it.
11. Never write to money or group tables from the app with `.insert()`, `.update()` or `.delete()`; always call the RPC function.
12. Do not add Cloudflare Workers or any extra backend service in v1.
