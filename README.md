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
