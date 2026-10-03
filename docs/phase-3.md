# SplitEase — Phase 3: Groups, Members and Roles

**Depends on:** `prd.md` (v1.1), finished Phase 1 and Phase 2 (`phase-2-done` tag)
**Goal:** Users can create groups, invite people, join with a code or link, and manage members and admins safely. Every role and edge case in this document is handled, and all rules are enforced **on the server**.
**Rule:** Work **one sub-phase at a time. STOP after each sub-phase**, test, and confirm before moving on. The backend (3.1 to 3.4) is built and tested **before** any screen.

> **UX stance:** creating a group and getting people into it is the most important moment in the app. Create = 1 field. Invite = 1 tap to share. Join = paste a code or tap a link. Nothing else is asked.

---

## 0. Scope

### In scope
- Tables: `groups`, `group_members`, `invites`, `invite_attempts`
- Roles: `admin` and `member`, with all safety rules (last admin, settled balances, cap)
- RPC functions for every write (direct writes are blocked)
- Screens: groups list, create group, join (code + deep link), group detail shell, members list, invite/share, role management, leave, remove, rename, delete
- Account deletion integration (the Phase 2 hooks F7 and F8)
- SQL tests for every rule

### Out of scope (later phases)
- Expenses (Phase 4), real balances (Phase 5), UPI settlement (Phase 6)
- Notifications for membership changes (Phase 7)
- https invite landing page / Android App Links (see decision D8)
- Members without the app (see decision D9)
- Cloudflare Workers or any extra backend

> **Settled-balance checks:** balances do not exist until Phase 5. In Phase 3, the functions `member_is_settled()` and `group_is_settled()` are **stubs that return true**. Every rule that depends on them is already wired in, and Phase 5 only replaces the stubs. Do not remove these checks.

---

## 1. Decisions to confirm before 3.1

| # | Decision | Recommendation (assumed if you don't change it) |
|---|----------|------------------------------------------------|
| D5 | Maximum members per group, and groups per user | **50 members per group, 50 groups per user** |
| D6 | Is there a separate "owner" above admins? | **No.** The creator is just the first admin. All admins have equal power. Safety comes from the "last admin" rule |
| D7 | Who can create or reset invite links | **Admins only** in v1. (A setting for "all members can invite" can come later) |
| D8 | Invite link format | **Code first.** Share a message containing the 8-character code plus a `splitease://join/CODE` link. Many chat apps do not make custom-scheme links tappable, so the code must always work by itself. An https landing page (needs a domain) is planned as an early Phase 7 item |
| D9 | Members without the app (carried over from Phase 2, D3) | **Assumed v2.** If you want them in v1, tell me **before 3.1** because it changes the tables |
| D10 | Removing a member who has an unsettled balance | **Blocked** until they settle |
| D11 | Deleting a group that has unsettled balances | **Blocked** until everyone settles |
| D12 | Currency | **INR only in v1.** No currency picker (multi-currency is Phase 7). The column exists so it can be opened up later |

---

## 2. UX rules for this phase

1. **Create group = one field** (name). After creating, go straight to the Invite screen.
2. **Invite = one tap**: Share button opens the system share sheet with a ready message. The code is shown big, with a Copy button.
3. **Join = paste or tap.** The code field cleans the input (spaces, dashes, lowercase, even a whole pasted message).
4. **Preview before joining:** "Join 'Goa Trip'? 5 members, invited by Rahul."
5. **Undo instead of confirm** for reversible actions (promote/demote admin: snackbar "Rahul is now admin · UNDO").
6. **Confirm dialogs only where others are affected or it cannot be undone:** remove member, leave group, reset invite link. **Typing DELETE** only for deleting a group.
7. Errors are specific and kind (see Section 5). The user always gets a next step ("Make someone else admin first").
8. Primary actions sit at the bottom (FAB, bottom sheet), reachable with one hand.
9. Every list has skeleton, empty and error states. Never a blank screen.
10. People are shown **you first, then admins, then others A to Z**.

---

## 3. Data model

```
profiles (Phase 2)
   ▲                 ▲
   │                 │
groups ──< group_members >── profiles
   │
   └──< invites          invite_attempts (private, functions only)
```

### `groups`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default `gen_random_uuid()` |
| name | text | 1 to 50 characters (trimmed, spaces collapsed) |
| currency | text | `INR` only in v1 (check constraint) |
| created_by | uuid FK profiles | |
| client_request_id | uuid | unique per creator; makes "create" safe to retry |
| created_at, updated_at | timestamptz | |

### `group_members`
| Column | Type | Notes |
|--------|------|-------|
| group_id | uuid FK groups (cascade) | composite PK |
| user_id | uuid FK profiles | composite PK |
| role | text | `admin` or `member` |
| status | text | `active`, `left` or `removed`. **Rows are never deleted**, so history keeps names and rejoining is possible |
| joined_at | timestamptz | reset when someone rejoins |
| left_at | timestamptz | set when `left` or `removed`, null when active |
| removed_by | uuid FK profiles | who removed them |

### `invites`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| group_id | uuid FK groups (cascade) | |
| code | text unique | 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0, O, 1, I) |
| created_by | uuid FK profiles | |
| created_at, expires_at | timestamptz | expires after 7 days |
| revoked_at | timestamptz | set when reset |

**One active invite per group** (partial unique index). Opening the Invite screen returns the current valid code, or creates one if there is none or it expired.

### `invite_attempts` (private)
Counts failed code guesses per user to stop brute force. Clients have **no access** to this table.

### Invariants (must always hold)
1. A group that has at least one active member has **at least one active admin**.
2. A group never has more than 50 active members; a user is never active in more than 50 groups.
3. A person who was **removed** can only come back with an invite created **after** they were removed.
4. Only active members can see anything about a group.
5. Email addresses are never exposed to other users.

---

## 4. Roles and permissions

There is **no owner**. "Group leader" simply means admin. Any admin can do everything below.

