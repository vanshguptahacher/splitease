import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ExpenseListItem } from '@/lib/api/expenses';
import { getCategoryEmoji, getCategoryLabel } from '@/lib/expenses/categories';
import { formatExpenseEffect } from '@/lib/expenses/formatEffect';
import { formatMoney } from '@/lib/money/format';
import { useAppTheme } from '@/lib/theme';

export interface ExpenseRowProps {
  expense: ExpenseListItem;
  currentUserId: string;
  payerName: string;
  onPress: () => void;
}

export function ExpenseRow({
  expense,
  currentUserId,
  payerName,
  onPress,
}: ExpenseRowProps) {
  const theme = useAppTheme();

  const emoji = getCategoryEmoji(expense.category);
  const fallbackLabel = getCategoryLabel(expense.category) || 'Expense';
  const displayTitle = expense.description?.trim() || fallbackLabel;

  const isCurrentPayer = expense.paid_by.toLowerCase() === currentUserId.toLowerCase();
  const payerDisplay = isCurrentPayer
    ? 'You paid'
    : payerName === 'Deleted user'
    ? 'Deleted user paid'
    : `${payerName || 'Someone'} paid`;

  const effect = formatExpenseEffect(expense, currentUserId);

  let effectColor = theme.colors.muted;
  if (effect.type === 'lent') {
    effectColor = theme.colors.primary;
  } else if (effect.type === 'owe') {
    effectColor = theme.colors.error;
  }

  const formattedTotal = formatMoney(expense.amount_minor);

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.outlineVariant,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`${displayTitle}, ${formattedTotal}, ${payerDisplay}, ${effect.text}`}
    >
      {/* Category Emoji Pill */}
      <View
        style={[
          styles.emojiContainer,
          { backgroundColor: theme.colors.surfaceVariant },
        ]}
      >
        <Text style={styles.emojiText}>{emoji}</Text>
      </View>

      {/* Center Details */}
      <View style={styles.centerDetails}>
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.titleText,
              theme.typography.body,
              { color: theme.colors.text, fontWeight: '600' },
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {displayTitle}
          </Text>
          {expense.is_locked && (
            <View
              style={styles.lockBadge}
              accessible={true}
              accessibilityLabel="Locked expense"
            >
              <Ionicons name="lock-closed" size={13} color={theme.colors.error} />
            </View>
          )}
        </View>

        <Text
          style={[
            styles.subtitleText,
            theme.typography.caption,
            { color: theme.colors.muted },
          ]}
          numberOfLines={1}
        >
          {payerDisplay}
        </Text>
      </View>

      {/* Right Financials */}
      <View style={styles.rightFinancials}>
        <Text
          style={[
            styles.amountText,
            theme.typography.body,
            { color: theme.colors.text, fontWeight: '700' },
          ]}
        >
          {formattedTotal}
        </Text>
        <Text
          style={[
            styles.effectText,
            theme.typography.caption,
            { color: effectColor, fontWeight: '600' },
          ]}
          numberOfLines={1}
        >
          {effect.text}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emojiContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  emojiText: {
    fontSize: 22,
  },
  centerDetails: {
    flex: 1,
    marginRight: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleText: {
    flexShrink: 1,
  },
  lockBadge: {
    marginLeft: 6,
  },
  subtitleText: {
    marginTop: 2,
  },
  rightFinancials: {
    alignItems: 'flex-end',
  },
  amountText: {
    textAlign: 'right',
  },
  effectText: {
    marginTop: 2,
    textAlign: 'right',
  },
});
