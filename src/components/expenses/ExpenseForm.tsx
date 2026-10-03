import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import {
  AmountDisplay,
  AmountKeypad,
  AppButton,
  AppHeader,
  CategoryChips,
  LoadingSkeleton,
  OfflineBanner,
  PaidBySheet,
  Screen,
  SplitParticipantConfig,
  SplitSheet,
  SplitType,
  useSnackbar,
} from '@/components';
import {
  useAddExpense,
  useAuth,
  useEditExpense,
  useGroup,
  useGroupMembers,
  useNetworkStatus,
} from '@/hooks';
import {
  computeShares,
  parseAmountToMinor,
  previewForUser,
} from '@/lib/money';
import { createClientRequestId } from '@/lib/expenses/clientRequestId';
import {
  formatCalendarDate,
  formatDateChipLabel,
  getMaxExpenseDate,
  getMinExpenseDate,
  getTodayDateString,
  parseCalendarDate,
} from '@/lib/expenses/date';
import { setLastUsedGroupId } from '@/lib/expenses/lastUsedGroup';
import { getParticipantNotMemberId, toFriendlyMessage } from '@/lib/errors';
import { useAppTheme } from '@/lib/theme';
import { ExpenseDetailResponse, ExpenseSplitItem } from '@/lib/api/expenses';

export interface ExpenseFormProps {
  mode: 'add' | 'edit';
  groupId: string;
  expenseId?: string;
  initialData?: ExpenseDetailResponse;
  onSuccess?: () => void;
}

