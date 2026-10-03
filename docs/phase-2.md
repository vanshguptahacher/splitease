# SplitEase — Phase 2: Auth and Profile

**Depends on:** `prd.md` (v1.1) and a finished Phase 1 (`phase-1-done` tag)
**Goal:** Users can sign in (Google or email code), stay signed in, manage a profile (name, photo, UPI ID), log out, and delete their account. Every normal and edge case in this document is handled.
**Rule:** Work **one sub-phase at a time. STOP after each sub-phase**, test on a real phone, and confirm before moving on.

> **UX stance (same as Phase 1):** sign-in must be the easiest part of the app. Google = 1 tap. Email = email → 6-digit code → done. **No passwords, no forms we don't need.** Optional things (UPI ID, photo) are never forced at sign-up.

---

## 0. Scope

### In scope
- Supabase Auth configuration: Google Sign-In + email one-time code (OTP)
- `profiles` table, auto-creation trigger, RLS, privileges, constraints
- Avatar storage (bucket + policies)
- Auth state, splash handling, protected routes, pending deep-link restore
- Sign-in, onboarding (name), profile screen, logout, delete account
- SQL tests for RLS and constraints, unit tests for validators

### Out of scope (later phases)
- Groups, roles and admin logic (Phase 3). The role cases are listed in **Section 8** so none are forgotten
- Expenses, balances, UPI payments
- Push notifications, Sentry, biometric app lock
- Phone-number (SMS) login, Apple Sign-In (iOS is not in v1)
- Cloudflare Workers or any extra backend

---

## 1. Decisions to confirm before 2.1

| # | Decision | Recommendation |
|---|----------|----------------|
| D1 | Email login method | **Email one-time code (OTP), no passwords.** Fewer screens, no "forgot password" flow, fewer cases. (Alternative: email + password, which adds reset-password flows and about 10 more cases.) |
| D2 | What happens to a user's data when they delete their account | **Smart delete of the profile row.** If nothing references the profile, hard delete the row. If other tables reference it (foreign key), keep the row but anonymize it (name 'Deleted user', avatar_path/avatar_url/upi_id null, deleted_at = now()) so other people's history stays correct. Then delete the auth user. Deletion is blocked if the user is a sole admin of groups with members or has unsettled balances. This must be written in the privacy policy (Phase 9). |
| D3 | Members **without the app** (e.g. elders who only appear by name in a group) | **Decide before Phase 3 starts, because it changes the database schema.** Recommendation: **v2.** For v1 such people can join using email code in under a minute. |
| D4 | Email delivery | Supabase's built-in email sender is heavily rate-limited and meant for testing. **Set up a custom SMTP provider (a free-tier transactional email service) before the family beta.** |

---

## 2. UX rules for this phase

1. Google sign-in: **1 tap** (plus the account picker).
2. Email sign-in: **3 steps** (email → code → name, name only for new users).
3. The code screen auto-submits when 6 digits are entered; pasting a code works.
4. Errors are plain and specific: "That code is wrong. 2 tries left", not "Auth error 400".
5. Never show a blank flash of the login screen to someone who is already signed in.
6. Cancelling a Google picker is **not** an error; show nothing.
7. The only confirmation dialogs in this phase are: discard unsaved profile changes, and delete account. Everything else is direct.
8. UPI ID is explained in one line ("so friends can pay you") and is never mandatory.

---

## 3. How it fits together

```
Welcome screen
 ├─ Google button ─► native Google account picker ─► idToken ─► supabase.auth.signInWithIdToken
 └─ Email button  ─► enter email ─► signInWithOtp (sends 6-digit code)
                     └─► enter code ─► verifyOtp ─► session
                                  │
                                  ▼
          AuthProvider (session restored, listens to auth changes)
                                  │
              profile exists? ── no ─► ensure_my_profile() RPC
                                  │
         onboarded_at is null? ── yes ─► Name screen ─► update profile
                                  │
                                  ▼
                       Tabs (Groups / Activity / Account)
```

**Data rules**
- `auth.users` (managed by Supabase) holds the email and login identities. **Emails are never copied into `profiles`**, so other members can never see your email.
- `profiles` holds only: name, avatar, UPI ID, onboarding/deleted flags.
- Clients can **read only their own profile** in Phase 2. Phase 3 widens this to "people who share a group with me" (see Section 8).
- Clients can update only `name`, `avatar_path`, `upi_id`, `onboarded_at`. Everything else is blocked at the database level.

---

## 4. Case Matrix (every case that must be handled)

> Each sub-phase lists the case IDs it must satisfy. At the end of Phase 2, walk through this whole matrix on a real phone.

