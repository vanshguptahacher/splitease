import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { ActivityListItem } from '@/lib/api/expenses';
import { useActivity, useAuth } from '@/hooks';
import { toFriendlyMessage } from '@/lib/errors';
import { useAppTheme } from '@/lib/theme';
import { EmptyState } from '../EmptyState';
import { ErrorState } from '../ErrorState';
import { LoadingSkeleton } from '../LoadingSkeleton';
import { ActivityRow } from './ActivityRow';

export interface ActivityListProps {
  onItemPress?: (item: ActivityListItem) => void;
}

export function ActivityList({ onItemPress }: ActivityListProps) {
  const theme = useAppTheme();
  const { user } = useAuth();
  const currentUserId = user?.id ?? '';

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
  } = useActivity();

  // Flatten all pages
  const items = useMemo(() => {
    return data?.pages.flatMap((page) => page) ?? [];
  }, [data]);

  const handlePress = (item: ActivityListItem) => {
    if (onItemPress) {
      onItemPress(item);
      return;
    }

    // Settlement entries route to the group's Balances tab (Phase 5.7 Task 3)
    if (item.action?.startsWith('settlement_')) {
      router.push({
        pathname: '/group/[id]' as any,
        params: { id: item.group_id, tab: 'balances' },
      });
      return;
    }

    // Default EV8 behavior:
    // Open expense if ref_id exists, otherwise open group
    if (item.ref_id) {
      router.push({
        pathname: '/group/[id]/expense/[expenseId]' as any,
        params: { id: item.group_id, expenseId: item.ref_id },
      });
    } else {
      router.push({
        pathname: '/group/[id]' as any,
        params: { id: item.group_id },
      });
    }
  };

  // Initial loading skeleton
  if (isLoading && !isRefetching) {
    return (
      <View style={styles.skeletonContainer}>
        <LoadingSkeleton height={68} style={styles.skeletonItem} />
        <LoadingSkeleton height={68} style={styles.skeletonItem} />
        <LoadingSkeleton height={68} style={styles.skeletonItem} />
        <LoadingSkeleton height={68} style={styles.skeletonItem} />
        <LoadingSkeleton height={68} style={styles.skeletonItem} />
      </View>
    );
  }

  // Error state
  if (isError) {
    return (
      <View style={styles.centerContainer}>
        <ErrorState
          title="Could not load activity"
          message={toFriendlyMessage(error)}
          onRetry={() => refetch()}
          retryTitle="Try Again"
        />
      </View>
    );
  }

  // Empty state (EV7)
  if (items.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <EmptyState
          icon="pulse-outline"
          title="No activity yet"
          message="When expenses are added, edited, or deleted in your groups, they will show up here."
        />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <ActivityRow
          item={item}
          currentUserId={currentUserId}
          onPress={handlePress}
        />
      )}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={theme.colors.primary}
          colors={[theme.colors.primary]}
        />
      }
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
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 24,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  skeletonContainer: {
    padding: 16,
  },
  skeletonItem: {
    marginBottom: 12,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
