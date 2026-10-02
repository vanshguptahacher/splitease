import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppButton, AppHeader, Screen, useSnackbar } from '@/components';
import { useAppTheme } from '@/lib/theme';

export default function GroupDetailScreen() {
  const theme = useAppTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showSnackbar } = useSnackbar();

  const handleOpenAddExpense = () => {
    router.push({
      pathname: '/group/[id]/add-expense',
      params: { id: id ?? '' },
    });
  };

  return (
    <Screen padding={false}>
      <AppHeader
        title={`Group #${id ?? 'Unknown'}`}
        subtitle="Group details & balances"
        showBack
        onBack={() => router.back()}
        actions={[
          {
            icon: 'add-circle-outline',
            onPress: handleOpenAddExpense,
            accessibilityLabel: 'Add Expense',
          },
        ]}
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
              🚧 Group details coming in Phase 3
            </Text>
          </View>

          <Text style={[theme.typography.caption, { color: theme.colors.muted }]}>
            RECEIVED GROUP ID VIA ROUTER / DEEP LINK
          </Text>

          <Text
            style={[
              theme.typography.amount,
              { color: theme.colors.primary, marginVertical: theme.spacing.md },
            ]}
          >
            {id ?? 'No ID'}
          </Text>

          <Text
            style={[
              theme.typography.body,
              { color: theme.colors.muted, textAlign: 'center', marginBottom: theme.spacing.xl },
            ]}
          >
            In Phase 3, this screen will display group members, expenses, balances, and settle-up actions.
          </Text>

          <View style={styles.buttonStack}>
            <AppButton
              title="Add Expense (Opens Modal) →"
              icon="add-outline"
              variant="primary"
              onPress={handleOpenAddExpense}
              fullWidth
            />
            <AppButton
              title="Copy Deep Link"
              icon="copy-outline"
              variant="secondary"
              onPress={() => {
                showSnackbar({ message: `Link: splitease://group/${id}` });
              }}
              fullWidth
            />
          </View>
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
  buttonStack: {
    width: '100%',
    gap: 12,
  },
});
