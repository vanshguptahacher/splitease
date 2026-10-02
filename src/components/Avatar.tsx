import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

export interface AvatarProps {
  url?: string | null;
  name?: string | null;
  size?: number;
  accessibilityLabel?: string;
}

const AVATAR_PALETTES = [
  { bg: '#E0F2FE', text: '#0369A1' }, // Sky
  { bg: '#DCFCE7', text: '#15803D' }, // Emerald
  { bg: '#F3E8FF', text: '#7E22CE' }, // Purple
  { bg: '#FEF3C7', text: '#B45309' }, // Amber
  { bg: '#FFE4E6', text: '#BE123C' }, // Rose
  { bg: '#E0E7FF', text: '#4338CA' }, // Indigo
  { bg: '#CCFBF1', text: '#0F766E' }, // Teal
];

function getStablePalette(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[index];
}

export function getInitials(name?: string | null): string {
  if (!name || !name.trim()) return 'U';

  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

export function Avatar({
  url,
  name,
  size = 48,
  accessibilityLabel,
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);

  const initials = getInitials(name);
  const palette = getStablePalette(name || 'User');
  const borderRadius = size / 2;
  const fontSize = Math.round(size * 0.4);

  const showImage = Boolean(url && !imageError);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: palette.bg,
        },
      ]}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel || name || 'User avatar'}
    >
      {showImage ? (
        <Image
          source={{ uri: url! }}
          style={{ width: size, height: size, borderRadius }}
          contentFit="cover"
          transition={200}
          onError={() => setImageError(true)}
        />
      ) : (
        <Text
          style={[
            styles.initials,
            {
              fontSize,
              color: palette.text,
            },
          ]}
        >
          {initials}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
});
