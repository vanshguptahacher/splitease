import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/types';
import { useProfile } from '@/hooks/useProfile';
import {
  clearPendingLink,
  consumePendingLink,
  savePendingLink,
} from '@/lib/auth/pendingLink';
import { registerSignOutCallback } from '@/lib/auth/unauthorizedHandler';

// Prevent splash screen from auto-hiding until initial auth state is resolved
SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore error if already prevented or not in native environment
});

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isProfileLoading: boolean;
  profileError: Error | null;
  refetchProfile: () => Promise<unknown>;
  signOutAndReset: () => Promise<void>;
  pendingLink: string | null;
  consumePendingLink: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [pendingLink, setPendingLinkState] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const user = session?.user ?? null;
  const userId = user?.id;

  // React Query hook for profile management (Case C10, ensure_my_profile fallback)
  const {
    profile,
    isLoading: isProfileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useProfile(userId);

  // Clean sign-out helper (Cases C7, E1, E2)
  const signOutAndReset = useCallback(async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Offline logout must succeed locally (Case E2)
    }

    setSession(null);
    setStatus('signedOut');
    setPendingLinkState(null);

    // Clear React Query cache so no previous user data persists (Case C7)
    queryClient.clear();

    // Clear saved pending links
    await clearPendingLink();
  }, [queryClient]);

  // Hook global 401 handler to clean local sign-out (Cases C3, C4)
  useEffect(() => {
    registerSignOutCallback(signOutAndReset);
  }, [signOutAndReset]);

  // Handle deep links when signed out (Case C5)
  const handleIncomingUrl = useCallback(
    async (url: string) => {
      if (status === 'signedOut') {
        await savePendingLink(url);
        setPendingLinkState(url);
      }
    },
    [status]
  );

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleIncomingUrl(url);
    });

    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) {
        handleIncomingUrl(initialUrl);
      }
    });

    return () => {
      sub.remove();
    };
  }, [handleIncomingUrl]);

  // Initial session restoration on app launch (Cases C1, C2, C3)
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        const {
          data: { session: initialSession },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          // If refresh token is invalid or revoked (Case C3)
          await signOutAndReset();
          return;
        }

        if (!isMounted) return;

        if (initialSession) {
          setSession(initialSession);
          setStatus('signedIn');
        } else {
          setSession(null);
          setStatus('signedOut');
        }
      } catch {
        // Cold start offline with a stored session (Case C2)
        // If network failed, do not sign out if session exists
        if (isMounted) {
          if (session) {
            setStatus('signedIn');
          } else {
            setStatus('signedOut');
          }
        }
      } finally {
        if (isMounted) {
          // Hide splash screen as soon as auth status is known (Case C1)
          SplashScreen.hideAsync().catch(() => {});
        }
      }
    }

    initSession();

    // Subscribe to auth state changes (Task 4, Case C9)
    // Note: Do NOT await other Supabase calls inside this callback (prevents deadlocks)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!isMounted) return;

      if (event === 'SIGNED_OUT' || !newSession) {
        setSession(null);
        setStatus('signedOut');
      } else if (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        setSession(newSession);
        setStatus('signedIn');
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [signOutAndReset, session]);

  const handleConsumePendingLink = useCallback(async () => {
    const link = await consumePendingLink();
    setPendingLinkState(null);
    return link;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user,
      profile,
      isProfileLoading,
      profileError: (profileError as Error) ?? null,
      refetchProfile,
      signOutAndReset,
      pendingLink,
      consumePendingLink: handleConsumePendingLink,
    }),
    [
      status,
      session,
      user,
      profile,
      isProfileLoading,
      profileError,
      refetchProfile,
      signOutAndReset,
      pendingLink,
      handleConsumePendingLink,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
