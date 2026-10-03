import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/components/AppButton';
import { Avatar } from '@/components/Avatar';
import { ErrorState } from '@/components/ErrorState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { SettleUpSheet } from '@/components/balances/SettleUpSheet';
import { useSnackbar } from '@/components/Snackbar';
import {
  useCancelSettlement,
  useConfirmSettlement,
  useDisputeSettlement,
  useGroupBalances,
  useSettlements,
} from '@/hooks/useSettlements';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { toFriendlyMessage } from '@/lib/errors';
import {
  ALL_SETTLED_SUBTITLE,
  ALL_SETTLED_TITLE,
  formatMemberBalance,
  formatNetSummary,
  formatPendingSettlement,
  formatSuggestedPayment,
  sortMembersForBalances,
  sortPendingSettlements,
  SUGGESTIONS_COPY,
  SuggestedPaymentItem,
} from '@/lib/money/balanceText';
import { useAppTheme } from '@/lib/theme';
import { GroupMemberItem } from '@/types/database';

export interface GroupBalancesTabProps {
  groupId: string;
  groupName?: string;
  members: GroupMemberItem[];
  currentUserId?: string;
  onSettleUpPress?: (payment: SuggestedPaymentItem) => void;
  onMarkReceivedPress?: (payment: SuggestedPaymentItem) => void;
  onRecordPaymentPress?: () => void;
  onPaymentHistoryPress?: () => void;
}

