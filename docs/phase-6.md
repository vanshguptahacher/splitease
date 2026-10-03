# SplitEase — Phase 6: UPI Payments

**Depends on:** `prd.md` (v1.1) and finished Phases 1 to 5 (`phase-5-done` tag)
**Goal:** Settling up with one tap through the user's own UPI app. The payer taps **Pay via UPI**, the UPI app opens with the receiver, amount and note already filled, and when the payer comes back SplitEase asks "Did the payment go through?". The receiver still confirms. SplitEase **never touches money** and **never assumes a payment succeeded**.
**Rule:** Work **one sub-phase at a time. STOP after each sub-phase**, test (on **real phones with real UPI apps**), and confirm before moving on.

> **UX stance:** the whole point of this phase is that paying a friend is faster than opening a UPI app and typing their ID. Tap **Pay via UPI** → pay in your UPI app → come back → tap **Yes, I paid**. If anything goes wrong (no UPI app, no UPI ID, the UPI app refuses), the user always has a clear fallback and is never stuck.

---

## 0. Scope

### In scope
- The `upi` payment method on top of the Phase 5 settlement lifecycle (create, confirm, dispute, cancel, undo all stay exactly as they are)
- UPI deep-link builder (pure, tested), eligibility rules, Android package-visibility setup, launcher
- The "Did the payment go through?" return flow, including app-killed and "Not now" cases
- Optional UPI transaction reference (for the receiver to check), with a duplicate guard
- Settle-up sheet upgrade: UPI chip, copy UPI ID, "Ask to add UPI ID", fallbacks
- Gentle nudge for people who have no UPI ID yet
- SQL tests, unit tests, and a real-device test plan

### Out of scope (later)
- Notifications and the "Remind" button (Phase 7)
- UPI QR codes, "request money" (collect requests), merchant-style payments, in-app payment status checking (v2, and mostly not possible for personal payments)
- Multi-currency (Phase 7). UPI works only in INR
- Cloudflare Workers or any extra backend

---

## 1. Decisions to confirm before 6.1

| # | Decision | Recommendation (assumed if you don't change it) |
|---|----------|------------------------------------------------|
| D37 | Order of steps | **Open the UPI app first, record afterwards** ("Did the payment go through?"). Recording first would leave junk "pending" payments whenever the UPI payment fails |
| D38 | Default method | **UPI** when the receiver has a UPI ID and the amount is at least ₹1; otherwise Cash. The app remembers the last method used |
| D39 | UPI reference | **Optional** for the payer (never required). The receiver sees it and can copy it |
| D40 | Duplicate reference guard | A reference can be used **once per group** by an active (pending, confirmed or disputed) payment |
| D41 | Large amounts | **Warn** above **₹1,00,000** ("many banks limit UPI payments; if it fails, pay in parts"). Never block |
| D42 | Minimum for UPI | **₹1.** Below that, the UPI chip is disabled and the user is offered Cash or Other |
| D43 | Unfinished UPI attempts | **One active attempt per user**, kept for **24 hours**, then dropped silently |
| D44 | Not in v1 | QR codes, editing the payee's UPI ID, auto-confirming a payment because the UPI app "returned", merchant parameters (`mc`, `tr`, `url`) |
| D45 | When UPI cannot be used | Always offer: **Copy UPI ID and amount**, and **I already paid** (records the payment without opening a UPI app) |
| D46 | Asking a friend for their UPI ID | Via the **system share sheet** with a ready message (no backend needed) |
| D47 | Nudge | If you are owed money and have no UPI ID, show a one-time, dismissible nudge on the Balances tab |

---

## 2. UX rules for this phase

1. **One tap to the UPI app**, with receiver, amount and note pre-filled. The user only enters their PIN in their own UPI app.
2. **Say what will happen**, in words: "Opens your UPI app to pay Priya ₹300. Come back here after you pay."
3. **Coming back is automatic:** the app asks "Did the payment go through?" with **Yes, I paid ₹300**, **I paid a different amount** and **No**.
4. **Never assume.** UPI apps do not tell SplitEase if a payment worked. A payment is only "settled" after the receiver confirms (Phase 5 rules).
5. **Never a dead end:** no UPI ID, no UPI app, UPI app refuses, UPI app fails: each has a clear message and a next step.
6. **Show the receiver's UPI ID** with a Copy button, so the user can always pay manually.
7. **Warn, don't block,** for large amounts. **Block** only what cannot work (below ₹1, no UPI ID).
8. **Optional means optional:** the UPI reference field is never required and is collapsed by default.
9. **Receiver view:** "Rahul says he paid you ₹300 via UPI" with the reference (if any) and a hint "Check your UPI app for ₹300 from Rahul", then Confirm or "I didn't receive this".
10. Same components as before: bottom sheets, snackbars with Undo, the amount keypad, Indian ₹ formatting, skeleton and error states.

---

## 3. How it works

```
Balances tab: "You owe Priya ₹300"  [Settle up]
        │
        ▼
Settle-up sheet  (chips: UPI · Cash · Other)
        │  UPI chosen, Priya has a UPI ID
        ▼
[Pay ₹300 via UPI]  ──►  save "attempt" on the phone  ──►  open UPI app (upi://pay?...)
                                                                  │  user pays in the UPI app
        ┌─────────────────────────────────────────────────────────┘
        ▼   (user comes back, or the app is reopened later)
"Did the payment go through?"
   ├─ Yes, I paid ₹300 ──► create_settlement(method 'upi', status pending) ──► receiver confirms (Phase 5)
   ├─ I paid a different amount ──► edit amount ──► same as Yes
   └─ No ──► forget the attempt, nothing is recorded
```

**What is stored on the phone (per user, cleared on sign-out):** one attempt `{ id, groupId, receiverId, amountMinor, launchedAt, state }`. **No UPI ID and no link are stored.** The UPI ID is fetched fresh when needed.

**What the server stores:** the normal settlement (method `upi`, status `pending`) and the optional reference. Nothing else about UPI.

