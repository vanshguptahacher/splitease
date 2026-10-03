# Phase 5 Test Log: Balances, Settle-Up & Settlement Lifecycle

**Phase:** 5 — Balances and Settle-Up  
**Date:** 2026-10-04  
**Status:** ALL TESTS PASSING (100% Case Matrix Coverage)  
**Verified On:**
- Node.js v20.x, TypeScript 5.7+
- Supabase PostgreSQL 15.8 (pgTAP test runner)
- Physical Device: Samsung Galaxy M32 (`RZ8T41L5HFL`), Android 13
- Automated Suites: 28 Jest test suites (296 tests), 14 SQL pgTAP suites (516 tests)

---

## 1. Concurrency & Performance Summary

### Concurrency Architecture (Sub-phase 5.3)
1. **Shared Group Lock + Exclusive Row Lock:**
   - Settlement mutation RPCs (`create_settlement`, `confirm_settlement`, `dispute_settlement`, `cancel_settlement`, `undo_settlement`) acquire a shared lock on the group row (`select 1 from public.groups where id = ... for share;`).
   - Group membership changes (leaving, removing, deleting group) acquire an exclusive lock on the group row (`select 1 from public.groups where id = ... for update;`).
   - This ensures membership status cannot change while a settlement status transition is occurring, and settlements cannot be created while someone is in the process of leaving.
2. **Race: Confirm vs Cancel (`ST11`):**
   - Settlement row is locked exclusively (`for update`).
   - If payer cancels and receiver confirms concurrently, the first transaction acquires the lock and transitions the status; the second transaction reads the updated status and raises `invalid_transition` (or returns idempotent success if identical action).
3. **Spam & Idempotency Guards (`SC9`, `SC15`, `SC16`):**
   - Partial unique index `settlements_no_duplicate_pending` on `(group_id, from_user, to_user, amount_minor) where status = 'pending'` prevents concurrent creation of identical pending payments at the database constraint level.
   - Per-user pending cap (maximum 10 pending settlements created by a user per group) enforced under group lock.
   - `client_request_id` makes double-taps completely safe and idempotent.

### Performance Benchmark (Sub-phase 5.2)
- Tested group with 50 active members and 5,000 expense splits.
- Server-side `compute_group_nets(p_group)` execution time: **8.4ms**.
- Debt simplification algorithm `compute_simplified_debts(p_group)` execution time: **12.1ms**.
- Combined overview RPC `get_group_balances(p_group)` round-trip: **14.6ms**.
- Far below the sub-phase acceptance threshold (< 500ms).

---

## 2. Shared Test Vectors & Money Sanity Checklist

| Vector | Scenario | Calculated Nets | Expected Simplified Payments | Result |
|---|---|---|---|---|
| **V1** | A paid ₹300, equal split among A, B, C | A: +₹200, B: -₹100, C: -₹100 | B→A ₹100, C→A ₹100 | **PASS** |
| **V2** | A paid ₹100 (10,000 paise), equal split | A: +6,666p, B: -3,333p, C: -3,333p | B→A ₹33.33, C→A ₹33.33 (no lost paisa) | **PASS** |
| **V3** | A paid ₹300 for A, B; B paid ₹300 for A, B | All net 0 | None (All settled up) | **PASS** |
| **V4** | A paid ₹200 for B only; B paid ₹200 for C only | A: +₹200, B: ₹0, C: -₹200 | C→A ₹200 (direct 1 payment) | **PASS** |
| **V5** | Vector 1 + confirmed payment B→A ₹100 | A: +₹100, B: ₹0, C: -₹100 | C→A ₹100 | **PASS** |
| **V6** | Vector 1 + pending payment B→A ₹100 | Same as V1 (pending does not alter nets) | B→A ₹100, C→A ₹100 | **PASS** |
| **V7** | Vector 1 + disputed & cancelled payments | Same as V1 | B→A ₹100, C→A ₹100 | **PASS** |
| **V8** | Vector 1 + confirmed overpayment C→A ₹150 | A: +₹50, B: -₹100, C: +₹50 | B→A ₹50, B→C ₹50 (A first by ID tiebreaker) | **PASS** |
| **V9** | Vector 1 + expense soft-deleted | All net 0 | None | **PASS** |
| **V10** | A paid ₹400, equal among A, B, C, D | A: +₹300, B: -₹100, C: -₹100, D: -₹100 | B→A ₹100, C→A ₹100, D→A ₹100 | **PASS** |
| **V11** | A paid ₹600 (A, B, C); B paid ₹300 (B, C, D) | A: +₹400, B: ₹0, C: -₹300, D: -₹100 | C→A ₹300, D→A ₹100 | **PASS** |
| **V12** | Vector 9 expense restored | Same as V1 | B→A ₹100, C→A ₹100 | **PASS** |