| Action | Admin | Member | Not in group |
|--------|:-----:|:------:|:------------:|
| See group, members, expenses, balances | Yes | Yes | No |
| See the invite code and link | Yes | No | No |
| Create or reset the invite link | Yes | No | No |
| Join with a valid code | n/a | n/a (already in) | Yes |
| Rename group | Yes | No | No |
| Make a member an admin | Yes | No | No |
| Remove admin role from an admin | Yes, **but not the last admin** | No | No |
| Remove a **member** | Yes (must be settled) | No | No |
| Remove an **admin** | **No.** Remove the admin role first | No | No |
| Leave the group | Yes (see rules below) | Yes (must be settled) | n/a |
| Delete group | Yes (all settled) | No | No |
| Add an expense *(Phase 4)* | Yes | Yes | No |
| Edit or delete an expense *(Phase 4)* | Any expense | Only their own | No |
| Confirm a UPI payment *(Phase 6)* | Only if they are the receiver | Only if they are the receiver | No |

**Leave rules**
- A member leaves only when their balance is settled.
- An admin who is **not** the last admin may leave.
- The **last admin** cannot leave while other members exist. The app offers "Make [member] admin" first.
- If the person leaving is the **only active member**, leaving **deletes the group**, and the confirm text says so.

**Remove rules**
- An admin cannot remove themselves (they use Leave), and cannot remove another admin directly.
- A removed person immediately loses all access. Their past expenses stay in the history under their name.

---

## 5. Error codes and messages

RPC functions raise errors using these exact codes (as the error message). The app maps them in `toFriendlyMessage()`.

| Code | What the user sees |
|------|--------------------|
| `not_authenticated` | "Please sign in again." |
| `not_a_member` | "You're no longer in this group." (and go back to the list) |
| `not_admin` | "Only group admins can do this." |
| `invalid_name` | "Group names need 1 to 50 characters." |
| `group_limit_reached` | "You've reached the limit of 50 groups." |
| `group_full` | "This group is full (50 members)." |
| `last_admin` | "A group needs at least one admin. Make someone else admin first." |
| `target_not_member` | "That person is no longer in this group." |
| `cannot_remove_self` | "Use Leave group to leave." |
| `cannot_remove_admin` | "Remove their admin role first, then remove them." |
| `member_not_settled` | "They need to settle up first." |
| `group_not_settled` | "Everyone needs to settle up before the group can be deleted." |
| `sole_admin` | "You're the only admin of a group with other members. Make someone else admin or delete the group first." |
| `unsettled_balances` | "Settle up with your groups first, then you can delete your account." |
| `invalid_role` | "Something went wrong. Please try again." |

**Join and preview results** (returned as a status, not raised, so failed attempts can be counted):

| Status | What the user sees |
|--------|--------------------|
| `joined` | Opens the group |
| `already_member` | "You're already in this group." and opens it |
| `invalid` | "Code not found. Check it and try again." |
| `expired` | "This invite has expired. Ask an admin for a new one." |
| `revoked` | "This invite was reset by an admin. Ask for the new one." |
| `removed` | "An admin removed you from this group. Ask for a new invite." |
| `group_full` | "This group is full." |
| `too_many_groups` | "You've reached the limit of 50 groups." |
| `too_many_attempts` | "Too many wrong codes. Try again in about 15 minutes." |

---

## 6. Case Matrix (every case that must be handled)

> Each sub-phase lists the case IDs it must satisfy. At the end of Phase 3, walk through the whole matrix with **at least 3 test accounts** (an admin, a member, and an outsider) on real phones.

### GC. Create group and groups list

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| GC1 | Create a group with a valid name | Group created, you are admin, you land on the Invite screen |
| GC2 | Empty or spaces-only name | Create button disabled |
| GC3 | Name longer than 50 | Counter shown, blocked (also blocked by the server) |
| GC4 | Emojis or Hindi text in the name | Allowed |
| GC5 | Two groups with the same name | Allowed (names are not unique) |
| GC6 | Double tap on Create | Only one group is created |
| GC7 | Offline | Create disabled with an explanation; typed name kept |
| GC8 | Request times out but actually succeeded, user retries | **No duplicate**: the retry returns the same group (`client_request_id`) |
| GC9 | User already has 50 groups | `group_limit_reached` message |
| GC10 | No groups yet | Empty state with two actions: Create group, Join with code |
| GC11 | List display | Skeleton while loading, pull to refresh, newest membership first |
| GC12 | 50 groups | Scrolls smoothly (virtualized list) |
| GC13 | Groups the user left or was removed from | Not shown |
| GC14 | Name with extra spaces | Trimmed and collapsed on the server too |

### GI. Invites

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| GI1 | Admin opens Invite | Gets the current valid code (created if none) |
| GI2 | Tap Share | System share sheet with a ready message containing group name, code and link |
| GI3 | Tap Copy | Code copied; snackbar "Code copied" |
| GI4 | Chat app does not make the link tappable | Code is shown large and works by typing or pasting it |
| GI5 | Code shows expiry date; code has expired | Admin opening the screen gets a **new** code automatically |
| GI6 | Admin taps Reset link | Confirm dialog ("Old link stops working"); old code dies immediately; new code shown |
| GI7 | Non-admin member | No Invite button; if reached by any route, `not_admin` with "Ask an admin for the invite link" |
| GI8 | Entering a code | Case-insensitive; input is cleaned |
| GI9 | Two admins open Invite at the same time | They see the **same** active code |
| GI10 | Admin demoted while on the Invite screen | Next action returns `not_admin`; friendly message and the screen closes |
| GI11 | Offline | Error state with Retry (the code is never cached) |

### GJ. Joining

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| GJ1 | Valid code typed or pasted | Preview screen, then Join, then you are in the group |
| GJ2 | Valid link tapped while signed in | Preview screen directly |
| GJ3 | Valid link tapped while signed out | Welcome → sign in → returns to the preview (pending link) |
| GJ4 | Already a member | `already_member`, opens the group |
| GJ5 | Expired code | `expired` message |
| GJ6 | Code that was reset | `revoked` message |
| GJ7 | Wrong or mistyped code | `invalid` message |
| GJ8 | Pasted text has extra words, spaces or a full link | The app extracts the code (from `/join/CODE` or an 8-character token) |
| GJ9 | Group has 50 members | `group_full` |
| GJ10 | User is already in 50 groups | `too_many_groups` |
| GJ11 | Person who **left** earlier joins again | Allowed with a valid invite; role is `member`; old history is kept |
| GJ12 | Person **removed by an admin** uses an **old** invite | `removed`. They need an invite created **after** their removal (admin resets the link) |
| GJ13 | 10 wrong codes within 15 minutes | `too_many_attempts` |
| GJ14 | Double tap on Join | Idempotent: second call returns `already_member` |
| GJ15 | Group was deleted after the link was shared | `invalid` |
| GJ16 | Offline while joining | Message shown; **the pending link is kept** until a real result arrives |
| GJ17 | Malformed link such as `splitease://join/` | Opens the Join screen with an empty code field |
| GJ18 | What the preview reveals | Only group name, member count and inviter's name. Nothing else |
| GJ19 | Someone joins while an admin is leaving at the same moment | Serialized by the server; invariants hold |
| GJ20 | Two people join a group with 49 members at once | Exactly one succeeds (never more than 50) |