### Invariants (must always hold)
1. A UPI payment is just a Phase 5 settlement with method `upi`. **Every Phase 5 rule still applies** (who can confirm, dispute, cancel, undo; balances only change when confirmed).
2. The app **never** confirms a payment because the UPI app returned.
3. A transaction reference only exists on `upi` payments, has a valid format, and is **unique per group among active payments**.
4. The payee UPI ID used to build the link is the **receiver's current UPI ID**, read fresh from the server, and is never typed or edited by the payer.
5. UPI IDs, references and the `upi://` link are **never logged**.
6. Only **active members of a shared group** can ever see a person's UPI ID (Phase 2 and 3 rules, unchanged).

---

## 4. The UPI link

```
upi://pay?pa=<payee UPI ID>&pn=<payee name>&am=<amount>&cu=INR&tn=<note>
```

| Part | Rule |
|------|------|
| `pa` | Receiver's UPI ID, trimmed and lower-cased, must pass the Phase 2 format check. The `@` is kept **literal** (not `%40`); everything else is URL-encoded |
| `pn` | Receiver's name, cleaned (see below), at most 40 characters; if nothing is left, use `Payee` |
| `am` | The amount with **exactly 2 decimals** built from integer paise by string logic (30000 → `300.00`, 1 → `0.01`). No floating-point math |
| `cu` | Always `INR` |
| `tn` | `"SplitEase " + group name`, cleaned, at most 40 characters in total; if the group name is empty after cleaning, `SplitEase payment` |
| order | Always `pa`, `pn`, `am`, `cu`, `tn` (deterministic) |

**Cleaning rule for names and notes:** keep only letters A to Z, digits, space, dot, comma, hyphen and underscore. Replace everything else (emojis, Hindi/other scripts, `& = # % ? + /` and so on) with a space, collapse repeated spaces, trim. This keeps the link valid and prevents any parameter injection. (Names in non-Latin scripts become plain `Payee` or `SplitEase payment`; that is fine because the UPI app shows the real name from the UPI ID.)

### Shared test vectors (Jest, from `tests/fixtures/upi-vectors.json`)

| # | Input (UPI ID, name, amount in paise, group name) | Expected result |
|---|---------------------------------------------------|-----------------|
| 1 | `priya@okaxis`, Priya Sharma, 30000, Goa Trip | `upi://pay?pa=priya@okaxis&pn=Priya%20Sharma&am=300.00&cu=INR&tn=SplitEase%20Goa%20Trip` |
| 2 | `priya@okaxis`, Priya, 1, Goa Trip | `am=0.01` |
| 3 | `priya@okaxis`, Priya, 3334, Goa Trip | `am=33.34` |
| 4 | `priya@okaxis`, Priya, 1000000000, Goa Trip | `am=10000000.00` |
| 5 | ` Priya@OkAxis `, Priya, 10000, Goa Trip | `pa=priya@okaxis` |
| 6 | `priya@okaxis`, Priya, 10000, `Goa 🌴 Trip!!` | `tn=SplitEase%20Goa%20Trip` |
| 7 | `priya@okaxis`, Priya, 10000, `गोवा ट्रिप` | `tn=SplitEase%20payment` |
| 8 | `priya@okaxis`, Priya, 10000, `A&B=C #1 100%` | `tn=SplitEase%20A%20B%20C%201%20100` (no raw `&`, `=`, `#`, `%` inside any value) |
| 9 | `priya@okaxis`, Priya, 10000, a 60-character group name | `tn` is at most 40 characters before encoding, no trailing space |
| 10 | `priya@okaxis`, `😀`, 10000, Goa Trip | `pn=Payee` |
| 11 | `priya`, Priya, 10000, Goa Trip | **error** `invalid_vpa` |
| 12 | `pri+ya@okaxis`, Priya, 10000, Goa Trip | **error** `invalid_vpa` |
| 13 | `priya@okaxis`, Priya, 0, Goa Trip | **error** `invalid_amount` |
| 14 | `priya@okaxis`, Priya, 1000000001, Goa Trip | **error** `invalid_amount` |

Every successful vector must also satisfy: the URL starts with `upi://pay?`, contains exactly the five parameters in the fixed order, and is under 500 characters.

### Eligibility rules (pure function `upiEligibility`)

| Condition | Result |
|-----------|--------|
| Receiver has no UPI ID | Not eligible: reason `no_vpa` |
| Amount below ₹1 (100 paise) | Not eligible: reason `below_minimum` |
| Amount above ₹1,00,000 (10,000,000 paise) | Eligible, with warning `large_amount` |
| Otherwise | Eligible |

---

## 5. Error codes and messages

**Server errors (new or changed):**

| Code | What the user sees |
|------|--------------------|
| `invalid_txn_ref` | "A UPI reference has 6 to 35 letters or numbers." |
| `duplicate_txn_ref` | "This UPI reference was already used for another payment in this group." |
| `invalid_method` *(changed)* | "Choose how the payment was made." (now `upi`, `cash`, `other` are valid) |

All Phase 5 codes (`duplicate_pending`, `too_many_pending`, `payer_not_member`, `receiver_not_member`, `invalid_amount`, `invalid_transition`, and so on) still apply.

**App-side messages (no server code):**

| Situation | What the user sees |
|-----------|--------------------|
| Receiver has no UPI ID | "[Name] hasn't added a UPI ID yet." with **Ask [Name] to add it** and the other methods available |
| No UPI app found | "No UPI app found on this phone." with **Copy UPI ID**, **Copy amount** and **I already paid** |
| Opening the UPI app failed | "Couldn't open your UPI app. You can copy the UPI ID and pay manually." |
| Amount below ₹1 | "UPI payments start at ₹1. Choose Cash or Other for smaller amounts." |
| Amount above ₹1,00,000 | "Many banks limit UPI payments. If this fails, try paying in parts." |
| Return prompt | "Did the payment go through?" |

---

## 6. Case Matrix (every case that must be handled)

> Each sub-phase lists the case IDs it must satisfy. At the end of Phase 6, walk through the whole matrix with **at least 3 test accounts**, **2 different UPI apps** on real phones, and a **release build** of the app. Use **₹1 payments between UPI IDs you control**. Never test with other people's money.

