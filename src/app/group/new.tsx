import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppButton, AppHeader, Screen, useSnackbar } from '@/components';
import { useAppTheme } from '@/lib/theme';

export default function NewGroupScreen() {
  const theme = useAppTheme();
  const { showSnackbar } = useSnackbar();

  return (
    <Screen padding={false}>
      <AppHeader
        title="New Group"
        subtitle="Create expense group"
        showBack
        onBack={() => router.back()}
      />

      <View style={[styles.content, { padding: theme.spacing.xl }]}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outline,
              borderRadius: theme.radius.sheet,
              padding: theme.spacing.xl,
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
              🚧 Group creation coming in Phase 3
            </Text>
          </View>

          <Text style={[theme.typography.sectionTitle, { color: theme.colors.text }]}>
            Create a Group
          </Text>

          <Text
            style={[
              theme.typography.body,
              { color: theme.colors.muted, marginTop: theme.spacing.sm, marginBottom: theme.spacing.xl },
            ]}
          >
            In Phase 3, you will be able to enter a group name, choose currency (INR default), and invite members via link/code.
          </Text>

          <AppButton
            title="Simulate Create (Phase 3 Demo)"
            variant="secondary"
            onPress={() => {
              showSnackbar({ message: 'Group creation will be available in Phase 3' });
            }}
            fullWidth
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    alignItems: 'center',
  },
  phaseBadge: {
    alignSelf: 'center',
  },
});
