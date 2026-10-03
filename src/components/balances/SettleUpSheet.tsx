import React, { useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/components/AppButton';
import { Avatar } from '@/components/Avatar';
import { AmountKeypad } from '@/components/expenses/AmountKeypad';
import { useSnackbar } from '@/components/Snackbar';
import { useCancelSettlement, useCreateSettlement } from '@/hooks/useSettlements';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { toFriendlyMessage } from '@/lib/errors';
import {
  formatMoneyCompact,
  parseAmountToMinor,
} from '@/lib/money';
import {
  formatSettleComparisonText,
} from '@/lib/money/balanceText';
import { useAppTheme } from '@/lib/theme';
import { generateUuid } from '@/lib/uuid';
import { GroupMemberItem, SettlementMethod } from '@/types/database';

export interface SettleUpSheetProps {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  members: GroupMemberItem[];
  currentUserId: string;
  mode: 'settle_up' | 'mark_received' | 'record_payment';
  initialCounterpartId?: string;
  initialAmountMinor?: number;
  expectedDueMinor?: number;
}

export function SettleUpSheet(props: SettleUpSheetProps) {
  if (!props.visible) return null;

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="slide"
      onRequestClose={props.onClose}
    >
      <SettleUpSheetContent {...props} />
    </Modal>
  );
}

