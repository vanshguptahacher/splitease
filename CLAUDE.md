# SplitEase Developer & AI Rules

This file outlines the non-negotiable architectural rules, process constraints, and UX principles for building SplitEase. Every developer and AI assistant must follow these strictly.

---

## 1. Process & Workflow Rules (PRD Section 17)

1. **Follow the phases and sub-phases in order:** Stop after each sub-phase. Never start the next sub-phase until the current one is tested, verified, and confirmed.
2. **Never skip ahead or add extra features:** Do not add libraries, services, or functionality not explicitly listed in the active sub-phase.
3. **Keep every change small:** The app must build and run after every step.
4. **Fix errors at the root cause:** Never stack new code or features on top of a broken build or failing tests.
5. **Integers (paise) for money:** Always store and compute money as integer paise. Never use floats for money.
6. **Server is the authoritative source of truth:** Money logic and balances live on the server in PostgreSQL functions (`SECURITY DEFINER`). `/lib/money` is a preview-only mirror with unit tests; never calculate balances inside components.
7. **No direct writes to money or group tables:** Clients must NEVER write to `expenses`, `expense_splits`, `settlements`, `groups`, `group_members`, `invites`, or `activity_log` using `.insert()`, `.update()`, or `.delete()`. Direct mutations are revoked; writes happen exclusively through RPC functions.
8. **Row Level Security (RLS) on every table:** Every new table must have RLS enabled and policies defined in the same migration.
9. **Never use or expose the Supabase `service_role` key:** Only the `anon` publishable key is permitted in the client app. Never commit `.env`.
10. **No Workers/Cloudflare in v1:** Keep architecture lean. Extra backend services and workers are strictly deferred to v2.
11. **Do not copy code from previous failed attempts.**
12. **Summarise and test:** At the end of each sub-phase, summarise changes and provide exact instructions for verifying on a physical phone.
13. **Phase 2 Auth Rules:**
    - **No passwords:** SplitEase is completely passwordless (Native Google Sign-In and Email OTP).
    - **No email in profiles table:** The `public.profiles` table must never store email columns. Email lives in `auth.users` and is read via the active Supabase session.
    - **Avatar rules:** Storage bucket `avatars` is public with strict write RLS (`<userId>/<uuid>.jpg`). Profile photos must be cropped square and compressed to ~512x512 JPEG (<500 KB). Fallback priority: custom uploaded photo (`avatar_path`) → Google photo (`avatar_url`) → deterministic initials on stable palette.
    - **Account deletion is RPC-only:** Client must call `delete_my_account()`, which anonymizes the profile row to "Deleted user", sets `deleted_at = now()`, and deletes the `auth.users` record. Client signs out with `{ scope: 'local' }`.
    - **Never log personal data:** Emails, tokens, and UPI IDs must never appear in production or development logs. All console logging must go through `src/lib/log.ts` which automatically redacts sensitive data.

---

## 2. UX Principles (PRD Section 3 / phase-1.md)

1. **Fast add:** Adding an equal-split expense takes **3 taps or fewer**: amount → (smart defaults) → Save.
2. **Smart defaults:** Payer = current user, split = equal among all group members, date = today, description optional.
3. **Big, simple amount entry:** Large number pad, opens automatically, no tiny inputs.
4. **Undo instead of confirm:** Deleting shows a snackbar `"Deleted · UNDO"` (soft delete). No disruptive "Are you sure?" confirmation dialogs for routine actions.
5. **Edit in place:** Tapping an expense opens the same screen as "Add", pre-filled.
6. **Plain language:** "You owe Rahul ₹250", not "Balance: -250". Zero accounting jargon.
7. **Show the effect before saving:** Live preview (e.g. "Rahul owes you ₹250") on the expense entry screen.
8. **No dead ends:** Every empty state must have one clear primary call-to-action.
9. **One-hand friendly:** Primary actions anchored at the bottom of the screen (FABs, action buttons, bottom sheets).
10. **Forgiving:** Automatically remember the last used group, recent members, and last payer.
11. **Always show status:** Loading skeletons, saving states, offline indicators, and friendly error states with Retry buttons.
12. **Never rely on color alone:** Always pair green (owed) and orange (owe) amounts with explicit text labels.

---

## 3. Tooling & Commands

- Package installation: `npx expo install <package>` (ensures Expo SDK compatibility)
- Run tests: `npm test`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Full check: `npm run check` (runs lint, typecheck, and Jest tests)