### GR. Roles

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| GR1 | Creator of a group | Is admin |
| GR2 | A group with several admins | Allowed |
| GR3 | Admin promotes a member | Done immediately; snackbar with UNDO |
| GR4 | Admin removes another admin's role | Done immediately; snackbar with UNDO |
| GR5 | Removing the admin role of the **last admin** | `last_admin` |
| GR6 | Admin removes **their own** admin role while other admins exist | Allowed; their admin menus disappear immediately |
| GR7 | A member calls an admin-only action through the API | `not_admin` |
| GR8 | Promote someone who has left or was removed | `target_not_member` |
| GR9 | Two admins remove each other's admin role at the same time | Serialized: exactly one succeeds; at least one admin always remains |
| GR10 | Promote or demote the same person twice (double tap) | Idempotent, no error |
| GR11 | Members tab display | "Admin" badge, "You" label; non-admins see no action menu |
| GR12 | Who can see roles | Every member |
| GR13 | Admin tries to remove another admin | `cannot_remove_admin` (remove the role first) |

### GM. Removing and leaving

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| GM1 | Admin removes a settled member | Confirm dialog; member removed; they lose access at once |
| GM2 | Remove a member with an unsettled balance | `member_not_settled` *(real once Phase 5 replaces the stub; test now with the stub switched to false)* |
| GM3 | Admin tries to remove themselves | `cannot_remove_self` |
| GM4 | Admin tries to remove another admin | `cannot_remove_admin` |
| GM5 | Member tries to remove someone | `not_admin` |
| GM6 | Settled member leaves | Confirm dialog; group disappears from their list |
| GM7 | Member with unsettled balance tries to leave | `member_not_settled` |
| GM8 | **Last admin** leaves while other members exist | `last_admin` and the app offers a "Make [member] admin" shortcut |
| GM9 | Last admin is also the **only member** and leaves | Group is deleted; the confirm text says so |
| GM10 | An admin who is not the last admin leaves | Allowed |
| GM11 | Past expenses of someone who left or was removed | Stay in history with their name (former members can be looked up) |
| GM12 | Removed member opens the group from a stale screen | "You're no longer in this group" and goes back to the list |
| GM13 | Double tap on Leave | Idempotent |
| GM14 | Leaving while offline | Disabled with an explanation |
| GM15 | After removal | Group disappears from their list on the next refresh or focus |

### GE. Rename and delete group

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| GE1 | Admin renames the group | Saved; others see it on their next refresh |
| GE2 | Member tries to rename | Option hidden; the server returns `not_admin` if called anyway |
| GE3 | Invalid name | Same rules as GC2 and GC3 |
| GE4 | Admin deletes the group | Must type `DELETE`; warning that it removes everything for everyone |
| GE5 | Delete with unsettled balances | `group_not_settled` *(stub until Phase 5)* |
| GE6 | Member tries to delete | `not_admin` |
| GE7 | Group deleted while another member is viewing it | Next action or refresh shows "This group no longer exists" and goes back to the list |
| GE8 | Deletion is permanent | The dialog says there is no undo |
| GE9 | What gets removed | Members and invites (and expenses from Phase 4 on) via cascade |

### GS. Security and privacy

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| GS1 | Non-member reads `groups`, `group_members` or `invites` | Nothing returned |
| GS2 | Direct insert, update or delete on any of the 4 tables (signed in or anonymous) | Denied |
| GS3 | Anonymous call to any RPC | Rejected; the user always comes from `auth.uid()`, never from a parameter |
| GS4 | A member tries to read invites | Impossible (no table access; only admins get codes through the RPC) |
| GS5 | Profile data of other people | `profiles` stays "own row only" (Phase 2). Co-members are read through `get_group_members()`, which returns only name, photo, UPI ID, role, status. Never email |
| GS6 | `get_group_members()` called by a non-member | `not_a_member` |
| GS7 | Guessing invite codes | 32^8 possible codes, generic `invalid` response, and 10 failed attempts per 15 minutes per user |
| GS8 | `invite_attempts` | Not readable or writable by clients |
| GS9 | Function hardening | Every new function is `SECURITY DEFINER`, has `search_path = ''`, and execute is revoked from `public` and `anon` |
| GS10 | Who sees a person's UPI ID | Only **active** members of a shared group |
| GS11 | Concurrent changes in one group | All membership-changing functions lock the group row first, so they run one at a time (no deadlocks, invariants hold) |

### GD. Deleted accounts (Phase 2 hooks F7, F8)

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| GD1 | User is the **only admin** of a group that has other members and tries to delete their account | The preflight check lists those groups; deletion is blocked (`sole_admin`) |
| GD2 | Groups where the user is the **only active member** | Deleted together with the account |
| GD3 | All other groups | User's membership is marked `left`; their history stays as "Deleted user" |
| GD4 | Unsettled balances *(stub until Phase 5)* | If unsettled (net balance != 0 or pending/disputed settlement), deletion is blocked (`unsettled_balances`). No force parameter or "delete anyway" override |
| GD5 | Order of steps | The preflight runs **before** any irreversible step (before avatar files are deleted) |
| GD6 | How a deleted user appears to others | "Deleted user", no photo, no UPI ID |