### Money Sanity Assertions:
1. **Sum of Nets:** Exact 0 paise across all test configurations (`sum(net_minor) = 0`).
2. **Simplified Debts:** At most N - 1 payments; executing all suggested payments brings all member balances to exactly 0.
3. **Undo Window:** 10-minute window for receiver undo (`confirmed_at + 10 minutes`); reverts status to `cancelled` and recalculates balance instantly.
4. **Expense Edit After Settle:** Editing an expense after payment confirmation recalculates nets safely without mutating settlements.

---

## 3. Complete Case Matrix Results

### BC. Balance Calculation (Server)
| ID | Scenario | Expected Behavior | Status |
|---|---|---|---|
| BC1 | Sum of all nets | Exactly 0 paise in any group with any history | **PASS** |
| BC2 | Net formula | `paid - share + confirmed_sent - confirmed_received` | **PASS** |
| BC3 | Soft-delete & restore | Excluded while deleted; restored instantly when un-deleted | **PASS** |
| BC4 | Non-confirmed payments | Pending, disputed, cancelled never affect balances | **PASS** |
| BC5 | Expense edits | Modifying amount, splits, or payer recalculates balances atomically | **PASS** |
| BC6 | Empty group / no expenses | All members at 0 net | **PASS** |
| BC7 | Payer not in split | Payer net equals +total; debtors split cost | **PASS** |
| BC8 | Solo payer is only participant | Net 0 for everyone | **PASS** |
| BC9 | Large totals (near ₹1 Cr) | Int64 math prevents overflow | **PASS** |
| BC10 | Left/removed member | Net is strictly 0 (enforced by exit guards) | **PASS** |
| BC11 | Rejoining member | Starts at 0 balance and 0 pending payments | **PASS** |
| BC12 | 1-paise split among 3 | Exact paise division; remainder allocated deterministically | **PASS** |
| BC13 | Non-member access | RPC raises `not_a_member` | **PASS** |
| BC14 | Single snapshot read | `get_group_balances` returns members, suggestions, and caller net in one atomic transaction | **PASS** |

### BS. Simplified Payments
| ID | Scenario | Expected Behavior | Status |
|---|---|---|---|
| BS1 | Suggestion count | Maximum `N - 1` payments for N non-zero balance members | **PASS** |
| BS2 | Full resolution | Executing all suggestions brings every balance to 0 | **PASS** |
| BS3 | Determinism | Identical balances yield identical suggestions (ties broken by UUID) | **PASS** |
| BS4 | Debt transitive collapse | A owes B and B owes C collapses to A owes C | **PASS** |
| BS5 | Settled state | Returns empty suggestions array ("All settled up") | **PASS** |
| BS6 | Debt direction | Amount > 0, always from debtor (net < 0) to creditor (net > 0) | **PASS** |
| BS7 | Zero balance exclusion | Members with net 0 are never suggested to pay or receive | **PASS** |
| BS8 | Dynamic update copy | Copy displayed: "Suggested payments update when expenses change." | **PASS** |
| BS9 | Performance | 50 members, 5000 expenses completes in < 15ms | **PASS** |
| BS10 | Random property test | 500 random configurations all satisfy zero sum and valid suggestions | **PASS** |
| BS11 | Shared vectors 1–12 | All 12 test vectors match hand-calculated results | **PASS** |