export function GroupBalancesTab({
  groupId,
  members,
  currentUserId = '',
  onSettleUpPress,
  onMarkReceivedPress,
  onRecordPaymentPress,
  onPaymentHistoryPress,
}: GroupBalancesTabProps) {
  const theme = useAppTheme();
  const { isOffline } = useNetworkStatus();
  const { showSnackbar } = useSnackbar();

  // Queries
  const {
    data: balanceData,
    isLoading: isBalancesLoading,
    isRefetching: isBalancesRefetching,
    isError: isBalancesError,
    error: balancesError,
    refetch: refetchBalances,
  } = useGroupBalances(groupId);

  const {
    data: settlements = [],
    isRefetching: isSettlementsRefetching,
    refetch: refetchSettlements,
  } = useSettlements(groupId);

  // Mutations
  const confirmSettlementMutation = useConfirmSettlement(groupId);
  const disputeSettlementMutation = useDisputeSettlement(groupId);
  const cancelSettlementMutation = useCancelSettlement(groupId);

  // Local Settle Up Sheet State
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetMode, setSheetMode] = useState<
    'settle_up' | 'mark_received' | 'record_payment'
  >('settle_up');
  const [sheetCounterpartId, setSheetCounterpartId] = useState<string | undefined>();
  const [sheetInitialAmountMinor, setSheetInitialAmountMinor] = useState<number>(0);
  const [sheetExpectedDueMinor, setSheetExpectedDueMinor] = useState<number>(0);

  // Resolve member display name from GroupMemberItem list (Phase 3)
  const nameResolver = useCallback(
    (userId: string) => {
      const found = members.find((m) => m.user_id === userId);
      return found?.name || 'Former member';
    },
    [members]
  );

  // Filter pending or disputed payments involving the caller or active in group (BU4)
  const pendingSettlements = useMemo(() => {
    const rawPending = settlements.filter(
      (s) =>
        (s.status === 'pending' || s.status === 'disputed') &&
        (s.from_user === currentUserId || s.to_user === currentUserId)
    );
    const formatted = rawPending.map((s) =>
      formatPendingSettlement(s, currentUserId, nameResolver)
    );
    return sortPendingSettlements(formatted);
  }, [settlements, currentUserId, nameResolver]);

  const handleRefresh = async () => {
    await Promise.all([refetchBalances(), refetchSettlements()]);
  };

  // BU9: not_a_member handling
  const rawError = balancesError ? (balancesError as { message?: string }).message || '' : '';
  const isNotMember =
    rawError.includes('not_a_member') ||
    rawError.includes('not_member') ||
    rawError.includes('28000');

  if (isNotMember) {
    return (
      <View style={[styles.centerContainer, { padding: theme.spacing.xl }]}>
        <Ionicons
          name="exit-outline"
          size={56}
          color={theme.colors.muted}
          style={{ marginBottom: theme.spacing.md }}
        />
        <Text
          style={[
            theme.typography.sectionTitle,
            { color: theme.colors.text, marginBottom: theme.spacing.sm, textAlign: 'center' },
          ]}
        >
          {"You're no longer in this group"}
        </Text>
        <Text
          style={[
            theme.typography.body,
            { color: theme.colors.muted, textAlign: 'center', marginBottom: theme.spacing.xl },
          ]}
        >
          You have been removed or left this group.
        </Text>
        <AppButton
          title="Back to Groups"
          variant="primary"
          onPress={() => router.replace('/(tabs)/groups' as any)}
        />
      </View>
    );
  }

  if (isBalancesLoading && !balanceData) {
    return (
      <View style={{ padding: theme.spacing.lg }} testID="balances-loading">
        <LoadingSkeleton variant="card" count={1} />
        <View style={{ height: theme.spacing.lg }} />
        <LoadingSkeleton variant="card" count={3} />
      </View>
    );
  }

  if (isBalancesError) {
    return (
      <ErrorState
        title="Could not load balances"
        message={toFriendlyMessage(balancesError)}
        onRetry={handleRefresh}
        retryLoading={isBalancesRefetching}
      />
    );
  }

  const myNetMinor = balanceData?.my_net_minor ?? 0;
  const netSummary = formatNetSummary(myNetMinor);
  const payments = balanceData?.payments || [];
  const rawMembers = balanceData?.members || [];

  const allSettled =
    payments.length === 0 &&
    pendingSettlements.length === 0 &&
    (rawMembers.length === 0 || rawMembers.every((m) => m.net_minor === 0));

  const sortedMembers = sortMembersForBalances(rawMembers, currentUserId);

  // Trigger Settle Up
  const handleOpenSettleUp = (payment: SuggestedPaymentItem) => {
    if (onSettleUpPress) {
      onSettleUpPress(payment);
      return;
    }
    setSheetMode('settle_up');
    setSheetCounterpartId(payment.to_user);
    setSheetInitialAmountMinor(payment.amount_minor);
    setSheetExpectedDueMinor(payment.amount_minor);
    setSheetVisible(true);
  };

  // Trigger Mark Received
  const handleOpenMarkReceived = (payment: SuggestedPaymentItem) => {
    if (onMarkReceivedPress) {
      onMarkReceivedPress(payment);
      return;
    }
    setSheetMode('mark_received');
    setSheetCounterpartId(payment.from_user);
    setSheetInitialAmountMinor(payment.amount_minor);
    setSheetExpectedDueMinor(payment.amount_minor);
    setSheetVisible(true);
  };

  // Trigger Record Payment
  const handleOpenRecordPayment = () => {
    if (onRecordPaymentPress) {
      onRecordPaymentPress();
      return;
    }
    setSheetMode('record_payment');
    setSheetCounterpartId(undefined);
    setSheetInitialAmountMinor(0);
    setSheetExpectedDueMinor(0);
    setSheetVisible(true);
  };

  // Receiver confirms pending payment (ST1, ST6)
  const handleConfirmPending = (item: ReturnType<typeof formatPendingSettlement>) => {
    confirmSettlementMutation.mutate(item.id, {
      onSuccess: () => {
        showSnackbar({
          message: `Confirmed ${item.amountText} from ${item.counterpartName}`,
          action: {
            label: 'UNDO',
            onPress: () => cancelSettlementMutation.mutate(item.id),
          },
          duration: 8000,
        });
      },
      onError: (err) => showSnackbar({ message: toFriendlyMessage(err) }),
    });
  };

  // Receiver disputes pending payment (ST2)
  const handleDisputePending = (item: ReturnType<typeof formatPendingSettlement>) => {
    Alert.alert(
      'Mark as not received?',
      `${item.counterpartName} will see that you marked this as not received.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Not Received',
          style: 'destructive',
          onPress: () => {
            disputeSettlementMutation.mutate(item.id, {
              onSuccess: () => {
                showSnackbar({
                  message: `Marked payment from ${item.counterpartName} as not received.`,
                });
              },
              onError: (err) => showSnackbar({ message: toFriendlyMessage(err) }),
            });
          },
        },
      ]
    );
  };

  // Payer cancels pending/disputed payment (ST4, ST5)
  const handleCancelPending = (item: ReturnType<typeof formatPendingSettlement>) => {
    Alert.alert('Cancel payment?', 'Are you sure you want to cancel this payment?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancel Payment',
        style: 'destructive',
        onPress: () => {
          cancelSettlementMutation.mutate(item.id, {
            onSuccess: () => {
              showSnackbar({ message: 'Payment cancelled.' });
            },
            onError: (err) => showSnackbar({ message: toFriendlyMessage(err) }),
          });
        },
      },
    ]);
  };

  return (
    <>
      <FlatList
        testID="balances-tab-container"
        data={[{ key: 'content' }]}
        keyExtractor={(item) => item.key}
        refreshControl={
          <RefreshControl
            refreshing={isBalancesRefetching || isSettlementsRefetching}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 80 }}
        renderItem={() => (
          <View>
            {/* BU8: Offline warning banner */}
            {isOffline && (
              <View
                testID="balances-offline-banner"
                style={[
                  styles.offlineBanner,
                  {
                    backgroundColor: theme.colors.surfaceVariant,
                    borderColor: theme.colors.outline,
                    borderRadius: theme.radius.card,
                    marginBottom: theme.spacing.md,
                    padding: theme.spacing.md,
                  },
                ]}
              >
                <Ionicons
                  name="cloud-offline-outline"
                  size={20}
                  color={theme.colors.owe}
                  style={{ marginRight: theme.spacing.sm }}
                />
                <Text
                  style={[
                    theme.typography.caption,
                    { color: theme.colors.text, flex: 1, fontWeight: '500' },
                  ]}
                >
                  {"You're offline. Reconnect to record or settle payments."}
                </Text>
              </View>
            )}

            {/* BU1: Top Card */}
            <View
              testID="balances-top-card"
              accessibilityLabel={netSummary.accessibleText}
              style={[
                styles.topCard,
                {
                  borderRadius: theme.radius.card,
                  padding: theme.spacing.xl,
                  marginBottom: theme.spacing.lg,
                  backgroundColor:
                    netSummary.state === 'owed'
                      ? theme.colors.owedContainer
                      : netSummary.state === 'owe'
                      ? theme.colors.oweContainer
                      : theme.colors.surfaceVariant,
                  borderWidth: 1,
                  borderColor:
                    netSummary.state === 'owed'
                      ? theme.colors.owed
                      : netSummary.state === 'owe'
                      ? theme.colors.owe
                      : theme.colors.outline,
                },
              ]}
            >
              <View style={styles.topCardHeader}>
                <View
                  style={[
                    styles.topCardIconCircle,
                    {
                      backgroundColor:
                        netSummary.state === 'owed'
                          ? theme.colors.owed
                          : netSummary.state === 'owe'
                          ? theme.colors.owe
                          : theme.colors.muted,
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      netSummary.state === 'owed'
                        ? 'arrow-down'
                        : netSummary.state === 'owe'
                        ? 'arrow-up'
                        : 'checkmark'
                    }
                    size={18}
                    color="#ffffff"
                  />
                </View>

                <Text
                  testID="balances-top-card-text"
                  style={[
                    theme.typography.screenTitle,
                    styles.topCardText,
                    {
                      color:
                        netSummary.state === 'owed'
                          ? theme.colors.owed
                          : netSummary.state === 'owe'
                          ? theme.colors.owe
                          : theme.colors.text,
                    },
                  ]}
                >
                  {netSummary.text}
                </Text>
              </View>

              <Text
                style={[
                  theme.typography.caption,
                  { color: theme.colors.muted, marginTop: theme.spacing.xs, textAlign: 'center' },
                ]}
              >
                {netSummary.state === 'owed'
                  ? 'Your net balance in this group'
                  : netSummary.state === 'owe'
                  ? 'Your net balance in this group'
                  : 'No one owes anything in this group'}
              </Text>
            </View>

            {/* Quick Action Bar (BU12: Record a payment, Payment history) */}
            <View style={styles.quickActionBar}>
              <Pressable
                onPress={handleOpenRecordPayment}
                disabled={isOffline}
                style={[
                  styles.quickActionBtn,
                  {
                    backgroundColor: theme.colors.primaryContainer,
                    borderColor: theme.colors.primary,
                  },
                ]}
                testID="balances-record-payment-btn"
              >
                <Ionicons name="card-outline" size={16} color={theme.colors.primary} />
                <Text
                  style={[
                    theme.typography.caption,
                    { color: theme.colors.primary, fontWeight: '700', marginLeft: 6 },
                  ]}
                >
                  Record Payment
                </Text>
              </Pressable>

              {onPaymentHistoryPress && (
                <Pressable
                  onPress={onPaymentHistoryPress}
                  style={[
                    styles.quickActionBtn,
                    {
                      backgroundColor: theme.colors.surfaceVariant,
                      borderColor: theme.colors.outline,
                    },
                  ]}
                  testID="balances-history-btn"
                >
                  <Ionicons name="time-outline" size={16} color={theme.colors.text} />
                  <Text
                    style={[
                      theme.typography.caption,
                      { color: theme.colors.text, fontWeight: '600', marginLeft: 6 },
                    ]}
                  >
                    History
                  </Text>
                </Pressable>
              )}
            </View>

            {/* BU4: Pending Payments Section */}
            {pendingSettlements.length > 0 && (
              <View testID="balances-pending-section" style={{ marginBottom: theme.spacing.xl }}>
                <View style={styles.sectionHeaderRow}>
                  <Text
                    style={[
                      theme.typography.sectionTitle,
                      { color: theme.colors.text },
                    ]}
                  >
                    Pending Payments
                  </Text>
                  <View
                    style={[
                      styles.pendingBadge,
                      { backgroundColor: theme.colors.oweContainer },
                    ]}
                  >
                    <Text
                      style={[
                        theme.typography.caption,
                        { color: theme.colors.owe, fontWeight: '700' },
                      ]}
                    >
                      {pendingSettlements.length}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.cardList,
                    {
                      backgroundColor: theme.colors.surface,
                      borderRadius: theme.radius.card,
                      borderColor: theme.colors.outline,
                    },
                  ]}
                >
                  {pendingSettlements.map((item, idx) => {
                    const isLast = idx === pendingSettlements.length - 1;
                    return (
                      <View
                        key={`pending-${item.id}`}
                        testID={`pending-settlement-row-${item.id}`}
                        accessibilityLabel={item.accessibleText}
                        style={[
                          styles.pendingRow,
                          !isLast && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: theme.colors.outline,
                          },
                          { padding: theme.spacing.md },
                        ]}
                      >
                        <View style={{ flex: 1, marginRight: theme.spacing.sm }}>
                          <Text
                            style={[
                              theme.typography.body,
                              { color: theme.colors.text, fontWeight: '600' },
                            ]}
                          >
                            {item.title}
                          </Text>
                          {item.subtitle && (
                            <Text
                              style={[
                                theme.typography.caption,
                                { color: theme.colors.muted, marginTop: 2 },
                              ]}
                            >
                              {item.subtitle}
                            </Text>
                          )}
                        </View>

                        {/* Actions for Pending row */}
                        <View style={styles.pendingActionButtonsRow}>
                          {item.canConfirm && (
                            <AppButton
                              title="Confirm"
                              variant="primary"
                              disabled={isOffline || confirmSettlementMutation.isPending}
                              onPress={() => handleConfirmPending(item)}
                              testID={`pending-confirm-btn-${item.id}`}
                              style={{ marginRight: 6, minWidth: 70 }}
                            />
                          )}

                          {item.canDispute && (
                            <AppButton
                              title="Not received"
                              variant="secondary"
                              disabled={isOffline || disputeSettlementMutation.isPending}
                              onPress={() => handleDisputePending(item)}
                              testID={`pending-dispute-btn-${item.id}`}
                              style={{ minWidth: 90 }}
                            />
                          )}

                          {item.canCancel && (
                            <AppButton
                              title={item.status === 'disputed' ? 'Cancel payment' : 'Cancel'}
                              variant="secondary"
                              disabled={isOffline || cancelSettlementMutation.isPending}
                              onPress={() => handleCancelPending(item)}
                              testID={`pending-cancel-btn-${item.id}`}
                              style={{ minWidth: 70 }}
                            />
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* BU5: Proper empty state if all settled up */}
            {allSettled ? (
              <View
                testID="balances-empty-state"
                style={[
                  styles.emptyStateCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radius.card,
                    borderColor: theme.colors.outline,
                    padding: theme.spacing.xxl,
                    marginTop: theme.spacing.md,
                  },
                ]}
              >
                <View
                  style={[
                    styles.emptyStateIconCircle,
                    { backgroundColor: theme.colors.owedContainer },
                  ]}
                >
                  <Ionicons
                    name="checkmark-done-circle-outline"
                    size={48}
                    color={theme.colors.owed}
                  />
                </View>
                <Text
                  style={[
                    theme.typography.sectionTitle,
                    { color: theme.colors.text, marginBottom: theme.spacing.xs, textAlign: 'center' },
                  ]}
                >
                  {ALL_SETTLED_TITLE}
                </Text>
                <Text
                  style={[
                    theme.typography.body,
                    { color: theme.colors.muted, textAlign: 'center', maxWidth: 280 },
                  ]}
                >
                  {ALL_SETTLED_SUBTITLE}
                </Text>
              </View>
            ) : (
              <>
                {/* BU2: Suggested Payments section */}
                {payments.length > 0 && (
                  <View testID="suggested-payments-section" style={{ marginBottom: theme.spacing.xl }}>
                    <Text
                      style={[
                        theme.typography.sectionTitle,
                        { color: theme.colors.text, marginBottom: 4 },
                      ]}
                    >
                      Suggested Payments
                    </Text>
                    {/* BU7: Copy line under suggestions */}
                    <Text
                      testID="suggested-payments-copy"
                      style={[
                        theme.typography.caption,
                        { color: theme.colors.muted, marginBottom: theme.spacing.md },
                      ]}
                    >
                      {SUGGESTIONS_COPY}
                    </Text>

                    <View
                      style={[
                        styles.cardList,
                        {
                          backgroundColor: theme.colors.surface,
                          borderRadius: theme.radius.card,
                          borderColor: theme.colors.outline,
                        },
                      ]}
                    >
                      {payments.map((payment, idx) => {
                        const formatted = formatSuggestedPayment(payment, currentUserId, nameResolver);
                        const isLast = idx === payments.length - 1;

                        return (
                          <View
                            key={`suggested-${payment.seq}`}
                            testID={`suggested-row-${payment.seq}`}
                            accessibilityLabel={formatted.accessibleText}
                            style={[
                              styles.suggestedRow,
                              !isLast && {
                                borderBottomWidth: StyleSheet.hairlineWidth,
                                borderBottomColor: theme.colors.outline,
                              },
                              { padding: theme.spacing.md },
                            ]}
                          >
                            <View style={{ flex: 1, marginRight: theme.spacing.sm }}>
                              <Text
                                style={[
                                  theme.typography.body,
                                  {
                                    color: formatted.isUserInvolved
                                      ? theme.colors.text
                                      : theme.colors.muted,
                                    fontWeight: formatted.isUserInvolved ? '600' : '400',
                                  },
                                ]}
                              >
                                {formatted.sentence}
                              </Text>
                            </View>

                            {/* Action button if user is involved (Settle up / Mark as received) */}
                            {formatted.action !== 'none' && (
                              <AppButton
                                title={formatted.actionLabel || ''}
                                variant={formatted.action === 'settle_up' ? 'primary' : 'secondary'}
                                disabled={isOffline}
                                onPress={() => {
                                  if (formatted.action === 'settle_up') {
                                    handleOpenSettleUp(payment);
                                  } else if (formatted.action === 'mark_received') {
                                    handleOpenMarkReceived(payment);
                                  }
                                }}
                                testID={`suggested-action-${formatted.action}-${payment.seq}`}
                              />
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* BU3: Everyone's Balances section */}
                {sortedMembers.length > 0 && (
                  <View testID="everyone-balances-section">
                    <Text
                      style={[
                        theme.typography.sectionTitle,
                        { color: theme.colors.text, marginBottom: theme.spacing.md },
                      ]}
                    >
                      {"Everyone's Balances"}
                    </Text>

                    <View
                      style={[
                        styles.cardList,
                        {
                          backgroundColor: theme.colors.surface,
                          borderRadius: theme.radius.card,
                          borderColor: theme.colors.outline,
                        },
                      ]}
                    >
                      {sortedMembers.map((member, idx) => {
                        const memberFormatted = formatMemberBalance(
                          member,
                          currentUserId,
                          nameResolver
                        );
                        const isLast = idx === sortedMembers.length - 1;

                        return (
                          <View
                            key={`member-${member.user_id}`}
                            testID={`member-balance-row-${member.user_id}`}
                            accessibilityLabel={memberFormatted.accessibleText}
                            style={[
                              styles.memberRow,
                              !isLast && {
                                borderBottomWidth: StyleSheet.hairlineWidth,
                                borderBottomColor: theme.colors.outline,
                              },
                              { padding: theme.spacing.md },
                            ]}
                          >
                            <View style={{ marginRight: theme.spacing.md }}>
                              <Avatar
                                name={memberFormatted.displayName}
                                size={36}
                              />
                            </View>

                            <View style={{ flex: 1, marginRight: theme.spacing.sm }}>
                              <Text
                                style={[
                                  theme.typography.body,
                                  {
                                    color: theme.colors.text,
                                    fontWeight: memberFormatted.isCurrentUser ? '700' : '500',
                                  },
                                ]}
                                numberOfLines={1}
                              >
                                {memberFormatted.displayName}
                              </Text>
                            </View>

                            {/* Balance status pill (Color never only signal; wording always explicit) */}
                            <View
                              style={[
                                styles.balancePill,
                                {
                                  backgroundColor:
                                    memberFormatted.state === 'owed'
                                      ? theme.colors.owedContainer
                                      : memberFormatted.state === 'owe'
                                      ? theme.colors.oweContainer
                                      : theme.colors.surfaceVariant,
                                  borderRadius: theme.radius.pill,
                                  paddingVertical: 4,
                                  paddingHorizontal: 10,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  theme.typography.caption,
                                  {
                                    color:
                                      memberFormatted.state === 'owed'
                                        ? theme.colors.owed
                                        : memberFormatted.state === 'owe'
                                        ? theme.colors.owe
                                        : theme.colors.muted,
                                    fontWeight: '600',
                                  },
                                ]}
                              >
                                {memberFormatted.text}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}
              </>
            )}
          </View>
        )}
      />

      {/* Settle Up / Mark Received / Record Payment Bottom Sheet */}
      <SettleUpSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        groupId={groupId}
        members={members}
        currentUserId={currentUserId}
        mode={sheetMode}
        initialCounterpartId={sheetCounterpartId}
        initialAmountMinor={sheetInitialAmountMinor}
        expectedDueMinor={sheetExpectedDueMinor}
      />
    </>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 300,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  topCard: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCardIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  topCardText: {
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  quickActionBar: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pendingBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  cardList: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  suggestedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pendingActionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balancePill: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateCard: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
});