### A. Google Sign-In

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| A1 | New user signs in with Google | Lands in the app; profile created with Google name and photo; name screen skipped |
| A2 | Returning user signs in with Google | Goes straight to home |
| A3 | User closes the account picker | Back to Welcome silently, no error, button usable again |
| A4 | No Google account on the phone | System flow offers to add one; backing out behaves like A3 |
| A5 | Google Play Services missing or outdated | Friendly message plus suggestion to use email instead |
| A6 | No internet | "No internet connection" message; button re-enabled |
| A7 | Double tap on the button | Button disabled while in progress; only one request is made |
| A8 | Wrong SHA-1 or web client ID (config error) | User sees a generic "Couldn't sign in, try again or use email"; the real error appears only in the dev log |
| A9 | Supabase rejects the Google token | Generic error, retry possible, never an infinite loop |
| A10 | Same email already exists through email code | **Same account** (identities linked), same profile, same data. Verify this by testing |
| A11 | Google name is very long or has emojis | Trimmed to 50 characters; emojis allowed |
| A12 | No Google photo | Initials avatar is shown |

### B. Email code (OTP)

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| B1 | New email, valid code | Code sent → entered → name screen (prefilled) → home |
| B2 | Existing user, valid code | Straight to home (no name screen if already onboarded) |
| B3 | Invalid email format | Inline error, no request sent |
| B4 | Email typed with capitals or spaces | Trimmed and lower-cased automatically |
| B5 | Typo in the email (code never arrives) | OTP screen shows the email and a "Wrong email? Change" link |
| B6 | Wrong code | Boxes shake and clear; message "Wrong code"; attempts limited by the server |
| B7 | Expired code | "Code expired" and a clear Resend button |
| B8 | Resend code | 60-second countdown before it can be used again; after resend, message says "Use the newest code" |
| B9 | Server rate limit hit | Friendly "Too many attempts, try again in a few minutes", no crash |
| B10 | User pastes the 6-digit code | All boxes fill and it submits automatically |
| B11 | Email lands in spam | Hint text on the OTP screen: "Check your spam folder" |
| B12 | User leaves the app to read the email and returns (even if the app was killed) | OTP screen restored with the same email (pending state kept for about 10 minutes) |
| B13 | No internet while sending or verifying | Message shown; typed data kept; retry works |
| B14 | Email service is slow or down | 15-second timeout, then a clear message and retry |
| B15 | Name screen: empty or spaces only | Continue button disabled |
| B16 | Name screen: more than 50 characters | Input limited with a counter |
| B17 | App killed on the name screen | Next launch: user is signed in and the name screen shows again (`onboarded_at` is still empty) |

### C. Session and routing

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| C1 | App reopened | Session restored; splash screen stays until the state is known; **no flash of the login screen** |
| C2 | Cold start offline with a stored session | Stays signed in; offline banner shows |
| C3 | Refresh token invalid or revoked (e.g. account deleted elsewhere) | Signed out cleanly with the message "Please sign in again" |
| C4 | Access token expires while using the app | Auto-refresh; if a request still returns unauthorized, refresh once and retry; if that fails, C3 |
| C5 | Signed-out user opens a protected route or deep link | Redirected to Welcome; the target link is saved and **opened after sign-in** (needed for Phase 3 invite links) |
| C6 | Signed-in user presses back to reach Welcome | Not possible (auth stack is replaced) |
| C7 | Different account signs in on the same phone | Query cache, pending links and per-user saved data are cleared first (no data from the previous user is ever visible) |
| C8 | Same account on two phones | Both work independently |
| C9 | Duplicate or rapid auth events (`SIGNED_IN`, `TOKEN_REFRESHED`) | Handled without flicker or double navigation |
| C10 | Profile row missing for a signed-in user | App calls `ensure_my_profile()`; if that fails, an error screen with Retry |
| C11 | Phone date/time is wrong (token errors) | Message: "Check your phone's date and time" |
| C12 | App in background for a long time | Resumes and refreshes the token on return to foreground |

### D. Profile

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| D1 | Edit name (valid) | Saved; snackbar "Saved" |
| D2 | Name empty or only spaces | Blocked inline |
| D3 | Name longer than 50 | Blocked with counter |
| D4 | Valid UPI ID | Saved in lower case |
| D5 | Invalid UPI ID | Inline error with an example such as `name@bank` |
| D6 | UPI ID cleared | Saved as empty; later settle-up screens show "Ask [name] to add their UPI ID" |
| D7 | UPI field | One-line privacy note: only members of your groups can see it |
| D8 | Pick a photo | System photo picker → square crop → resized and compressed → uploaded → shown |
| D9 | Picker cancelled or permission denied | No change, no error, can try again |
| D10 | Huge, HEIC or other unsupported photo | Converted to JPEG at a small size (target well under 500 KB); server hard limit 2 MB |
| D11 | Upload fails or offline | Old photo stays; clear message and retry |
| D12 | Replace photo | Old file deleted (best effort) |
| D13 | Remove photo | File deleted, field cleared, initials avatar shown |
| D14 | Unsaved changes and the user goes back | "Discard changes?" dialog |
| D15 | Save button | Disabled until the form is changed and valid; shows loading; double tap is safe |
| D16 | Saving while offline | Save disabled with an explanation |
| D17 | Profile edited on two phones | Last write wins; screen refetches when focused |
| D18 | Sign-in info | Shows how the user signed in and their own email (read-only, visible only to them) |

### E. Logout

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| E1 | Logout | This phone's session cleared (local scope, other phones stay signed in), caches cleared, goes to Welcome; back button cannot return to protected screens |
| E2 | Logout while offline | Still works locally |
| E3 | Logout during an upload | Upload cancelled, nothing left behind |