### UL. Link building (pure function)

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| UL1 | Amount formatting | 30000 → `300.00`, 1 → `0.01`, 100 → `1.00`, 123456789 → `1234567.89`, 1000000000 → `10000000.00` |
| UL2 | UPI ID with spaces or capitals | Trimmed and lower-cased; `@` stays literal |
| UL3 | Name cleaning | Emojis, other scripts and symbols removed; spaces collapsed; at most 40 characters; fallback `Payee` |
| UL4 | Note cleaning | `SplitEase <group>`, cleaned, at most 40 characters; fallback `SplitEase payment` |
| UL5 | Emoji or Hindi in the group name | Replaced; the link stays valid |
| UL6 | Currency | Always `INR` |
| UL7 | Parameter order | Always `pa`, `pn`, `am`, `cu`, `tn` |
| UL8 | Invalid UPI ID | The builder throws `invalid_vpa` (the UI never calls it in that case) |
| UL9 | Amount of 0, negative or above the maximum | The builder throws `invalid_amount` |
| UL10 | Floating point | None anywhere (string logic only) |
| UL11 | Length | Under 500 characters |
| UL12 | Injection | A note or name containing `& = # % ? + /` can never add, change or break a parameter |
| UL13 | All 14 shared vectors | Exact expected output |

### UA. Availability and launching

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| UA1 | Receiver has a UPI ID and a UPI app is installed | The UPI app opens with receiver, amount and note pre-filled |
| UA2 | Receiver has no UPI ID | UPI chip disabled with the message; **Ask [Name] to add it** (share sheet); Cash and Other available |
| UA3 | No UPI app installed | "No UPI app found" with Copy UPI ID, Copy amount and **I already paid** |
| UA4 | Several UPI apps installed | The system chooser appears |
| UA5 | Opening throws an error | Friendly message; nothing is recorded; the sheet stays open |
| UA6 | Receiver changed their UPI ID while the sheet was open | The app refetches the members when the sheet opens **and again right before launching**; the newest ID is used |
| UA7 | Receiver deleted their account | No UPI ID, so UA2 |
| UA8 | Amount below ₹1 | UPI disabled with the message (D42) |
| UA9 | Amount above ₹1,00,000 | Warning only (D41) |
| UA10 | Amount with paise (₹33.34) | `am=33.34` opens correctly |
| UA11 | Android 11 and above | The `upi` scheme is declared in the manifest through a config plugin; verified on a **release** build, not only the dev build |
| UA12 | Offline when tapping Pay | Allowed to open the UPI app; the attempt is saved; recording waits for internet (UR4) |
| UA13 | The UPI app declines or limits a deep-link payment to a personal UPI ID (behavior differs per app and bank) | The user returns and answers **No**, or uses Copy UPI ID and pays manually, then **I already paid**; nothing is lost |
| UA14 | The payment fails inside the UPI app | The user returns and answers **No**; nothing is recorded |
| UA15 | **I already paid** | Records a pending UPI payment without opening any UPI app (same sheet, same rules) |

### UR. Return and the "Did it go through?" flow

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| UR1 | The user comes back from the UPI app | The sheet "Did the payment go through?" appears (Yes / different amount / No) |
| UR2 | Yes | A pending `upi` payment is created and the receiver can confirm; message "Sent to Priya for confirmation." |
| UR3 | No | The attempt is discarded; nothing is recorded |
| UR4 | The app was killed while in the UPI app | On the next launch (within 24 hours) the prompt appears after sign-in and splash; older attempts are dropped silently |
| UR5 | "Not now" or the sheet was closed | A banner on that group's Balances tab ("Did you pay Priya ₹300?") with Yes / No, until answered or 24 hours pass |
| UR6 | Double tap on Yes | Exactly one payment (the attempt id is the `client_request_id`) |
| UR7 | Signed out or a different account signs in | The attempt is cleared (stored per user; cleared on sign-out) |
| UR8 | Group deleted, user removed, or receiver left meanwhile | The server error is shown kindly ("contact them directly"), the attempt is cleared |
| UR9 | A pending payment with the same payer, receiver and amount already exists | `duplicate_pending` message; the attempt is cleared |
| UR10 | Balances changed while the user was in the UPI app | The payment is recorded as entered; the Phase 5 "more than you owe" line applies |
| UR11 | The user starts a second UPI payment while an unfinished attempt exists | The app first asks "Did you pay Priya ₹300?" about the old one, then continues |
| UR12 | The user changed the amount inside the UPI app | **I paid a different amount** lets them enter the real amount before recording |
| UR13 | False triggers (permission dialogs, notification shade, quick app switch) | The prompt appears only after the app really went to the background and came back after launching |
| UR14 | No internet when answering Yes | The attempt stays; the user is told to retry when online; nothing is lost |
| UR15 | Receiver-side: "Mark as received" with the UPI chip | Recorded and confirmed at once, no deep link (Phase 5 rules) |

### UT. Transaction reference

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| UT1 | Optional reference field | Collapsed by default; accepts 6 to 35 letters, digits, dot, underscore, hyphen; trimmed; bad input shows an inline error |
| UT2 | Reference on a Cash or Other payment | Rejected by the server (`invalid_txn_ref`) |
| UT3 | Receiver's view | Shows the reference with a **Copy** button on the pending card, the detail view and the history detail |
| UT4 | Payer adds or edits the reference | Possible while the payment is `pending` or `disputed` (`set_settlement_txn_ref`); not after `confirmed` or `cancelled` |
| UT5 | The same reference used again in the same group | `duplicate_txn_ref` (also enforced by a unique index; cancelled payments free the reference) |
| UT6 | Non-members | Can never read a reference |
| UT7 | No reference | Perfectly fine |
| UT8 | Lower and upper case of the same reference | Treated as the same reference |
| UT9 | A disputed payment | The payer can add a reference as proof; the receiver can then confirm |

### US. Method selection and display

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| US1 | Method chips | UPI (when eligible), Cash, Other; UPI preselected when eligible (D38); otherwise the last used method, or Cash |
| US2 | Receiver marking as received | Chips UPI, Cash, Other (UPI here only labels how it arrived) |
| US3 | History rows | Show the method ("UPI", "Cash", "Other"); the reference appears in the detail |
| US4 | Existing Phase 5 payments | Unchanged |
| US5 | Changing the method after creation | Not possible |
| US6 | `upi` by the payer | Pending; by the receiver: confirmed at once (same as every method) |
| US7 | Phase 5 tests | Updated: `upi` is accepted; other values such as `card` are still rejected |
| US8 | Last used method | Remembered on the device per user; cleared on sign-out |