### GN. Staleness and navigation

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| GN1 | Kicked out or group deleted while viewing | Friendly message and back to the list (`not_a_member`) |
| GN2 | Group, members and invite screens | Refetch on focus; pull to refresh |
| GN3 | After create, join, leave or delete | Groups list updates by itself (cache invalidation) |
| GN4 | Android back button | Invite → group → list; join preview → previous screen |
| GN5 | Join link opened while the user is on another screen | Preview opens on top; back returns |
| GN6 | Account switch on the same phone | Cached groups are cleared (Phase 2, case C7) |

### GU. UI and device

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| GU1 | Largest font size, dark mode, 360dp width | Everything readable and usable |
| GU2 | Very long group or member names | Truncated with an ellipsis; full name visible in the detail |
| GU3 | 50 members in the list | Smooth scrolling |
| GU4 | Every list | Has skeleton, empty and error states |
| GU5 | Primary actions | At the bottom, one-hand reachable |
| GU6 | Offline | Offline banner; all write actions disabled with an explanation |

---

## 7. Sub-phases

---

### 3.1 — Database: tables, privileges, helper functions

**Goal:** The tables and the rules that protect them exist before any function or screen. (Cases: GS1, GS2, GS8, GS9.)

**Tasks**
1. Confirm decisions D5 to D12 (or note your changes).
2. Migration `groups_and_members`: tables, constraints, indexes, `invite_attempts` (SQL in Section 8.1).
3. Migration `group_helpers`: `is_active_member`, `is_group_admin`, `generate_invite_code`, and the two **stubs** `member_is_settled` and `group_is_settled` (Section 8.2).
4. Row Level Security on all four tables; privileges: **revoke everything, grant only `select` on `groups` and `group_members`** (Section 8.1).
5. Apply with `npx supabase db push` and regenerate types.
6. SQL tests (`supabase/tests/`): non-member sees nothing; direct insert/update/delete denied for `authenticated` and `anon`; `invite_attempts` unreachable; invalid group name (0 and 51 characters), role and status values rejected; the one-active-invite index works; `gm_left_consistency` rejects an active row with `left_at` set.

**Acceptance**
- `npx supabase test db` passes
- All four tables show RLS enabled and the privileges listed above

**STOP.** Report the migrations and test output.

---

### 3.2 — Core read and group RPCs

**Goal:** Create, list, view and rename groups safely. (Cases: GC1 to GC14, GE1 to GE3, GS3, GS5, GS6, GS10, GD6.)

**Tasks** (each function: `SECURITY DEFINER`, `search_path = ''`, user from `auth.uid()`, execute revoked from `public` and `anon`, granted to `authenticated`)

| RPC | Rules |
|-----|-------|
| `create_group(p_name text, p_client_request_id uuid)` | Normalize name (trim, collapse spaces), validate 1 to 50; if the user already has 50 active groups raise `group_limit_reached`; if a group with the same `(created_by, client_request_id)` exists, **return it** (retry safe); insert group and the creator as `admin`, all in one transaction |
| `list_my_groups()` | Returns groups where the caller is active: `group_id`, `name`, `my_role`, `member_count`, `joined_at`. (Phase 4 adds `last_activity_at`, Phase 5 adds `my_balance_minor`.) Newest membership first |
| `get_group(p_group uuid)` | Caller must be an active member (else `not_a_member`). Returns group fields, `my_role`, `member_count` |
| `get_group_members(p_group uuid, p_include_former boolean default false)` | Caller must be an active member. Returns `user_id`, `name`, `avatar_path`, `avatar_url`, `upi_id` (only for **active** rows), `role`, `status`, `joined_at`. Ordering: you, admins, others A to Z. Deleted users show as "Deleted user". Former members only when requested (for expense history) |
| `rename_group(p_group uuid, p_name text)` | Lock group row; caller must be admin; same name rules |

SQL tests: each function rejects anonymous callers; non-members get `not_a_member`; a retry with the same request id returns the same group; the 51st group is rejected; UPI IDs of former members are never returned; `get_group_members` never returns any email.

**Acceptance**
- All SQL tests pass
- From the Supabase SQL editor or a test script, call each function as two different users and confirm the results match the rules above

**STOP.** Report the functions and test output.

---

### 3.3 — Invite RPCs

**Goal:** Safe invites and joining. (Cases: GI1 to GI11, GJ1 to GJ20, GS4, GS7.)

**Tasks**

| RPC | Rules |
|-----|-------|
| `get_or_create_invite(p_group uuid)` | Lock group row; caller must be admin. Return the active, unexpired, unrevoked invite; if none (or it expired) revoke the old one and create a new one with `generate_invite_code()` (retry on the rare code collision). Returns `code`, `expires_at` |
| `reset_invite(p_group uuid)` | Admin only. Revoke the active invite (`revoked_at = now()`), create a new one, return it |
| `preview_invite(p_code text)` | Authenticated. Same cleaning and attempt limits as `join_group`. Returns `status` plus, **only when valid**, `group_name`, `member_count`, `inviter_name`. Never anything more (GJ18) |
| `join_group(p_code text)` | Full logic in Section 8.3. Returns a status (see Section 5) and the group id and name. Handles: attempt limit, invalid, revoked, expired, already member, removed (invite older than the removal), group full, user's group cap, rejoin, and records attempts |

**Important:** invite problems are **returned as a status, not raised as errors**. If the function raised an exception, the failed-attempt row would be rolled back and brute-force protection would never work.

SQL tests: all statuses in Section 5; code format; a reset code kills the old one; a removed person is refused by an old invite and accepted by a newer one; rejoin sets role `member` and keeps history; 10 failures lock for 15 minutes; two sessions joining a 49-member group at once yield exactly one success (use two connections or a scripted concurrency check, and record the result in the test log).

**Acceptance**
- All tests pass; the concurrency check result is recorded
- Invite codes contain only the allowed characters

**STOP.** Report functions, tests and the concurrency check.

---

### 3.4 — Membership and role RPCs, account deletion integration

**Goal:** Every rule in Section 4 enforced in the database. (Cases: GR1 to GR13, GM1 to GM15, GE4 to GE9, GS11, GD1 to GD6.)

**Tasks**

