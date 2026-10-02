import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppButton, AppHeader, Screen, useSnackbar } from '@/components';
import { env, getEnvIssues } from '@/lib/env';
import { supabase } from '@/lib/supabase/client';
import { useAppTheme } from '@/lib/theme';

export default function AccountTabScreen() {
  const theme = useAppTheme();
  const { showSnackbar } = useSnackbar();
  const [testing, setTesting] = useState(false);
  const envIssues = getEnvIssues();

  const handleTestConnection = async () => {
    if (envIssues) {
      showSnackbar({ message: 'Missing .env configuration' });
      return;
    }

    setTesting(true);
    try {
      const healthUrl = `${env.supabaseUrl.replace(/\/$/, '')}/auth/v1/health`;
      const response = await fetch(healthUrl, {
        headers: {
          apikey: env.supabaseAnonKey,
          Authorization: `Bearer ${env.supabaseAnonKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const { error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw new Error(sessionError.message);
      }

      showSnackbar({ message: '✓ Supabase connection healthy!' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showSnackbar({ message: `Connection error: ${msg}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Screen scrollable padding={false}>
      <AppHeader title="Account" subtitle="User settings & developer tools" />

      <View style={[styles.content, { padding: theme.spacing.lg }]}>
        {/* Phase Indicator */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outline,
              padding: theme.spacing.lg,
              borderRadius: theme.radius.card,
            },
          ]}
        >
          <View
            style={[
              styles.phaseBadge,
              {
                backgroundColor: theme.colors.primaryContainer,
                borderRadius: theme.radius.pill,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.xs,
                marginBottom: theme.spacing.md,
              },
            ]}
          >
            <Text
              style={[
                theme.typography.caption,
                { color: theme.colors.onPrimaryContainer, fontWeight: '700' },
              ]}
            >
              🚧 Auth & Profiles coming in Phase 2
            </Text>
          </View>

          <Text style={[theme.typography.sectionTitle, { color: theme.colors.text }]}>
            Guest User
          </Text>
          <Text style={[theme.typography.body, { color: theme.colors.muted, marginTop: 4 }]}>
            Google Sign-In, Email login, UPI ID management, and profile editing will be implemented in Phase 2.
          </Text>
        </View>

        {/* Developer Diagnostics Section */}
        {__DEV__ && (
          <View style={[styles.devSection, { marginTop: theme.spacing.xl }]}>
            <Text style={[theme.typography.sectionTitle, { color: theme.colors.text, marginBottom: theme.spacing.md }]}>
              Developer Tools
            </Text>

            <View style={styles.buttonStack}>
              <AppButton
                title={testing ? 'Checking Supabase...' : 'Test Supabase Connection'}
                variant="secondary"
                icon="cloud-done-outline"
                loading={testing}
                onPress={handleTestConnection}
                fullWidth
              />

              <AppButton
                title="Open Component Showcase →"
                variant="primary"
                icon="shapes-outline"
                onPress={() => router.push('/dev/components')}
                fullWidth
              />
            </View>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  card: {
    borderWidth: 1,
    alignItems: 'flex-start',
    width: '100%',
  },
  phaseBadge: {
    alignSelf: 'flex-start',
  },
  devSection: {
    width: '100%',
  },
  buttonStack: {
    gap: 12,
  },
});
