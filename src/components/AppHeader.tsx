import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/lib/theme';

export interface HeaderAction {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel?: string;
}

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  actions?: HeaderAction[];
}

export function AppHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  actions = [],
}: AppHeaderProps) {
  const theme = useAppTheme();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.outline,
          paddingHorizontal: theme.spacing.md,
        },
      ]}
    >
      <View style={styles.leftRow}>
        {showBack && (
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [
              styles.iconButton,
              {
                marginRight: theme.spacing.xs,
                borderRadius: theme.radius.pill,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </Pressable>
        )}
        <View style={styles.titleContainer}>
          <Text
            style={[
              theme.typography.sectionTitle,
              { color: theme.colors.text },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle && (
            <Text
              style={[
                theme.typography.caption,
                { color: theme.colors.muted, marginTop: 2 },
              ]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          )}
        </View>
      </View>

      {actions.length > 0 && (
        <View style={styles.actionsRow}>
          {actions.map((action, index) => (
            <Pressable
              key={index}
              onPress={action.onPress}
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel ?? `Action ${index + 1}`}
              style={({ pressed }) => [
                styles.iconButton,
                {
                  borderRadius: theme.radius.pill,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name={action.icon} size={22} color={theme.colors.text} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  titleContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