| RPC | Rules |
|-----|-------|
| `set_member_role(p_group, p_user, p_role)` | Lock group row first. Caller is an active member and an admin. Target must be an active member (`target_not_member`). Same role = no-op. Demoting requires at least 2 active admins (`last_admin`). Full code in Section 8.3 |
| `remove_member(p_group, p_user)` | Lock group row; caller must be admin; `cannot_remove_self`; target must be active; `cannot_remove_admin` if the target is an admin; `member_not_settled` if `member_is_settled()` is false. Set `status = 'removed'`, `left_at = now()`, `removed_by = caller` |
| `leave_group(p_group)` | Full code in Section 8.3. Returns `'left'` or `'group_deleted'` |
| `delete_group(p_group)` | Lock group row; admin only; `group_not_settled` if `group_is_settled()` is false; delete (cascade) |
| `account_deletion_blockers()` | Returns JSON: groups where the caller is the **only** active admin and others remain (`sole_admin_groups`), and groups with unsettled balances (`unsettled_groups`, empty until Phase 5) |
| `delete_my_account()` | Zero-argument function with smart-delete logic. In Phase 3.4: replace the `account_deletion_blockers()` stub with the real sole-admin logic and add the "leave all groups / delete groups where user is the only member" hook; keep the smart-delete logic. Steps: check blockers (`sole_admin`, `unsettled_balances`); leave all groups / delete groups where user is the only member; smart delete profile (hard delete if unreferenced, anonymize if FK referenced) and delete auth user |

**Locking rule:** every function above starts by locking the **group row** (`select ... for update`), so membership changes in one group always run one at a time. Never lock in a different order.

SQL tests (this is the heaviest test file; write it carefully):
- Every row of the permissions table in Section 4 for admin, member and outsider
- Last-admin invariant: demote, leave and delete-account attempts all fail correctly
- Demoting yourself with another admin present works
- Removing an admin directly fails; after demotion it works
- Leave: member, non-last admin, last admin with others (fails), sole member (group deleted)
- Remove then rejoin rules from GJ12
- Stub switched to false: remove, leave, delete group and delete account behave as GM2, GM7, GE5, GD4 require. Switch it back after the test
- `account_deletion_blockers()` and `delete_my_account` for all GD cases
- Two concurrent "demote the other admin" calls leave exactly one admin (record the result in the test log)

**Acceptance**
- `npx supabase test db` passes with every function covered
- Section 4 permissions table is proven by tests, not just by reading the code

**STOP.** Report functions, test output, and the concurrency check.

---

### 3.5 — App: groups list and create group

**Goal:** First visible feature. (Cases: GC1 to GC14, GN3, GN6, GU1 to GU6.)

**Tasks**
1. Query keys: `['groups']`, `['group', id]`, `['group', id, 'members']`. Hooks: `useGroups()`, `useGroup(id)`, `useGroupMembers(id)`, and mutation hooks. All writes call the RPC functions from `lib/api/groups.ts`; the app never uses `.insert()`, `.update()` or `.delete()` on these tables.
2. Map every error code in Section 5 in `toFriendlyMessage()`.
3. **Groups tab:** list of group cards (name, member count, "Admin" chip if you are admin); skeleton, pull-to-refresh, error state with Retry; empty state with **Create group** and **Join with code**. A floating button opens a bottom sheet with the same two actions.
4. **Create group screen:** one auto-focused text field with counter, **Create** button at the bottom above the keyboard. Generate a `client_request_id` (uuid) when the screen opens and reuse it on retries (GC8). Disable on double tap (GC6) and when offline (GC7). After success, replace the screen with the Invite screen (built in 3.7; until then go to the group placeholder).
5. Clear the `['groups']` cache on sign-out (GN6, already part of `signOutAndReset`).

**Acceptance**
- GC1 to GC14, GN3, GN6 and GU cases tested on a real phone with 2 accounts
- The app contains no direct table writes (search the code for `.from('groups')` writes)

**STOP.** Report results case by case.

---

### 3.6 — App: join flow

**Goal:** Joining works from a typed code, a pasted message, and a tapped link. (Cases: GJ1 to GJ18, GN4, GN5.)

**Tasks**
1. **Join with code screen:** one large, letter-spaced, auto-uppercase field; paste supported. `lib/invite/parseCode.ts` cleans input and extracts the code from `/join/CODE` links or 8-character tokens (GJ8). When a valid-looking code is entered, move to the preview automatically.
2. **Deep link route** `app/join/[code].tsx` for `splitease://join/CODE`; an empty or malformed code opens the entry screen (GJ17).
3. **Preview screen:** calls `preview_invite`. Valid: "Join [group]? [N] members · invited by [name]" with **Join** and **Not now**. Every other status shows its message from Section 5 and a clear next step.
4. **Join:** calls `join_group`, handles every status. On `joined` or `already_member`: invalidate `['groups']` and open the group (GJ4, GJ14).
5. **Pending link handling** (from Phase 2, C5): a signed-out user is sent to Welcome, then returned to the preview after sign-in (GJ3). Clear the pending link **only after a final result** (joined, invalid, expired, and so on), **never on a network error** (GJ16).
6. Offline: message and retry (GJ16). Back button follows GN4 and GN5.
7. Unit tests for `parseCode`: lowercase, spaces, dashes, a full share message, a full link, text without a code, and a 7- or 9-character token.

**Acceptance**
- GJ1 to GJ18 tested with 3 accounts (an admin who resets and removes, a joiner, and an outsider); GJ19 and GJ20 are covered by the 3.3 concurrency check
- `npm run check` passes

**STOP.** Report results case by case.

---

### 3.7 — App: group detail, members, invite, roles

**Goal:** Everything an admin and a member can do inside a group. (Cases: GI1 to GI11, GR1 to GR13, GM1 to GM15, GE1 to GE9, GN1, GN2.)

**Tasks**
1. **Group detail screen:** header with group name and a stack of member avatars; a segmented control with **Expenses**, **Balances**, **Members** (the first two are placeholders: "Coming in Phase 4" and "Coming in Phase 5"). Overflow menu: Invite (admins), Rename (admins), Leave group, Delete group (admins).
2. **Members tab:** order you, admins, others A to Z; "Admin" and "You" labels; skeleton and error states. Admins see an action sheet on each other member:
   - **Make admin** (member) or **Remove admin role** (admin): direct action with an **Undo** snackbar that calls the reverse function (GR3, GR4).
   - **Remove from group** (members only): confirm dialog, then `remove_member`. For admins the sheet shows "Remove admin role first" instead (GR13).
   Members see no action sheet (GR11).