### UP. Profile and UPI ID

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| UP1 | Profile UPI ID field | Hint: "Friends use this to pay you in one tap." |
| UP2 | You are owed money and have no UPI ID | One-time dismissible nudge on the Balances tab: "Add your UPI ID so friends can pay you in one tap" with a button to the profile; remembered once dismissed |
| UP3 | Who can see a UPI ID | Only active members of a shared group (unchanged) |
| UP4 | Copy UPI ID | Copies exactly the stored lower-case ID; snackbar "Copied" |
| UP5 | Ask to add a UPI ID | Opens the system share sheet with a ready message ("Hey, please add your UPI ID in SplitEase so I can pay you ₹300"); no backend |
| UP6 | After the receiver adds their UPI ID | The sheet shows UPI as available the next time it is opened |

### UZ. Security and privacy

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| UZ1 | Link built from user text | Only from validated fields and cleaned text; never raw input |
| UZ2 | UPI IDs of non-members | Never exposed (unchanged `get_group_members` rules) |
| UZ3 | Server validation of the reference | Rejects references on non-UPI methods, bad characters, and wrong length |
| UZ4 | `set_settlement_txn_ref` | Payer only; only for `pending` or `disputed` UPI payments; non-members rejected; anonymous rejected |
| UZ5 | Duplicate reference | Blocked by a unique index, so a race cannot create two |
| UZ6 | What the phone stores for an attempt | Only ids, amount and times, per user; no UPI ID, no link |
| UZ7 | Logs and error reports | **Never** include UPI IDs, references or `upi://` links (check Sentry settings in Phase 8) |
| UZ8 | Payee UPI ID | The payer can never edit it; it always comes from the server |
| UZ9 | Encoding | A note with `& = # % ? +` is proven harmless by tests |
| UZ10 | Money rules | Unchanged: server is the authority; UPI success is never assumed; the receiver always confirms |
| UZ11 | Function hardening | Every new or changed function: `SECURITY DEFINER`, `search_path = ''`, execute revoked from `public` and `anon` |
| UZ12 | Direct table access | Still none (settlements stay RPC-only) |
| UZ13 | Old function version | The old 7-argument `create_settlement` is **dropped**, so no unvalidated overload remains callable |

### UD. Devices and environments

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| UD1 | At least 2 different UPI apps on real phones | Link opens and pre-fills in each (record which apps were tested) |
| UD2 | Release build | Everything works in a **release** APK (package visibility and deep link) |
| UD3 | Emulator or phone without a UPI app | UA3 path works |
| UD4 | Largest font, dark mode, 360dp width | Everything usable |
| UD5 | Android back from the UPI app | Returns to SplitEase and shows the prompt (UR1) |
| UD6 | Screen reader | Chips, buttons and amounts have clear labels |
| UD7 | Android 8 up to the latest version available to you | Works; Android 11 and above verified for package visibility |
| UD8 | Low memory (app killed in the background) | Attempt restored (UR4) |
| UD9 | Orientation | Locked to portrait |

---

## 7. Sub-phases

---

### 6.1 — Server: the `upi` method, reference, and duplicate guard

**Goal:** The server accepts UPI payments safely. (Cases: UT2, UT4 to UT9, UZ3 to UZ5, UZ11, UZ13, US6, US7.)

**Tasks**
1. Confirm decisions D37 to D47 (or note your changes).
2. Migration `settlements_upi`:
   - add the check `settlements_txn_ref_format`: `upi_txn_ref is null or (method = 'upi' and upi_txn_ref ~ '^[A-Za-z0-9._-]{6,35}$')`
   - add the **partial unique index** on `(group_id, upper(upi_txn_ref))` where `upi_txn_ref is not null` and status in `pending`, `confirmed`, `disputed` (SQL in Section 8.1)
3. **Drop the old 7-argument `create_settlement`** and create the new version with an extra last parameter `p_upi_txn_ref text default null`. The method check now accepts `upi`, `cash`, `other`. Validation of the reference and the two kinds of duplicate (Section 8.2). Dropping the old version matters: two overloads with different argument lists make the API call ambiguous and leave an old, less strict version callable.
4. New RPC `set_settlement_txn_ref(p_settlement, p_ref)` (Section 8.3): payer only, method `upi`, status `pending` or `disputed`, same format and duplicate rules, idempotent when the value is unchanged.
5. `list_settlements` also returns `upi_txn_ref` and the flag `can_edit_ref`. Hide `upi_txn_ref` from anyone who is not an active member (already true because of the membership check).
6. **Update the Phase 5 SQL tests:** the case that expected `invalid_method` for `upi` now expects success; keep `invalid_method` for any other value (for example `card`).
7. New SQL tests: valid and invalid references; reference on a cash or other payment is rejected; the same reference in the same group twice is rejected (also in different letter case); the same reference in a different group is allowed; a cancelled payment frees its reference; `set_settlement_txn_ref` permission and status table (payer, receiver, outsider, anonymous; pending, disputed, confirmed, cancelled); a race of two creations with the same reference gives exactly one success (record the result); the old 7-argument function no longer exists.

**Acceptance**
- `npx supabase test db` passes, including the updated Phase 5 tests
- `select proname, pronargs from pg_proc where proname = 'create_settlement'` shows exactly **one** row

**STOP.** Report the migration, test output, and the race result.

---

### 6.2 — UPI link builder, cleaning, eligibility (pure code)

**Goal:** The link is always valid and safe, proven by shared vectors. (Cases: UL1 to UL13.)

**Tasks**
1. `tests/fixtures/upi-vectors.json` with the 14 vectors from Section 4.
2. `lib/upi/clean.ts`: `cleanText(input, maxLength)` implementing the cleaning rule.
3. `lib/upi/amount.ts`: `formatUpiAmount(amountMinor)` using **integer and string logic only** (`Math.floor(m / 100)` and `m % 100` padded to 2 digits). Throws `invalid_amount` for values below 1 or above 1,000,000,000.
4. `lib/upi/buildLink.ts`: `buildUpiLink({ vpa, payeeName, amountMinor, groupName })` following Section 4: validate the UPI ID with the **same regex as the database** (Phase 2), encode with `encodeURIComponent` and then put the `@` of `pa` back, fixed parameter order. Throws `invalid_vpa` or `invalid_amount`.
5. `lib/upi/eligibility.ts`: `upiEligibility({ amountMinor, payeeVpa })` per Section 4 returning `{ eligible, reasons, warnings }`.
6. Jest tests: all 14 vectors; amount formatting table (UL1); injection tests (UL12) with `& = # % ? + /` in names and notes, asserting that the output has exactly five parameters; length (UL11); eligibility table; **no use of floating-point** (a test that formats 100 random amounts and compares them with a string-based reference).

