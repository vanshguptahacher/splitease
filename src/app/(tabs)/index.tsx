import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppButton, AppHeader, EmptyState, Screen } from '@/components';
import { useAppTheme } from '@/lib/theme';

export default function GroupsTabScreen() {
  const theme = useAppTheme();

  return (
    <Screen padding={false}>
      <AppHeader
        title="Groups"
        subtitle="SplitEase"
        actions={[
          {
            icon: 'add-outline',
            onPress: () => router.push('/group/new'),
            accessibilityLabel: 'New Group',
          },
        ]}
      />

      <View style={styles.content}>
        <View
          style={[
            styles.phaseBadge,
            {
              backgroundColor: theme.colors.primaryContainer,
              borderRadius: theme.radius.pill,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.xs,
              marginBottom: theme.spacing.lg,
            },
          ]}
        >
          <Text
            style={[
              theme.typography.caption,
              { color: theme.colors.onPrimaryContainer, fontWeight: '700' },
            ]}
          >
            🚧 Full Groups feature coming in Phase 3
          </Text>
        </View>

        <EmptyState
          icon="people-outline"
          title="Create your first group"
          message="Groups help you split rent, trip costs, and dinners with friends or roommates."
          actionTitle="Create Group"
          onAction={() => router.push('/group/new')}
        />

        {/* Quick link to test group detail deep link */}
        <View style={[styles.testSection, { marginTop: theme.spacing.xl }]}>
          <AppButton
            title="Open Sample Group #123 →"
            variant="text"
            onPress={() =>
              router.push({
                pathname: '/group/[id]',
                params: { id: '123' },
              })
            }
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  phaseBadge: {
    alignSelf: 'center',
  },
  testSection: {
    alignItems: 'center',
  },
});
