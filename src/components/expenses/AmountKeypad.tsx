import React, { useCallback, useEffect, useRef } from 'react';
import {
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KeypadKey, applyKeypadInput } from '@/lib/money';
import { useAppTheme } from '@/lib/theme';

export interface AmountKeypadProps {
  /**
   * The current amount string (e.g. "1234.5", "0.", "12" or "").
   */
  value: string;
  /**
   * Callback invoked with the updated value when a key is pressed.
   */
  onChange: (nextValue: string) => void;
  /**
   * Optional callback invoked when a keypress is blocked because it would exceed ₹1,00,00,000.
   */
  onExceedMax?: () => void;
  /**
   * Container style override.
   */
  style?: StyleProp<ViewStyle>;
}

interface KeyItem {
  id: KeypadKey;
  label?: string;
  icon?: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
}

const KEYPAD_ROWS: KeyItem[][] = [
  [
    { id: '1', label: '1', accessibilityLabel: '1' },
    { id: '2', label: '2', accessibilityLabel: '2' },
    { id: '3', label: '3', accessibilityLabel: '3' },
  ],
  [
    { id: '4', label: '4', accessibilityLabel: '4' },
    { id: '5', label: '5', accessibilityLabel: '5' },
    { id: '6', label: '6', accessibilityLabel: '6' },
  ],
  [
    { id: '7', label: '7', accessibilityLabel: '7' },
    { id: '8', label: '8', accessibilityLabel: '8' },
    { id: '9', label: '9', accessibilityLabel: '9' },
  ],
  [
    { id: '.', label: '.', accessibilityLabel: 'Decimal point' },
    { id: '0', label: '0', accessibilityLabel: '0' },
    {
      id: 'backspace',
      icon: 'backspace-outline',
      accessibilityLabel: 'Delete',
      accessibilityHint: 'Double tap to delete one character, hold to clear all',
    },
  ],
];

/**
 * AmountKeypad
 * Custom numerical keypad for fast, fluid amount entry.
 * Keys are >= 56dp for one-handed thumb reach (EU1).
 * Enforces EM2 (max 2 decimals), EM3 (leading zeros & dots), EM5 (1 crore limit), EM7 (long-press clear).
 */
export function AmountKeypad({
  value,
  onChange,
  onExceedMax,
  style,
}: AmountKeypadProps) {
  const theme = useAppTheme();
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const handleKey = useCallback(
    (key: KeypadKey) => {
      const result = applyKeypadInput(valueRef.current, key);
      if (result.exceedsMax) {
        onExceedMax?.();
        return;
      }
      valueRef.current = result.nextValue;
      onChange(result.nextValue);
    },
    [onChange, onExceedMax]
  );

  return (
    <View style={[styles.container, style]}>
      {KEYPAD_ROWS.map((row, rowIndex) => (
        <View key={`row-${rowIndex}`} style={styles.row}>
          {row.map((item) => {
            const isBackspace = item.id === 'backspace';

            return (
              <Pressable
                key={item.id}
                onPress={() => handleKey(item.id)}
                onLongPress={isBackspace ? () => handleKey('clear') : undefined}
                delayLongPress={350}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={item.accessibilityLabel}
                accessibilityHint={item.accessibilityHint}
                android_ripple={{
                  color: theme.colors.surfaceVariant,
                  borderless: false,
                  radius: 36,
                }}
                style={({ pressed }) => [
                  styles.keyButton,
                  pressed && Platform.OS === 'ios' && styles.pressedIos,
                ]}
              >
                {item.icon ? (
                  <Ionicons
                    name={item.icon as keyof typeof Ionicons.glyphMap}
                    size={26}
                    color={theme.colors.text}
                  />
                ) : (
                  <Text
                    style={[
                      styles.keyText,
                      { color: theme.colors.text },
                      item.id === '.' && styles.dotText,
                    ]}
                  >
                    {item.label}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 8,
    paddingBottom: 8,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 3,
  },
  keyButton: {
    flex: 1,
    minHeight: 56,
    height: 60,
    marginHorizontal: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  pressedIos: {
    opacity: 0.4,
  },
  keyText: {
    fontSize: 26,
    fontWeight: '500',
  },
  dotText: {
    fontSize: 32,
    lineHeight: 32,
    fontWeight: '700',
  },
});
