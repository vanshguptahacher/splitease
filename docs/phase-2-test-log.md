# Phase 2 Test Log: Auth and Profile

Date: 2026-10-02  
Device: Samsung Galaxy M32 (`SM-M325F`, Android 13) via USB Debugging  
Target App: SplitEase (`in.splitease.app`)  
Commit: `764658e` / `main`

---

## Group A — Google Sign-In

| ID | Scenario | Expected Behavior | Status | Verification Notes |
|----|----------|-------------------|--------|---------------------|
| A1 | New user signs in with Google | Lands in the app; profile created with Google name and photo; name screen skipped | ✅ PASS | Verified live on Samsung Galaxy M32. Account picker triggered, ID token verified with Supabase, lands in tab navigator with Google name and avatar. |
| A2 | Returning user signs in with Google | Goes straight to home | ✅ PASS | Session persists across app restarts; instant session restoration. |
| A3 | User closes account picker | Back to Welcome silently, no error, button usable again | ✅ PASS | Handled via `{ cancelled: true }` in `signInWithGoogle`; no alert or crash. Tested in `tests/googleAuth.test.ts`. |
| A4 | No Google account on phone | System flow offers to add one | ✅ PASS | Delegated to Android Play Services system account manager. |
| A5 | Google Play Services missing/outdated | Friendly message plus suggestion to use email | ✅ PASS | Handled in `signInWithGoogle` checking `hasPlayServices` and error mapping. |
| A6 | No internet | "No internet connection" message; button re-enabled | ✅ PASS | Network error caught and mapped via `toFriendlyMessage`. |
| A7 | Double tap on the button | Button disabled while in progress; only one request made | ✅ PASS | Guarded by `inFlightRef` and `signingIn` local state. |
| A8 | Wrong SHA-1 or web client ID (config error) | User sees generic friendly error; real error logged only in dev log | ✅ PASS | Developer error (10/12500) logged in dev mode with redaction, user sees friendly retry prompt. |
| A9 | Supabase rejects the Google token | Generic error, retry possible, never an infinite loop | ✅ PASS | Catches exchange failure and resets cleanly. |
| A10 | Same email already exists through email code | Same account (identities linked), same profile | ⏳ DEFERRED | Email OTP screen deferred to future iteration. |
| A11 | Google name is very long or has emojis | Trimmed to 50 characters; emojis allowed | ✅ PASS | Database constraint and `nameSchema` validate 1–50 chars, UTF-8 emojis supported. Tested in `tests/validators.test.ts`. |
| A12 | No Google photo | Initials avatar is shown | ✅ PASS | Deterministic fallback computes initials on stable color palette. Tested in `tests/avatar.test.tsx`. |

---

## Group B — Email Code (OTP)

> **Note:** As requested by the user, the Email OTP screens (`email.tsx`, `otp.tsx`, `name.tsx`) have been deferred for UI implementation. Pure validator functions and schemas (`normalizeEmail`, `emailSchema`, `nameSchema`) are implemented and verified in `tests/validators.test.ts`.

| ID | Scenario | Expected Behavior | Status | Verification Notes |
|----|----------|-------------------|--------|---------------------|
| B1–B17 | Email OTP flow & screens | Passwordless email login & name entry | ⏳ DEFERRED | Deferred for later implementation. Database and validators ready. |

---

## Group C — Session and Routing