### F. Delete account

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| F1 | Open Delete account | Screen explains what is deleted (name, photo, UPI ID, login) and what stays (past expenses shown as "Deleted user") |
| F2 | Confirm identity | User must sign in again (Google or email code) inside this flow |
| F3 | Final confirmation | User types `DELETE` to enable the button |
| F4 | Deletion runs | Preflight blockers re-check → avatar files removed → `delete_my_account()` (smart delete: hard delete profile if unreferenced, anonymize if referenced by FK, delete auth user) → local session cleared → goodbye screen. If deletion fails after avatar removal, `avatar_path` is reset to null. |
| F5 | Network fails mid-way | Safe to retry; nothing half-deleted is left in a broken state |
| F6 | Same email signs up again later | Gets a **brand new** account with a fresh profile row and none of the old data |
| F7 | *(Phase 3 hook)* User is the only admin of a group that has other members | Deletion blocked (`sole_admin`): "You're the only admin of a group with other members. Make someone else admin or delete the group first." |
| F8 | *(Phase 3/5 hook)* User has unsettled balances | Deletion is **blocked** (`unsettled_balances`): "Settle up with your groups first, then you can delete your account." No force parameter or delete anyway option. |
| F9 | Other members' view of a deleted user | If anonymized due to references: name "Deleted user", no photo, no UPI ID; history and balances unchanged |
| F10 | *(Phase 9)* Deletion request from the Play Store web link | Same outcome through a public web page |

### G. Security and abuse

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| G1 | User A reads or edits user B's profile through the API | Denied |
| G2 | Not-logged-in read of profiles | Denied |
| G3 | Client changes `id`, `deleted_at`, `created_at` or `avatar_url` | Denied (no column permission) |
| G4 | Client sets `avatar_path` to another user's path or an external URL | Rejected by a database check |
| G5 | Invalid UPI ID or long name sent directly to the API | Rejected by database constraints |
| G6 | OTP brute force | Server rate limits plus a short code expiry |
| G7 | Email bombing (spamming the send-code button) | Client 60-second cooldown plus server limits (CAPTCHA can come later) |
| G8 | Account enumeration ("does this email exist?") | Same response for new and existing emails |
| G9 | Fake metadata at sign-up (custom name or avatar) | Avatar accepted only from Google's photo host; name length-limited |
| G10 | Redirect URLs | Allow-list contains only the app's own scheme |
| G11 | `service_role` key | Never in the app or repo |
| G12 | Personal data in logs | None (emails, tokens, UPI IDs never logged) |
| G13 | Where tokens are stored | `AsyncStorage` in v1 (accepted). Phase 8 upgrades to an encrypted storage adapter |
| G14 | `delete_my_account()` and `ensure_my_profile()` | Callable only by signed-in users and only for themselves (user comes from `auth.uid()`, never from a parameter) |

### H. Device and OS

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| H1 | Android back button on each auth screen | Sensible (OTP → email → welcome; Welcome exits the app) |
| H2 | Keyboard open | Inputs and the OTP boxes are never hidden |
| H3 | Dark mode, largest font size, 360dp width | Everything readable and usable |
| H4 | Rotation | Locked to portrait |
| H5 | Emulator for Google Sign-In | Must use an image **with Google Play**; otherwise Google Sign-In cannot work |
| H6 | App killed by low memory during sign-in | Recoverable on next launch (B12, B17) |
| H7 | Slow network | Loaders and timeouts everywhere; never an endless spinner |

---

## 5. Sub-phases

---

### 2.1 — Auth configuration (Supabase and Google Cloud)

**Goal:** Everything outside the code is set up correctly, once, and written down.

**Tasks**
1. **Supabase Auth settings**
   - Keep Email provider on; turn **off** any provider we don't use.
   - Email templates: edit the **Magic Link** and **Confirm signup** templates so the email shows the code using `{{ .Token }}` (not a link). Keep the text short and friendly.
   - Set the OTP expiry to a short value (about 10 minutes).
   - URL configuration: set the redirect allow-list to the app scheme only (`splitease://*`). Remove any wildcard web URLs you don't own.
   - Check the current rate limits shown in the dashboard and note them in `README.md`.
2. **Custom SMTP (D4):** create an account with a transactional email provider, verify a sending address or domain, and add the SMTP details in Supabase. Send yourself a test code.
3. **Google Cloud project**
   - Create a project; set up the OAuth consent screen (app name, support email, scopes: `openid`, `email`, `profile` only).
   - Create **two OAuth client IDs**: a **Web** client (its ID is used by the app library and by Supabase) and an **Android** client (package name = your app ID, plus the SHA-1 fingerprint).
   - Debug SHA-1: run `cd android && ./gradlew signingReport` (or `keytool -list -v` on the debug keystore) and copy the SHA-1.
   - Set the consent screen's publishing status so people outside your test-user list can sign in (basic scopes normally need no Google review).
4. **Supabase Google provider:** enable it and paste the Web client ID (and secret). Follow the current Supabase docs for the native ID-token flow, including the nonce setting that matches the library version you install.
5. **Write it down** in `README.md` → "Auth setup": which IDs exist and where they are configured (no secrets).

