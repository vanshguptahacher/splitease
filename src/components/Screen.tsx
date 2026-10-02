import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/lib/theme';

export interface ScreenProps {
  children: React.ReactNode;
  scrollable?: boolean;
  padding?: boolean | number;
  keyboardOffset?: number;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

export function Screen({
  children,
  scrollable = false,
  padding = true,
  keyboardOffset = 0,
  style,
  contentContainerStyle,
}: ScreenProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  const paddingValue =
    typeof padding === 'number'
      ? padding
      : padding
        ? theme.spacing.lg
        : 0;

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: insets.top,
    paddingBottom: insets.bottom,
    paddingLeft: insets.left,
    paddingRight: insets.right,
  };

  const innerStyle: ViewStyle = {
    flex: scrollable ? undefined : 1,
    paddingHorizontal: paddingValue,
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardOffset}
      style={[containerStyle, style]}
    >
      {scrollable ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            innerStyle,
            { paddingVertical: paddingValue },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[innerStyle, contentContainerStyle]}>{children}</View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
});