3. **Invite screen:** the code in large type, expiry date, **Copy code**, **Share** (system share sheet with a ready message: group name, code, link, a short friendly line), and for admins **Reset link** with a confirm dialog. Non-admins never see this screen (GI7).
4. **Rename:** bottom sheet with the same validation as create.
5. **Leave:** confirm dialog. If the user is the last admin and others remain, the error becomes a sheet "Make someone admin first" listing members to pick from, then leave again (GM8). If the user is the only member, the dialog says leaving will delete the group (GM9).
6. **Delete group:** type `DELETE`, clear "no undo, deletes for everyone" text (GE4, GE8).
7. **Staleness:** any `not_a_member` or "group not found" result clears the group's cache, shows the right message, and returns to the list (GN1, GM12, GE7). Refetch on focus and pull-to-refresh on all three tabs (GN2).
8. All buttons that need internet are disabled with an explanation when offline (GM14, GU6).

**Acceptance**
- GI, GR, GM, GE, GN cases tested on real phones with 3 accounts, including: last admin tries to leave, admin demotes self, admin removes member then member opens the stale screen, group deleted while another phone is viewing it
- Undo works for promote and demote

**STOP.** Report results case by case.

---

### 3.8 — Account deletion integration

**Goal:** Account deletion respects groups. (Cases: GD1 to GD6, and Phase 2 cases F7, F8, F9.)

