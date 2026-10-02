import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppButton, Screen } from '@/components';
import { useAppTheme } from '@/lib/theme';

export default function GoodbyeScreen() {
  const theme = useAppTheme();
  const router = useRouter();

  return (
    <Screen style={styles.container}>
      <View style={styles.content}>
        <View
          style={[
            styles.iconWrapper,
            { backgroundColor: theme.colors.surfaceVariant },
          ]}
        >
          <Ionicons name="checkmark-done-circle" size={64} color={theme.colors.primary} />
        </View>

        <Text
          style={[
            theme.typography.screenTitle,
            { color: theme.colors.text, textAlign: 'center', marginTop: 24 },
          ]}
        >
          Account Deleted
        </Text>

        <Text
          style={[
            theme.typography.body,
            {
              color: theme.colors.muted,
              textAlign: 'center',
              marginTop: 12,
              lineHeight: 22,
              paddingHorizontal: 16,
            },
          ]}
        >
          Your login, profile details, and personal data have been removed. Any past
          shared expenses are now anonymized as &quot;Deleted user&quot;.
        </Text>

        <Text
          style={[
            theme.typography.body,
            {
              color: theme.colors.text,
              textAlign: 'center',
              marginTop: 16,
              fontWeight: '500',
            },
          ]}
        >
          Thank you for using SplitEase. You are always welcome back!
        </Text>
      </View>

      <View style={styles.footer}>
        <AppButton
          title="Back to Welcome"
          variant="primary"
          onPress={() => router.replace('/(auth)/welcome')}
          fullWidth
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'space-between',
    padding: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    width: '100%',
    paddingBottom: 16,
  },
});
