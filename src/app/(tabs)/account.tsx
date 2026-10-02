import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  AppButton,
  AppHeader,
  Avatar,
  Screen,
  useSnackbar,
} from '@/components';
import { env, getEnvIssues } from '@/lib/env';
import { supabase } from '@/lib/supabase/client';
import { useAppTheme } from '@/lib/theme';
import { useAuth } from '@/hooks';

export default function AccountTabScreen() {
  const theme = useAppTheme();
  const { showSnackbar } = useSnackbar();
  const { user, profile, signOutAndReset } = useAuth();
  const [testing, setTesting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const envIssues = getEnvIssues();

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOutAndReset();
      showSnackbar({ message: 'Signed out successfully' });
    } catch {
      showSnackbar({ message: 'Error signing out' });
    } finally {
      setSigningOut(false);
    }
  };

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
      <AppHeader title="Account" subtitle="Profile & Settings" />

      <View style={[styles.content, { padding: theme.spacing.lg }]}>
        {/* User Profile Card */}
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
          <View style={styles.profileHeader}>
            <Avatar
              url={profile?.avatar_url}
              name={profile?.name || user?.email || 'User'}
              size={64}
            />
            <View style={styles.profileInfo}>
              <Text
                style={[
                  theme.typography.sectionTitle,
                  { color: theme.colors.text },
                ]}
              >
                {profile?.name || 'User'}
              </Text>
              {user?.email && (
                <Text
                  style={[
                    theme.typography.caption,
                    { color: theme.colors.muted, marginTop: 2 },
                  ]}
                >
                  {user.email}
                </Text>
              )}
              {profile?.upi_id ? (
                <Text
                  style={[
                    theme.typography.caption,
                    { color: theme.colors.primary, marginTop: 4 },
                  ]}
                >
                  UPI: {profile.upi_id}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Account Actions */}
        <View style={[styles.section, { marginTop: theme.spacing.xl }]}>
          <AppButton
            title="Sign Out"
            variant="danger"
            icon="log-out-outline"
            loading={signingOut}
            onPress={handleSignOut}
            fullWidth
          />
        </View>

        {/* Developer Diagnostics Section */}
        {__DEV__ && (
          <View style={[styles.section, { marginTop: theme.spacing.xl }]}>
            <Text
              style={[
                theme.typography.sectionTitle,
                { color: theme.colors.text, marginBottom: theme.spacing.md },
              ]}
            >
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
    width: '100%',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  profileInfo: {
    flex: 1,
  },
  section: {
    width: '100%',
  },
  buttonStack: {
    gap: 12,
  },
});