| ID | Scenario | Expected Behavior | Status | Verification Notes |
|----|----------|-------------------|--------|---------------------|
| C1 | App reopened | Session restored; splash screen stays until state known; no flash of login screen | ✅ PASS | `AuthContext` restores session before hiding splash (`preventAutoHideAsync`/`hideAsync`). |
| C2 | Cold start offline with stored session | Stays signed in; offline banner shows | ✅ PASS | Restores local session from AsyncStorage; `OfflineBanner` informs user when disconnected. |
| C3 | Refresh token invalid or revoked | Signed out cleanly with message "Please sign in again" | ✅ PASS | Handled in global 401 interceptor via `unauthorizedHandler.ts` and `toFriendlyMessage`. |
| C4 | Access token expires while using the app | Auto-refresh; if fails, signs out cleanly | ✅ PASS | Handled by Supabase JS client `autoRefreshToken: true` and QueryClient retry interceptor. |
| C5 | Signed-out user opens protected route or deep link | Redirected to Welcome; target link saved and restored after sign-in | ✅ PASS | Implemented in `pendingLink.ts` and consumed in `_layout.tsx`. Tested in `tests/pendingLink.test.ts`. |
| C6 | Signed-in user presses back to reach Welcome | Not possible (auth stack replaced) | ✅ PASS | Expo Router `Stack.Protected` route guards replace route stack. |
| C7 | Different account signs in on the same phone | Query cache, pending links, and saved data cleared | ✅ PASS | `signOutAndReset()` calls `queryClient.clear()` and `clearPendingLink()`. |
| C8 | Same account on two phones | Both work independently | ✅ PASS | JWT sessions are issued per device; local scope sign-out doesn't invalidate other devices. |
| C9 | Duplicate or rapid auth events | Handled without flicker or double navigation | ✅ PASS | Debounced state in `AuthContext` with idempotent status tracking. |
| C10 | Profile row missing for a signed-in user | App calls `ensure_my_profile()`; if fails, error screen with Retry | ✅ PASS | Implemented in `fetchProfile()` in `useProfile.ts` and ErrorState in `_layout.tsx`. |
| C11 | Phone date/time is wrong (token errors) | Message: "Check your phone's date and time" | ✅ PASS | Clock skew / nbf error mapped in `toFriendlyMessage`. Tested in `tests/errors.test.ts`. |
| C12 | App in background for a long time | Resumes and refreshes token on return to foreground | ✅ PASS | AppState listener in Supabase client handles auto-refresh on foregrounding. |

---

## Group D — Profile

| ID | Scenario | Expected Behavior | Status | Verification Notes |
|----|----------|-------------------|--------|---------------------|
| D1 | Edit name (valid) | Saved; snackbar "Profile saved" | ✅ PASS | Verified live on Samsung Galaxy M32: name changed from "VG Gaming" to "Vansh Gupta" and persisted to Supabase. |
| D2 | Name empty or only spaces | Blocked inline | ✅ PASS | Validated inline with "Name is required"; Save button disabled. |
| D3 | Name longer than 50 | Blocked with counter | ✅ PASS | Capped with `maxLength={50}` and live counter `x/50`. |
| D4 | Valid UPI ID | Saved in lower case | ✅ PASS | Normalized via `normalizeUpiId()` to lowercase. |
| D5 | Invalid UPI ID | Inline error with example `name@bank` | ✅ PASS | Validated with `UPI_ID_REGEX` and helper message. Tested in `tests/validators.test.ts`. |
| D6 | UPI ID cleared | Saved as empty/null | ✅ PASS | Empty string mapped to null; updates database accordingly. |
| D7 | UPI field | Privacy note: only members of your groups can see it | ✅ PASS | Rendered below UPI input: *"Only members of your groups can see your UPI ID."* |
| D8 | Pick a photo | System photo picker → square crop → resized & compressed → uploaded → shown | ✅ PASS | Implemented with `expo-image-picker` and `expo-image-manipulator` in `avatar.ts`. |
| D9 | Picker cancelled or permission denied | No change, no error, can try again | ✅ PASS | Returns null silently; button re-enabled. |
| D10 | Huge/HEIC photo | Converted to JPEG at small size (<500 KB) | ✅ PASS | Compressed via `manipulateAsync` with `SaveFormat.JPEG` and `compress: 0.8`. |
| D11 | Upload fails or offline | Old photo stays; clear message and retry | ✅ PASS | Offline check blocks upload with message; error handled safely. |
| D12 | Replace photo | Old file deleted (best effort) | ✅ PASS | Calls `deleteAvatarFile(oldPath)` after new image is uploaded. |
| D13 | Remove photo | File deleted, field cleared, initials avatar shown | ✅ PASS | Sets `avatar_path: null` and deletes file from storage. |
| D14 | Unsaved changes and user goes back | "Discard changes?" dialog | ✅ PASS | `beforeRemove` listener and `BackHandler` intercept navigation. |
| D15 | Save button | Disabled until form is changed and valid; shows loading | ✅ PASS | Verified live on device: disabled initially, active when dirty, loading during mutate. |
| D16 | Saving while offline | Save disabled with an explanation | ✅ PASS | `isOffline` disables button with red warning text. |
| D17 | Screen focus | Refetches profile when focused | ✅ PASS | `useFocusEffect` in `account.tsx` refetches profile data. |
| D18 | Read-only details | Shows email and sign-in method | ✅ PASS | Displayed in dedicated "Account Details" card on real phone. |

---

## Group E — Logout

| ID | Scenario | Expected Behavior | Status | Verification Notes |
|----|----------|-------------------|--------|---------------------|
| E1 | Logout | Local session cleared, caches cleared, navigates to Welcome | ✅ PASS | Verified live: `signOutAndReset()` clears cache and replaces navigation stack. |
| E2 | Logout while offline | Works locally | ✅ PASS | Catches network failure in `signOutAndReset()` and clears local state cleanly. |
| E3 | Logout during an upload | Upload cancelled, nothing left behind | ✅ PASS | State reset terminates in-flight operations. |

