import React, { useCallback } from 'react';
import {
  FlatList,
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
import { useGroupBalances } from '@/hooks/useSettlements';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { toFriendlyMessage } from '@/lib/errors';
import {
  ALL_SETTLED_SUBTITLE,
  ALL_SETTLED_TITLE,
  formatMemberBalance,
  formatNetSummary,
  formatSuggestedPayment,
  sortMembersForBalances,
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
}: GroupBalancesTabProps) {
  const theme = useAppTheme();
  const { isOffline } = useNetworkStatus();

  const {
    data: balanceData,
    isLoading,
    isRefetching,
    isError,
    error,
    refetch,
  } = useGroupBalances(groupId);

  // Resolve member display name from GroupMemberItem list (Phase 3)
  const nameResolver = useCallback(
    (userId: string) => {
      const found = members.find((m) => m.user_id === userId);
      return found?.name || 'Former member';
    },
    [members]
  );

  // BU9: not_a_member handling
  const rawError = error ? (error as { message?: string }).message || '' : '';
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

  if (isLoading) {
    return (
      <View style={{ padding: theme.spacing.lg }} testID="balances-loading">
        <LoadingSkeleton variant="card" count={1} />
        <View style={{ height: theme.spacing.lg }} />
        <LoadingSkeleton variant="card" count={3} />
      </View>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Could not load balances"
        message={toFriendlyMessage(error)}
        onRetry={refetch}
        retryLoading={isRefetching}
      />
    );
  }

  const myNetMinor = balanceData?.my_net_minor ?? 0;
  const netSummary = formatNetSummary(myNetMinor);
  const payments = balanceData?.payments || [];
  const rawMembers = balanceData?.members || [];

  const allSettled =
    payments.length === 0 &&
    (rawMembers.length === 0 || rawMembers.every((m) => m.net_minor === 0));

  const sortedMembers = sortMembersForBalances(rawMembers, currentUserId);

  return (
    <FlatList
      testID="balances-tab-container"
      data={[{ key: 'content' }]}
      keyExtractor={(item) => item.key}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
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
                marginBottom: theme.spacing.xl,
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
                                  onSettleUpPress?.(payment);
                                } else if (formatted.action === 'mark_received') {
                                  onMarkReceivedPress?.(payment);
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
  cardList: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  suggestedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