> **Remember for Phase 9:** when you publish to the Play Store, Google re-signs your app. Add the SHA-1 of the **upload key** *and* of the **Play App Signing key** (from Play Console) to the Android client in Google Cloud, or Google Sign-In will work in testing but fail for real users.

**Acceptance**
- A test code email arrives in your inbox from your SMTP provider and shows a 6-digit code, not a link
- Google provider is enabled in Supabase; Web and Android client IDs exist
- `README.md` documents the setup, with no secrets in git

**STOP.** Report what was configured and show the email template text used.

---

### 2.2 — Database: profiles, privileges, RPCs, avatar storage

**Goal:** A locked-down `profiles` table that creates itself on sign-up. (Cases: C10, D3–D6, G1–G5, G9, G14.)

**Tasks**
1. Create migration files with `npx supabase migration new profiles` and `npx supabase migration new avatars_storage`. Put the SQL from **Section 6** in them (adjust as needed, but keep every rule).
2. Apply with `npx supabase db push`.
3. Write SQL tests in `supabase/tests/` (run with `npx supabase test db`) that prove:
   - user A cannot select or update user B's profile
   - an anonymous user cannot read profiles
   - updating `id`, `deleted_at`, `created_at` or `avatar_url` as a normal user fails
   - invalid UPI IDs, a 51-character name and a foreign `avatar_path` are rejected
   - the trigger creates a profile for a new auth user, including the name fallbacks (Google name → email prefix → "User")
   - `ensure_my_profile()` creates a missing profile and is idempotent
4. Regenerate TypeScript types: `npx supabase gen types typescript --linked > types/supabase.ts`.

**Acceptance**
- `npx supabase test db` passes
- In the Supabase dashboard, `profiles` has RLS enabled and the privileges match Section 6
- Types file generated and committed

**STOP.** Report the migrations, test output and any change you made to the SQL.

---

### 2.3 — Auth state, splash, protected routes

**Goal:** The app always knows who is signed in, and shows the right screens. (Cases: C1–C12, E1, E2.)

**Tasks**
1. Install: `npx expo install expo-splash-screen`.
2. `AuthProvider` exposing `{ status: 'loading' | 'signedOut' | 'signedIn', session, profile }` plus `useAuth()` and `useProfile()` (profile via React Query, key `['profile']`).
3. Restore the session on launch (`supabase.auth.getSession()`), keep the **splash screen visible** until status is known (C1).
4. Subscribe to `supabase.auth.onAuthStateChange`.
   - **Do not `await` other Supabase calls inside the callback** (this can deadlock). Just update state and run follow-up work afterwards.
   - Make handlers idempotent so duplicate events don't cause double navigation (C9).
5. Route protection: use Expo Router's `Stack.Protected` guards (or a redirect inside the root layout if your SDK version lacks them): signed-out users only see `(auth)` routes; signed-in users only see the app. The auth screens replace the stack, so back cannot cross over (C6).
6. **Pending link:** if a signed-out user opens a deep link (e.g. `splitease://join/CODE`), save it in `AsyncStorage` and open it right after sign-in, then clear it (C5).
7. **Clean sign-out helper** `signOutAndReset()`: `supabase.auth.signOut({ scope: 'local' })`, clear the React Query cache, clear pending links and per-user saved data, reset navigation to Welcome (C7, E1).
8. If the stored refresh token is rejected, call the helper and show "Please sign in again" (C3). A network failure at startup must **not** sign the user out (C2).
9. Global handling of "unauthorized" API errors: refresh once, retry once, otherwise C3 (C4).
10. `ensure_my_profile()`: call it when the profile fetch finds no row (C10); show `ErrorState` with Retry if it fails.
11. Extend `toFriendlyMessage()` with auth errors (invalid or expired code, rate limit, bad clock, network). Check the current Supabase Auth error codes (for example for rate limits and expired codes) rather than guessing.
12. Placeholder `(auth)/welcome` screen for now (real UI comes in 2.4/2.5).

**Acceptance**
- Kill and reopen the app while signed in: no login flash, goes straight in (C1)
- Airplane mode + cold start while signed in: stays in, banner shows (C2)
- Revoke the session from another place (or delete the user in the dashboard): next app action signs out cleanly (C3)
- Open `splitease://group/123` while signed out: Welcome shows; after sign-in the link opens (C5)
- Sign out then sign in as a different account: nothing from the first account is visible (C7)

**STOP.** Report the route structure, the auth state flow, and test results for the above.

---

### 2.4 — Google Sign-In

**Goal:** One-tap Google login that works on a real phone. (Cases: A1–A12.)

