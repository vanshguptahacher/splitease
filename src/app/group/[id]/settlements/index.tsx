import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  AppButton,
  AppHeader,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  OfflineBanner,
  Screen,
  useSnackbar,
} from '@/components';
import {
  useAuth,
  useCancelSettlement,
  useConfirmSettlement,
  useDisputeSettlement,
  useGroup,
  useGroupMembers,
  useInfiniteSettlements,
  useNetworkStatus,
} from '@/hooks';
import { toFriendlyMessage } from '@/lib/errors';
import { formatMoney } from '@/lib/money/format';
import {
  formatSettlementHistoryRow,
  FormattedSettlementHistoryRow,
} from '@/lib/money/balanceText';
import { palette, useAppTheme } from '@/lib/theme';
import { SettlementListItem } from '@/types/database';

export default function PaymentHistoryScreen() {
  const theme = useAppTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = id ?? '';
  const { user } = useAuth();
  const currentUserId = user?.id ?? '';
  const { isOffline } = useNetworkStatus();
  const { showSnackbar } = useSnackbar();

  // Queries
  const { data: group } = useGroup(groupId);
  const { data: members = [] } = useGroupMembers(groupId, true);

  const {
    data,
    isLoading,
    isRefetching,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteSettlements(groupId, 30);

  // Mutations
  const confirmSettlementMutation = useConfirmSettlement(groupId);
  const disputeSettlementMutation = useDisputeSettlement(groupId);
  const cancelSettlementMutation = useCancelSettlement(groupId);

  // Detail Modal state (Case SH5)
  const [selectedItem, setSelectedItem] = useState<SettlementListItem | null>(null);

  // Refetch when focused
  useFocusEffect(
    useCallback(() => {
      if (groupId) {
        refetch();
      }
    }, [groupId, refetch])
  );

  // Name resolver: maps userId to member name; fallback to Former member / Deleted user (Case SH4)
  const nameResolver = useCallback(
    (userId: string) => {
      const found = members.find((m) => m.user_id === userId);
      return found?.name || 'Deleted user';
    },
    [members]
  );

  // Flatten all pages
  const items = useMemo(() => {
    return data?.pages.flatMap((page) => page) ?? [];
  }, [data]);

  // Action handlers with confirmation and snackbars (Cases ST1-ST6, SH3)
  const handleConfirm = async (item: SettlementListItem) => {
    if (isOffline) return;
    try {
      await confirmSettlementMutation.mutateAsync(item.id);
      const payerName = nameResolver(item.from_user);
      const amountStr = formatMoney(item.amount_minor);
      showSnackbar({
        message: `Confirmed ${amountStr} from ${payerName}`,
        action: item.can_undo
          ? {
              label: 'UNDO',
              onPress: async () => {
                try {
                  await cancelSettlementMutation.mutateAsync(item.id);
                  showSnackbar({ message: 'Payment confirmation undone' });
                } catch (undoErr) {
                  showSnackbar({ message: toFriendlyMessage(undoErr) });
                }
              },
            }
          : undefined,
      });
      if (selectedItem?.id === item.id) {
        setSelectedItem(null);
      }
    } catch (err) {
      showSnackbar({ message: toFriendlyMessage(err) });
    }
  };

  const handleDispute = (item: SettlementListItem) => {
    if (isOffline) return;
    const payerName = nameResolver(item.from_user);
    Alert.alert(
      'Mark as not received?',
      `${payerName} will see that you marked this payment as not received.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Not Received',
          style: 'destructive',
          onPress: async () => {
            try {
              await disputeSettlementMutation.mutateAsync(item.id);
              showSnackbar({ message: 'Marked as not received' });
              if (selectedItem?.id === item.id) {
                setSelectedItem(null);
              }
            } catch (err) {
              showSnackbar({ message: toFriendlyMessage(err) });
            }
          },
        },
      ]
    );
  };

  const handleCancel = (item: SettlementListItem) => {
    if (isOffline) return;
    const isUndo = item.status === 'confirmed';
    Alert.alert(
      isUndo ? 'Undo confirmation?' : 'Cancel payment?',
      isUndo
        ? 'This will cancel the payment and revert balances.'
        : 'Are you sure you want to cancel this payment?',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: isUndo ? 'Undo' : 'Cancel Payment',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelSettlementMutation.mutateAsync(item.id);
              showSnackbar({
                message: isUndo ? 'Payment confirmation undone' : 'Payment cancelled',
              });
              if (selectedItem?.id === item.id) {
                setSelectedItem(null);
              }
            } catch (err) {
              showSnackbar({ message: toFriendlyMessage(err) });
            }
          },
        },
      ]
    );
  };

  const renderStatusChip = (statusState: 'warning' | 'success' | 'error' | 'muted', label: string) => {
    let bg = theme.colors.surfaceVariant;
    let fg = theme.colors.muted;

    if (statusState === 'success') {
      bg = palette.owedContainer;
      fg = palette.owed;
    } else if (statusState === 'warning') {
      bg = palette.oweContainer;
      fg = palette.owe;
    } else if (statusState === 'error') {
      bg = palette.errorContainer;
      fg = palette.error;
    }

    return (
      <View style={[styles.chip, { backgroundColor: bg }]}>
        <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
      </View>
    );
  };

  const renderRow = ({ item }: { item: SettlementListItem }) => {
    const formatted: FormattedSettlementHistoryRow = formatSettlementHistoryRow(
      item,
      currentUserId,
      nameResolver
    );

    const isMutating =
      confirmSettlementMutation.isPending ||
      disputeSettlementMutation.isPending ||
      cancelSettlementMutation.isPending;

    return (
      <TouchableOpacity
        style={[
          styles.rowCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.outline,
          },
        ]}
        onPress={() => setSelectedItem(item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={formatted.accessibleText}
      >
        <View style={styles.rowMain}>
          <View style={{ flex: 1, marginRight: theme.spacing.sm }}>
            <View style={styles.sentenceRow}>
              <Text
                style={[
                  theme.typography.body,
                  { color: theme.colors.text, fontWeight: '600', flex: 1 },
                ]}
                numberOfLines={2}
              >
                {formatted.sentence}
              </Text>
            </View>

            {formatted.note ? (
              <Text
                style={[
                  theme.typography.caption,
                  { color: theme.colors.muted, marginTop: 4 },
                ]}
                numberOfLines={1}
              >
                Note: {formatted.note}
              </Text>
            ) : null}

            <Text
              style={[
                theme.typography.caption,
                { color: theme.colors.muted, marginTop: 4, fontSize: 11 },
              ]}
            >
              {formatted.timeAgo}
            </Text>
          </View>

          {renderStatusChip(formatted.statusState, formatted.statusChip)}
        </View>

        {/* Action Buttons if allowed by server capability flags (Case SH3) */}
        {(formatted.canConfirm ||
          formatted.canDispute ||
          formatted.canCancel ||
          formatted.canUndo) && (
          <View style={styles.rowActions}>
            {formatted.canConfirm && (
              <AppButton
                title="Confirm"
                variant="primary"
                disabled={isOffline || isMutating}
                onPress={() => handleConfirm(item)}
                style={styles.actionBtn}
                testID={`settlement-confirm-btn-${item.id}`}
              />
            )}
            {formatted.canDispute && (
              <AppButton
                title="Not received"
                variant="secondary"
                disabled={isOffline || isMutating}
                onPress={() => handleDispute(item)}
                style={styles.actionBtn}
                testID={`settlement-dispute-btn-${item.id}`}
              />
            )}
            {formatted.canCancel && (
              <AppButton
                title={item.status === 'disputed' ? 'Cancel payment' : 'Cancel'}
                variant="secondary"
                disabled={isOffline || isMutating}
                onPress={() => handleCancel(item)}
                style={styles.actionBtn}
                testID={`settlement-cancel-btn-${item.id}`}
              />
            )}
            {formatted.canUndo && (
              <AppButton
                title="Undo"
                variant="secondary"
                disabled={isOffline || isMutating}
                onPress={() => handleCancel(item)}
                style={styles.actionBtn}
                testID={`settlement-undo-btn-${item.id}`}
              />
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Detail Modal Content (Case SH5)
  const renderDetailModal = () => {
    if (!selectedItem) return null;

    const formatted = formatSettlementHistoryRow(selectedItem, currentUserId, nameResolver);
    const fromName = nameResolver(selectedItem.from_user);
    const toName = nameResolver(selectedItem.to_user);
    const payerDisplay = selectedItem.from_user === currentUserId ? 'You' : fromName;
    const receiverDisplay = selectedItem.to_user === currentUserId ? 'You' : toName;

    const isMutating =
      confirmSettlementMutation.isPending ||
      disputeSettlementMutation.isPending ||
      cancelSettlementMutation.isPending;

    return (
      <Modal
        visible={Boolean(selectedItem)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedItem(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedItem(null)}>
          <Pressable
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.sheet,
                padding: theme.spacing.xl,
              },
            ]}
          >
            <View style={styles.sheetHandle} />

            <View style={styles.detailHeader}>
              <Text
                style={[
                  theme.typography.screenTitle,
                  { color: theme.colors.text, fontWeight: '700' },
                ]}
              >
                {formatMoney(selectedItem.amount_minor)}
              </Text>
              {renderStatusChip(formatted.statusState, formatted.statusChip)}
            </View>

            <Text
              style={[
                theme.typography.body,
                { color: theme.colors.muted, marginTop: 4, marginBottom: theme.spacing.lg },
              ]}
            >
              {formatted.sentence}
            </Text>

            <ScrollView style={{ maxHeight: 300 }}>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.colors.muted }]}>Paid by</Text>
                <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                  {payerDisplay}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.colors.muted }]}>Paid to</Text>
                <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                  {receiverDisplay}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.colors.muted }]}>Method</Text>
                <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                  {formatted.methodLabel}
                </Text>
              </View>

              {selectedItem.note ? (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.colors.muted }]}>Note</Text>
                  <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                    {selectedItem.note}
                  </Text>
                </View>
              ) : null}

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.colors.muted }]}>Recorded at</Text>
                <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                  {new Date(selectedItem.created_at).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </Text>
              </View>

              {selectedItem.confirmed_at ? (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.colors.muted }]}>
                    Confirmed at
                  </Text>
                  <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                    {new Date(selectedItem.confirmed_at).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            {/* Modal Actions */}
            <View style={{ marginTop: theme.spacing.lg }}>
              {formatted.canConfirm && (
                <AppButton
                  title="Confirm Payment"
                  variant="primary"
                  disabled={isOffline || isMutating}
                  onPress={() => handleConfirm(selectedItem)}
                  fullWidth
                  style={{ marginBottom: 8 }}
                />
              )}
              {formatted.canDispute && (
                <AppButton
                  title="Mark as Not Received"
                  variant="secondary"
                  disabled={isOffline || isMutating}
                  onPress={() => handleDispute(selectedItem)}
                  fullWidth
                  style={{ marginBottom: 8 }}
                />
              )}
              {(formatted.canCancel || formatted.canUndo) && (
                <AppButton
                  title={formatted.canUndo ? 'Undo Confirmation' : 'Cancel Payment'}
                  variant="secondary"
                  disabled={isOffline || isMutating}
                  onPress={() => handleCancel(selectedItem)}
                  fullWidth
                  style={{ marginBottom: 8 }}
                />
              )}
              <AppButton
                title="Close"
                variant="secondary"
                onPress={() => setSelectedItem(null)}
                fullWidth
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  return (
    <Screen padding={false}>
      <AppHeader
        title="Payment History"
        subtitle={group?.name || 'Group'}
        showBack
        onBack={() => router.back()}
      />

      {isOffline && <OfflineBanner />}

      {/* Loading Skeleton */}
      {isLoading && !isRefetching ? (
        <View style={{ padding: theme.spacing.lg }}>
          <LoadingSkeleton variant="card" count={4} />
        </View>
      ) : isError ? (
        <View style={styles.centerContainer}>
          <ErrorState
            title="Could not load payment history"
            message={toFriendlyMessage(error)}
            onRetry={() => refetch()}
            retryTitle="Try Again"
          />
        </View>
      ) : items.length === 0 ? (
        /* Empty State (Case SH6: "No payments yet.") */
        <View style={styles.centerContainer}>
          <EmptyState
            icon="receipt-outline"
            title="No payments yet."
            message="Recorded and confirmed payments in this group will appear here."
          />
        </View>
      ) : (
        /* Keyset infinite scroll list (Case SH1, SH7) */
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          contentContainerStyle={[styles.listContent, { padding: theme.spacing.lg }]}
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
      )}

      {renderDetailModal()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  rowCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  rowMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sentenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  rowActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
    gap: 8,
  },
  actionBtn: {
    minWidth: 80,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ccc',
    alignSelf: 'center',
    marginBottom: 16,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  detailLabel: {
    fontSize: 14,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
});
