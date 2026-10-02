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

To run database unit tests with pgTAP:
```bash
npx supabase test db
```
Or run `supabase/tests/database/profiles.test.sql` directly in Supabase Dashboard SQL Editor.

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
