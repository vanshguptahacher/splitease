import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { AppButton, Screen } from '@/components';
import { useAuth } from '@/hooks';

export default function WelcomeScreen() {
  const theme = useTheme();
  const { status } = useAuth();

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
            onPress={() => {}}
            fullWidth
          />

          <AppButton
            title="Continue with Email"
            variant="secondary"
            onPress={() => {}}
            fullWidth
          />
        </View>

        <Text
          variant="labelSmall"
          style={[styles.statusText, { color: theme.colors.outline }]}
        >
          Auth Status: {status}
        </Text>
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
