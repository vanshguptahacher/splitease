# SplitEase

SplitEase is an Android expense-splitting application (a fast, intuitive Splitwise alternative for India) built with React Native + Expo, TypeScript, and Supabase.

## Tech Stack
- **Framework**: React Native + Expo (SDK 57)
- **Navigation**: Expo Router (file-based)
- **Backend / Database**: Supabase (PostgreSQL + RLS + RPC)
- **State Management**: TanStack Query + Supabase JS Client

---

## Getting Started

### Prerequisites
- Node.js (v20+ LTS)
- Android Studio / Android SDK (`ANDROID_HOME` configured)
- Supabase account

### Installation
1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/vanshguptahacher/splitease.git
   cd splitease
   npm install
   ```

2. Configure environment variables:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Fill in your Supabase credentials:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-publishable-key
   ```
   > **IMPORTANT**: Never commit `.env` or use the `service_role` key anywhere in the client app.

3. Start development server:
   ```bash
   npx expo start
   ```

4. Run on Android device:
   ```bash
   npx expo run:android
   ```

---

## Auth Setup (Phase 2)
### Supabase Configuration
- **Site URL**: `splitease://`
- **Redirect URLs**: `splitease://*`
- **Providers**:
  - Email (OTP code enabled, 10-minute expiry)
  - Google (enabled with Google Web OAuth Client ID)

### Google Cloud OAuth Configuration
- **Application Type 1 (Web Application)**:
  - Name: `SplitEase Web`
  - Authorized Redirect URI: `https://<supabase-project-ref>.supabase.co/auth/v1/callback`
  - Configured in Supabase Google Provider & `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `.env`
- **Application Type 2 (Android)**:
  - Name: `SplitEase Android Debug`
  - Package Name: `in.splitease.app`
  - Debug SHA-1 Fingerprint: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`

### SMTP Note for Production
Supabase free-tier built-in email service is rate-limited (30 emails/hour). For production deployments, configure custom SMTP (e.g. Resend, SendGrid, or AWS SES) in Supabase Project Settings → Auth → SMTP Settings.

### Database Migrations & SQL Tests
1. **Profiles & Privileges**: `supabase/migrations/20261002144652_profiles.sql`
2. **Storage Bucket `avatars`**: `supabase/migrations/20261002144700_avatars_storage.sql`
3. **UPI Quantifier Fix**: `supabase/migrations/20261002225300_fix_upi_regex.sql`
4. **Groups & Members Tables**: `supabase/migrations/20261002231500_groups_and_members.sql`
5. **Group Helper Functions & RLS**: `supabase/migrations/20261002231600_group_helpers.sql`
6. **Core Group RPCs**: `supabase/migrations/20261002232500_group_core_rpcs.sql`
7. **Group Invites & Join RPCs**: `supabase/migrations/20261002233500_group_invite_rpcs.sql`
8. **Member, Role & Deletion RPCs**: `supabase/migrations/20261002234500_group_member_and_role_rpcs.sql`
9. **Finalize Account Deletion**: `supabase/migrations/20261003100000_finalize_account_deletion.sql`
10. **Expenses Tables, Constraints & Activity Log**: `supabase/migrations/20261003153000_expenses_tables.sql`
11. **Split Sum Deferred Constraint Trigger**: `supabase/migrations/20261003153100_expense_split_sum_trigger.sql`
12. **Server-Side Split Engine (`compute_shares`)**: `supabase/migrations/20261003154000_compute_shares.sql`
13. **Expenses Write RPCs (`add`, `edit`, `delete`, `restore`, locking)**: `supabase/migrations/20261003160000_expenses_write_rpcs.sql`
14. **Expenses Read RPCs (`list_expenses`, `get_expense`, `list_activity`)**: `supabase/migrations/20261003161000_expenses_read_rpcs.sql`

To run database unit tests with pgTAP:
```bash
npx supabase test db
```

---

## Expenses & Split Engine (Phase 4)
- **Zero Floating-Point Math**: All amounts are represented strictly as integer paise (`bigint` in PostgreSQL).
- **Split Modes**:
  - **Equal**: Divides evenly with remainder paise allocated deterministically to the payer.
  - **Exact**: User assigns specific paise amounts with a live "Split the rest equally" assistant.
  - **Percent**: Precise basis points (0.01% = 1 bp, total = 10,000 bp).
- **Concurrency & Locking**: Shared group lock (`for share`) followed by exclusive expense lock (`for update`). Stale edits throw `expense_changed`.
- **Soft Delete & 8s Undo**: Deletion marks `deleted_at` and `deleted_by`, supported by an 8-second client UNDO snackbar calling `restore_expense`.
- **Former Member Locking**: When any participant or the payer leaves a group, past expenses lock (`expense_locked`) to preserve ledger integrity.
- **Activity Feed**: Keyset-paginated feed with human-readable event sentences (e.g. *"Rahul changed 'Dinner' ₹1,200 → ₹1,500 · Goa Trip · 2h ago"*).


---

## Supabase Notice (Free Tier)
> ⚠️ **Inactivity & Backup Notice**:
> - Free-tier Supabase projects **pause after 7 days of inactivity**. If paused, log into your Supabase dashboard and click "Restore project".
> - Free tier does not include automated daily backups. Always take a manual backup / export SQL before applying significant database migrations.

---

## Development Scripts
- `npm run start`: Start Metro bundler
- `npm run android`: Start on Android
- `npm run lint`: Run ESLint
- `npm run typecheck`: Run TypeScript typecheck (`tsc --noEmit`)
- `npm run test`: Run Jest unit tests
- `npm run check`: Run lint, typecheck, and tests together (clean baseline check)

---

## Building Release APK (Smoke Testing)
To build a release APK locally for Android:
```bash
cd android
./gradlew assembleRelease
```
The output APK is generated at:
`android/app/build/outputs/apk/release/app-release.apk`
Install on device:
```bash
adb install android/app/build/outputs/apk/release/app-release.apk
```