**Tasks**
1. Update the Phase 2 delete flow: on the **Explain screen**, call `account_deletion_blockers()` **first**, before anything irreversible (GD5).
2. If `sole_admin_groups` is not empty: show the list with a button per group ("Make someone admin" opens that group's Members tab, or "Delete group"). The Delete button stays disabled (GD1, F7).
3. If `unsettled_groups` is not empty (empty until Phase 5): show blocked state with the groups and message "Settle up with your groups first, then you can delete your account." The Delete button stays disabled (GD4, F8). There is no "delete anyway" option and no force parameter.
4. Keep the rest of the Phase 2 flow (re-authenticate, type DELETE, delete avatar, call RPC, local sign-out).
5. Verify with test accounts: sole-admin block, auto-deletion of a group where the user was the only member (GD2), membership marked `left` elsewhere (GD3), and how the deleted user appears to the other members (GD6, F9).

**Acceptance**
- GD1 to GD6 tested; F7 and F9 from Phase 2 can now be marked pass in `docs/phase-2-test-log.md`

**STOP.** Report results.

---

### 3.9 — Hardening, tests and handoff

**Goal:** Prove the matrix, lock the docs, tag the phase. (Cases: GS1 to GS11 and a full re-run of GC to GU.)

**Tasks**
1. **Security pass:**
   - confirm RLS on all four tables and that clients have only `select` on `groups` and `group_members`
   - confirm every new function has `search_path = ''` and execute revoked from `public` and `anon`
   - confirm there is no way for a non-admin to see an invite code
   - search the app for direct writes to these tables (must be none)
   - search for `service_role` (must be nowhere)
2. Re-run all SQL tests and unit tests; add tests for any gap found in manual testing.
3. **Full manual walkthrough** of the Case Matrix (GC to GU) with 3 accounts on real phones. Record each case ID as pass, fail or note in `docs/phase-3-test-log.md`.
4. Write down the results of the two concurrency checks (GJ20 and GR9).
5. Update `README.md` and `CLAUDE.md` (group rules: server enforces roles, no direct table writes, invite codes, settled-balance stubs and where Phase 5 replaces them, never expose emails).
6. Copy `phase-3.md` into `/docs`. Run `npm run check` and `npx supabase test db`. Commit, tag `phase-3-done`, push.

**Acceptance**
- Both check commands pass
- `docs/phase-3-test-log.md` has a result for every case ID, no open failures
- Tag `phase-3-done` is pushed

**STOP.** Phase 3 is complete once this passes.

---

## 8. SQL reference

> A starting point, not gospel. Keep every rule. Put it in migration files. Revoke first, grant explicitly.

### 8.1 Tables, constraints, RLS

```sql
create table public.groups (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  currency           text not null default 'INR',
  created_by         uuid not null references public.profiles(id),
  client_request_id  uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint groups_name_len check (char_length(name) between 1 and 50),
  constraint groups_currency check (currency = 'INR'),          -- relax in Phase 7
  constraint groups_request_unique unique (created_by, client_request_id)
);

create table public.group_members (
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null references public.profiles(id),
  role        text not null default 'member' check (role in ('admin', 'member')),
  status      text not null default 'active' check (status in ('active', 'left', 'removed')),
  joined_at   timestamptz not null default now(),
  left_at     timestamptz,
  removed_by  uuid references public.profiles(id),
  primary key (group_id, user_id),
  constraint gm_left_consistency check ((status = 'active') = (left_at is null))
);
create index group_members_user_active  on public.group_members (user_id)  where status = 'active';
create index group_members_group_active on public.group_members (group_id) where status = 'active';

create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  code        text not null unique,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  revoked_at  timestamptz,
  constraint invites_code_format check (code ~ '^[A-HJ-NP-Z2-9]{8}$')
);
create unique index invites_one_active_per_group on public.invites (group_id) where revoked_at is null;

create table public.invite_attempts (
  id            bigint generated always as identity primary key,
  user_id       uuid not null,
  attempted_at  timestamptz not null default now(),
  success       boolean not null
);
create index invite_attempts_user_time on public.invite_attempts (user_id, attempted_at desc);

-- RLS and privileges
alter table public.groups          enable row level security;
alter table public.group_members   enable row level security;
alter table public.invites         enable row level security;
alter table public.invite_attempts enable row level security;

revoke all on public.groups, public.group_members, public.invites, public.invite_attempts
  from anon, authenticated;
grant select on public.groups, public.group_members to authenticated;
-- No insert/update/delete grants anywhere. invites and invite_attempts: no grants at all.

create policy groups_select_members on public.groups
  for select to authenticated using (public.is_active_member(id));

create policy group_members_select_members on public.group_members
  for select to authenticated using (public.is_active_member(group_id));
```

> Add the `updated_at` trigger from Phase 2 (`set_updated_at`) to `groups` if you want it maintained.
> In Phase 4, expenses must reference `groups` with `on delete cascade` so deleting a group removes its data.

### 8.2 Helper functions

```sql
create or replace function public.is_active_member(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group
      and gm.user_id = (select auth.uid())
      and gm.status = 'active'
  );
$$;

create or replace function public.is_group_admin(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group
      and gm.user_id = (select auth.uid())
      and gm.status = 'active'
      and gm.role = 'admin'
  );
$$;

create or replace function public.generate_invite_code()
returns text language plpgsql set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- 32 symbols, no 0 O 1 I
  bytes bytea := extensions.gen_random_bytes(8);                   -- verify this schema in your project
  code  text  := '';
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return code;
end;
$$;

-- >>> STUBS. Phase 5 replaces these with real balance checks. Do not delete the calls. <<<
create or replace function public.member_is_settled(p_group uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select true; $$;

create or replace function public.group_is_settled(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select true; $$;

revoke execute on function public.is_active_member(uuid), public.is_group_admin(uuid),
  public.generate_invite_code(), public.member_is_settled(uuid, uuid), public.group_is_settled(uuid)
  from public, anon;
-- RLS policies call these as the signed-in user, so only these two need execute for authenticated:
grant execute on function public.is_active_member(uuid), public.is_group_admin(uuid) to authenticated;
```

### 8.3 The three riskiest functions

**`join_group`** (returns statuses instead of raising, so failed attempts are saved):

```sql
create or replace function public.join_group(p_code text)
returns table (r_status text, r_group_id uuid, r_group_name text)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid        uuid := auth.uid();
  v_code       text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_inv        public.invites;
  v_group      public.groups;
  v_member     public.group_members;
  v_was_member boolean;
  v_fails      int;
  v_members    int;
  v_my_groups  int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select count(*) into v_fails from public.invite_attempts ia
   where ia.user_id = v_uid and ia.success = false
     and ia.attempted_at > now() - interval '15 minutes';
  if v_fails >= 10 then
    return query select 'too_many_attempts'::text, null::uuid, null::text; return;
  end if;

  select * into v_inv from public.invites i where i.code = v_code;
  if not found then
    insert into public.invite_attempts (user_id, success) values (v_uid, false);
    return query select 'invalid'::text, null::uuid, null::text; return;
  end if;
  if v_inv.revoked_at is not null then
    return query select 'revoked'::text, null::uuid, null::text; return;
  end if;
  if v_inv.expires_at <= now() then
    return query select 'expired'::text, null::uuid, null::text; return;
  end if;

  -- lock the group first (same order everywhere)
  select * into v_group from public.groups g where g.id = v_inv.group_id for update;
  if not found then
    return query select 'invalid'::text, null::uuid, null::text; return;
  end if;

  select * into v_member from public.group_members gm
   where gm.group_id = v_group.id and gm.user_id = v_uid;
  v_was_member := found;          -- capture FOUND immediately, the next statements reset it

  if v_was_member and v_member.status = 'active' then
    return query select 'already_member'::text, v_group.id, v_group.name; return;
  end if;

  -- removed by an admin: only an invite created AFTER the removal lets them back in
  if v_was_member and v_member.status = 'removed' and v_inv.created_at <= v_member.left_at then
    return query select 'removed'::text, null::uuid, v_group.name; return;
  end if;

  select count(*) into v_members from public.group_members gm
   where gm.group_id = v_group.id and gm.status = 'active';
  if v_members >= 50 then
    return query select 'group_full'::text, null::uuid, null::text; return;
  end if;

  select count(*) into v_my_groups from public.group_members gm
   where gm.user_id = v_uid and gm.status = 'active';
  if v_my_groups >= 50 then
    return query select 'too_many_groups'::text, null::uuid, null::text; return;
  end if;

  if v_was_member then
    update public.group_members gm
       set status = 'active', role = 'member', left_at = null,
           removed_by = null, joined_at = now()
     where gm.group_id = v_group.id and gm.user_id = v_uid;
  else
    insert into public.group_members (group_id, user_id) values (v_group.id, v_uid);
  end if;

  insert into public.invite_attempts (user_id, success) values (v_uid, true);
  return query select 'joined'::text, v_group.id, v_group.name;
end;
$$;
```

**`set_member_role`**:

```sql
create or replace function public.set_member_role(p_group uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := auth.uid();
  v_target  public.group_members;
  v_admins  int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_role not in ('admin', 'member') then raise exception 'invalid_role'; end if;

  perform 1 from public.groups g where g.id = p_group for update;      -- serialize per group
  if not found or not public.is_active_member(p_group) then
    raise exception 'not_a_member';
  end if;
  if not public.is_group_admin(p_group) then raise exception 'not_admin'; end if;

  select * into v_target from public.group_members gm
   where gm.group_id = p_group and gm.user_id = p_user and gm.status = 'active';
  if not found then raise exception 'target_not_member'; end if;

  if v_target.role = p_role then return; end if;                        -- idempotent

  if p_role = 'member' then
    select count(*) into v_admins from public.group_members gm
     where gm.group_id = p_group and gm.role = 'admin' and gm.status = 'active';
    if v_admins <= 1 then raise exception 'last_admin'; end if;
  end if;

  update public.group_members gm set role = p_role
   where gm.group_id = p_group and gm.user_id = p_user;
end;
$$;
```

**`leave_group`**:

```sql
create or replace function public.leave_group(p_group uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid           uuid := auth.uid();
  v_me            public.group_members;
  v_active        int;
  v_other_admins  int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  perform 1 from public.groups g where g.id = p_group for update;
  select * into v_me from public.group_members gm
   where gm.group_id = p_group and gm.user_id = v_uid and gm.status = 'active';
  if not found then raise exception 'not_a_member'; end if;

  if not public.member_is_settled(p_group, v_uid) then
    raise exception 'member_not_settled';
  end if;

  select count(*) into v_active from public.group_members gm
   where gm.group_id = p_group and gm.status = 'active';

  if v_active = 1 then
    delete from public.groups g where g.id = p_group;                   -- last person out
    return 'group_deleted';
  end if;

  if v_me.role = 'admin' then
    select count(*) into v_other_admins from public.group_members gm
     where gm.group_id = p_group and gm.role = 'admin'
       and gm.status = 'active' and gm.user_id <> v_uid;
    if v_other_admins = 0 then raise exception 'last_admin'; end if;
  end if;

  update public.group_members gm
     set status = 'left', left_at = now(), role = 'member'
   where gm.group_id = p_group and gm.user_id = v_uid;
  return 'left';
end;
$$;
```

> The other functions (`create_group`, `list_my_groups`, `get_group`, `get_group_members`, `rename_group`, `get_or_create_invite`, `reset_invite`, `preview_invite`, `remove_member`, `delete_group`, `account_deletion_blockers`, `delete_my_account`) follow the same pattern and the rules in the sub-phase tables. After writing each one, run `revoke execute ... from public, anon` and `grant execute ... to authenticated`.

---

## 9. Notes on choices (so they are not re-debated mid-build)

- **All reads of other people's data go through `get_group_members()`**, not through wider `profiles` access. Phase 2 mentioned widening `profiles` reads; this is safer because it exposes only the columns we choose, and only to active co-members.
- **Rows in `group_members` are never deleted.** That keeps names in expense history, makes rejoining a simple update, and allows the "removed" rule.
- **Join returns statuses, not errors,** because a raised error would roll back the failed-attempt record.
- **Locking the group row first** in every membership function removes race conditions between admins, joiners and leavers.
- **No owner role:** fewer rules and fewer edge cases. If you later want "the creator can never be demoted", it can be added without breaking the schema.
- **Custom-scheme invite links** can be unreliable in chat apps, so the 8-character code is the primary path. An https landing page will fix this later (planned for Phase 7).
- **Stubs for balances:** the settled-balance rules are already in every function. Phase 5 only replaces two small functions.

---

## 10. Hooks for later phases

| Phase | What it must do for Phase 3 |
|-------|------------------------------|
| 4 | Expenses reference `groups` with `on delete cascade`; expense functions use `is_active_member()`; expense lists show former members' names via `get_group_members(..., true)`; `list_my_groups()` gains `last_activity_at` |
| 5 | Replace `member_is_settled()` and `group_is_settled()` with real checks; replace `account_deletion_blockers()` unsettled stub with real check (net balance != 0 in the group OR user has pending/disputed settlement); `list_my_groups()` gains `my_balance_minor`; re-run GM2, GM7, GE5, GD4 against real data |
| 6 | Settlement confirmation uses `is_active_member()` for both parties |
| 7 | Membership notifications; https invite landing page and Android App Links |
| 8 | Full RLS audit including all Phase 3 functions |

---

## 11. Phase 3 Definition of Done

- [x] 3.1 to 3.9 completed, tested, and confirmed one by one
- [x] Every row of the Section 4 permissions table is proven by SQL tests
- [x] Every case ID in Section 6 has a pass result in `docs/phase-3-test-log.md`
- [x] The two concurrency checks (GJ20 and GR9) are recorded
- [x] No direct table writes anywhere in the app; clients only have `select` on `groups` and `group_members`
- [x] The stubs `member_is_settled` and `group_is_settled` are in place and documented
- [x] Account deletion respects groups (GD1 to GD6) and Phase 2 cases F7 and F9 are marked pass
- [x] `npm run check` and `npx supabase test db` pass
- [x] Docs updated; tagged `phase-3-done`
- [x] Decisions D5 to D12 have recorded answers

---

## 12. Common problems and fixes

| Problem | Fix |
|---------|-----|
| `infinite recursion detected in policy` | A policy reads the same table directly. Use the `security definer` helper functions (`is_active_member`) as in Section 8 |
| `column reference "group_id" is ambiguous` inside a function | Output column names clash with table columns. Use prefixed output names (`r_group_id`) and table aliases, as in `join_group` |
| Wrong results after `select ... into` | `FOUND` is reset by the next statement. Save it into a variable right away (`v_was_member := found`) |
| Failed join attempts are never counted | The function raised an exception, which rolls back the insert. Return a status instead |
| `permission denied for function is_active_member` | RLS policies run as the caller. Grant execute on the two helper functions to `authenticated` |
| `gen_random_bytes` not found | Check which schema holds `pgcrypto` in your project (usually `extensions`) and adjust the call |
| New function is callable by anyone | Forgot `revoke execute ... from public, anon` |
| Group list shows stale data after joining | Invalidate `['groups']` after join, create, leave, delete |
| Member still sees the group after removal | The screen is stale. Refetch on focus; handle `not_a_member` by returning to the list |
| Deadlocks or odd results with two admins | A function locked rows in a different order. Always lock the group row first |

---

## 13. Starter prompt for Claude Code

```
You are continuing SplitEase (React Native + Expo, TypeScript, Supabase). Phases 1 and 2 are done (tags phase-1-done, phase-2-done).

Read these first and follow them strictly:
- docs/prd.md
- docs/phase-3.md (the current phase, including the Roles table, Error codes and Case Matrix)
- docs/phase-2.md (auth and profile rules still apply)
- CLAUDE.md

Rules:
1. Work ONLY on sub-phase 3.1 right now. Do not start 3.2 or anything else.
2. The backend (3.1 to 3.4) comes before any screen. Do not build UI until 3.5.
3. All business rules live in Postgres functions. The app never inserts, updates or deletes rows in groups, group_members, invites or invite_attempts.
4. Every new function: SECURITY DEFINER, SET search_path = '', user from auth.uid() only, execute revoked from public and anon.
5. Every membership-changing function locks the group row first.
6. Write the SQL tests described in the sub-phase. A sub-phase is not done until its tests pass.
7. STOP when 3.1 is done and tell me: what you created, the exact commands you ran, the test output, and how I can verify it myself.
8. Keep every change small. Never use or ask for the service_role key. Never commit .env or secrets. Never log emails, tokens or UPI IDs.
9. Every sub-phase must satisfy the case IDs it lists in docs/phase-3.md. If a case cannot be met, tell me instead of working around it.
10. Do not add libraries or services that the current sub-phase does not list.

Start with 3.1 now.
```

After 3.1 is confirmed, say "continue with 3.2", and so on.
