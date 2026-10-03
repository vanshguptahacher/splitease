import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import { AppButton } from '@/components/AppButton';
import { formatMoney, computeShares } from '@/lib/money';
import { parseAmountToMinor } from '@/lib/money/parse';
import { useAppTheme } from '@/lib/theme';
import { GroupMemberItem } from '@/types/database';

export type SplitType = 'equal' | 'exact' | 'percent';

export interface SplitParticipantConfig {
  user_id: string;
  value?: number; // exact paise or percent bp (basis points: 100% = 10000)
}

export interface SplitSheetProps {
  visible: boolean;
  onClose: () => void;
  members: GroupMemberItem[];
  currentUserId?: string;
  totalAmountMinor: number; // in integer paise
  splitType: SplitType;
  participants: SplitParticipantConfig[];
  onApplySplit: (type: SplitType, participants: SplitParticipantConfig[]) => void;
}

export function SplitSheet({
  visible,
  onClose,
  members,
  currentUserId,
  totalAmountMinor,
  splitType: initialSplitType,
  participants: initialParticipants,
  onApplySplit,
}: SplitSheetProps) {
  const theme = useAppTheme();

  // Active members sorted with current user first
  const activeMembers = useMemo(
    () =>
      [...members]
        .filter((m) => m.status === 'active')
        .sort((a, b) => {
          if (a.user_id === currentUserId) return -1;
          if (b.user_id === currentUserId) return 1;
          return (a.name || '').localeCompare(b.name || '');
        }),
    [members, currentUserId]
  );

  const [activeTab, setActiveTab] = useState<SplitType>(initialSplitType);

  // Equal split selection state: Set of selected user_ids
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(() => {
    if (initialSplitType === 'equal' && initialParticipants.length > 0) {
      return new Set(initialParticipants.map((p) => p.user_id));
    }
    // Default: everyone selected (EQ1)
    return new Set(activeMembers.map((m) => m.user_id));
  });

  // Exact split inputs: Record<userId, textInputString>
  const [exactInputs, setExactInputs] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (initialSplitType === 'exact') {
      for (const p of initialParticipants) {
        if (p.value !== undefined && p.value > 0) {
          map[p.user_id] = (p.value / 100).toFixed(2).replace(/\.00$/, '');
        }
      }
    }
    return map;
  });

  // Percent split inputs: Record<userId, textInputString>
  const [percentInputs, setPercentInputs] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (initialSplitType === 'percent') {
      for (const p of initialParticipants) {
        if (p.value !== undefined && p.value > 0) {
          map[p.user_id] = (p.value / 100).toFixed(2).replace(/\.00$/, '');
        }
      }
    }
    return map;
  });

  // Switching tab handlers (EX5, EP6)
  const handleTabSwitch = (newTab: SplitType) => {
    if (newTab === activeTab) return;

    if (newTab === 'exact') {
      // Prefill with current equal shares if exact fields are empty (EX5)
      const hasAnyExact = Object.values(exactInputs).some((v) => v && v.trim() !== '');
      if (!hasAnyExact && totalAmountMinor > 0) {
        const selected = activeMembers.filter((m) => selectedUserIds.has(m.user_id));
        if (selected.length > 0) {
          try {
            const shares = computeShares(
              'equal',
              totalAmountMinor,
              selected.map((s) => ({ user_id: s.user_id }))
            );
            const newInputs: Record<string, string> = {};
            for (const s of shares) {
              newInputs[s.user_id] = (s.share_minor / 100).toFixed(2);
            }
            setExactInputs(newInputs);
          } catch {
            // fallback
          }
        }
      }
    } else if (newTab === 'percent') {
      // Prefill with equal percentages if percent fields are empty (EP6)
      const hasAnyPercent = Object.values(percentInputs).some((v) => v && v.trim() !== '');
      if (!hasAnyPercent) {
        const selected = activeMembers.filter((m) => selectedUserIds.has(m.user_id));
        const count = selected.length;
        if (count > 0) {
          const baseBp = Math.floor(10000 / count);
          const remainderBp = 10000 % count;
          const newInputs: Record<string, string> = {};
          selected.forEach((m, idx) => {
            const bp = baseBp + (idx < remainderBp ? 1 : 0);
            newInputs[m.user_id] = (bp / 100).toFixed(2);
          });
          setPercentInputs(newInputs);
        }
      }
    }

    setActiveTab(newTab);
  };

  // 1. Equal split calculation
  const equalSharesMap = useMemo(() => {
    const selected = activeMembers.filter((m) => selectedUserIds.has(m.user_id));
    if (selected.length === 0 || totalAmountMinor <= 0) return {};
    try {
      const shares = computeShares(
        'equal',
        totalAmountMinor,
        selected.map((m) => ({ user_id: m.user_id }))
      );
      const map: Record<string, number> = {};
      for (const s of shares) {
        map[s.user_id] = s.share_minor;
      }
      return map;
    } catch {
      return {};
    }
  }, [activeMembers, selectedUserIds, totalAmountMinor]);

  const toggleEqualSelectAll = () => {
    if (selectedUserIds.size === activeMembers.length) {
      // Deselect all
      setSelectedUserIds(new Set());
    } else {
      // Select all
      setSelectedUserIds(new Set(activeMembers.map((m) => m.user_id)));
    }
  };

  const toggleEqualUser = (userId: string) => {
    const next = new Set(selectedUserIds);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    setSelectedUserIds(next);
  };

  // 2. Exact split calculation
  const { exactDiffMinor } = useMemo(() => {
    let sum = 0;
    for (const val of Object.values(exactInputs)) {
      const minor = parseAmountToMinor(val);
      if (minor) sum += minor;
    }
    return {
      exactDiffMinor: totalAmountMinor - sum,
    };
  }, [exactInputs, totalAmountMinor]);

  const handleSplitRestEqually = () => {
    if (exactDiffMinor <= 0) return;
    // Find active members whose exact field is empty or 0
    const emptyMembers = activeMembers.filter((m) => {
      const val = exactInputs[m.user_id];
      const minor = parseAmountToMinor(val);
      return !minor || minor === 0;
    });

    if (emptyMembers.length === 0) return;

    try {
      const leftoverShares = computeShares(
        'equal',
        exactDiffMinor,
        emptyMembers.map((m) => ({ user_id: m.user_id }))
      );
      const nextInputs = { ...exactInputs };
      for (const s of leftoverShares) {
        nextInputs[s.user_id] = (s.share_minor / 100).toFixed(2);
      }
      setExactInputs(nextInputs);
    } catch {
      // fallback
    }
  };

  // 3. Percent split calculation
  const { percentDiffBp } = useMemo(() => {
    let sumBp = 0;
    for (const val of Object.values(percentInputs)) {
      if (!val || !val.trim()) continue;
      const num = parseFloat(val.trim());
      if (!isNaN(num) && num > 0) {
        sumBp += Math.round(num * 100);
      }
    }
    return {
      percentDiffBp: 10000 - sumBp,
    };
  }, [percentInputs]);

  // Done / Apply handler
  const handleDone = () => {
    if (activeTab === 'equal') {
      const participants: SplitParticipantConfig[] = Array.from(selectedUserIds).map(
        (userId) => ({ user_id: userId })
      );
      onApplySplit('equal', participants);
    } else if (activeTab === 'exact') {
      const participants: SplitParticipantConfig[] = [];
      for (const [userId, val] of Object.entries(exactInputs)) {
        const minor = parseAmountToMinor(val);
        if (minor && minor > 0) {
          participants.push({ user_id: userId, value: minor });
        }
      }
      onApplySplit('exact', participants);
    } else if (activeTab === 'percent') {
      const participants: SplitParticipantConfig[] = [];
      for (const [userId, val] of Object.entries(percentInputs)) {
        if (!val || !val.trim()) continue;
        const num = parseFloat(val.trim());
        if (!isNaN(num) && num > 0) {
          participants.push({
            user_id: userId,
            value: Math.round(num * 100),
          });
        }
      }
      onApplySplit('percent', participants);
    }
    onClose();
  };

  // Render Member row for Equal tab
  const renderEqualRow = ({ item }: { item: GroupMemberItem }) => {
    const isSelected = selectedUserIds.has(item.user_id);
    const isYou = item.user_id === currentUserId;
    const shareMinor = equalSharesMap[item.user_id] ?? 0;
    const displayName = isYou ? `${item.name} (You)` : item.name;

    return (
      <TouchableOpacity
        style={[
          styles.memberRow,
          {
            backgroundColor: isSelected
              ? theme.colors.surfaceVariant
              : theme.colors.surface,
          },
        ]}
        onPress={() => toggleEqualUser(item.user_id)}
        activeOpacity={0.7}
        accessible={true}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={`${displayName}, ${isSelected ? `share ${formatMoney(shareMinor)}` : 'not selected'}`}
      >
        <Avatar name={item.name} url={item.avatar_url} size={36} />
        <View style={styles.memberInfo}>
          <Text
            style={[
              theme.typography.body,
              { color: theme.colors.text, fontWeight: isSelected ? '600' : '400' },
            ]}
          >
            {displayName}
          </Text>
          {isSelected && totalAmountMinor > 0 && (
            <Text style={[theme.typography.caption, { color: theme.colors.primary, fontWeight: '600' }]}>
              {formatMoney(shareMinor)}
            </Text>
          )}
        </View>
        <Ionicons
          name={isSelected ? 'checkbox' : 'square-outline'}
          size={24}
          color={isSelected ? theme.colors.primary : theme.colors.muted}
        />
      </TouchableOpacity>
    );
  };

  // Render Member row for Exact tab
  const renderExactRow = ({ item }: { item: GroupMemberItem }) => {
    const isYou = item.user_id === currentUserId;
    const displayName = isYou ? `${item.name} (You)` : item.name;
    const val = exactInputs[item.user_id] ?? '';

    return (
      <View style={styles.inputRow}>
        <Avatar name={item.name} url={item.avatar_url} size={36} />
        <Text style={[styles.inputRowName, theme.typography.body, { color: theme.colors.text }]}>
          {displayName}
        </Text>
        <View style={[styles.fieldWrapper, { borderColor: theme.colors.outline }]}>
          <Text style={[styles.fieldCurrency, { color: theme.colors.muted }]}>₹</Text>
          <TextInput
            style={[styles.numericInput, { color: theme.colors.text }]}
            placeholder="0.00"
            placeholderTextColor={theme.colors.muted}
            keyboardType="decimal-pad"
            value={val}
            onChangeText={(text) =>
              setExactInputs((prev) => ({ ...prev, [item.user_id]: text }))
            }
          />
        </View>
      </View>
    );
  };

  // Render Member row for Percent tab
  const renderPercentRow = ({ item }: { item: GroupMemberItem }) => {
    const isYou = item.user_id === currentUserId;
    const displayName = isYou ? `${item.name} (You)` : item.name;
    const val = percentInputs[item.user_id] ?? '';

    return (
      <View style={styles.inputRow}>
        <Avatar name={item.name} url={item.avatar_url} size={36} />
        <Text style={[styles.inputRowName, theme.typography.body, { color: theme.colors.text }]}>
          {displayName}
        </Text>
        <View style={[styles.fieldWrapper, { borderColor: theme.colors.outline }]}>
          <TextInput
            style={[styles.numericInput, { color: theme.colors.text, textAlign: 'right' }]}
            placeholder="0"
            placeholderTextColor={theme.colors.muted}
            keyboardType="decimal-pad"
            value={val}
            onChangeText={(text) =>
              setPercentInputs((prev) => ({ ...prev, [item.user_id]: text }))
            }
          />
          <Text style={[styles.fieldUnit, { color: theme.colors.muted }]}>%</Text>
        </View>
      </View>
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
              Split expense
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Close split sheet"
            >
              <Ionicons name="close" size={24} color={theme.colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Split Type Tabs */}
          <View style={[styles.tabBar, { backgroundColor: theme.colors.surfaceVariant }]}>
            {(['equal', 'exact', 'percent'] as SplitType[]).map((tab) => {
              const isSelected = activeTab === tab;
              const tabLabels = { equal: 'Equal', exact: 'Exact', percent: 'Percent' };
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => handleTabSwitch(tab)}
                  style={[
                    styles.tabButton,
                    isSelected && {
                      backgroundColor: theme.colors.surface,
                      shadowColor: '#000',
                      shadowOpacity: 0.1,
                      shadowRadius: 4,
                      elevation: 2,
                    },
                  ]}
                >
                  <Text
                    style={[
                      theme.typography.caption,
                      {
                        color: isSelected ? theme.colors.primary : theme.colors.muted,
                        fontWeight: isSelected ? '700' : '500',
                        fontSize: 13,
                      },
                    ]}
                  >
                    {tabLabels[tab]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Sub-header status / Action helpers */}
          {activeTab === 'equal' && (
            <View style={styles.subHeaderRow}>
              <Text style={[theme.typography.caption, { color: theme.colors.muted }]}>
                {selectedUserIds.size === 0
                  ? 'Pick at least one person.'
                  : `Split equally among ${selectedUserIds.size} people`}
              </Text>
              <TouchableOpacity onPress={toggleEqualSelectAll}>
                <Text style={[theme.typography.caption, { color: theme.colors.primary, fontWeight: '700' }]}>
                  {selectedUserIds.size === activeMembers.length ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {activeTab === 'exact' && (
            <View style={styles.subHeaderCol}>
              <View style={styles.subHeaderRow}>
                <Text
                  style={[
                    theme.typography.caption,
                    {
                      color:
                        exactDiffMinor === 0
                          ? theme.colors.primary
                          : exactDiffMinor < 0
                          ? theme.colors.error
                          : theme.colors.muted,
                      fontWeight: '700',
                    },
                  ]}
                >
                  {exactDiffMinor === 0
                    ? `All assigned: ${formatMoney(totalAmountMinor)}`
                    : exactDiffMinor < 0
                    ? `${formatMoney(-exactDiffMinor)} over assigned!`
                    : `${formatMoney(exactDiffMinor)} left to assign`}
                </Text>
                {exactDiffMinor > 0 && (
                  <TouchableOpacity onPress={handleSplitRestEqually}>
                    <Text style={[theme.typography.caption, { color: theme.colors.primary, fontWeight: '700' }]}>
                      Split rest equally
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {activeTab === 'percent' && (
            <View style={styles.subHeaderRow}>
              <Text
                style={[
                  theme.typography.caption,
                  {
                    color:
                      percentDiffBp === 0
                        ? theme.colors.primary
                        : percentDiffBp < 0
                        ? theme.colors.error
                        : theme.colors.muted,
                    fontWeight: '700',
                  },
                ]}
              >
                {percentDiffBp === 0
                  ? '100.00% of 100% assigned'
                  : percentDiffBp < 0
                  ? `${(-percentDiffBp / 100).toFixed(2)}% over 100%!`
                  : `${(percentDiffBp / 100).toFixed(2)}% left to assign`}
              </Text>
            </View>
          )}

          {/* Members list */}
          <FlatList
            data={activeMembers}
            keyExtractor={(item) => item.user_id}
            renderItem={
              activeTab === 'equal'
                ? renderEqualRow
                : activeTab === 'exact'
                ? renderExactRow
                : renderPercentRow
            }
            contentContainerStyle={styles.listContent}
          />

          {/* Done Bar */}
          <View style={styles.footer}>
            <AppButton
              title="Done"
              variant="primary"
              fullWidth
              onPress={handleDone}
            />
          </View>
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
    maxHeight: '80%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 3,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  subHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  subHeaderCol: {
    width: '100%',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginVertical: 4,
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  inputRowName: {
    flex: 1,
    marginLeft: 12,
  },
  fieldWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 42,
    width: 110,
  },
  fieldCurrency: {
    fontSize: 14,
    marginRight: 4,
  },
  fieldUnit: {
    fontSize: 14,
    marginLeft: 4,
  },
  numericInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});