**Tasks**
1. Install the native Google Sign-In library (`@react-native-google-signin/google-signin`) following its **current** docs and its Expo config plugin, then rebuild the dev client: `npx expo run:android`. (This needs a dev build; Expo Go cannot do it.)
2. Configure it with the **Web client ID** from 2.1.
3. `lib/auth/google.ts`: get the ID token, call `supabase.auth.signInWithIdToken({ provider: 'google', token })`.
4. Handle every library result explicitly: cancelled (A3, silent), in progress (A7), Play Services unavailable (A5), configuration error (A8: generic message to the user, details to the dev log), network failure (A6), token rejected (A9).
5. Build the Welcome screen's Google button (`AppButton`, loading state, disabled during sign-in). Use Google's official branding guidelines for the button.
6. Test linking (A10): sign up with email code first, then sign in with Google using the same email, and confirm both land in the **same** profile. If they don't, report it and stop; do not work around it silently.
7. `Avatar` component: shows the photo if present, otherwise initials on a stable color. Use it on the Account tab (A12).

**Acceptance**
- Real phone: new Google account → home, name and photo filled in (A1)
- Second sign-in → straight to home (A2)
- A3, A5 (if you can simulate), A6 (airplane mode), A7 (rapid taps) all behave as in the matrix
- Linking test result reported (A10)
- Emulator tests only on a Google Play image (H5)

**STOP.** Report results case by case (A1–A12).

---

### 2.5 — Email code sign-in and name screen

**Goal:** Passwordless email login that survives real-life interruptions. (Cases: B1–B17, G7, G8.)

**Tasks**
1. Install: `npx expo install react-hook-form @hookform/resolvers` (Zod is already installed).
2. `lib/validators.ts` (pure functions, unit tested later): `normalizeEmail`, `emailSchema`, `nameSchema` (trim, collapse spaces, 1–50 chars), `upiSchema`.
3. `(auth)/email.tsx`: email field with correct keyboard type, inline validation, "Send code" button with loading state (B3, B4). Call `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`; the response must look the same whether the email is new or not (G8).
4. `(auth)/otp.tsx`: `OtpInput` component with 6 boxes, big digits, paste support, auto-submit at 6 digits (B10), shake-and-clear on a wrong code (B6), expiry message (B7), **resend with a 60-second visible countdown** (B8, G7), "Wrong email? Change" link showing the email (B5), spam hint (B11), friendly rate-limit message (B9).
5. Persist `{ email, requestedAt }` in `AsyncStorage` while waiting for the code; restore it if the app is reopened within about 10 minutes (B12, H6). Clear it on success or when the user changes the email.
6. Wrap network calls with a 15-second timeout and clear messages (B13, B14).
7. `(auth)/name.tsx`: shown only when `profile.onboarded_at` is null (B1, B2, B17). Prefill the name from the email prefix. Validation per B15 and B16. On continue, update `name` and set `onboarded_at`.
8. Make sure keyboard-avoiding behavior works on every auth screen (H2) and that Android back follows H1.

**Acceptance**
- Full new-user flow on a real phone with a real email: B1
- Returning user: B2
- Test B3 to B16 one by one (airplane mode for B13, wait for expiry for B7, kill the app for B12 and B17)
- A user cannot reach the app without finishing the name screen when `onboarded_at` is null

**STOP.** Report results case by case (B1–B17).

---

### 2.6 — Profile screen (name, UPI ID, photo)

**Goal:** A profile screen that is hard to misuse. (Cases: D1–D18, G4, G5.)

**Tasks**
1. Install: `npx expo install expo-image-picker expo-image-manipulator`.
2. Account tab becomes the profile screen: avatar, name, UPI ID, sign-in method and email (read-only, D18), Logout and Delete account rows (built in 2.7).
3. Form with React Hook Form + Zod using `lib/validators.ts` (D1–D6). The **Save** button is disabled until the form is dirty and valid, shows loading, and ignores double taps (D15). Disabled with an explanation when offline (D16). UPI field shows the privacy line (D7) and an example placeholder.
4. Unsaved changes: intercept back/gesture and show "Discard changes?" (D14).
5. Photo flow (D8–D13):
   - Use the system photo picker (no broad storage permission needed); crop to square.
   - Resize and compress with `expo-image-manipulator` (about 512×512, JPEG), which also converts HEIC.
   - Upload to bucket `avatars` at path `<user id>/<new random uuid>.jpg`. A new random file name per upload avoids stale cached images.
   - After the upload succeeds, update `avatar_path`; then delete the old file (best effort). If the upload fails, nothing changes (D11).
   - "Remove photo" deletes the file and clears the field (D13).
   - Show upload progress and keep the UI responsive.
6. Public URL for display comes from the storage client using `avatar_path`; if there is no path, use `avatar_url` (Google photo); if neither, initials (A12).
7. Refetch the profile when the screen gains focus (D17).
8. All writes use plain column updates allowed by the privileges in Section 6. Anything the database rejects must show a friendly message through `toFriendlyMessage()`.

**Acceptance**
- D1 to D18 tested on a real phone
- Try to save a 51-character name and a bad UPI ID by editing the request or using the API directly (G5): both are rejected by the database, not only by the app
- Try setting `avatar_path` to another user's path using the API (G4): rejected

**STOP.** Report results case by case (D1–D18) and the G4/G5 attempts.

---

### 2.7 — Logout and delete account

**Goal:** Clean exit paths, including the Play Store requirement to delete an account in-app. (Cases: E1–E3, F1–F9.)