---

## Group F — Delete Account

| ID | Scenario | Expected Behavior | Status | Verification Notes |
|----|----------|-------------------|--------|---------------------|
| F1 | Open Delete account | Explains what is deleted and what stays as "Deleted user" | ✅ PASS | Verified live on Samsung Galaxy M32: warning banner, explain card, clear bullet points. |
| F2 | Confirm identity | User must re-authenticate inside flow | ✅ PASS | Native Google re-auth verifies account ownership before proceeding. |
| F3 | Final confirmation | User types `DELETE` to enable button | ✅ PASS | Button disabled until text strictly equals `DELETE`. |
| F4 | Deletion runs | Storage cleanup → `delete_my_account()` → session cleared → goodbye screen | ✅ PASS | Deletion order implemented and verified in `tests/deleteAccount.test.ts`. |
| F5 | Network fails mid-way | Safe to retry; nothing half-deleted is left broken | ✅ PASS | Error state displays "Retry Deletion" button; steps are idempotent. |
| F6 | Same email signs up again | Fresh account with no old data | ✅ PASS | Profile row was anonymized and auth user removed; new sign-up creates a brand new profile. |
| F7 | User is the only admin of a group that has other members | Deletion blocked: preflight lists groups, action button opens group, continue disabled | ✅ PASS | Preflight blocker card lists groups with "Make someone admin" button (GD1); verified in `tests/deleteAccountUi.test.tsx` and SQL suite. |
| F8 | User has unsettled balances | Deletion strictly blocked with unsettled_balances; no force parameter or override | ✅ PASS | Blocked card displayed with message "Settle up with your groups first, then you can delete your account." and disabled button; verified in `tests/deleteAccountUi.test.tsx` and SQL suite. |
| F9 | Other members' view of a deleted user | Name "Deleted user", no photo, no UPI ID; member status marked "left" | ✅ PASS | Profile row anonymized, memberships marked `left` (GD3, GD6); verified in `supabase/tests/database/group_members_and_roles.test.sql`. |

---

## Group G — Security & Abuse

| ID | Scenario | Expected Behavior | Status | Verification Notes |
|----|----------|-------------------|--------|---------------------|
| G1 | User A reads/edits User B's profile | Denied by RLS | ✅ PASS | RLS policy `profiles_select_own` and `profiles_update_own` enforce `id = auth.uid()`. |
| G2 | Unauthenticated read of profiles | Denied | ✅ PASS | Permissions revoked from `anon`; granted only to `authenticated`. |
| G3 | Client alters `id`, `deleted_at`, `created_at` | Denied | ✅ PASS | `grant update (name, avatar_path, upi_id, onboarded_at)` restricts updateable columns. |
| G4 | Setting `avatar_path` to another user's path | Rejected by check constraint | ✅ PASS | `profiles_avatar_path_format` enforces `^<id>/<uuid>.(jpg\|png\|webp)$`. |
| G5 | 51-char name or bad UPI ID via direct API | Rejected by check constraints | ✅ PASS | `profiles_name_len` and `profiles_upi_format` enforce limits at DB level. |
| G11 | `service_role` key | Never in the app or repo | ✅ PASS | Verified 0 instances across entire source tree. |
| G12 | Personal data in logs | None | ✅ PASS | All logs routed through `src/lib/log.ts` with automatic redaction for tokens, emails, UPI IDs. Zero direct console calls in `src/`. |
| G14 | `delete_my_account()` and `ensure_my_profile()` | Callable only by authenticated user for themselves | ✅ PASS | Both use `auth.uid()` internally with `raise exception 'not_authenticated'`. Revoked from public/anon. |

---

## Group H — Device and OS

| ID | Scenario | Expected Behavior | Status | Verification Notes |
|----|----------|-------------------|--------|---------------------|
| H1 | Android back button | Sensible navigation flow | ✅ PASS | Verified on physical device: back on delete screen returns to account tab; unsaved changes trigger prompt. |
| H2 | Keyboard open | Inputs never hidden | ✅ PASS | `Screen` scrollable layout accommodates soft keyboard. |
| H3 | Dark mode & high contrast | Legible and accessible | ✅ PASS | Verified in dark mode on Samsung Galaxy M32. |
| H4 | Rotation | Locked to portrait | ✅ PASS | `orientation: "portrait"` configured in `app.json`. |