**Acceptance**
- `npm run check` passes; every vector matches exactly
- Changing any expected value in the JSON fixture breaks a test (prove it once, then revert)

**STOP.** Report the files and test output.

---

### 6.3 — Android setup and the launcher

**Goal:** The UPI link can really be opened on Android 11 and above, in a release build. (Cases: UA1, UA3 to UA5, UA11, UD1 to UD3, UD7.)

**Tasks**
1. **Package visibility.** Android 11 and above hide other apps unless the manifest declares what you want to open. Because `android/` is regenerated by `expo prebuild`, do it with a small config plugin (check the current Expo config-plugin docs if an import path has changed):
```js
// plugins/withUpiQueries.js
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withUpiQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.queries = manifest.queries ?? [];
    const exists = manifest.queries.some((q) =>
      (q.intent ?? []).some((i) =>
        (i.data ?? []).some((d) => d.$['android:scheme'] === 'upi')));
    if (!exists) {
      manifest.queries.push({
        intent: [{
          action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
          data: [{ $: { 'android:scheme': 'upi' } }],
        }],
      });
    }
    return cfg;
  });
};
```
   Add `"./plugins/withUpiQueries"` to `plugins` in `app.json`, run `npx expo prebuild --platform android --clean`, and confirm the generated `AndroidManifest.xml` contains a `<queries>` block with the `upi` scheme.
2. `lib/upi/launch.ts`: `launchUpi(url)` returns `'opened' | 'no_app' | 'failed'` (uses `Linking.canOpenURL`, then `Linking.openURL`, with try/catch). Never logs the URL.
3. Install clipboard support: `npx expo install expo-clipboard`. `lib/upi/copy.ts` with `copyText(text)`.
4. A **dev-only test screen** (hidden in release) that lets you type a UPI ID, name, amount and group name, shows the built link (in the screen only, never in logs), and has an **Open UPI app** button and the results of `launchUpi`.
5. **Real-device test with ₹1:** on a phone with a UPI app, pay ₹1 from your account to a UPI ID you control. Repeat with a second UPI app if you can. Record which apps opened with the data pre-filled and what each one did.
6. **Release test:** build a release APK (`cd android && ./gradlew assembleRelease`), install it, and repeat. If `canOpenURL` returns false on a phone that has a UPI app, the `<queries>` entry is missing from the release build.
7. Test on a phone or emulator **without** a UPI app: the result must be `no_app`.

**Acceptance**
- The UPI app opens with receiver, amount and note pre-filled on at least one real phone, in **both** the dev build and the release APK
- The no-app path returns `no_app`
- The generated manifest contains the `upi` query

**STOP.** Report the apps tested, what each showed, and the manifest snippet.

---

### 6.4 — The attempt store and return handling

**Goal:** The app remembers an unfinished UPI payment safely and notices when the user comes back. (Cases: UR1, UR4 to UR7, UR11, UR13, UR14, UZ6, UD5, UD8.)

**Tasks**
1. `lib/upi/attempt.ts`, stored in `AsyncStorage` under a **per-user key** `upiAttempt:<userId>`:
   - fields: `id` (a uuid, later used as `client_request_id`), `groupId`, `receiverId`, `amountMinor`, `launchedAt`, `state` (`launched`, `prompted`, `dismissed`), `wentToBackground` (boolean)
   - **one active attempt per user**; starting a new one first requires the old one to be answered (UR11)
   - expires after **24 hours** and is dropped silently (D43)
   - `clearAttempt()` is called by the Phase 2 `signOutAndReset()` (UR7)
2. `useUpiReturn()` hook:
   - listens to `AppState`; marks `wentToBackground` when the app leaves the foreground after launching; when it becomes active again **after** that, and the attempt is `launched`, it asks for the prompt (UR1, UR13)
   - on a cold start, after the auth state and splash are ready, a stored `launched` or `dismissed` attempt younger than 24 hours triggers the prompt or the banner (UR4)
   - exposes `attempt`, `markPrompted()`, `dismiss()` (becomes a banner, UR5), `answerNo()`, `answerYes(...)`
3. Unit tests (no UI): create, restore, expire at exactly 24 hours, replace rules, clear on sign-out, state transitions, and that **no UPI ID or link is ever stored**.
4. A logging check: nothing in this module logs attempt contents.

**Acceptance**
- Unit tests pass
- On a real phone: start an attempt, switch to another app, come back: `useUpiReturn` reports "prompt now". Kill the app from recents and reopen: the attempt is restored

**STOP.** Report the module, tests and the manual results.

---

### 6.5 — Settle-up sheet: UPI chip and fallbacks

**Goal:** The payer can start a UPI payment in one tap, and every failure has a clear path. (Cases: UA1 to UA10, UA13, UA15, UP4 to UP6, US1, US2, US8, UD4, UD6.)

**Tasks**
1. Extend the Phase 5 settle-up sheet with method chips **UPI**, **Cash**, **Other**:
   - default per D38; the last used method is remembered per user (US8)
   - when opened, **refetch the group members** to get the receiver's current UPI ID; refetch **again right before launching** (UA6)
2. **UPI chip, eligible:** show "Priya's UPI ID: priya@okaxis" with **Copy** (UP4), and the primary button **Pay ₹300 via UPI**. Under it: "Opens your UPI app. Come back here after you pay." A secondary text button **I already paid** records the payment without opening a UPI app (UA15).
   - tapping the primary button: save the attempt (6.4), build the link (6.2), call `launchUpi` (6.3).
3. **Not eligible:**
   - no UPI ID: chip disabled with "[Name] hasn't added a UPI ID yet." and **Ask [Name] to add it** that opens the share sheet with the ready message (UA2, UP5)
   - below ₹1: chip disabled with the message (UA8)
   - above ₹1,00,000: eligible, with the warning line (UA9)
