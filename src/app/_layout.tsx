import React, { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { Stack, ThemeProvider, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  appDarkTheme,
  appLightTheme,
  navigationDarkTheme,
  navigationLightTheme,
} from '@/lib/theme';
import { queryClient } from '@/lib/queryClient';
import {
  ErrorBoundary,
  ErrorState,
  OfflineBanner,
  Screen,
  SnackbarProvider,
} from '@/components';
import { toFriendlyMessage } from '@/lib/errors';
import { AuthProvider, useAuth } from '@/context/AuthContext';

function RootNavigator() {
  const {
    status,
    profile,
    profileError,
    isProfileLoading,
    refetchProfile,
    consumePendingLink,
  } = useAuth();
  const router = useRouter();

  // Restore and open pending deep link after sign-in (Case C5)
  useEffect(() => {
    if (status === 'signedIn') {
      consumePendingLink().then((target) => {
        if (target) {
          router.replace(target as any);
        }
      });
    }
  }, [status, consumePendingLink, router]);

  // Keep splash screen visible while initial session status is resolving (Case C1)
  if (status === 'loading') {
    return null;
  }

  const isAuthenticated = status === 'signedIn';

  // Profile missing or failed to create via ensure_my_profile (Case C10)
  if (isAuthenticated && profileError && !profile) {
    return (
      <Screen style={{ justifyContent: 'center', alignItems: 'center' }}>
        <ErrorState
          title="Could not load your profile"
          message={toFriendlyMessage(profileError)}
          onRetry={refetchProfile}
          retryLoading={isProfileLoading}
        />
      </Screen>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Auth routes: accessible only when signed out */}
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>

      {/* Main app routes: protected, accessible only when signed in */}
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="group/new" options={{ headerShown: false }} />
        <Stack.Screen name="group/[id]/index" options={{ headerShown: false }} />
        <Stack.Screen
          name="group/[id]/add-expense"
          options={{
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen name="dev/components" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const paperTheme = isDark ? appDarkTheme : appLightTheme;
  const navTheme = isDark ? navigationDarkTheme : navigationLightTheme;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PaperProvider theme={paperTheme}>
            <ThemeProvider value={navTheme}>
              <SnackbarProvider>
                <StatusBar style={isDark ? 'light' : 'dark'} />
                <OfflineBanner />
                <RootNavigator />
              </SnackbarProvider>
            </ThemeProvider>
          </PaperProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
