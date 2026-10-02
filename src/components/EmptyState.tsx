import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/lib/theme';
import { AppButton } from './AppButton';

export interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionTitle?: string;
  onAction?: () => void;
  actionLoading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({
  icon = 'receipt-outline',
  title,
  message,
  actionTitle,
  onAction,
  actionLoading = false,
  style,
}: EmptyStateProps) {
  const theme = useAppTheme();

  return (
    <View style={[styles.container, { padding: theme.spacing.xl }, style]}>
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: theme.colors.surfaceVariant,
            borderRadius: theme.radius.pill,
            marginBottom: theme.spacing.lg,
          },
        ]}
      >
        <Ionicons name={icon} size={40} color={theme.colors.primary} />
      </View>

      <Text
        style={[
          theme.typography.sectionTitle,
          styles.title,
          { color: theme.colors.text, marginBottom: theme.spacing.xs },
        ]}
      >
        {title}
      </Text>

      <Text
        style={[
          theme.typography.body,
          styles.message,
          { color: theme.colors.muted, marginBottom: theme.spacing.xl },
        ]}
      >
        {message}
      </Text>

      {actionTitle && onAction && (
        <AppButton
          title={actionTitle}
          onPress={onAction}
          loading={actionLoading}
          variant="primary"
          style={styles.actionButton}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  iconCircle: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 22,
  },
  actionButton: {
    minWidth: 160,
  },
});
