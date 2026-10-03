import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ExpenseListItem } from '@/lib/api/expenses';
import { ExpenseDateSection, groupExpensesByDate } from '@/lib/expenses/date';
import { useExpenses } from '@/hooks';
import { toFriendlyMessage } from '@/lib/errors';
import { useAppTheme } from '@/lib/theme';
import { GroupMemberItem } from '@/types/database';
import { AppButton } from '../AppButton';
import { ErrorState } from '../ErrorState';
import { LoadingSkeleton } from '../LoadingSkeleton';
import { ExpenseRow } from './ExpenseRow';

export interface ExpenseListProps {
  groupId: string;
  members: GroupMemberItem[];
  currentUserId: string;
  onAddExpense: () => void;
  onExpensePress: (expense: ExpenseListItem) => void;
}

export function ExpenseList({
  groupId,
  members,
  currentUserId,
  onAddExpense,
  onExpensePress,
}: ExpenseListProps) {
  const theme = useAppTheme();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useExpenses(groupId);

  // Map member names (including former members)
  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.user_id.toLowerCase(), m.name || 'Member');
    }
    return map;
  }, [members]);

  // Flatten all pages
  const allExpenses = useMemo(() => {
    return data?.pages.flatMap((page) => page) ?? [];
  }, [data]);

  // Group into date sections (EL1, EL9, EL11)
  const sections = useMemo<ExpenseDateSection<ExpenseListItem>[]>(() => {
    return groupExpensesByDate(allExpenses);
  }, [allExpenses]);

  // Initial loading state
  if (isLoading && !isRefetching) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingSkeleton height={64} style={styles.skeletonItem} />
        <LoadingSkeleton height={64} style={styles.skeletonItem} />
        <LoadingSkeleton height={64} style={styles.skeletonItem} />
        <LoadingSkeleton height={64} style={styles.skeletonItem} />
      </View>
    );
  }

  // Error state
  if (isError) {
    return (
      <View style={styles.centerContainer}>
        <ErrorState
          title="Could not load expenses"
          message={toFriendlyMessage(error)}
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  // Empty state (EL1)
  if (allExpenses.length === 0) {
    return (
      <View style={[styles.centerContainer, { padding: theme.spacing.xl }]}>
        <Ionicons
          name="receipt-outline"
          size={56}
          color={theme.colors.muted}
          style={{ marginBottom: 16 }}
        />
        <Text
          style={[
            theme.typography.sectionTitle,
            { color: theme.colors.text, marginBottom: 8, textAlign: 'center' },
          ]}
        >
          No expenses yet. Add the first one.
        </Text>
        <Text
          style={[
            theme.typography.body,
            { color: theme.colors.muted, textAlign: 'center', marginBottom: 24, maxWidth: 300 },
          ]}
        >
          Keep track of shared bills, meals, trips, and who owes what.
        </Text>
        <AppButton
          title="Add an Expense"
          variant="primary"
          icon="add-circle-outline"
          onPress={onAddExpense}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section: { title } }) => (
          <View
            style={[
              styles.sectionHeader,
              { backgroundColor: theme.colors.background },
            ]}
          >
            <Text
              style={[
                theme.typography.caption,
                styles.sectionHeaderText,
                { color: theme.colors.muted },
              ]}
            >
              {title}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <ExpenseRow
            expense={item}
            currentUserId={currentUserId}
            payerName={memberNameMap.get(item.paid_by.toLowerCase()) || 'Someone'}
            onPress={() => onExpensePress(item)}
          />
        )}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          ) : (
            <View style={styles.footerSpacer} />
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
        contentContainerStyle={styles.listContent}
      />

      {/* Floating Action Button (+) */}
      <TouchableOpacity
        style={[
          styles.fab,
          { backgroundColor: theme.colors.primary },
        ]}
        onPress={onAddExpense}
        activeOpacity={0.8}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Add an expense"
      >
        <Ionicons name="add" size={28} color={theme.colors.onPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 80,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionHeaderText: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 12,
  },
  loadingContainer: {
    padding: 16,
  },
  skeletonItem: {
    marginBottom: 12,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerSpacer: {
    height: 16,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
});
