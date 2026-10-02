import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppHeader, EmptyState, Screen } from '@/components';
import { useAppTheme } from '@/lib/theme';

export default function ActivityTabScreen() {
  const theme = useAppTheme();

  return (
    <Screen padding={false}>
      <AppHeader title="Activity" subtitle="Recent transactions & updates" />

      <View style={styles.content}>
        <View
          style={[
            styles.phaseBadge,
            {
              backgroundColor: theme.colors.surfaceVariant,
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
              { color: theme.colors.text, fontWeight: '700' },
            ]}
          >
            🚧 Activity feed coming in Phase 4
          </Text>
        </View>

        <EmptyState
          icon="pulse-outline"
          title="No activity yet"
          message="When expenses or settlements are added in your groups, they will show up here."
        />
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
});
