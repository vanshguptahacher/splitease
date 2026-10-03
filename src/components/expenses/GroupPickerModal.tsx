import React, { useEffect, useState } from 'react';
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
import { router } from 'expo-router';
import { getLastUsedGroupId, setLastUsedGroupId } from '@/lib/expenses/lastUsedGroup';
import { useAppTheme } from '@/lib/theme';
import { GroupSummary } from '@/types/database';

export interface GroupPickerModalProps {
  visible: boolean;
  onClose: () => void;
  groups: GroupSummary[];
  currentUserId?: string;
}

export function GroupPickerModal({
  visible,
  onClose,
  groups,
  currentUserId,
}: GroupPickerModalProps) {
  const theme = useAppTheme();
  const [lastGroupId, setLastGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (visible && currentUserId) {
      getLastUsedGroupId(currentUserId).then((id) => setLastGroupId(id));
    }
  }, [visible, currentUserId]);

  const handleSelectGroup = async (groupId: string) => {
    if (currentUserId) {
      await setLastUsedGroupId(currentUserId, groupId);
    }
    onClose();
    router.push({
      pathname: '/group/[id]/add-expense',
      params: { id: groupId },
    });
  };

  // Sort with last used group first, then alphabetically
  const sortedGroups = [...groups].sort((a, b) => {
    if (a.group_id === lastGroupId) return -1;
    if (b.group_id === lastGroupId) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

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
              Add expense to group
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Close group picker"
            >
              <Ionicons name="close" size={24} color={theme.colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Group List */}
          <FlatList
            data={sortedGroups}
            keyExtractor={(item) => item.group_id}
            renderItem={({ item }) => {
              const isLastUsed = item.group_id === lastGroupId;
              const initial = (item.name || 'G').trim().charAt(0).toUpperCase();

              return (
                <TouchableOpacity
                  style={[
                    styles.groupRow,
                    {
                      backgroundColor: isLastUsed
                        ? theme.colors.surfaceVariant
                        : theme.colors.surface,
                    },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => handleSelectGroup(item.group_id)}
                >
                  <View
                    style={[
                      styles.avatarCircle,
                      { backgroundColor: theme.colors.primaryContainer },
                    ]}
                  >
                    <Text
                      style={[
                        theme.typography.caption,
                        { color: theme.colors.onPrimaryContainer, fontWeight: '700' },
                      ]}
                    >
                      {initial}
                    </Text>
                  </View>
                  <View style={styles.groupInfo}>
                    <Text
                      style={[
                        theme.typography.body,
                        { color: theme.colors.text, fontWeight: '600' },
                      ]}
                    >
                      {item.name}
                    </Text>
                    {isLastUsed && (
                      <Text
                        style={[
                          theme.typography.caption,
                          { color: theme.colors.primary, fontSize: 11 },
                        ]}
                      >
                        Recent group
                      </Text>
                    )}
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={theme.colors.muted}
                  />
                </TouchableOpacity>
              );
            }}
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
    maxHeight: '60%',
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
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginVertical: 4,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupInfo: {
    flex: 1,
    marginLeft: 12,
  },
});
