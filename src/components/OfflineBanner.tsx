import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useAppTheme } from '@/lib/theme';

export function OfflineBanner() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { isOffline } = useNetworkStatus();
  const [slideAnim] = useState(() => new Animated.Value(-80));

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isOffline ? 0 : -80,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isOffline, slideAnim]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: insets.top > 0 ? insets.top : 8,
          backgroundColor: theme.colors.owe,
          transform: [{ translateY: slideAnim }],
        },
      ]}
      pointerEvents="none"
    >
      <View style={styles.content}>
        <Ionicons name="cloud-offline-outline" size={18} color="#FFFFFF" />
        <Text style={[theme.typography.caption, styles.text]}>
          {"You're offline. Changes can't be saved."}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99999,
    paddingBottom: 8,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
