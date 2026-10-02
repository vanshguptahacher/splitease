import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/lib/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger';

export interface AppButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  fullWidth?: boolean;
  accessibilityLabel?: string;
}

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  style,
  textStyle,
  fullWidth = false,
  accessibilityLabel,
}: AppButtonProps) {
  const theme = useAppTheme();
  const isDisabled = disabled || loading;

  let backgroundColor = 'transparent';
  let textColor = theme.colors.primary;
  let borderWidth = 0;
  let borderColor = 'transparent';

  switch (variant) {
    case 'primary':
      backgroundColor = theme.colors.primary;
      textColor = theme.colors.onPrimary;
      break;
    case 'secondary':
      backgroundColor = theme.colors.primaryContainer;
      textColor = theme.colors.onPrimaryContainer;
      break;
    case 'danger':
      backgroundColor = theme.colors.error;
      textColor = theme.colors.onError;
      break;
    case 'text':
      backgroundColor = 'transparent';
      textColor = theme.colors.primary;
      break;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: isDisabled && variant !== 'text' ? theme.colors.surfaceVariant : backgroundColor,
          borderRadius: theme.radius.card,
          paddingHorizontal: theme.spacing.lg,
          borderWidth,
          borderColor,
          minHeight: 48,
          alignSelf: fullWidth ? 'stretch' : 'auto',
          opacity: isDisabled && variant === 'text' ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={isDisabled ? theme.colors.muted : textColor}
        />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <Ionicons
              name={icon}
              size={20}
              color={isDisabled ? theme.colors.muted : textColor}
              style={{ marginRight: theme.spacing.sm }}
            />
          )}
          <Text
            style={[
              theme.typography.sectionTitle,
              styles.text,
              {
                color: isDisabled ? theme.colors.muted : textColor,
                fontSize: 15,
              },
              textStyle,
            ]}
          >
            {title}
          </Text>
          {icon && iconPosition === 'right' && (
            <Ionicons
              name={icon}
              size={20}
              color={isDisabled ? theme.colors.muted : textColor}
              style={{ marginLeft: theme.spacing.sm }}
            />
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
});