### SC. Creating a Payment
| ID | Scenario | Expected Behavior | Status |
|---|---|---|---|
| SC1 | Payer records payment | Created with status `pending`; awaits receiver confirmation | **PASS** |
| SC2 | Receiver records payment | Created with status `confirmed` immediately; 10m undo window | **PASS** |
| SC3 | Third-party / admin records | Server raises `settlement_not_allowed` | **PASS** |
| SC4 | Payer equals receiver | Server raises `invalid_settlement` | **PASS** |
| SC5 | Inactive member involved | Raises `payer_not_member` or `receiver_not_member` | **PASS** |
| SC6 | Invalid amount | Below ₹0.01, above ₹1 Cr, or fractional paise rejected with `invalid_amount` | **PASS** |
| SC7 | Invalid method | Methods outside `cash` and `other` rejected with `invalid_method` | **PASS** |
| SC8 | Note length / characters | Truncated/cleaned; >100 characters rejected with `invalid_note` | **PASS** |
| SC9 | Double tap / retry | Idempotent on `client_request_id`; returns existing record | **PASS** |
| SC10 | Overpayment | Allowed; UI displays warning banner: "[Name] will owe you ₹X back" | **PASS** |
| SC11 | Pre-fill from suggestion | Opens settle sheet with exact suggested amount pre-filled | **PASS** |
| SC12 | Partial payment | Allowed; displays remaining balance after payment | **PASS** |
| SC13 | Offline creation | Button disabled with explanation | **PASS** |
| SC14 | Custom person payment | "Record a payment" action sheet allows picking any active member | **PASS** |
| SC15 | Duplicate pending payment | Blocked by unique index; raises `duplicate_pending` | **PASS** |
| SC16 | Max pending spam guard | Exceeding 10 pending payments raises `too_many_pending` | **PASS** |
| SC17 | Mutual pending payments | Pending A→B does not block separate pending B→A | **PASS** |

### ST. Payment Status Changes
| ID | Scenario | Expected Behavior | Status |
|---|---|---|---|
| ST1 | Receiver confirms pending | Status becomes `confirmed`, sets `confirmed_at`, updates balances, logs activity | **PASS** |
| ST2 | Receiver disputes pending | Status becomes `disputed`, balances unaffected, logs activity | **PASS** |
| ST3 | Receiver confirms disputed | Status becomes `confirmed`, updates balances | **PASS** |
| ST4 | Payer cancels pending | Status becomes `cancelled`, logs activity | **PASS** |
| ST5 | Payer cancels disputed | Status becomes `cancelled`, logs activity | **PASS** |
| ST6 | Receiver undoes within 10m | Status becomes `cancelled`, balances revert, `confirmed_at` cleared | **PASS** |
| ST7 | Payer confirms own payment | Rejected with `settlement_not_allowed` | **PASS** |
| ST8 | Receiver cancels pending | Rejected with `settlement_not_allowed` (receiver must dispute) | **PASS** |
| ST9 | Invalid transitions | E.g. confirming cancelled or disputing confirmed raises `invalid_transition` | **PASS** |
| ST10 | Double-action idempotency | Second identical call is safe no-op | **PASS** |
| ST11 | Confirm vs cancel race | Serialized by row lock; winner succeeds, second gets `invalid_transition` | **PASS** |
| ST12 | Undo after 10 minutes | Rejected with `undo_window_passed` | **PASS** |
| ST13 | Undo after member left | Rejected with `settlement_locked` | **PASS** |
| ST14 | Confirm dispute after member left | Rejected with `settlement_locked` | **PASS** |
| ST15 | Disputed payments & leaving | Disputed payments do NOT block leaving; pending payments DO block | **PASS** |
| ST16 | Activity logging | Exactly 1 activity entry per successful status change; 0 on failure | **PASS** |
| ST17 | Third party status change | Rejected with `settlement_not_allowed` | **PASS** |
| ST18 | Instant confirmation undo | Receiver-created payments undoable within 10m | **PASS** |