4. **No UPI app or launch failure:** show the messages from Section 5 with **Copy UPI ID**, **Copy amount** and **I already paid** (UA3, UA5, UA13).
5. **Receiver flow:** the "Mark as received" sheet gets the same chips; UPI here is only a label (UR15, US2). No deep link is ever built in this flow.
6. The amount keypad, preview sentences and Phase 5 overpayment and partial-payment lines keep working exactly as before.
7. Disabled and explained when offline for Cash and Other. For UPI, opening the UPI app is allowed offline (UA12); recording waits (6.6).

**Acceptance**
- UA cases tested on real phones with 3 accounts, including: a receiver without a UPI ID, a phone without a UPI app, an amount of ₹0.50, an amount of ₹1,50,000, a receiver who changes their UPI ID while the sheet is open, and the Copy buttons
- `npm run check` passes

**STOP.** Report results case by case.

---

### 6.6 — Return flow UI, reference, receiver view

**Goal:** The "Did it go through?" moment, and the receiver's side of a UPI payment. (Cases: UR1 to UR15, UT1, UT3, UT4, UT9, US3.)

**Tasks**
1. **"Did the payment go through?" sheet** (shown by `useUpiReturn`):
   - big text "Did you pay Priya ₹300?" with three actions: **Yes, I paid ₹300**, **I paid a different amount** (opens the keypad, then the same Yes), **No, I didn't pay**
   - a collapsed field **UPI reference (optional)** with the format hint and inline validation (UT1)
   - **Yes** calls `create_settlement` with method `upi`, the attempt `id` as `client_request_id` (UR6), the amount, and the optional reference; then clears the attempt and shows "Sent to Priya for confirmation. You'll be settled once she confirms."
   - **No** clears the attempt (UR3)
   - closing the sheet marks the attempt `dismissed` (becomes a banner, UR5)
2. **Banner** on the group's Balances tab for a `dismissed` attempt: "Did you pay Priya ₹300?" with **Yes** and **No** (same actions).
3. **Errors:** map every code in Section 5 (and Phase 5): `duplicate_pending`, `payer_not_member`, `receiver_not_member`, `invalid_txn_ref`, `duplicate_txn_ref`. On errors that cannot succeed later (UR8, UR9) clear the attempt and say what to do next; on network errors keep it (UR14).
4. **Receiver's pending card:** "Rahul says he paid you ₹300 via UPI", the reference with **Copy** (UT3), the hint "Check your UPI app for ₹300 from Rahul", then **Confirm** and **I didn't receive this** (Phase 5 behavior, unchanged).
5. **Payer's pending and disputed cards:** show "Waiting for Priya to confirm ₹300" or "Priya says she didn't receive this", with **Add UPI reference** or **Edit reference** (calls `set_settlement_txn_ref`, UT4, UT9) and **Cancel** as before.
6. **History:** rows show the method ("UPI") and the detail shows the reference with Copy (US3).

**Acceptance**
- UR, UT and US3 cases tested end to end on real phones with ₹1 payments: pay and say Yes, pay and say No, different amount, kill the app while in the UPI app and reopen, close the sheet and answer from the banner, double tap on Yes, a duplicate reference in the same group, a reference on a disputed payment followed by confirmation by the receiver
- A UPI payment that the receiver never confirms stays pending and does not change balances

**STOP.** Report results case by case.

---

### 6.7 — Nudge, profile hints, polish

**Goal:** Make the receiver side easy and finish the details. (Cases: UP1 to UP3, UP6, US3, US4.)

**Tasks**
1. Profile screen: add the hint under the UPI field (UP1).
2. **Nudge** (UP2, D47): on the Balances tab, when the user is owed money and has no UPI ID, show a one-time, dismissible card with a button that opens the profile. Remember the dismissal per user on the device (cleared on sign-out).
3. After the receiver adds a UPI ID, make sure the payer's sheet shows UPI as available the next time (UP6).
4. Activity feed: settlement sentences mention "via UPI" when the method is `upi` (for example "Rahul paid Priya ₹300 via UPI · waiting for confirmation").
5. Check that Phase 5 payments (cash, other) look and behave exactly as before (US4).
6. Accessibility pass on all new sheets and buttons (UD6); dark mode, largest font and a 360dp screen (UD4).

**Acceptance**
- UP, US and UD4/UD6 cases tested

**STOP.** Report results case by case.

---

### 6.8 — Real-device testing, hardening, docs, tag

**Goal:** Prove it works on real phones, lock the docs, tag the phase. (Cases: UZ1 to UZ13, UD1 to UD9, and a full re-run of UL to UP.)

**Tasks**
1. **Security pass:**
   - search the code for logging or error reporting of UPI IDs, references or `upi://` links (must be none; note it for the Phase 8 Sentry configuration)
   - confirm the old 7-argument `create_settlement` does not exist and every new or changed function has `search_path = ''` and execute revoked from `public` and `anon`
   - confirm there is no direct table access to `settlements`
   - confirm the payee UPI ID can never be edited in the payment UI
   - search for `service_role` (must be nowhere)
2. Re-run all SQL tests, Jest tests (including the 14 UPI vectors and the Phase 4 split vectors) and `npm run check`.
3. **Real-device matrix:** at least **2 UPI apps** (for example Google Pay and PhonePe, plus BHIM or Paytm if you have them), at least **2 Android versions** (one with Android 11 or above), the **release APK**. For each: open with pre-filled data, pay ₹1, return, answer Yes, receiver confirms, balances update. Record the app, version and result in `docs/phase-6-test-log.md`, including any app that refused or limited a deep-link payment to a personal UPI ID, and how the fallback worked.
4. **Full manual walkthrough** of the Case Matrix (UL to UD) with 3 accounts. Record each case ID as pass, fail or note in `docs/phase-6-test-log.md`, including the race result from 6.1.
5. Re-run the Phase 5 cases that touch settlements (SC, ST, SB, BU) to prove nothing broke; update `docs/phase-5-test-log.md`.
6. Update `README.md` and `CLAUDE.md` (UPI rules: open first and record after, never assume success, receiver always confirms, never log UPI IDs or links, the config plugin, no QR in v1).
7. Update `docs/prd.md`: Phase 6 now says "UPI method and flow on top of the Phase 5 settlement lifecycle", and add the decisions D37 to D47.
8. **Privacy policy note for Phase 9:** the policy must say that UPI IDs are shown to members of the user's groups, and that optional transaction references are stored.
9. Copy `phase-6.md` into `/docs`. Run `npm run check` and `npx supabase test db`. Commit, tag `phase-6-done`, push.