export function ExpenseForm({
  mode,
  groupId,
  expenseId,
  initialData,
  onSuccess,
}: ExpenseFormProps) {
  const theme = useAppTheme();
  const { user } = useAuth();
  const currentUserId = user?.id ?? '';
  const { isOffline } = useNetworkStatus();
  const { showSnackbar } = useSnackbar();

  // Queries
  const { data: group, isLoading: groupLoading } = useGroup(groupId);
  const { data: members = [], isLoading: membersLoading } = useGroupMembers(groupId, false);

  // Mutations
  const addMutation = useAddExpense(groupId);
  const editMutation = useEditExpense(groupId);

  // Active members only
  const activeMembers = useMemo(
    () => members.filter((m) => m.status === 'active'),
    [members]
  );

  // Member name lookup for error details & preview
  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.user_id.toLowerCase(), m.name || 'Member');
    }
    return map;
  }, [members]);

  const memberNameResolver = useCallback(
    (userId: string) => memberNameMap.get(userId.toLowerCase()),
    [memberNameMap]
  );

  // Idempotency: generate clientRequestId once per form session (EA6, EA7)
  const clientRequestIdRef = useRef<string>(createClientRequestId());

  // Form states
  const [amountText, setAmountText] = useState<string>(() => {
    if (mode === 'edit' && initialData) {
      return (initialData.expense.amount_minor / 100).toFixed(2).replace(/\.00$/, '');
    }
    return '';
  });

  const [description, setDescription] = useState<string>(() => {
    return initialData?.expense.description ?? '';
  });

  const [category, setCategory] = useState<string | null>(() => {
    return initialData?.expense.category ?? null;
  });

  const [expenseDate, setExpenseDate] = useState<string>(() => {
    return initialData?.expense.expense_date ?? getTodayDateString();
  });

  const [paidBy, setPaidBy] = useState<string>(() => {
    return initialData?.expense.paid_by ?? '';
  });

  const effectivePaidBy = useMemo(() => {
    if (paidBy) return paidBy;
    if (mode === 'edit' && initialData?.expense.paid_by) return initialData.expense.paid_by;
    return currentUserId || (activeMembers[0]?.user_id ?? '');
  }, [paidBy, mode, initialData, currentUserId, activeMembers]);

  const [splitType, setSplitType] = useState<SplitType>(() => {
    return (initialData?.expense.split_type as SplitType) ?? 'equal';
  });

  const [customParticipants, setCustomParticipants] = useState<SplitParticipantConfig[] | null>(() => {
    if (mode === 'edit' && initialData) {
      return initialData.splits.map((s: ExpenseSplitItem) => ({
        user_id: s.user_id,
        value:
          initialData.expense.split_type === 'percent'
            ? s.percent_bp ?? undefined
            : s.share_minor,
      }));
    }
    return null;
  });

  const participants = useMemo<SplitParticipantConfig[]>(() => {
    if (customParticipants !== null) {
      return customParticipants;
    }
    return activeMembers.map((m) => ({ user_id: m.user_id }));
  }, [customParticipants, activeMembers]);

  // UI modal sheets
  const [paidBySheetVisible, setPaidBySheetVisible] = useState(false);
  const [splitSheetVisible, setSplitSheetVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [isDescriptionFocused, setIsDescriptionFocused] = useState(false);

  // Track if user changed anything
  const hasChanges = useMemo(() => {
    if (mode === 'add') {
      return (
        amountText.trim() !== '' ||
        description.trim() !== '' ||
        category !== null ||
        expenseDate !== getTodayDateString() ||
        (paidBy !== '' && paidBy !== currentUserId) ||
        customParticipants !== null
      );
    }
    if (mode === 'edit' && initialData) {
      const origAmount = (initialData.expense.amount_minor / 100).toFixed(2).replace(/\.00$/, '');
      const origDesc = initialData.expense.description ?? '';
      const origCat = initialData.expense.category ?? null;
      const origDate = initialData.expense.expense_date;
      const origPaidBy = initialData.expense.paid_by;
      const origSplitType = initialData.expense.split_type;

      if (
        amountText !== origAmount ||
        description !== origDesc ||
        category !== origCat ||
        expenseDate !== origDate ||
        effectivePaidBy !== origPaidBy ||
        splitType !== origSplitType
      ) {
        return true;
      }

      // Check participants changes
      if (participants.length !== initialData.splits.length) return true;
      for (const p of participants) {
        const orig = initialData.splits.find((s: ExpenseSplitItem) => s.user_id === p.user_id);
        if (!orig) return true;
        if (splitType === 'exact' && p.value !== orig.share_minor) return true;
        if (splitType === 'percent' && p.value !== orig.percent_bp) return true;
      }
      return false;
    }
    return false;
  }, [
    mode,
    initialData,
    amountText,
    description,
    category,
    expenseDate,
    paidBy,
    effectivePaidBy,
    splitType,
    customParticipants,
    participants,
    currentUserId,
  ]);

  // Back handling (EU4, EA15, EE9)
  const handleBack = useCallback(() => {
    // 1. Close any open bottom sheet first (EU4)
    if (paidBySheetVisible) {
      setPaidBySheetVisible(false);
      return true;
    }
    if (splitSheetVisible) {
      setSplitSheetVisible(false);
      return true;
    }
    if (datePickerVisible) {
      setDatePickerVisible(false);
      return true;
    }

    // 2. If description keyboard is focused, dismiss it
    if (isDescriptionFocused) {
      Keyboard.dismiss();
      setIsDescriptionFocused(false);
      return true;
    }

    // 3. Confirm discard if dirty (EA15, EE9)
    if (hasChanges) {
      Alert.alert(
        mode === 'add' ? 'Discard this expense?' : 'Discard changes?',
        mode === 'add'
          ? 'You have entered expense details that will be lost.'
          : 'Any changes you made to this expense will be discarded.',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => router.back(),
          },
        ]
      );
      return true;
    }

    router.back();
    return true;
  }, [
    paidBySheetVisible,
    splitSheetVisible,
    datePickerVisible,
    isDescriptionFocused,
    hasChanges,
    mode,
  ]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => sub.remove();
  }, [handleBack]);

  // Calculate parsed integer amount in paise
  const amountMinor = useMemo(() => {
    return parseAmountToMinor(amountText) ?? 0;
  }, [amountText]);

  // Compute live shares using TypeScript mirror
  const { computedShares, splitError } = useMemo(() => {
    if (amountMinor <= 0) {
      return { computedShares: [], splitError: null };
    }
    if (participants.length === 0) {
      return { computedShares: [], splitError: 'Pick at least one person.' };
    }

    try {
      const shares = computeShares(
        splitType,
        amountMinor,
        participants.map((p) => ({
          user_id: p.user_id,
          value: p.value,
        }))
      );
      return { computedShares: shares, splitError: null };
    } catch (err) {
      const msg = toFriendlyMessage(err, memberNameResolver);
      return { computedShares: [], splitError: msg };
    }
  }, [splitType, amountMinor, participants, memberNameResolver]);

  // UX Rule 4: Plain-language financial effect preview
  const previewInfo = useMemo(() => {
    if (amountMinor <= 0 || splitError || computedShares.length === 0) {
      return null;
    }
    const payerName = memberNameMap.get(effectivePaidBy.toLowerCase()) || 'Someone';
    return previewForUser(
      currentUserId,
      effectivePaidBy,
      computedShares,
      amountMinor,
      payerName
    );
  }, [amountMinor, splitError, computedShares, currentUserId, effectivePaidBy, memberNameMap]);

  // Validation state for Save button
  const isValidToSave =
    amountMinor >= 1 &&
    amountMinor <= 1_000_000_000 &&
    !splitError &&
    computedShares.length > 0 &&
    (mode === 'add' ? true : hasChanges);

  // Date picker handler
  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setDatePickerVisible(false);
    if (event.type === 'set' && selectedDate) {
      setExpenseDate(formatCalendarDate(selectedDate));
    }
  };

  // Submit Handler
  const isSaving = addMutation.isPending || editMutation.isPending;

  const handleSave = async () => {
    if (!isValidToSave || isSaving) return;

    if (isOffline) {
      showSnackbar({ message: 'Cannot save expense while offline. Please check your connection.' });
      return;
    }

    try {
      if (mode === 'add') {
        await addMutation.mutateAsync({
          groupId,
          clientRequestId: clientRequestIdRef.current,
          description: description.trim() || null,
          amountMinor,
          paidBy: effectivePaidBy,
          splitType,
          participants: participants.map((p) => ({
            user_id: p.user_id,
            value: p.value,
          })),
          category: category || null,
          expenseDate,
        });

        // Store last used group for quick add preselection
        if (currentUserId) {
          await setLastUsedGroupId(currentUserId, groupId);
        }

        showSnackbar({ message: 'Expense added successfully!' });
        onSuccess?.();
        router.back();
      } else {
        if (!expenseId || !initialData) return;

        await editMutation.mutateAsync({
          expenseId,
          expectedVersion: initialData.expense.version,
          description: description.trim() || null,
          amountMinor,
          paidBy: effectivePaidBy,
          splitType,
          participants: participants.map((p) => ({
            user_id: p.user_id,
            value: p.value,
          })),
          category: category || null,
          expenseDate,
          groupId,
        });

        showSnackbar({ message: 'Expense updated successfully!' });
        onSuccess?.();
        router.back();
      }
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      const rawCode = errObj?.message || '';

      if (rawCode === 'not_a_member') {
        showSnackbar({ message: "You're no longer in this group." });
        router.replace('/(tabs)');
        return;
      }

      if (rawCode === 'participant_not_member') {
        const removedUserId = getParticipantNotMemberId(err);
        if (removedUserId) {
          const name = memberNameMap.get(removedUserId.toLowerCase()) || 'A member';
          showSnackbar({ message: `${name} is no longer in this group and was removed from the split.` });
          setCustomParticipants((prev) => (prev ?? participants).filter((p) => p.user_id !== removedUserId));
        } else {
          showSnackbar({ message: 'A member in this split has left the group.' });
        }
        return;
      }

      if (rawCode === 'payer_not_member') {
        showSnackbar({ message: 'The payer is no longer in this group. Please choose another payer.' });
        setPaidBy(currentUserId);
        setPaidBySheetVisible(true);
        return;
      }

      if (rawCode === 'expense_changed') {
        showSnackbar({ message: "Someone just changed this expense. Please review the updated version." });
        router.back();
        return;
      }

      if (rawCode === 'expense_locked') {
        showSnackbar({ message: "This expense includes someone who left the group, so it's locked." });
        router.back();
        return;
      }

      showSnackbar({ message: toFriendlyMessage(err, memberNameResolver) });
    }
  };

  if (groupLoading || membersLoading) {
    return (
      <Screen padding={false}>
        <AppHeader
          title={mode === 'add' ? 'Add Expense' : 'Edit Expense'}
          showBack
          onBack={handleBack}
        />
        <View style={{ padding: 16 }}>
          <LoadingSkeleton height={80} style={{ marginBottom: 16 }} />
          <LoadingSkeleton height={48} style={{ marginBottom: 16 }} />
          <LoadingSkeleton height={56} style={{ marginBottom: 16 }} />
        </View>
      </Screen>
    );
  }

  // Summary labels
  const payerDisplayName =
    effectivePaidBy === currentUserId
      ? 'You'
      : memberNameMap.get(effectivePaidBy.toLowerCase()) || 'Someone';

  const splitSummary =
    splitType === 'equal'
      ? `equally among ${participants.length} people`
      : splitType === 'exact'
      ? `exact amounts (${participants.length} people)`
      : `percentages (${participants.length} people)`;

  return (
    <Screen padding={false}>
      {isOffline && <OfflineBanner />}

      {/* Header */}
      <AppHeader
        title={mode === 'add' ? 'Add Expense' : 'Edit Expense'}
        subtitle={group?.name}
        showBack
        onBack={handleBack}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. Large Amount Display (EM1, EM9, EU6) */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => {
            Keyboard.dismiss();
            setIsDescriptionFocused(false);
          }}
        >
          <AmountDisplay amountText={amountText} />
        </TouchableOpacity>

        {/* 2. Optional Description with Character Counter (EA2, EA3) */}
        <View style={styles.descriptionRow}>
          <Ionicons
            name="document-text-outline"
            size={20}
            color={theme.colors.muted}
            style={styles.descriptionIcon}
          />
          <TextInput
            style={[
              styles.descriptionInput,
              theme.typography.body,
              { color: theme.colors.text },
            ]}
            placeholder="What was it for? (optional)"
            placeholderTextColor={theme.colors.muted}
            value={description}
            maxLength={100}
            onChangeText={setDescription}
            onFocus={() => setIsDescriptionFocused(true)}
            onBlur={() => setIsDescriptionFocused(false)}
            returnKeyType="done"
            onSubmitEditing={() => setIsDescriptionFocused(false)}
          />
          {description.length > 0 && (
            <Text
              style={[
                theme.typography.caption,
                { color: description.length >= 100 ? theme.colors.error : theme.colors.muted },
              ]}
            >
              {description.length}/100
            </Text>
          )}
        </View>

        {/* 3. Horizontal Category Chips (D18) */}
        <CategoryChips
          selectedCategory={category}
          onSelectCategory={setCategory}
        />

        {/* 4. One Summary Row: Paid by [You] · Split [equally] · [Today] */}
        <View
          style={[
            styles.summaryCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outline,
            },
          ]}
        >
          <View style={styles.summaryDetails}>
            <Text style={[theme.typography.body, { color: theme.colors.text }]}>
              Paid by{' '}
              <Text
                style={{ color: theme.colors.primary, fontWeight: '700' }}
                onPress={() => setPaidBySheetVisible(true)}
              >
                {payerDisplayName}
              </Text>
              {' · '}
              Split{' '}
              <Text
                style={{ color: theme.colors.primary, fontWeight: '700' }}
                onPress={() => setSplitSheetVisible(true)}
              >
                {splitSummary}
              </Text>
            </Text>
          </View>

          {/* Date Chip */}
          <TouchableOpacity
            style={[
              styles.dateChip,
              {
                backgroundColor: theme.colors.surfaceVariant,
                borderColor: theme.colors.outline,
              },
            ]}
            onPress={() => setDatePickerVisible(true)}
            activeOpacity={0.7}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`Expense date: ${formatDateChipLabel(expenseDate)}`}
          >
            <Ionicons name="calendar-outline" size={14} color={theme.colors.text} />
            <Text
              style={[
                theme.typography.caption,
                { color: theme.colors.text, fontWeight: '600', marginLeft: 4 },
              ]}
            >
              {formatDateChipLabel(expenseDate)}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Group with only you hint (EA12) */}
        {activeMembers.length === 1 && (
          <View
            style={[
              styles.hintBox,
              { backgroundColor: theme.colors.primaryContainer },
            ]}
          >
            <Ionicons name="information-circle" size={18} color={theme.colors.primary} />
            <Text
              style={[
                theme.typography.caption,
                { color: theme.colors.onPrimaryContainer, marginLeft: 8, flex: 1 },
              ]}
            >
              {"You're the only person in this group right now. Invite people to split with!"}
            </Text>
          </View>
        )}

        {/* 5. Plain-words Preview Line or Validation Warning (UX Rule 4) */}
        <View style={styles.previewContainer}>
          {splitError ? (
            <Text style={[styles.previewError, { color: theme.colors.error }]}>
              {splitError}
            </Text>
          ) : previewInfo ? (
            <Text style={[styles.previewText, { color: theme.colors.text }]}>
              {previewInfo.sentence}
            </Text>
          ) : (
            <Text style={[styles.previewHint, { color: theme.colors.muted }]}>
              Enter an amount above to see who owes whom.
            </Text>
          )}
        </View>

        {/* 6. Save Button Bar */}
        <View style={styles.saveContainer}>
          <AppButton
            title={mode === 'add' ? 'Save Expense' : 'Save Changes'}
            variant="primary"
            fullWidth
            loading={isSaving}
            disabled={!isValidToSave || isSaving || isOffline}
            onPress={handleSave}
          />
        </View>
      </ScrollView>

      {/* 7. Keypad at bottom (EU3: hidden when description is focused) */}
      {!isDescriptionFocused && (
        <AmountKeypad
          value={amountText}
          onChange={setAmountText}
          onExceedMax={() =>
            showSnackbar({ message: 'Enter an amount between ₹0.01 and ₹1,00,00,000.' })
          }
        />
      )}

      {/* Native DateTimePicker */}
      {datePickerVisible && (
        <DateTimePicker
          value={parseCalendarDate(expenseDate)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={getMinExpenseDate()}
          maximumDate={getMaxExpenseDate()}
          onChange={handleDateChange}
        />
      )}

      {/* Paid By Bottom Sheet */}
      <PaidBySheet
        visible={paidBySheetVisible}
        onClose={() => setPaidBySheetVisible(false)}
        members={activeMembers}
        selectedPayerId={effectivePaidBy}
        onSelectPayer={setPaidBy}
        currentUserId={currentUserId}
      />

      {/* Split Bottom Sheet */}
      <SplitSheet
        visible={splitSheetVisible}
        onClose={() => setSplitSheetVisible(false)}
        members={activeMembers}
        currentUserId={currentUserId}
        totalAmountMinor={amountMinor}
        splitType={splitType}
        participants={participants}
        onApplySplit={(type, newParticipants) => {
          setSplitType(type);
          setCustomParticipants(newParticipants);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 16,
  },
  descriptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginVertical: 4,
  },
  descriptionIcon: {
    marginRight: 10,
  },
  descriptionInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
    paddingVertical: 0,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  summaryDetails: {
    flex: 1,
    marginRight: 10,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  previewContainer: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 6,
    minHeight: 24,
    justifyContent: 'center',
  },
  previewText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  previewHint: {
    fontSize: 14,
    textAlign: 'center',
  },
  previewError: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  saveContainer: {
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
  },
});