### SB. Settled Status & Exit Hooks
| ID | Scenario | Expected Behavior | Status |
|---|---|---|---|
| SB1 | `member_is_settled` | Returns true iff `net_minor = 0` AND no pending payments in group | **PASS** |
| SB2 | Member leaving with balance | Blocked with `member_not_settled` | **PASS** |
| SB3 | Admin removing member with balance | Blocked with `member_not_settled` | **PASS** |
| SB4 | Deleting group with balance/pending | Blocked with `group_not_settled` | **PASS** |
| SB5 | Deleting account with balances | `account_deletion_blockers` lists unsettled groups; blocked with `unsettled_balances` | **PASS** |
| SB6 | Sole admin rule | Checked independently of settlement status | **PASS** |
| SB7 | Operations after settling | Leaving, removing, deleting group, and deleting account all succeed | **PASS** |
| SB8 | Delete group with settled expenses | Allowed (warns ledger history is deleted) | **PASS** |
| SB9 | 1-paisa imbalance | Blocked (net must be exact 0) | **PASS** |
| SB10 | Rejoin after leaving | Member rejoins with 0 balance | **PASS** |
| SB11 | Blocked action navigation | Leave/remove/delete failure dialog provides "Go to Balances" button | **PASS** |

### SH. Payment History
| ID | Scenario | Expected Behavior | Status |
|---|---|---|---|
| SH1 | History list UI | Keyset infinite scroll (`list_settlements`), status chips, pull-to-refresh | **PASS** |
| SH2 | Row text | Plain words: "Rahul paid Priya ₹300 · Cash · Confirmed" | **PASS** |
| SH3 | Action buttons | Confirm/Dispute/Cancel/Undo shown only when server flags allow | **PASS** |
| SH4 | Former member & deleted user | Former members show historical name; deleted show "Deleted user" | **PASS** |
| SH5 | Settlement detail sheet | Displays amount, method, note, timeline and audit timestamps | **PASS** |
| SH6 | Empty state | Displays receipt icon and "No payments yet." | **PASS** |
| SH7 | Keyset pagination | Stable pagination by `(created_at, id)` | **PASS** |
| SH8 | Member visibility | All active group members can view all settlements | **PASS** |

### HO. Home Overview
| ID | Scenario | Expected Behavior | Status |
|---|---|---|---|
| HO1 | Top card on Groups tab | "All settled up", "You are owed ₹X in total", or "You owe ₹Y in total" | **PASS** |
| HO2 | Group row balance | Words: "settled up", "you owe ₹300", "you're owed ₹960" | **PASS** |
| HO3 | Zero balance display | "settled up", never "₹0" or "-0" | **PASS** |
| HO4 | Cache consistency | Group row and group's Balances tab display identical values | **PASS** |
| HO5 | Cache invalidation | Invalidation on expense or settlement mutations | **PASS** |
| HO6 | Left groups | Excluded from home balance totals | **PASS** |
| HO7 | Totals derivation | Directly from `get_my_balance_summary()`; no app-side sums | **PASS** |
| HO8 | Indian numbering | Formatted with Indian comma grouping (₹1,00,000) | **PASS** |
| HO9 | Pending badges | Badge displayed on group row and Balances tab when `my_pending_actions > 0` | **PASS** |
| HO10 | Mixed balance breakdown | Shows owed total, owe total, and net overall | **PASS** |

### BU. Balances Tab (Screen)
| ID | Scenario | Expected Behavior | Status |
|---|---|---|---|
| BU1 | Group top card | "You are owed ₹X", "You owe ₹X" or "All settled up" | **PASS** |
| BU2 | Suggestions sentences | "You owe Priya ₹300" (Settle up), "Rahul owes you ₹300" (Mark as received) | **PASS** |
| BU3 | Everyone's balances | You first, then sorted by largest absolute amount | **PASS** |
| BU4 | Pending settlements section | Actions needing user action first, then waiting sent payments | **PASS** |
| BU5 | Empty state | Green checkmark icon with "All settled up" message | **PASS** |
| BU6 | Loading & errors | Skeletons on loading; error card with retry button | **PASS** |
| BU7 | Footer disclaimer | "Suggested payments update when expenses change." | **PASS** |
| BU8 | Offline mode | Actions disabled with offline explanation banner | **PASS** |
| BU9 | Stale screen handling | `not_a_member` caught gracefully; redirects to group list | **PASS** |
| BU10 | Auto-refresh after action | UI updates immediately without manual pull-to-refresh | **PASS** |
| BU11 | Undo snackbar | 8-second snackbar with interactive Undo button on confirmation | **PASS** |
| BU12 | Header menu | Contains "Record a payment" and "Payment history" | **PASS** |

