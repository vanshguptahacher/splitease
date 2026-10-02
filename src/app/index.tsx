import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { env, getEnvIssues } from '@/lib/env';
import { supabase } from '@/lib/supabase/client';

export default function HomeScreen() {
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
        message: `Configuration Error:\n${envIssues}\n\nAdd EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env file and restart Metro with 'npx expo start -c'.`,
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
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>SplitEase</Text>
        <Text style={styles.subtitle}>Phase 1.2 — Supabase Connection</Text>

        {envIssues ? (
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>⚠️ Missing .env Config</Text>
            <Text style={styles.alertText}>{envIssues}</Text>
            <Text style={styles.alertHint}>
              Create a .env file based on .env.example with your Supabase credentials.
            </Text>
          </View>
        ) : (
          <View style={styles.configuredBadge}>
            <Text style={styles.configuredText}>✓ Environment variables detected</Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={handleTestConnection}
          disabled={testing}
        >
          {testing ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Test Supabase Connection</Text>
          )}
        </Pressable>

        {status.type !== 'idle' && (
          <View
            style={[
              styles.statusBox,
              status.type === 'success' ? styles.statusSuccess : styles.statusError,
            ]}
          >
            <Text
              style={[
                styles.statusTitle,
                status.type === 'success' ? styles.statusTextSuccess : styles.statusTextError,
              ]}
            >
              {status.type === 'success' ? 'Connection Successful' : 'Connection Error'}
            </Text>
            <Text
              style={[
                styles.statusMessage,
                status.type === 'success' ? styles.statusTextSuccess : styles.statusTextError,
              ]}
            >
              {status.message}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f9fa',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0d9488',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 24,
  },
  alertBox: {
    width: '100%',
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  alertTitle: {
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 4,
  },
  alertText: {
    fontSize: 13,
    color: '#92400e',
    marginBottom: 4,
  },
  alertHint: {
    fontSize: 12,
    color: '#b45309',
    fontStyle: 'italic',
  },
  configuredBadge: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 16,
  },
  configuredText: {
    color: '#047857',
    fontSize: 13,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#0d9488',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  statusBox: {
    marginTop: 20,
    padding: 14,
    borderRadius: 8,
    width: '100%',
  },
  statusSuccess: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#10b981',
  },
  statusError: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  statusTitle: {
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 4,
  },
  statusMessage: {
    fontSize: 13,
  },
  statusTextSuccess: {
    color: '#065f46',
  },
  statusTextError: {
    color: '#991b1b',
  },
});