function SettleUpSheetContent({
  onClose,
  groupId,
  members,
  currentUserId,
  mode,
  initialCounterpartId,
  initialAmountMinor = 0,
  expectedDueMinor,
}: Omit<SettleUpSheetProps, 'visible'>) {
  const theme = useAppTheme();
  const { isOffline } = useNetworkStatus();
  const { showSnackbar } = useSnackbar();

  const createSettlementMutation = useCreateSettlement(groupId);
  const cancelSettlementMutation = useCancelSettlement(groupId);

  // Active counterpart candidates (exclude current user and inactive)
  const eligibleMembers = useMemo(() => {
    return members.filter(
      (m) => m.user_id !== currentUserId && m.status === 'active'
    );
  }, [members, currentUserId]);

  const defaultCounterpart = useMemo(() => {
    if (initialCounterpartId) return initialCounterpartId;
    return eligibleMembers.length > 0 ? eligibleMembers[0].user_id : '';
  }, [initialCounterpartId, eligibleMembers]);

  // Session client_request_id (SC9: one per sheet session, retained on retry)
  const clientRequestIdRef = useRef<string>(generateUuid());

  // Direction: 'payer' (I paid them) or 'receiver' (They paid me / I received)
  const [direction, setDirection] = useState<'payer' | 'receiver'>(
    mode === 'mark_received' ? 'receiver' : 'payer'
  );
  const [counterpartId, setCounterpartId] = useState<string>(defaultCounterpart);
  const [amountStr, setAmountStr] = useState<string>(
    initialAmountMinor > 0 ? (initialAmountMinor / 100).toFixed(2).replace(/\.00$/, '') : ''
  );
  const [method, setMethod] = useState<SettlementMethod>('cash');
  const [note, setNote] = useState<string>('');
  const [showKeypad, setShowKeypad] = useState<boolean>(true);

  const counterpartMember = useMemo(() => {
    return members.find((m) => m.user_id === counterpartId);
  }, [members, counterpartId]);

  const counterpartName = counterpartMember?.name || 'Member';

  // Amount parsing
  const parsedMinor = useMemo(() => {
    return parseAmountToMinor(amountStr);
  }, [amountStr]);

  const enteredMinor = parsedMinor ?? 0;
  const targetExpectedMinor = expectedDueMinor ?? initialAmountMinor;

  // Live sentence under amount (SC10, SC11, SC12)
  const liveComparisonSentence = useMemo(() => {
    return formatSettleComparisonText({
      direction,
      counterpartName,
      enteredMinor,
      expectedMinor: targetExpectedMinor,
    });
  }, [direction, counterpartName, enteredMinor, targetExpectedMinor]);

  const isValidAmount = enteredMinor >= 1 && enteredMinor <= 1000000000;
  const canSubmit =
    Boolean(counterpartId) &&
    isValidAmount &&
    !isOffline &&
    !createSettlementMutation.isPending;

  const handleSubmit = async () => {
    if (!canSubmit || !counterpartId) return;

    const fromUser = direction === 'payer' ? currentUserId : counterpartId;
    const toUser = direction === 'payer' ? counterpartId : currentUserId;

    try {
      const settlementId = await createSettlementMutation.mutateAsync({
        groupId,
        clientRequestId: clientRequestIdRef.current,
        fromUser,
        toUser,
        amountMinor: enteredMinor,
        method,
        note: note.trim() || null,
      });

      onClose();

      const formattedAmount = formatMoneyCompact(enteredMinor);
      if (direction === 'payer') {
        // SC1: Payer created -> Pending
        showSnackbar({
          message: `Sent to ${counterpartName} for confirmation.`,
        });
      } else {
        // SC2, ST18: Receiver created -> Confirmed instantly with 8-second Undo
        showSnackbar({
          message: `Confirmed ${formattedAmount} from ${counterpartName}`,
          action: {
            label: 'UNDO',
            onPress: () => {
              cancelSettlementMutation.mutate(settlementId);
            },
          },
          duration: 8000,
        });
      }
    } catch (err: any) {
      const rawMsg = err?.message || '';
      // SC5: payer_not_member / receiver_not_member closes sheet
      if (
        rawMsg.includes('payer_not_member') ||
        rawMsg.includes('receiver_not_member')
      ) {
        onClose();
        showSnackbar({ message: toFriendlyMessage(err) });
      } else {
        showSnackbar({ message: toFriendlyMessage(err) });
      }
    }
  };

  const actionButtonTitle = useMemo(() => {
    const formattedAmount = enteredMinor > 0 ? ` ${formatMoneyCompact(enteredMinor)}` : '';
    if (direction === 'payer') {
      return `I paid ${counterpartName}${formattedAmount}`;
    }
    return `I received${formattedAmount} from ${counterpartName}`;
  }, [direction, counterpartName, enteredMinor]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.backdrop}
    >
      <Pressable style={styles.dismissArea} onPress={onClose} />

        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outline,
            },
          ]}
          testID="settle-up-sheet"
        >
          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={[theme.typography.sectionTitle, { color: theme.colors.text }]}>
              {mode === 'record_payment'
                ? 'Record a payment'
                : direction === 'payer'
                ? 'Settle up'
                : 'Mark as received'}
            </Text>

            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close"
              testID="settle-sheet-close-btn"
            >
              <Ionicons name="close" size={24} color={theme.colors.muted} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Direction Selector (Record Payment mode) */}
            {mode === 'record_payment' && (
              <View style={styles.sectionRow}>
                <Text style={[theme.typography.caption, { color: theme.colors.muted, marginBottom: 8 }]}>
                  DIRECTION
                </Text>
                <View style={styles.directionToggleRow}>
                  <Pressable
                    onPress={() => setDirection('payer')}
                    style={[
                      styles.toggleChip,
                      {
                        backgroundColor:
                          direction === 'payer'
                            ? theme.colors.oweContainer
                            : theme.colors.surfaceVariant,
                        borderColor:
                          direction === 'payer'
                            ? theme.colors.owe
                            : theme.colors.outline,
                      },
                    ]}
                    testID="settle-direction-payer"
                  >
                    <Text
                      style={[
                        theme.typography.body,
                        {
                          fontWeight: direction === 'payer' ? '700' : '400',
                          color:
                            direction === 'payer'
                              ? theme.colors.owe
                              : theme.colors.text,
                        },
                      ]}
                    >
                      I paid them
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setDirection('receiver')}
                    style={[
                      styles.toggleChip,
                      {
                        backgroundColor:
                          direction === 'receiver'
                            ? theme.colors.owedContainer
                            : theme.colors.surfaceVariant,
                        borderColor:
                          direction === 'receiver'
                            ? theme.colors.owed
                            : theme.colors.outline,
                      },
                    ]}
                    testID="settle-direction-receiver"
                  >
                    <Text
                      style={[
                        theme.typography.body,
                        {
                          fontWeight: direction === 'receiver' ? '700' : '400',
                          color:
                            direction === 'receiver'
                              ? theme.colors.owed
                              : theme.colors.text,
                        },
                      ]}
                    >
                      They paid me
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Counterpart Selector (Record Payment mode or single display) */}
            {mode === 'record_payment' ? (
              <View style={styles.sectionRow}>
                <Text style={[theme.typography.caption, { color: theme.colors.muted, marginBottom: 8 }]}>
                  {direction === 'payer' ? 'PAY TO' : 'RECEIVED FROM'}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.memberChipsRow}>
                    {eligibleMembers.map((m) => {
                      const isSelected = m.user_id === counterpartId;
                      return (
                        <Pressable
                          key={m.user_id}
                          onPress={() => setCounterpartId(m.user_id)}
                          style={[
                            styles.memberChip,
                            {
                              backgroundColor: isSelected
                                ? theme.colors.primaryContainer
                                : theme.colors.surfaceVariant,
                              borderColor: isSelected
                                ? theme.colors.primary
                                : theme.colors.outline,
                            },
                          ]}
                          testID={`settle-member-${m.user_id}`}
                        >
                          <Avatar name={m.name} size={24} />
                          <Text
                            style={[
                              theme.typography.body,
                              {
                                marginLeft: 8,
                                fontWeight: isSelected ? '700' : '400',
                                color: isSelected
                                  ? theme.colors.primary
                                  : theme.colors.text,
                              },
                            ]}
                          >
                            {m.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            ) : (
              <View style={[styles.sectionRow, styles.counterpartBanner]}>
                <Avatar name={counterpartName} size={36} />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={[theme.typography.caption, { color: theme.colors.muted }]}>
                    {direction === 'payer' ? 'Paying' : 'Receiving from'}
                  </Text>
                  <Text
                    style={[
                      theme.typography.body,
                      { color: theme.colors.text, fontWeight: '700' },
                    ]}
                  >
                    {counterpartName}
                  </Text>
                </View>
              </View>
            )}

            {/* Amount Display */}
            <View style={styles.amountDisplayBox}>
              <Pressable
                onPress={() => setShowKeypad((prev) => !prev)}
                style={styles.amountPressable}
                testID="settle-amount-display"
              >
                <Text
                  style={[
                    styles.amountCurrencySymbol,
                    { color: theme.colors.primary },
                  ]}
                >
                  ₹
                </Text>
                <Text
                  style={[
                    styles.amountText,
                    {
                      color:
                        enteredMinor > 0 ? theme.colors.text : theme.colors.muted,
                    },
                  ]}
                >
                  {amountStr || '0'}
                </Text>
              </Pressable>

              {/* Live sentence under amount (SC10, SC11, SC12) */}
              <Text
                testID="settle-comparison-text"
                style={[
                  theme.typography.caption,
                  styles.comparisonText,
                  {
                    color:
                      enteredMinor > targetExpectedMinor && targetExpectedMinor > 0
                        ? theme.colors.owe
                        : theme.colors.muted,
                  },
                ]}
              >
                {liveComparisonSentence}
              </Text>
            </View>

            {/* Big Keypad (EU1, SC11) */}
            {showKeypad && (
              <View style={styles.keypadWrapper} testID="settle-keypad-wrapper">
                <AmountKeypad
                  value={amountStr}
                  onChange={setAmountStr}
                  onExceedMax={() => {
                    showSnackbar({
                      message: 'Maximum amount is ₹1,00,00,000.',
                    });
                  }}
                />
              </View>
            )}

            {/* Payment Method Chips (SC7: Cash, Other) */}
            <View style={styles.sectionRow}>
              <Text style={[theme.typography.caption, { color: theme.colors.muted, marginBottom: 8 }]}>
                PAYMENT METHOD
              </Text>
              <View style={styles.methodChipsRow}>
                <Pressable
                  onPress={() => setMethod('cash')}
                  style={[
                    styles.methodChip,
                    {
                      backgroundColor:
                        method === 'cash'
                          ? theme.colors.primaryContainer
                          : theme.colors.surfaceVariant,
                      borderColor:
                        method === 'cash'
                          ? theme.colors.primary
                          : theme.colors.outline,
                    },
                  ]}
                  testID="settle-method-cash"
                >
                  <Ionicons
                    name="cash-outline"
                    size={18}
                    color={
                      method === 'cash'
                        ? theme.colors.primary
                        : theme.colors.text
                    }
                  />
                  <Text
                    style={[
                      theme.typography.body,
                      {
                        marginLeft: 6,
                        fontWeight: method === 'cash' ? '700' : '400',
                        color:
                          method === 'cash'
                            ? theme.colors.primary
                            : theme.colors.text,
                      },
                    ]}
                  >
                    Cash
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setMethod('other')}
                  style={[
                    styles.methodChip,
                    {
                      backgroundColor:
                        method === 'other'
                          ? theme.colors.primaryContainer
                          : theme.colors.surfaceVariant,
                      borderColor:
                        method === 'other'
                          ? theme.colors.primary
                          : theme.colors.outline,
                    },
                  ]}
                  testID="settle-method-other"
                >
                  <Ionicons
                    name="ellipsis-horizontal-circle-outline"
                    size={18}
                    color={
                      method === 'other'
                        ? theme.colors.primary
                        : theme.colors.text
                    }
                  />
                  <Text
                    style={[
                      theme.typography.body,
                      {
                        marginLeft: 6,
                        fontWeight: method === 'other' ? '700' : '400',
                        color:
                          method === 'other'
                            ? theme.colors.primary
                            : theme.colors.text,
                      },
                    ]}
                  >
                    Other
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Optional Note (SC8: max 100 characters) */}
            <View style={styles.sectionRow}>
              <View style={styles.noteHeaderRow}>
                <Text style={[theme.typography.caption, { color: theme.colors.muted }]}>
                  NOTE (OPTIONAL)
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.muted }]}>
                  {note.length}/100
                </Text>
              </View>
              <TextInput
                value={note}
                onChangeText={setNote}
                maxLength={100}
                placeholder="e.g. Google Pay, split for lunch"
                placeholderTextColor={theme.colors.muted}
                style={[
                  styles.noteInput,
                  {
                    backgroundColor: theme.colors.surfaceVariant,
                    borderColor: theme.colors.outline,
                    color: theme.colors.text,
                  },
                ]}
                testID="settle-note-input"
              />
            </View>

            {/* Offline Explanation Banner (SC13) */}
            {isOffline && (
              <View
                style={[
                  styles.offlineNotice,
                  {
                    backgroundColor: theme.colors.surfaceVariant,
                    borderColor: theme.colors.outline,
                  },
                ]}
                testID="settle-offline-notice"
              >
                <Ionicons
                  name="cloud-offline-outline"
                  size={18}
                  color={theme.colors.owe}
                />
                <Text
                  style={[
                    theme.typography.caption,
                    { color: theme.colors.text, marginLeft: 8, flex: 1 },
                  ]}
                >
                  {"You're offline. Reconnect to record or settle payments."}
                </Text>
              </View>
            )}

            {/* Submit Button */}
            <View style={styles.actionButtonContainer}>
              <AppButton
                title={actionButtonTitle}
                variant="primary"
                loading={createSettlementMutation.isPending}
                disabled={!canSubmit}
                onPress={handleSubmit}
                testID="settle-submit-btn"
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    maxHeight: '92%',
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  closeButton: {
    padding: 4,
  },
  scrollBody: {
    paddingHorizontal: 20,
  },
  sectionRow: {
    marginBottom: 16,
  },
  directionToggleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  counterpartBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  amountDisplayBox: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  amountPressable: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  amountCurrencySymbol: {
    fontSize: 28,
    fontWeight: '700',
    marginRight: 4,
  },
  amountText: {
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1,
  },
  comparisonText: {
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '500',
  },
  keypadWrapper: {
    marginBottom: 16,
    alignItems: 'center',
  },
  methodChipsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  methodChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
  },
  noteHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  offlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  actionButtonContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
});