**Tasks**
1. **Logout:** Account → Logout → `signOutAndReset()` from 2.3. No confirmation dialog needed (it is easy to sign in again). Works offline (E2). Cancel any running upload (E3).
2. **Delete account flow** (screens: explain → re-authenticate → type DELETE → progress → goodbye):
   1. Explain screen (F1): check `account_deletion_blockers()` first. If `sole_admin_groups` or `unsettled_groups` are non-empty, show blocked state with group names and disabled delete button. If clear, explain what is removed, what stays as "Deleted user" (if referenced), and that it cannot be undone.
   2. Re-authenticate inside the flow with the same method the user signed in with (F2).
   3. Type `DELETE` to enable the final button (F3).
   4. Run, in this order (F4, F5):
      - re-check `account_deletion_blockers()` before irreversible file removal
      - delete the user's avatar files from storage (ignore "not found")
      - call `delete_my_account()` (smart delete: hard delete if unreferenced, anonymize if referenced by foreign keys; then delete auth user)
      - if `delete_my_account()` fails after avatar removal, update `avatar_path = null` on profile as fallback
      - sign out locally with `scope: 'local'`, because the server session no longer exists
      - clear caches and saved data
      - show the goodbye screen
   5. If a step fails, show Retry. Every step must be safe to repeat (F5).
3. **Verify** that `delete_my_account()` really removes the login. Deleting from `auth.users` inside a database function is a common pattern but is not an official API. **If it fails in your project, stop and report.** The fallback is a small Supabase Edge Function that uses the admin API (this is the only case where Phase 2 may add an Edge Function, and only with approval).
4. Add `account_deletion_blockers()` RPC and call it inside `delete_my_account()` before deletion. Add marked hook comment for Phase 3 ("PHASE 3 HOOK: leave all groups / delete groups where user is the only member").
5. After a deletion, sign up again with the same email and confirm it creates a fresh account with no old data (F6).

**Acceptance**
- E1 to E3 and F1 to F6 tested; F7/F8 blockers and F9 can be checked in Phase 3/5
- In the dashboard: the auth user is gone; the profile row is hard deleted if unreferenced, or anonymized (`Deleted user`, empty photo/UPI, `deleted_at` set) if referenced by foreign keys
- The deleted account's avatar files are gone from storage

**STOP.** Report results and the exact verification of what remains in the database.

---

### 2.8 — Hardening, tests and handoff

**Goal:** Prove the matrix, lock the docs, tag the phase. (Cases: G1–G14, H1–H7, plus a full re-run of A–F.)

**Tasks**
1. Unit tests (Jest) for `lib/validators.ts`: emails (case, spaces, bad formats), names (trim, collapse, 0/1/50/51 chars, emoji), UPI IDs (valid, uppercase, spaces, missing `@`, too short, empty = null).
2. Unit tests for the auth state helpers (pending-link save/restore, OTP pending-state expiry after about 10 minutes).
3. Re-run the SQL tests; add any gap found during manual testing.
4. **Security pass:**
   - search the code for `service_role` (must be nowhere)
   - search for logging of emails, tokens or UPI IDs (must be none)
   - confirm unused auth providers are off and the redirect allow-list is minimal
   - confirm the two RPCs and the trigger functions have `execute` revoked from `public` and `anon`
5. **Full manual walkthrough** of the whole Case Matrix (A–H) on a real phone, and the H cases on the emulator (Google Play image). Record the result per case ID in `docs/phase-2-test-log.md` (pass/fail/notes).
6. Update `README.md` (auth setup, how to run SQL tests, SMTP note) and `CLAUDE.md` (auth rules: no passwords, no email in profiles, avatar rules, RPC-only account deletion, never log personal data).
7. Copy `phase-2.md` into `/docs`. Run `npm run check`. Commit, tag `phase-2-done`, push.

**Acceptance**
- `npm run check` and `npx supabase test db` both pass
- `docs/phase-2-test-log.md` has a result for every case ID; no open failures
- Tag `phase-2-done` is pushed

**STOP.** Phase 2 is complete once this passes.

---

## 6. SQL reference

> Starting point, not gospel. Keep every rule; adjust names to your conventions. Put it in migration files. Depending on your project's defaults, new tables may be open to the API roles, so **always revoke first and grant explicitly.**

### 6.1 Profiles table, triggers, privileges, RLS

```sql
create table public.profiles (
  id            uuid primary key,   -- same value as auth.users.id. No foreign key on purpose:
                                    -- on account deletion the login is removed but this row is
                                    -- kept as an anonymized "Deleted user" so other members'
                                    -- ledgers stay intact (decision D2).
  name          text not null,
  avatar_url    text,               -- set only by the sign-up trigger (Google photo)
  avatar_path   text,               -- set by the app: '<uid>/<uuid>.jpg|png|webp'
  upi_id        text,
  onboarded_at  timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint profiles_name_len check (char_length(name) between 1 and 50),
  constraint profiles_upi_format check (
    upi_id is null or upi_id ~ '^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,63}$'
  ),
  constraint profiles_avatar_path_format check (
    avatar_path is null
    or avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')
  ),
  constraint profiles_avatar_url_host check (
    avatar_url is null or avatar_url ~ '^https://lh3\.googleusercontent\.com/'
  )
);

-- Normalize before the CHECK constraints run
create or replace function public.profiles_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name       := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.upi_id     := nullif(lower(btrim(new.upi_id)), '');
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_before_write
  before insert or update on public.profiles
  for each row execute function public.profiles_before_write();

-- RLS and privileges
alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (name, avatar_path, upi_id, onboarded_at) on public.profiles to authenticated;
-- No INSERT or DELETE grant: rows are created by the trigger / ensure_my_profile()
-- and removed (anonymized) by delete_my_account().

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
```

