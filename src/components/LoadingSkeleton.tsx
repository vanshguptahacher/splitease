import React, { useEffect, useState } from 'react';
import {
  Animated,
  DimensionValue,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useAppTheme } from '@/lib/theme';

export type SkeletonVariant = 'row' | 'card' | 'avatar' | 'rect';

export interface LoadingSkeletonProps {
  variant?: SkeletonVariant;
  count?: number;
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function LoadingSkeleton({
  variant = 'row',
  count = 1,
  width,
  height,
  borderRadius,
  style,
}: LoadingSkeletonProps) {
  const theme = useAppTheme();
  const [pulseAnim] = useState(() => new Animated.Value(0.35));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.85,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();

    return () => loop.stop();
  }, [pulseAnim]);

  const blockStyle = {
    backgroundColor: theme.colors.surfaceVariant,
    opacity: pulseAnim,
  };

  const renderSingle = (key: number) => {
    switch (variant) {
      case 'row':
        return (
          <View
            key={key}
            style={[
              styles.rowContainer,
              {
                paddingVertical: theme.spacing.md,
                borderBottomColor: theme.colors.outline,
              },
              style,
            ]}
          >
            <Animated.View
              style={[
                styles.avatar,
                blockStyle,
                { borderRadius: theme.radius.pill },
              ]}
            />
            <View style={styles.rowContent}>
              <Animated.View
                style={[
                  styles.titleLine,
                  blockStyle,
                  { borderRadius: theme.radius.sm },
                ]}
              />
              <Animated.View
                style={[
                  styles.subtitleLine,
                  blockStyle,
                  { borderRadius: theme.radius.sm, marginTop: theme.spacing.xs },
                ]}
              />
            </View>
            <Animated.View
              style={[
                styles.amountBlock,
                blockStyle,
                { borderRadius: theme.radius.sm },
              ]}
            />
          </View>
        );

      case 'card':
        return (
          <View
            key={key}
            style={[
              styles.cardContainer,
              {
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.card,
                padding: theme.spacing.lg,
                borderColor: theme.colors.outline,
                borderWidth: 1,
                marginBottom: theme.spacing.md,
              },
              style,
            ]}
          >
            <Animated.View
              style={[
                styles.cardHeader,
                blockStyle,
                { borderRadius: theme.radius.sm },
              ]}
            />
            <Animated.View
              style={[
                styles.cardBody,
                blockStyle,
                { borderRadius: theme.radius.sm, marginTop: theme.spacing.md },
              ]}
            />
            <Animated.View
              style={[
                styles.cardFooter,
                blockStyle,
                { borderRadius: theme.radius.sm, marginTop: theme.spacing.md },
              ]}
            />
          </View>
        );

      case 'avatar':
        return (
          <Animated.View
            key={key}
            style={[
              styles.avatarOnly,
              blockStyle,
              {
                width: width ?? 44,
                height: height ?? 44,
                borderRadius: borderRadius ?? theme.radius.pill,
              },
              style,
            ]}
          />
        );

      case 'rect':
      default:
        return (
          <Animated.View
            key={key}
            style={[
              blockStyle,
              {
                width: width ?? '100%',
                height: height ?? 20,
                borderRadius: borderRadius ?? theme.radius.sm,
                marginBottom: theme.spacing.sm,
              },
              style,
            ]}
          />
        );
    }
  };

  return (
    <View style={styles.container}>
      {Array.from({ length: count }, (_, i) => renderSingle(i))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 44,
    height: 44,
  },
  rowContent: {
    flex: 1,
    marginLeft: 12,
    marginRight: 16,
  },
  titleLine: {
    width: '60%',
    height: 16,
  },
  subtitleLine: {
    width: '35%',
    height: 12,
  },
  amountBlock: {
    width: 60,
    height: 20,
  },
  cardContainer: {
    width: '100%',
  },
  cardHeader: {
    width: '45%',
    height: 18,
  },
  cardBody: {
    width: '85%',
    height: 28,
  },
  cardFooter: {
    width: '30%',
    height: 14,
  },
  avatarOnly: {
    alignSelf: 'center',
  },
});
