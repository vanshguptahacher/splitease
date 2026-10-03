import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActivityListItem } from '@/lib/api/expenses';
import { formatActivitySentence } from '@/lib/activity/formatActivity';
import { palette, useAppTheme } from '@/lib/theme';

export interface ActivityRowProps {
  item: ActivityListItem;
  currentUserId: string;
  onPress: (item: ActivityListItem) => void;
}

export function ActivityRow({ item, currentUserId, onPress }: ActivityRowProps) {
  const theme = useAppTheme();
  const formatted = formatActivitySentence(item, currentUserId);

  // Badge style by action type
  let badgeBg: string;
  let iconColor: string;
  let iconName: keyof typeof Ionicons.glyphMap;

  switch (formatted.actionType) {
    case 'added':
      badgeBg = palette.owedContainer;
      iconColor = palette.owed;
      iconName = 'add';
      break;
    case 'edited':
      badgeBg = palette.primaryContainer;
      iconColor = palette.primary;
      iconName = 'pencil';
      break;
    case 'deleted':
      badgeBg = palette.errorContainer;
      iconColor = palette.error;
      iconName = 'trash-outline';
      break;
    case 'restored':
      badgeBg = palette.owedContainer;
      iconColor = palette.owed;
      iconName = 'refresh';
      break;
    case 'settlement':
      if (formatted.iconColorType === 'success') {
        badgeBg = palette.owedContainer;
        iconColor = palette.owed;
      } else if (formatted.iconColorType === 'warning') {
        badgeBg = palette.oweContainer;
        iconColor = palette.owe;
      } else if (formatted.iconColorType === 'danger') {
        badgeBg = palette.errorContainer;
        iconColor = palette.error;
      } else {
        badgeBg = theme.colors.surfaceVariant;
        iconColor = theme.colors.muted;
      }
      iconName = (formatted.iconName as any) || 'cash-outline';
      break;
    default:
      badgeBg = theme.colors.surfaceVariant;
      iconColor = theme.colors.muted;
      iconName = 'information-circle-outline';
      break;
  }

  return (
    <TouchableOpacity
      style={[
        styles.row,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outline,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={formatted.sentence}
    >
      {/* Icon Badge */}
      <View style={[styles.iconBadge, { backgroundColor: badgeBg }]}>
        <Ionicons name={iconName} size={20} color={iconColor} />
      </View>

      {/* Main Details */}
      <View style={styles.textContainer}>
        {formatted.actionType === 'settlement' ? (
          <Text
            style={[styles.sentence, { color: theme.colors.text }]}
            numberOfLines={2}
          >
            {formatted.primaryText}
          </Text>
        ) : (
          <Text
            style={[styles.sentence, { color: theme.colors.text }]}
            numberOfLines={2}
          >
            <Text style={styles.actorText}>{formatted.actor} </Text>
            {formatted.actionType === 'added' && 'added '}
            {formatted.actionType === 'edited' && 'changed '}
            {formatted.actionType === 'deleted' && 'deleted '}
            {formatted.actionType === 'restored' && 'restored '}
            {formatted.actionType === 'other' && `${item.action} `}
            <Text style={styles.descText}>{formatted.description}</Text>
            {formatted.amountText ? (
              <Text style={styles.amountText}> {formatted.amountText}</Text>
            ) : null}
          </Text>
        )}

        {/* Group and Timestamp meta */}
        <View style={styles.metaRow}>
          <Ionicons
            name="people-outline"
            size={13}
            color={theme.colors.muted}
            style={styles.metaIcon}
          />
          <Text
            style={[styles.metaText, { color: theme.colors.muted }]}
            numberOfLines={1}
          >
            {formatted.groupName}
          </Text>
          <Text style={[styles.metaDot, { color: theme.colors.muted }]}>·</Text>
          <Text style={[styles.metaText, { color: theme.colors.muted }]}>
            {formatted.timeAgo}
          </Text>
        </View>
      </View>

      {/* Chevron */}
      <Ionicons
        name="chevron-forward"
        size={18}
        color={theme.colors.muted}
        style={styles.chevron}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  sentence: {
    fontSize: 15,
    lineHeight: 20,
  },
  actorText: {
    fontWeight: '700',
  },
  descText: {
    fontWeight: '600',
  },
  amountText: {
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  metaIcon: {
    marginRight: 4,
  },
  metaDot: {
    marginHorizontal: 5,
    fontSize: 12,
  },
  metaText: {
    fontSize: 12,
  },
  chevron: {
    marginLeft: 8,
  },
});