### 6.2 Auto-create the profile on sign-up

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta_name text := nullif(btrim(coalesce(
                        new.raw_user_meta_data ->> 'full_name',
                        new.raw_user_meta_data ->> 'name', '')), '');
  v_avatar    text := nullif(coalesce(
                        new.raw_user_meta_data ->> 'avatar_url',
                        new.raw_user_meta_data ->> 'picture', ''), '');
  v_name      text;
begin
  v_name := left(coalesce(
              v_meta_name,
              nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
              'User'), 50);

  -- Accept a photo only from Google's photo host (sign-up metadata can be user-supplied).
  -- Verify the exact host Google returns during testing and adjust the pattern if needed.
  if v_avatar is not null and v_avatar !~ '^https://lh3\.googleusercontent\.com/' then
    v_avatar := null;
  end if;

  insert into public.profiles (id, name, avatar_url, onboarded_at)
  values (new.id, v_name, v_avatar,
          case when v_meta_name is not null then now() else null end)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
```

> Keep this trigger **small and safe**. If it raises an error, sign-up itself fails. That is why `ensure_my_profile()` exists as a backup.

### 6.3 RPC functions

```sql
create or replace function public.ensure_my_profile()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.profiles;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  insert into public.profiles (id, name)
  select u.id,
         left(coalesce(nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'User'), 50)
  from auth.users u
  where u.id = v_uid
  on conflict (id) do nothing;

  select * into v_row from public.profiles where id = v_uid;
  return v_row;
end;
$$;

create or replace function public.account_deletion_blockers()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- STUB - replaced in Phase 3.4 for sole_admin_groups and Phase 5 for unsettled_groups.
  -- Phase 5 unsettled definition: net balance != 0 in the group OR user has pending/disputed settlement.
  return jsonb_build_object(
    'sole_admin_groups', '[]'::jsonb,
    'unsettled_groups', '[]'::jsonb
  );
end;
$$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_blockers jsonb;
begin
  -- 1. auth check
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- 2. blocker checks
  v_blockers := public.account_deletion_blockers();

  if jsonb_array_length(v_blockers->'sole_admin_groups') > 0 then
    raise exception 'sole_admin' using errcode = 'P0001';
  end if;

  if jsonb_array_length(v_blockers->'unsettled_groups') > 0 then
    raise exception 'unsettled_balances' using errcode = 'P0001';
  end if;

  -- 3. PHASE 3 HOOK: leave all groups / delete groups where user is the only member

  -- 4. SMART DELETE of the profile row:
  -- If nothing references the profile, hard delete the row.
  -- If other tables reference it (foreign key), keep the row but anonymize it.
  begin
    delete from public.profiles where id = v_uid;
  exception
    when foreign_key_violation then
      update public.profiles
         set name = 'Deleted user',
             avatar_path = null,
             avatar_url = null,
             upi_id = null,
             deleted_at = now()
       where id = v_uid;
  end;

  -- 5. delete auth user
  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.ensure_my_profile()          from public, anon;
revoke execute on function public.account_deletion_blockers()  from public, anon;
revoke execute on function public.delete_my_account()          from public, anon;

grant  execute on function public.ensure_my_profile()          to authenticated;
grant  execute on function public.account_deletion_blockers()  to authenticated;
grant  execute on function public.delete_my_account()          to authenticated;
```

### 6.4 Avatar storage

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Public bucket: anyone with the (random, unguessable) file URL can view the image.
-- Do NOT add a SELECT policy, so nobody can list the files.

create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_update_own on storage.objects
  for update to authenticated
  using      (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
```

---

## 7. Notes on choices (so they are not re-debated mid-build)

- **No FK from `profiles` to `auth.users`:** deliberate, so deleting the login does not cascade-delete the profile row that other tables will point to (D2).
- **Email is not in `profiles`:** keeps it private from group members.
- **`avatar_path` and `avatar_url` are separate:** the app can only write the strictly validated storage path; the Google photo URL is written only by the trigger. This stops anyone from pointing their avatar at an external tracking URL that co-members would load.
- **Public avatar bucket with random file names:** simple and fast. If you later want fully private avatars, switch to signed URLs (a Phase 8 option).
- **`AsyncStorage` for the session in v1:** accepted for now; upgrade in Phase 8 (G13).
- **Local-scope logout:** logging out on one phone must not log out the user's other phones.

---

## 8. Group role cases (tracked for Phase 3, NOT built now)

Listed here so nothing is forgotten. They become the "Roles and Permissions" part of the Phase 3 spec and PRD.

