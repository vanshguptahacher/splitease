import React from 'react';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  appDarkTheme,
  appLightTheme,
  navigationDarkTheme,
  navigationLightTheme,
} from '@/lib/theme';
import { queryClient } from '@/lib/queryClient';
import { ErrorBoundary, OfflineBanner, SnackbarProvider } from '@/components';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const paperTheme = isDark ? appDarkTheme : appLightTheme;
  const navTheme = isDark ? navigationDarkTheme : navigationLightTheme;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={paperTheme}>
          <ThemeProvider value={navTheme}>
            <SnackbarProvider>
              <StatusBar style={isDark ? 'light' : 'dark'} />
              <OfflineBanner />
              <Stack screenOptions={{ headerShown: false }}>
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
              </Stack>
            </SnackbarProvider>
          </ThemeProvider>
        </PaperProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
