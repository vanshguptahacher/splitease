import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  AppButton,
  AppHeader,
  ErrorState,
  LoadingSkeleton,
  Screen,
} from '@/components';
import { ExpenseForm } from '@/components/expenses/ExpenseForm';
import { useExpense } from '@/hooks/useExpenses';
import { toFriendlyMessage } from '@/lib/errors';

export default function EditExpenseScreen() {
  const { id: groupId, expenseId } = useLocalSearchParams<{
    id: string;
    expenseId: string;
  }>();

  const { data, isLoading, isError, error, refetch } = useExpense(expenseId);

  if (isLoading) {
    return (
      <Screen padding={false}>
        <AppHeader title="Edit Expense" showBack onBack={() => router.back()} />
        <View style={{ padding: 16 }}>
          <LoadingSkeleton height={80} style={{ marginBottom: 16 }} />
          <LoadingSkeleton height={48} style={{ marginBottom: 16 }} />
          <LoadingSkeleton height={56} style={{ marginBottom: 16 }} />
        </View>
      </Screen>
    );
  }

  if (isError || !data) {
    return (
      <Screen padding={false}>
        <AppHeader title="Edit Expense" showBack onBack={() => router.back()} />
        <View style={styles.centerContainer}>
          <ErrorState
            title="Could not load expense"
            message={toFriendlyMessage(error)}
            onRetry={refetch}
          />
        </View>
      </Screen>
    );
  }

  // Permission check (EE3, EE8)
  if (data.is_locked) {
    return (
      <Screen padding={false}>
        <AppHeader title="Edit Expense" showBack onBack={() => router.back()} />
        <View style={styles.centerContainer}>
          <ErrorState
            title="Expense is locked"
            message="This expense includes someone who left the group, so it's locked. Add a new expense to correct it."
          />
          <View style={styles.buttonWrapper}>
            <AppButton
              title="Go Back"
              variant="secondary"
              fullWidth
              onPress={() => router.back()}
            />
          </View>
        </View>
      </Screen>
    );
  }

  if (!data.can_edit) {
    return (
      <Screen padding={false}>
        <AppHeader title="Edit Expense" showBack onBack={() => router.back()} />
        <View style={styles.centerContainer}>
          <ErrorState
            title="Permission denied"
            message="Only the person who added this expense or a group admin can change it."
          />
          <View style={styles.buttonWrapper}>
            <AppButton
              title="Go Back"
              variant="secondary"
              fullWidth
              onPress={() => router.back()}
            />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <ExpenseForm
      mode="edit"
      groupId={groupId || ''}
      expenseId={expenseId}
      initialData={data}
    />
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  buttonWrapper: {
    marginTop: 20,
    width: '100%',
  },
});