| ID | Case | Proposed rule |
|----|------|---------------|
| R1 | Who is admin initially | The group creator |
| R2 | More than one admin | Allowed |
| R3 | Promote a member to admin | Any admin can |
| R4 | Demote an admin to member | Any admin can, but **never the last admin** |
| R5 | Last admin wants to leave | Blocked until another admin is assigned (offer "Make [name] admin"); if they are the only member, leaving means deleting the group |
| R6 | Admin removes a member who has an unsettled balance | Blocked until their balance is settled (offer "Settle first") |
| R7 | Member leaves the group | Allowed only when their balance is zero |
| R8 | Who can add expenses | Every member |
| R9 | Who can edit or delete an expense | The creator, or any admin |
| R10 | Who can create or revoke invite links | Admins only in v1 (setting for "all members" can come later) |
| R11 | Who can rename the group | Admins |
| R12 | Who can delete the group | Admins; extra warning because it deletes the history for everyone; blocked or warned if balances are unsettled |
| R13 | A removed member | Loses access to the group; their past expenses remain in history |
| R14 | Removed member rejoins | Needs a fresh invite |
| R15 | Opening an invite while already a member | Just opens the group |
| R16 | Expired, revoked or invalid invite | Clear, specific message for each |
| R17 | Group size limit | Choose a sensible cap (for example 50 members) |
| R18 | Admin deletes their own account | Case F7 applies |
| R19 | Who confirms a UPI settlement | Only the receiver; disputes are shown to both parties |
| R20 | Members without the app | Decision D3 |

---

## 9. Phase 2 Definition of Done

- [ ] 2.1 to 2.8 completed, tested on a real phone, and confirmed one by one
- [ ] Google Sign-In and email code both work end to end, including linking (A10)
- [ ] Every case ID in Section 4 has a pass result in `docs/phase-2-test-log.md`
- [ ] `profiles` locked down: column-level update, RLS, constraints, no client insert or delete
- [ ] Avatar upload, replace and remove work; foreign paths are rejected
- [ ] Logout and account deletion work; the deleted user is anonymized, not erased from the ledger
- [ ] No `service_role` key and no personal data in logs or git
- [ ] `npm run check` and `npx supabase test db` pass
- [ ] Docs updated; tagged `phase-2-done`
- [ ] Open decisions D1 to D4 have recorded answers; D3 answered before Phase 3 starts

---

## 10. Common problems and fixes

| Problem | Fix |
|---------|-----|
| Google Sign-In fails with a developer or configuration error | The SHA-1 or package name in the Android client ID is wrong, or the app is using the wrong Web client ID. Re-check 2.1 |
| Works in debug, fails in the release build or Play Store | The release or Play App Signing SHA-1 is missing from Google Cloud (see the Phase 9 reminder in 2.1) |
| Google Sign-In does nothing on the emulator | Use an emulator image **with Google Play** |
| No email code arrives | Check spam, the SMTP provider's logs, and the Supabase rate limit; the default sender is not for real use (D4) |
| Email contains a link instead of a code | The template is missing `{{ .Token }}` |
| Signed out right after sign-in, or navigation flickers | An `await` of another Supabase call inside `onAuthStateChange`, or non-idempotent handlers (2.3) |
| `permission denied for table profiles` | The grants in Section 6.1 are missing or the column list is wrong |
| New user has no profile | Trigger error. Check the Supabase Postgres logs; `ensure_my_profile()` should cover it |
| Avatar upload returns "new row violates row-level security" | The file path must start with the user id folder: `<uid>/<uuid>.jpg` |
| Old avatar still shows | Reuse of the same file name. Always use a new random name |
| Deleting the account fails | See task 3 in 2.7 about deleting from `auth.users` and the Edge Function fallback |
| Deleted user can still "sign in" with an old token | Normal until the token expires; always sign out locally right after deletion |

---

## 11. Starter prompt for Claude Code

```
You are continuing SplitEase (React Native + Expo, TypeScript, Supabase). Phase 1 is done and tagged phase-1-done.

Read these first and follow them strictly:
- docs/prd.md
- docs/phase-2.md (the current phase, including the Case Matrix)
- CLAUDE.md

Rules:
1. Work ONLY on sub-phase 2.1 right now. Do not start 2.2 or anything else.
2. 2.1 is mostly configuration outside the code (Supabase dashboard, Google Cloud, SMTP). Guide me step by step, tell me exactly what to click and what values to copy, and tell me when you need me to do something myself. Do not invent IDs or secrets.
3. STOP when 2.1 is done and tell me: what was configured, what I should verify, and the exact test steps.
4. Keep every change small. The app must still build and run after each step.
5. Never use or ask for the Supabase service_role key. Never commit .env or any secret.
6. Never log emails, tokens or UPI IDs.
7. Money logic and group data rules from the PRD still apply (server is the source of truth, no direct writes to money/group tables).
8. Do not add libraries or services that the current sub-phase does not list.
9. Every sub-phase must satisfy the case IDs it lists in docs/phase-2.md. If a case cannot be met, tell me instead of working around it.

Start with 2.1 now.
```

After 2.1 is confirmed, say "continue with 2.2", and so on.
