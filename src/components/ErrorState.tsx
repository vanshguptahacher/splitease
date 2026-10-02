import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/lib/theme';
import { AppButton } from './AppButton';

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryTitle?: string;
  retryLoading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryTitle = 'Try Again',
  retryLoading = false,
  style,
}: ErrorStateProps) {
  const theme = useAppTheme();

  return (
    <View style={[styles.container, { padding: theme.spacing.xl }, style]}>
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: theme.colors.errorContainer,
            borderRadius: theme.radius.pill,
            marginBottom: theme.spacing.lg,
          },
        ]}
      >
        <Ionicons name="alert-circle-outline" size={42} color={theme.colors.error} />
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

      {onRetry && (
        <AppButton
          title={retryTitle}
          onPress={onRetry}
          loading={retryLoading}
          variant="primary"
          icon="refresh-outline"
          style={styles.retryButton}
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
  retryButton: {
    minWidth: 160,
  },
});
