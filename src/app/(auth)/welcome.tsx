import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { AppButton, Screen, useSnackbar } from '@/components';
import { useAuth } from '@/hooks';
import { signInWithGoogle } from '@/lib/auth/google';
import { toFriendlyMessage } from '@/lib/errors';

export default function WelcomeScreen() {
  const theme = useTheme();
  const { status } = useAuth();
  const { showSnackbar } = useSnackbar();
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    if (googleLoading) return; // Prevent double tap (Case A7)

    setGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      if ('error' in result && result.error) {
        showSnackbar({ message: result.error });
      }
      // If result.cancelled is true, do nothing silently (Case A3)
    } catch (err: unknown) {
      showSnackbar({ message: toFriendlyMessage(err) });
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text
            variant="headlineLarge"
            style={[styles.title, { color: theme.colors.primary }]}
          >
            SplitEase
          </Text>
          <Text
            variant="bodyLarge"
            style={[styles.tagline, { color: theme.colors.onSurfaceVariant }]}
          >
            Split expenses effortlessly with friends and family.
          </Text>
        </View>

        <View style={styles.actions}>
          <AppButton
            title="Continue with Google"
            variant="primary"
            icon="logo-google"
            loading={googleLoading}
            disabled={googleLoading}
            onPress={handleGoogleSignIn}
            accessibilityLabel="Sign in with Google"
            fullWidth
          />

          <AppButton
            title="Continue with Email"
            variant="secondary"
            icon="mail-outline"
            disabled={googleLoading}
            onPress={() => {
              // Handled in Sub-phase 2.5
              showSnackbar({ message: 'Email login coming in Sub-phase 2.5' });
            }}
            accessibilityLabel="Sign in with Email"
            fullWidth
          />
        </View>

        {__DEV__ && (
          <Text
            variant="labelSmall"
            style={[styles.statusText, { color: theme.colors.outline }]}
          >
            Auth Status: {status}
          </Text>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  tagline: {
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 280,
  },
  actions: {
    gap: 16,
    width: '100%',
  },
  statusText: {
    textAlign: 'center',
    marginTop: 32,
  },
});