**Acceptance**
- Both check commands pass
- `docs/phase-6-test-log.md` has a result for every case ID and the real-device matrix, with no open failures
- Tag `phase-6-done` is pushed

**STOP.** Phase 6 is complete once this passes.

---

## 8. SQL reference

> A starting point, not gospel. Keep every rule. Put it in migration files. Revoke first, grant explicitly.

### 8.1 Table changes

```sql
-- the reference may exist only on UPI payments and must look like a reference
alter table public.settlements
  add constraint settlements_txn_ref_format check (
    upi_txn_ref is null
    or (method = 'upi' and upi_txn_ref ~ '^[A-Za-z0-9._-]{6,35}$')
  );

-- one active payment per reference per group (case-insensitive); cancelled payments free it
create unique index settlements_unique_txn_ref
  on public.settlements (group_id, upper(upi_txn_ref))
  where upi_txn_ref is not null
    and status in ('pending', 'confirmed', 'disputed');
```

### 8.2 `create_settlement` (new version: differences from Phase 5)

```sql
-- IMPORTANT: remove the old 7-argument version first (otherwise the API call is ambiguous
-- and the old, less strict function stays callable)
drop function public.create_settlement(uuid, uuid, uuid, uuid, bigint, text, text);

create or replace function public.create_settlement(
  p_group uuid, p_client_request_id uuid, p_from_user uuid, p_to_user uuid,
  p_amount_minor bigint, p_method text, p_note text,
  p_upi_txn_ref text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  -- ... same variables as Phase 5 ...
  v_ref text := nullif(btrim(p_upi_txn_ref), '');
begin
  -- ... same steps as Phase 5 up to and including the amount check ...

  if p_method is null or p_method not in ('upi', 'cash', 'other') then      -- 'upi' is now valid
    raise exception 'invalid_method';
  end if;

  if v_ref is not null then
    if p_method <> 'upi' or v_ref !~ '^[A-Za-z0-9._-]{6,35}$' then
      raise exception 'invalid_txn_ref';
    end if;
  end if;

  -- ... same note, member, spam-guard and duplicate-pending checks as Phase 5 ...

  begin
    insert into public.settlements
      (group_id, from_user, to_user, amount_minor, method, note, upi_txn_ref, status,
       created_by, client_request_id, confirmed_at)
    values
      (p_group, p_from_user, p_to_user, p_amount_minor, p_method, v_note, v_ref, v_status,
       v_uid, p_client_request_id, case when v_status = 'confirmed' then now() end)
    returning id into v_id;
  exception when unique_violation then
    -- 1) a retry that raced: return the payment that won
    select s.id into v_existing from public.settlements s
     where s.created_by = v_uid and s.client_request_id = p_client_request_id;
    if found then return v_existing; end if;

    -- 2) the same reference is already used by an active payment in this group
    if v_ref is not null and exists (
         select 1 from public.settlements s
          where s.group_id = p_group and upper(s.upi_txn_ref) = upper(v_ref)
            and s.status in ('pending', 'confirmed', 'disputed')) then
      raise exception 'duplicate_txn_ref';
    end if;

    -- 3) otherwise it was the duplicate-pending index
    raise exception 'duplicate_pending';
  end;

  -- ... same activity entry as Phase 5, plus 'method' (already included) ...
  return v_id;
end;
$$;

revoke execute on function public.create_settlement(uuid, uuid, uuid, uuid, bigint, text, text, text)
  from public, anon;
grant execute on function public.create_settlement(uuid, uuid, uuid, uuid, bigint, text, text, text)
  to authenticated;
```

### 8.3 `set_settlement_txn_ref`

```sql
create or replace function public.set_settlement_txn_ref(p_settlement uuid, p_ref text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_group uuid;
  v_s     public.settlements;
  v_ref   text := nullif(btrim(p_ref), '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select s.group_id into v_group from public.settlements s where s.id = p_settlement;
  if not found then raise exception 'settlement_not_found'; end if;

  perform 1 from public.groups g where g.id = v_group for share;          -- 1) group, shared
  if not public.is_active_member(v_group) then raise exception 'not_a_member'; end if;

  select * into v_s from public.settlements s where s.id = p_settlement for update;   -- 2) settlement, exclusive
  if not found then raise exception 'settlement_not_found'; end if;

  if v_uid <> v_s.from_user then raise exception 'settlement_not_allowed'; end if;   -- payer only
  if v_s.method <> 'upi' then raise exception 'invalid_txn_ref'; end if;
  if v_s.status not in ('pending', 'disputed') then raise exception 'invalid_transition'; end if;

  if v_ref is not null and v_ref !~ '^[A-Za-z0-9._-]{6,35}$' then
    raise exception 'invalid_txn_ref';
  end if;

  if v_ref is not distinct from v_s.upi_txn_ref then return; end if;        -- unchanged: no-op

  begin
    update public.settlements
       set upi_txn_ref = v_ref, updated_at = now()
     where id = p_settlement;
  exception when unique_violation then
    raise exception 'duplicate_txn_ref';
  end;
end;
$$;

revoke execute on function public.set_settlement_txn_ref(uuid, text) from public, anon;
grant  execute on function public.set_settlement_txn_ref(uuid, text) to authenticated;
```

---

## 9. Notes on choices (so they are not re-debated mid-build)

- **Open UPI first, record after.** UPI apps cannot tell SplitEase if a payment worked. Recording first would create pending payments for failed attempts. Asking afterwards keeps the data clean, and the receiver still confirms.
- **The attempt lives on the phone, not the server.** It is only a reminder for one user. Nothing about it needs to be shared, and it contains no UPI ID.
- **The receiver always confirms.** Coming back from a UPI app proves nothing; the receiver's UPI app is the only real proof.
- **The reference is optional but guarded.** It helps the receiver check quickly; the unique index stops the same transaction from being claimed twice in a group.
- **The UPI ID is fetched fresh and never editable by the payer.** This removes the "pay to a different ID" trick and any stale-ID problems.
- **Text is cleaned to a safe character set.** Some UPI apps choke on emojis or unusual characters, and injection into the link is impossible when only safe characters remain.
- **No QR codes or collect requests in v1.** They are useful but each adds cases. They fit v2.
- **The old function is dropped, not kept.** Two overloads would make calls ambiguous and keep a weaker version alive.
- **Real-device testing is part of the phase.** UPI behavior depends on the UPI app, the bank and the Android version; no amount of unit testing replaces trying it.

