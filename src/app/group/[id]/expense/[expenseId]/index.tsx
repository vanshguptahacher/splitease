import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  AppButton,
  AppHeader,
  Avatar,
  ErrorState,
  LoadingSkeleton,
  OfflineBanner,
  Screen,
  useSnackbar,
} from '@/components';
import {
  useAuth,
  useDeleteExpense,
  useExpense,
  useGroup,
  useGroupMembers,
  useNetworkStatus,
  useRestoreExpense,
} from '@/hooks';
import { getCategoryEmoji, getCategoryLabel } from '@/lib/expenses/categories';
import { formatDateChipLabel } from '@/lib/expenses/date';
import { formatExpenseEffect } from '@/lib/expenses/formatEffect';
import { formatMoney } from '@/lib/money/format';
import { toFriendlyMessage } from '@/lib/errors';
import { useAppTheme } from '@/lib/theme';

export default function ExpenseDetailScreen() {
  const { id: groupId, expenseId } = useLocalSearchParams<{
    id: string;
    expenseId: string;
  }>();

  const theme = useAppTheme();
  const { user } = useAuth();
  const currentUserId = user?.id ?? '';
  const { isOffline } = useNetworkStatus();
  const { showSnackbar } = useSnackbar();

  // Queries
  const { data: group } = useGroup(groupId);
  // Include former members so names always resolve (EL4)
  const { data: members = [] } = useGroupMembers(groupId, true);

  const {
    data: detail,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useExpense(expenseId);

  // Mutations
  const deleteMutation = useDeleteExpense(groupId);
  const restoreMutation = useRestoreExpense(groupId);

  const [isDeleting, setIsDeleting] = useState(false);

  // Refetch on focus (EL6)
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  // Member lookups
  const memberMap = useMemo(() => {
    const map = new Map<string, { name: string; avatar_url: string | null }>();
    for (const m of members) {
      map.set(m.user_id.toLowerCase(), {
        name: m.name || 'Member',
        avatar_url: m.avatar_url,
      });
    }
    return map;
  }, [members]);

  const expense = detail?.expense;
  const splits = useMemo(() => detail?.splits ?? [], [detail?.splits]);
  const activity = detail?.activity ?? [];
  const isLocked = detail?.is_locked ?? false;
  const canEdit = detail?.can_edit ?? false;
  const canRestore = detail?.can_restore ?? false;

  // Current user's share in this expense
  const mySplit = useMemo(() => {
    return splits.find(
      (s) => s.user_id.toLowerCase() === currentUserId.toLowerCase()
    );
  }, [splits, currentUserId]);

  // Effect banner
  const effect = useMemo(() => {
    if (!expense) return null;
    return formatExpenseEffect(
      {
        paid_by: expense.paid_by,
        amount_minor: expense.amount_minor,
        my_share_minor: mySplit?.share_minor,
      },
      currentUserId
    );
  }, [expense, mySplit, currentUserId]);

  // Delete handler with 8s UNDO snackbar (ED1 to ED5)
  const handleDelete = () => {
    if (isOffline) {
      showSnackbar({ message: 'Cannot delete expense while offline. Please check your connection.' });
      return;
    }

    if (isLocked) {
      showSnackbar({ message: "This expense includes someone who left the group, so it's locked." });
      return;
    }

    Alert.alert(
      'Delete Expense?',
      'Are you sure you want to delete this expense? This will remove it from group balances.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!expenseId) return;
            setIsDeleting(true);
            try {
              await deleteMutation.mutateAsync({ expenseId, groupId });
              router.back();
              showSnackbar({
                message: 'Expense deleted',
                duration: 8000,
                action: {
                  label: 'UNDO',
                  onPress: async () => {
                    try {
                      await restoreMutation.mutateAsync({ expenseId, groupId });
                      showSnackbar({ message: 'Expense restored' });
                    } catch (err) {
                      showSnackbar({ message: toFriendlyMessage(err) });
                    }
                  },
                },
              });
            } catch (err) {
              setIsDeleting(false);
              showSnackbar({ message: toFriendlyMessage(err) });
            }
          },
        },
      ]
    );
  };

  // Stale link / Error states (EL8, EA9)
  if (isError) {
    const rawError = (error as { message?: string })?.message || '';
    if (rawError === 'not_a_member') {
      router.replace('/(tabs)');
      return null;
    }

    const isDeleted = rawError === 'expense_not_found';

    return (
      <Screen padding={false}>
        <AppHeader title="Expense Details" showBack onBack={() => router.back()} />
        <View style={styles.centerContainer}>
          <ErrorState
            title={isDeleted ? 'This expense was deleted' : 'Could not load expense'}
            message={
              isDeleted
                ? 'It may have been removed by an admin or the person who added it.'
                : toFriendlyMessage(error)
            }
            onRetry={
              isDeleted && canRestore && expenseId
                ? () => {
                    restoreMutation
                      .mutateAsync({ expenseId, groupId })
                      .then(() => refetch())
                      .catch((err) => showSnackbar({ message: toFriendlyMessage(err) }));
                  }
                : () => refetch()
            }
            retryTitle={isDeleted && canRestore ? 'Restore Expense' : 'Retry'}
          />
        </View>
      </Screen>
    );
  }

  // Loading skeleton
  if (isLoading || !expense) {
    return (
      <Screen padding={false}>
        <AppHeader title="Expense Details" showBack onBack={() => router.back()} />
        <View style={{ padding: 16 }}>
          <LoadingSkeleton height={100} style={{ marginBottom: 16 }} />
          <LoadingSkeleton height={140} style={{ marginBottom: 16 }} />
          <LoadingSkeleton height={120} />
        </View>
      </Screen>
    );
  }

  const categoryEmoji = getCategoryEmoji(expense.category);
  const categoryLabel = getCategoryLabel(expense.category) || 'Expense';
  const displayTitle = expense.description?.trim() || categoryLabel;

  const isCurrentPayer = expense.paid_by.toLowerCase() === currentUserId.toLowerCase();
  const payerInfo = memberMap.get(expense.paid_by.toLowerCase());
  const payerDisplayName = isCurrentPayer
    ? 'You'
    : payerInfo?.name || 'Someone';

  const creatorInfo = memberMap.get(expense.created_by.toLowerCase());
  const creatorDisplayName = expense.created_by.toLowerCase() === currentUserId.toLowerCase()
    ? 'You'
    : creatorInfo?.name || 'A member';

  let effectColor = theme.colors.muted;
  if (effect?.type === 'lent') {
    effectColor = theme.colors.primary;
  } else if (effect?.type === 'owe') {
    effectColor = theme.colors.error;
  }

  return (
    <Screen padding={false}>
      {isOffline && <OfflineBanner />}

      <AppHeader
        title="Expense Details"
        subtitle={group?.name}
        showBack
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        {/* Lock Banner if locked (EL12, EE8) */}
        {isLocked && (
          <View
            style={[
              styles.lockBanner,
              {
                backgroundColor: theme.colors.errorContainer,
                borderColor: theme.colors.error,
              },
            ]}
          >
            <Ionicons name="lock-closed" size={20} color={theme.colors.onErrorContainer} />
            <Text
              style={[
                theme.typography.caption,
                { color: theme.colors.onErrorContainer, marginLeft: 10, flex: 1, fontWeight: '600' },
              ]}
            >
              {"This expense includes someone who left the group, so it's locked. It cannot be edited or deleted."}
            </Text>
          </View>
        )}

        {/* 1. Header Card: Amount, Category, Description */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outline,
            },
          ]}
        >
          <View style={styles.amountHeaderRow}>
            <View
              style={[
                styles.emojiPill,
                { backgroundColor: theme.colors.surfaceVariant },
              ]}
            >
              <Text style={styles.emojiText}>{categoryEmoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.titleText,
                  theme.typography.sectionTitle,
                  { color: theme.colors.text, fontWeight: '700' },
                ]}
              >
                {displayTitle}
              </Text>
              <Text
                style={[
                  theme.typography.body,
                  { color: theme.colors.muted, marginTop: 2 },
                ]}
              >
                {categoryLabel}
              </Text>
            </View>
          </View>

          <Text
            style={[
              styles.bigAmount,
              theme.typography.amount,
              { color: theme.colors.text },
            ]}
          >
            {formatMoney(expense.amount_minor)}
          </Text>

          {/* Date & Payer Meta */}
          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Ionicons name="calendar-outline" size={14} color={theme.colors.muted} />
              <Text style={[theme.typography.caption, { color: theme.colors.muted, marginLeft: 4 }]}>
                {formatDateChipLabel(expense.expense_date)}
              </Text>
            </View>
            <Text style={{ color: theme.colors.muted, marginHorizontal: 6 }}>·</Text>
            <View style={styles.metaChip}>
              <Ionicons name="person-outline" size={14} color={theme.colors.muted} />
              <Text style={[theme.typography.caption, { color: theme.colors.muted, marginLeft: 4 }]}>
                Paid by {payerDisplayName}
              </Text>
            </View>
          </View>

          {/* Plain words financial effect banner (EL2) */}
          {effect && (
            <View
              style={[
                styles.effectBanner,
                {
                  backgroundColor: theme.colors.surfaceVariant,
                },
              ]}
            >
              <Text
                style={[
                  theme.typography.body,
                  { color: effectColor, fontWeight: '700', textAlign: 'center' },
                ]}
              >
                {effect.text}
              </Text>
            </View>
          )}
        </View>

        {/* 2. Split Breakdown Table */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outline,
            },
          ]}
        >
          <Text
            style={[
              theme.typography.sectionTitle,
              { color: theme.colors.text, marginBottom: 12 },
            ]}
          >
            Split ({splits.length} {splits.length === 1 ? 'person' : 'people'})
          </Text>

          {splits.map((splitItem) => {
            const isUser = splitItem.user_id.toLowerCase() === currentUserId.toLowerCase();
            const member = memberMap.get(splitItem.user_id.toLowerCase());
            const memberName = isUser
              ? `${member?.name || 'You'} (You)`
              : member?.name || 'Member';

            return (
              <View key={splitItem.user_id} style={styles.splitRow}>
                <Avatar
                  name={member?.name || 'Member'}
                  url={member?.avatar_url}
                  size={36}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text
                    style={[
                      theme.typography.body,
                      { color: theme.colors.text, fontWeight: isUser ? '700' : '500' },
                    ]}
                  >
                    {memberName}
                  </Text>
                  {splitItem.percent_bp !== null && (
                    <Text
                      style={[
                        theme.typography.caption,
                        { color: theme.colors.muted },
                      ]}
                    >
                      {(splitItem.percent_bp / 100).toFixed(2)}%
                    </Text>
                  )}
                </View>
                <Text
                  style={[
                    theme.typography.body,
                    { color: theme.colors.text, fontWeight: '700' },
                  ]}
                >
                  {formatMoney(splitItem.share_minor)}
                </Text>
              </View>
            );
          })}
        </View>

        {/* 3. Audit Trail Info */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outline,
            },
          ]}
        >
          <Text
            style={[
              theme.typography.sectionTitle,
              { color: theme.colors.text, marginBottom: 8 },
            ]}
          >
            Audit Trail
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.muted }]}>
            Added by {creatorDisplayName} on{' '}
            {new Date(expense.created_at).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </Text>
          {expense.version > 1 && (
            <Text
              style={[
                theme.typography.caption,
                { color: theme.colors.muted, marginTop: 4 },
              ]}
            >
              Edited (Version {expense.version}) · Last updated{' '}
              {new Date(expense.updated_at).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
              })}
            </Text>
          )}

          {/* Activity items if present */}
          {activity.length > 0 && (
            <View style={styles.activityList}>
              {activity.map((act) => (
                <View key={act.id} style={styles.activityItem}>
                  <Ionicons
                    name="time-outline"
                    size={14}
                    color={theme.colors.muted}
                    style={{ marginTop: 2, marginRight: 6 }}
                  />
                  <Text
                    style={[
                      theme.typography.caption,
                      { color: theme.colors.muted, flex: 1 },
                    ]}
                  >
                    {act.actor_name} {act.action}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 4. Action Buttons (Edit / Delete) */}
        {canEdit && !isLocked && (
          <View style={styles.actionButtonsContainer}>
            <AppButton
              title="Edit Expense"
              variant="secondary"
              icon="pencil"
              fullWidth
              style={{ marginBottom: 12 }}
              onPress={() =>
                router.push({
                  pathname: '/group/[id]/expense/[expenseId]/edit',
                  params: { id: groupId, expenseId },
                })
              }
            />

            <AppButton
              title="Delete Expense"
              variant="danger"
              icon="trash-outline"
              fullWidth
              loading={isDeleting}
              disabled={isDeleting || isOffline}
              onPress={handleDelete}
            />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  amountHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  emojiPill: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  emojiText: {
    fontSize: 24,
  },
  titleText: {
    fontSize: 20,
  },
  bigAmount: {
    fontSize: 36,
    lineHeight: 44,
    marginVertical: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  effectBanner: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.15)',
  },
  activityList: {
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150, 150, 150, 0.15)',
    paddingTop: 8,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 4,
  },
  actionButtonsContainer: {
    marginTop: 8,
  },
});
