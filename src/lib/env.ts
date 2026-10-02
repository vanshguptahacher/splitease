import { z } from 'zod';
import { log } from './log';

const envSchema = z.object({
  supabaseUrl: z
    .string()
    .min(1, 'EXPO_PUBLIC_SUPABASE_URL is required in .env')
    .url('EXPO_PUBLIC_SUPABASE_URL must be a valid URL starting with https://'),
  supabaseAnonKey: z
    .string()
    .min(1, 'EXPO_PUBLIC_SUPABASE_ANON_KEY is required in .env'),
});

// Statically access process.env so Expo compiler inlines them
const rawEnv = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
};

const parsed = envSchema.safeParse(rawEnv);

export function getEnvIssues(): string | null {
  if (!parsed.success) {
    return parsed.error.issues.map((i) => i.message).join('\n');
  }
  return null;
}

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => i.message).join('\n');
  log.error('[SplitEase Config Error] Invalid environment variables:\n' + issues);
}

export const env = parsed.success
  ? parsed.data
  : {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    };