---

## 10. Hooks for later phases

| Phase | What it must do for Phase 6 |
|-------|------------------------------|
| 7 | Push notifications and the **Remind** button can now mention "paid you ₹300" without naming the method; the "Add your UPI ID" nudge can become a notification; exports include `method` and `upi_txn_ref`; **multi-currency must keep UPI available only for INR groups/payments**; optional UPI QR code for the receiver |
| 8 | Configure Sentry to **strip** UPI IDs, references and `upi://` links from events; audit `create_settlement`, `set_settlement_txn_ref` and `list_settlements`; consider encrypting the stored attempt |
| 9 | Privacy policy and Play Console Data Safety: UPI IDs are shown to group members; optional transaction references are stored; no payment is processed by the app |

---

## 11. Phase 6 Definition of Done

- [ ] 6.1 to 6.8 completed, tested, and confirmed one by one
- [ ] The 14 UPI link vectors pass; the link builder uses no floating-point math
- [ ] Every case ID in Section 6 has a pass result in `docs/phase-6-test-log.md`
- [ ] The UPI app opens with pre-filled data in a **release APK** on at least 2 UPI apps, and the results (including any app that refused) are recorded
- [ ] Only one `create_settlement` function exists; references are validated and unique per group among active payments
- [ ] A UPI payment is never treated as settled until the receiver confirms
- [ ] No UPI ID, reference or link appears in logs, and nothing sensitive is stored for an attempt
- [ ] Every failure path (no UPI ID, no UPI app, launch failure, app killed, duplicate, offline) has a clear next step
- [ ] Phase 5 cases re-run and still pass
- [ ] `npm run check` and `npx supabase test db` pass
- [ ] Docs updated (`prd.md`, README, CLAUDE.md); tagged `phase-6-done`
- [ ] Decisions D37 to D47 have recorded answers

---

## 12. Common problems and fixes

| Problem | Fix |
|---------|-----|
| `canOpenURL` returns false although a UPI app is installed (Android 11 and above) | The `<queries>` entry for the `upi` scheme is missing from the **built** manifest. Re-run `npx expo prebuild --platform android --clean` with the config plugin and check `AndroidManifest.xml` |
| It works in the dev build but not in the release APK | Test the release build early; check the manifest in the release variant and that the plugin is in `app.json` |
| The UPI app opens but shows no amount, or says the payment is declined | Some UPI apps and banks restrict deep-link payments to personal UPI IDs. Use the Copy UPI ID fallback and **I already paid**. Record the app in the test log |
| The app asks "Did you pay?" while the user never left the app | The return detection fires on any app state change. Require that the app actually went to the background after launching (UR13) |
| The prompt never appears after returning | The app was killed. Restore the attempt on cold start after auth and splash are ready (UR4) |
| Two payments appear after one tap on Yes | A new `client_request_id` was made on retry. Use the attempt `id` |
| `Could not choose the best candidate function` when creating a payment | The old 7-argument `create_settlement` still exists. Drop it |
| `upi_txn_ref` rejected for a valid-looking reference | It must be 6 to 35 characters from letters, digits, dot, underscore and hyphen. Some apps show references with spaces; ask the user to paste only the reference |
| Amount shows as `300` or `300.0` in the UPI app | The amount must have exactly two decimals (`300.00`). Use the string-based formatter |
| Note with `&` breaks the link | The cleaning step was skipped. Always pass names and notes through `cleanText` |
| Receiver has no UPI ID but the UPI chip is enabled | The members list was cached. Refetch when the sheet opens and again before launching |
| Hindi group names disappear from the note | Expected: non-Latin characters are removed from the note for compatibility; the UPI app shows the real name from the UPI ID |
| The phone's UPI app asks for a merchant | The link must be a personal payment: do not add `mc`, `tr` or `url` |

---

## 13. Starter prompt for Claude Code

```
You are continuing SplitEase (React Native + Expo, TypeScript, Supabase). Phases 1 to 5 are done (tags phase-1-done to phase-5-done).

Read these first and follow them strictly:
- docs/prd.md
- docs/phase-6.md (the current phase: the link rules, vectors, flows, error messages, and Case Matrix)
- docs/phase-5.md, docs/phase-4.md, docs/phase-3.md and docs/phase-2.md (their rules still apply)
- CLAUDE.md

Rules:
1. Work ONLY on sub-phase 6.1 right now. Do not start 6.2 or anything else.
2. A UPI payment is a normal Phase 5 settlement with method 'upi'. Every Phase 5 rule still applies. The server (Postgres functions) stays the authority. The app never assumes a UPI payment succeeded; the receiver always confirms.
3. Clients get NO direct access to settlements. Every read and write goes through RPC functions.
4. Every new or changed function: SECURITY DEFINER, SET search_path = '', user from auth.uid() only, execute revoked from public and anon. Lock order is always: group row first, then the settlement row.
5. When changing create_settlement, DROP the old 7-argument version first so only one version exists.
6. Never log UPI IDs, transaction references or upi:// links. Never store a UPI ID or a link on the phone.
7. Write the SQL tests described in the sub-phase and update the Phase 5 tests that expected 'upi' to be rejected. A sub-phase is not done until its tests pass.
8. STOP when 6.1 is done and tell me: what you created, the exact commands you ran, the test output, and how I can verify it myself.
9. Keep every change small. Never use or ask for the service_role key. Never commit .env or secrets.
10. Every sub-phase must satisfy the case IDs it lists in docs/phase-6.md. If a case cannot be met, tell me instead of working around it.
11. Do not add libraries or services that the current sub-phase does not list. No QR codes, no merchant parameters, no Cloudflare Workers.
12. Tell me when something needs a real phone or a real UPI app (from 6.3 on). Tests with real payments use only 1 rupee between UPI IDs I control.

Start with 6.1 now.
```

After 6.1 is confirmed, say "continue with 6.2", and so on.
