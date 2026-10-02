import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { formatMoney } from '@/lib/money';
import { useAppTheme } from '@/lib/theme';

export type MoneyTone = 'auto' | 'owed' | 'owe' | 'neutral';
export type MoneySize = 'sm' | 'md' | 'lg' | 'hero';

export interface MoneyTextProps {
  amountMinor: number;
  tone?: MoneyTone;
  size?: MoneySize;
  showLabel?: boolean;
  customLabel?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

export function MoneyText({
  amountMinor,
  tone = 'auto',
  size = 'md',
  showLabel = false,
  customLabel,
  style,
  textStyle,
  labelStyle,
}: MoneyTextProps) {
  const theme = useAppTheme();

  // Determine effective tone
  let resolvedTone: 'owed' | 'owe' | 'neutral' = 'neutral';
  if (tone === 'auto') {
    if (amountMinor > 0) resolvedTone = 'owed';
    else if (amountMinor < 0) resolvedTone = 'owe';
    else resolvedTone = 'neutral';
  } else {
    resolvedTone = tone;
  }

  // Determine color based on tone
  let color = theme.colors.text;
  if (resolvedTone === 'owed') color = theme.colors.owed;
  else if (resolvedTone === 'owe') color = theme.colors.owe;
  else color = theme.colors.text;

  // Determine typography style
  let typoStyle: TextStyle = theme.typography.body;
  switch (size) {
    case 'sm':
      typoStyle = theme.typography.caption;
      break;
    case 'md':
      typoStyle = theme.typography.amountSmall;
      break;
    case 'lg':
      typoStyle = { ...theme.typography.sectionTitle, fontSize: 24, lineHeight: 30 };
      break;
    case 'hero':
      typoStyle = theme.typography.amount;
      break;
  }

  // Default helper labels to satisfy UX Principle 12: Never rely on color alone
  let label = customLabel;
  if (!label && showLabel) {
    if (resolvedTone === 'owed') label = 'you are owed';
    else if (resolvedTone === 'owe') label = 'you owe';
    else label = 'settled up';
  }

  return (
    <View style={[styles.container, style]}>
      {label ? (
        <Text
          style={[
            theme.typography.caption,
            styles.label,
            { color: theme.colors.muted },
            labelStyle,
          ]}
        >
          {label.toUpperCase()}
        </Text>
      ) : null}
      <Text style={[typoStyle, styles.amount, { color }, textStyle]}>
        {formatMoney(amountMinor)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
  },
  label: {
    letterSpacing: 0.5,
    fontWeight: '600',
    marginBottom: 2,
  },
  amount: {
    fontWeight: '700',
  },
});
