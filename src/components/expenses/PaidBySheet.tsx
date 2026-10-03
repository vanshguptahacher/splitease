import React from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import { useAppTheme } from '@/lib/theme';
import { GroupMemberItem } from '@/types/database';

export interface PaidBySheetProps {
  visible: boolean;
  onClose: () => void;
  members: GroupMemberItem[];
  selectedPayerId: string;
  onSelectPayer: (memberId: string) => void;
  currentUserId?: string;
}

export function PaidBySheet({
  visible,
  onClose,
  members,
  selectedPayerId,
  onSelectPayer,
  currentUserId,
}: PaidBySheetProps) {
  const theme = useAppTheme();

  // Active members only, with current user placed first (Task 2)
  const activeMembers = [...members]
    .filter((m) => m.status === 'active')
    .sort((a, b) => {
      if (a.user_id === currentUserId) return -1;
      if (b.user_id === currentUserId) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

  const renderItem = ({ item }: { item: GroupMemberItem }) => {
    const isSelected = item.user_id === selectedPayerId;
    const isYou = item.user_id === currentUserId;
    const displayName = isYou
      ? `${item.name || 'You'} (You)`
      : item.name || 'Member';

    return (
      <TouchableOpacity
        style={[
          styles.memberRow,
          {
            backgroundColor: isSelected
              ? theme.colors.surfaceVariant
              : theme.colors.surface,
            borderColor: isSelected
              ? theme.colors.primary
              : 'transparent',
          },
        ]}
        activeOpacity={0.7}
        onPress={() => {
          onSelectPayer(item.user_id);
          onClose();
        }}
        accessible={true}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={`Paid by ${displayName}`}
      >
        <Avatar
          name={item.name || 'Member'}
          url={item.avatar_url}
          size={40}
        />
        <View style={styles.memberInfo}>
          <Text
            style={[
              theme.typography.body,
              { color: theme.colors.text, fontWeight: isSelected ? '700' : '500' },
            ]}
          >
            {displayName}
          </Text>
        </View>
        {isSelected ? (
          <Ionicons
            name="checkmark-circle"
            size={24}
            color={theme.colors.primary}
          />
        ) : (
          <View style={styles.placeholderCircle} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheetContainer,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outline,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[theme.typography.sectionTitle, { color: theme.colors.text }]}>
              Who paid?
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Close payer sheet"
            >
              <Ionicons name="close" size={24} color={theme.colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Member List */}
          <FlatList
            data={activeMembers}
            keyExtractor={(item) => item.user_id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    maxHeight: '65%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginVertical: 4,
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  placeholderCircle: {
    width: 24,
    height: 24,
  },
});
