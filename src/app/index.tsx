import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { env, getEnvIssues } from '@/lib/env';
import { supabase } from '@/lib/supabase/client';
import { useAppTheme } from '@/lib/theme';

export default function HomeScreen() {
  const theme = useAppTheme();
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message: string;
  }>({
    type: 'idle',
    message: '',
  });

  const envIssues = getEnvIssues();

  const handleTestConnection = async () => {
    if (envIssues) {
      setStatus({
        type: 'error',
        message: `Configuration Error:\n${envIssues}\n\nAdd credentials to .env and reload the app.`,
      });
      return;
    }

    setTesting(true);
    setStatus({ type: 'idle', message: '' });

    try {
      // 1. Check Supabase health endpoint
      const healthUrl = `${env.supabaseUrl.replace(/\/$/, '')}/auth/v1/health`;
      const response = await fetch(healthUrl, {
        headers: {
          apikey: env.supabaseAnonKey,
          Authorization: `Bearer ${env.supabaseAnonKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Health check returned HTTP ${response.status}: ${response.statusText}`);
      }

      // 2. Client query check via SDK
      const { error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw new Error(`Supabase Auth error: ${sessionError.message}`);
      }

      setStatus({
        type: 'success',
        message: 'Successfully connected to Supabase!',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({
        type: 'error',
        message: `Connection failed: ${msg}`,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { padding: theme.spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.sheet,
              padding: theme.spacing.xl,
              borderColor: theme.colors.outline,
            },
          ]}
        >
          {/* Header */}
          <Text style={[theme.typography.screenTitle, { color: theme.colors.primary }]}>
            SplitEase
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.muted, marginTop: theme.spacing.xs }]}>
            Phase 1.3 — Theme & Design System
          </Text>

          {/* Theme Mode Indicator Badge */}
          <View
            style={[
              styles.pillBadge,
              {
                backgroundColor: theme.colors.surfaceVariant,
                borderRadius: theme.radius.pill,
                marginTop: theme.spacing.md,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.xs,
              },
            ]}
          >
            <Text style={[theme.typography.caption, { color: theme.colors.text }]}>
              {theme.isDark ? '🌙 Dark Mode Active' : '☀️ Light Mode Active'} (follows system)
            </Text>
          </View>

          {/* Design Tokens Preview Section */}
          <View
            style={[
              styles.tokensPreview,
              {
                borderColor: theme.colors.outline,
                borderRadius: theme.radius.card,
                padding: theme.spacing.md,
                marginTop: theme.spacing.lg,
                backgroundColor: theme.colors.surfaceVariant,
              },
            ]}
          >
            <Text style={[theme.typography.sectionTitle, { color: theme.colors.text }]}>
              Money Tokens Preview
            </Text>

            {/* Owed (Green) */}
            <View
              style={[
                styles.tokenRow,
                {
                  backgroundColor: theme.colors.owedContainer,
                  borderRadius: theme.radius.sm,
                  padding: theme.spacing.sm,
                  marginTop: theme.spacing.sm,
                },
              ]}
            >
              <Text style={[theme.typography.caption, { color: theme.colors.owed, fontWeight: '700' }]}>
                OWED TO YOU
              </Text>
              <Text style={[theme.typography.amountSmall, { color: theme.colors.owed }]}>
                +₹1,250.00
              </Text>
            </View>

            {/* Owe (Orange) */}
            <View
              style={[
                styles.tokenRow,
                {
                  backgroundColor: theme.colors.oweContainer,
                  borderRadius: theme.radius.sm,
                  padding: theme.spacing.sm,
                  marginTop: theme.spacing.sm,
                },
              ]}
            >
              <Text style={[theme.typography.caption, { color: theme.colors.owe, fontWeight: '700' }]}>
                YOU OWE
              </Text>
              <Text style={[theme.typography.amountSmall, { color: theme.colors.owe }]}>
                -₹420.00
              </Text>
            </View>
          </View>

          {/* Supabase Connection Test Section */}
          <View style={[styles.sectionDivider, { marginTop: theme.spacing.xl }]}>
            <Text style={[theme.typography.sectionTitle, { color: theme.colors.text }]}>
              Supabase Connection
            </Text>

            {envIssues ? (
              <View
                style={[
                  styles.alertBox,
                  {
                    backgroundColor: theme.colors.errorContainer,
                    borderColor: theme.colors.error,
                    borderRadius: theme.radius.sm,
                    padding: theme.spacing.md,
                    marginTop: theme.spacing.sm,
                  },
                ]}
              >
                <Text style={[theme.typography.caption, { color: theme.colors.error, fontWeight: '700' }]}>
                  ⚠️ Missing .env Config
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.error, marginTop: theme.spacing.xs }]}>
                  {envIssues}
                </Text>
              </View>
            ) : (
              <View
                style={[
                  styles.configuredBadge,
                  {
                    backgroundColor: theme.colors.owedContainer,
                    borderRadius: theme.radius.pill,
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: theme.spacing.xs,
                    marginTop: theme.spacing.sm,
                  },
                ]}
              >
                <Text style={[theme.typography.caption, { color: theme.colors.owed, fontWeight: '700' }]}>
                  ✓ Supabase Credentials Detected
                </Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.button,
                {
                  backgroundColor: theme.colors.primary,
                  borderRadius: theme.radius.card,
                  marginTop: theme.spacing.md,
                  minHeight: theme.spacing.xl * 2, // 48dp minimum touch target
                },
                pressed && styles.buttonPressed,
              ]}
              onPress={handleTestConnection}
              disabled={testing}
            >
              {testing ? (
                <ActivityIndicator color={theme.colors.onPrimary} />
              ) : (
                <Text style={[theme.typography.sectionTitle, { color: theme.colors.onPrimary, fontSize: 16 }]}>
                  Test Supabase Connection
                </Text>
              )}
            </Pressable>

            {status.type !== 'idle' && (
              <View
                style={[
                  styles.statusBox,
                  {
                    backgroundColor:
                      status.type === 'success' ? theme.colors.owedContainer : theme.colors.errorContainer,
                    borderRadius: theme.radius.card,
                    borderColor:
                      status.type === 'success' ? theme.colors.owed : theme.colors.error,
                    padding: theme.spacing.md,
                    marginTop: theme.spacing.md,
                  },
                ]}
              >
                <Text
                  style={[
                    theme.typography.caption,
                    {
                      fontWeight: '700',
                      color: status.type === 'success' ? theme.colors.owed : theme.colors.error,
                    },
                  ]}
                >
                  {status.type === 'success' ? 'Connection Successful' : 'Connection Error'}
                </Text>
                <Text
                  style={[
                    theme.typography.caption,
                    {
                      color: status.type === 'success' ? theme.colors.owed : theme.colors.error,
                      marginTop: theme.spacing.xs,
                    },
                  ]}
                >
                  {status.message}
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    alignItems: 'center',
  },
  pillBadge: {
    alignSelf: 'center',
  },
  tokensPreview: {
    width: '100%',
    borderWidth: 1,
  },
  tokenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionDivider: {
    width: '100%',
    alignItems: 'center',
  },
  alertBox: {
    width: '100%',
    borderWidth: 1,
  },
  configuredBadge: {
    alignSelf: 'center',
  },
  button: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  statusBox: {
    width: '100%',
    borderWidth: 1,
  },
});