### BG. Interplay with Groups, Expenses & Accounts
| ID | Scenario | Expected Behavior | Status |
|---|---|---|---|
| BG1 | Group deleted | Cascades to settlements and settlement activity entries | **PASS** |
| BG2 | Account deletion | Referencing profile anonymized to "Deleted user" (no cascade delete) | **PASS** |
| BG3 | Pending payment exit guard | Leaving blocked while pending payment exists | **PASS** |
| BG4 | Expense edit post-settlement | Balances update cleanly; past confirmed payments untouched | **PASS** |
| BG5 | Locked expenses | Settlement flow does not alter Phase 4 expense locks | **PASS** |
| BG6 | Activity feed | Settlement sentences formatted with "You", "Rahul paid Priya ₹300", etc. | **PASS** |
| BG7 | Group list ordering | Settlement creation/confirmation updates `last_activity_at` | **PASS** |

### BZ. Security & Database Privileges
| ID | Scenario | Expected Behavior | Status |
|---|---|---|---|
| BZ1 | Direct table access | RLS on `settlements`; zero grants to `public`, `anon`, `authenticated` | **PASS** |
| BZ2 | Anonymous calls | Rejected with `not_authenticated` | **PASS** |
| BZ3 | Non-member RPC call | Rejected with `not_a_member` | **PASS** |
| BZ4 | Third-party tamper | Cannot record or transition payments for other users | **PASS** |
| BZ5 | Self-confirm / wrong cancel | Payer cannot confirm own payment; receiver cannot cancel | **PASS** |
| BZ6 | Invalid arguments | Server constraints reject negative amounts, bad methods, invalid notes | **PASS** |
| BZ7 | Function hardening | All functions `SECURITY DEFINER`, `search_path = ''`, execute revoked from `anon` | **PASS** |
| BZ8 | Concurrency races | Shared group lock + exclusive settlement row lock prevents deadlocks/races | **PASS** |
| BZ9 | Cross-group leakage | Zero data leakage between groups | **PASS** |
| BZ10 | Reusing request ID | Scoped per user; returns only creator's record | **PASS** |
| BZ11 | PII in logs | No phone numbers, emails, or tokens in activity log | **PASS** |
| BZ12 | Public profile exposure | Only user name exposed in balance responses (UPI/emails masked) | **PASS** |

### BD. UI & Device Verification
| ID | Scenario | Expected Behavior | Status |
|---|---|---|---|
| BD1 | Dark mode & high contrast | Tested on physical Samsung Galaxy M32; crisp contrast and legible typography | **PASS** |
| BD2 | Offline banner | Banner displays when disconnected; mutating actions disabled | **PASS** |
| BD3 | Screen reader labels | Accessibility labels on all balance amounts and action buttons | **PASS** |
| BD4 | Large list virtualized | Virtualized FlatList handles 50 member balances smoothly | **PASS** |
| BD5 | Dual visual cues | Colors paired with plain text labels ("owed" / "owe" / "settled") | **PASS** |
| BD6 | Orientation lock | Locked to portrait orientation | **PASS** |

---

## 4. Final Verification Summary
- **Lint:** 0 errors, 0 warnings (`expo lint`)
- **TypeScript:** 0 errors (`tsc --noEmit`)
- **Jest Unit Suites:** 28 passed, 296 tests passed (100%)
- **Release APK:** Built, signed, and running on Samsung Galaxy device (`RZ8T41L5HFL`).
- **Tag:** `phase-5-done`
