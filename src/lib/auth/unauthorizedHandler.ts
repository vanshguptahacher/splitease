import { supabase } from '@/lib/supabase/client';

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;
let onSignOutCallback: (() => Promise<void>) | null = null;

export function registerSignOutCallback(cb: () => Promise<void>) {
  onSignOutCallback = cb;
}

/**
 * Handles 401 / unauthorized errors globally (Case C3, C4).
 * Tries to refresh the token once.
 * If refresh succeeds, returns true (caller can retry).
 * If refresh fails, calls signOut callback and returns false.
 */
export async function handleUnauthorized(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) {
        if (onSignOutCallback) {
          await onSignOutCallback();
        }
        return false;
      }
      return true;
    } catch {
      if (onSignOutCallback) {
        await onSignOutCallback();
      }
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export function isUnauthorizedError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'object' && error !== null) {
    const err = error as { status?: number; statusCode?: number; code?: string; message?: string };
    if (err.status === 401 || err.statusCode === 401) return true;
    if (err.code === 'refresh_token_not_found' || err.code === 'token_revoked') return true;
    if (typeof err.message === 'string' && (
      err.message.toLowerCase().includes('jwt expired') ||
      err.message.toLowerCase().includes('token has expired') ||
      err.message.toLowerCase().includes('unauthorized')
    )) {
      return true;
    }
  }
  return false;
}
