import React from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { formatAmountInput, formatMoney, toAccessibleMoneyString } from '@/lib/money';
import { useAppTheme } from '@/lib/theme';

export interface AmountDisplayProps {
  /**
   * The live typed string (e.g. "1234.5", "0.", "12") or empty string.
   */
  amountText?: string;
  /**
   * Optional integer paise amount if displaying an existing saved expense.
   */
  amountMinor?: number;
  /**
   * Placeholder to show when amount is empty or '0'. Defaults to "0".
   */
  placeholder?: string;
  /**
   * Currency symbol prefix. Defaults to "₹".
   */
  currencySymbol?: string;
  /**
   * Container style override.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * Amount text style override.
   */
  textStyle?: StyleProp<TextStyle>;
  /**
   * Currency symbol style override.
   */
  symbolStyle?: StyleProp<TextStyle>;
}

/**
 * Calculates a responsive base font size based on character count
 * ensuring the amount never overflows or wraps (EM9).
 */
function getDynamicFontSize(charCount: number): { fontSize: number; lineHeight: number } {
  if (charCount <= 6) {
    return { fontSize: 48, lineHeight: 56 };
  } else if (charCount <= 9) {
    return { fontSize: 38, lineHeight: 46 };
  } else if (charCount <= 12) {
    return { fontSize: 30, lineHeight: 38 };
  } else {
    return { fontSize: 24, lineHeight: 32 };
  }
}

/**
 * AmountDisplay
 * Displays large-type INR currency values with live Indian digit grouping.
 * Automatically scales down font size for long numbers (EM9).
 * Screen reader friendly, announcing numbers as "rupees and paise" (EU6).
 */
export function AmountDisplay({
  amountText,
  amountMinor,
  placeholder = '0',
  currencySymbol = '₹',
  style,
  textStyle,
  symbolStyle,
}: AmountDisplayProps) {
  const theme = useAppTheme();

  // Determine displayed text and accessibility speech
  let formattedValue = '';
  let accessibleLabel = '';

  if (amountMinor !== undefined) {
    const rawFormatted = formatMoney(amountMinor);
    // Strip leading currency symbol from formatMoney so we render it separately with custom styling
    formattedValue = rawFormatted.replace(/^[^\d-]*/, '');
    accessibleLabel = toAccessibleMoneyString(amountMinor);
  } else if (amountText !== undefined && amountText !== '') {
    formattedValue = formatAmountInput(amountText);
    accessibleLabel = toAccessibleMoneyString(amountText);
  } else {
    formattedValue = placeholder;
    accessibleLabel = '0 rupees';
  }

  const isPlaceholder = !amountText && amountMinor === undefined;
  const { fontSize, lineHeight } = getDynamicFontSize(formattedValue.length + currencySymbol.length);

  return (
    <View
      accessible={true}
      accessibilityRole="text"
      accessibilityLabel={accessibleLabel}
      style={[styles.container, style]}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit={true}
        minimumFontScale={0.5}
        style={[
          styles.textRow,
          {
            color: isPlaceholder ? theme.colors.muted : theme.colors.text,
          },
        ]}
      >
        <Text
          style={[
            styles.symbol,
            {
              fontSize: Math.round(fontSize * 0.8),
              lineHeight,
              color: isPlaceholder ? theme.colors.muted : theme.colors.primary,
            },
            symbolStyle,
          ]}
        >
          {currencySymbol}{' '}
        </Text>
        <Text
          style={[
            styles.amount,
            {
              fontSize,
              lineHeight,
              color: isPlaceholder ? theme.colors.muted : theme.colors.text,
            },
            textStyle,
          ]}
        >
          {formattedValue}
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: '100%',
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  symbol: {
    fontWeight: '600',
  },
  amount: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
