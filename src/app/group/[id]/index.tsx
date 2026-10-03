import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  AppButton,
  AppHeader,
  Avatar,
  ErrorState,
  ExpenseList,
  GroupBalancesTab,
  LoadingSkeleton,
  Screen,
  SettleUpSheet,
  useSnackbar,
} from '@/components';
import {
  useAuth,
  useDeleteGroup,
  useGroup,
  useGroupBalances,
  useGroupMembers,
  useLeaveGroup,
  useNetworkStatus,
  useRemoveMember,
  useRenameGroup,
  useSetMemberRole,
} from '@/hooks';
import { toFriendlyMessage } from '@/lib/errors';
import { useAppTheme } from '@/lib/theme';
import { GroupMemberItem } from '@/types/database';

type TabKey = 'expenses' | 'balances' | 'members';

const MAX_NAME_LENGTH = 50;

export default function GroupDetailScreen() {
  const theme = useAppTheme();
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: TabKey }>();
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();
  const { isOffline } = useNetworkStatus();

  const validParamTab =
    tab === 'expenses' || tab === 'balances' || tab === 'members' ? tab : undefined;
  const [userTab, setUserTab] = useState<TabKey | null>(null);
  const [prevParamTab, setPrevParamTab] = useState<TabKey | undefined>(validParamTab);

  if (validParamTab !== prevParamTab) {
    setPrevParamTab(validParamTab);
    setUserTab(validParamTab ?? null);
  }

  const activeTab: TabKey = userTab ?? validParamTab ?? 'members';
  const setActiveTab = setUserTab;

  const { data: groupBalances } = useGroupBalances(id);
  const pendingForMe = groupBalances?.pending_for_me ?? 0;

  // Queries
  const {
    data: group,
    isLoading: isGroupLoading,
    isError: isGroupError,
    error: groupError,
    refetch: refetchGroup,
  } = useGroup(id);

  const {
    data: members = [],
    isLoading: isMembersLoading,
    isRefetching: isMembersRefetching,
    refetch: refetchMembers,
  } = useGroupMembers(id, true);

  // Mutations
  const renameGroupMutation = useRenameGroup();
  const setMemberRoleMutation = useSetMemberRole();
  const removeMemberMutation = useRemoveMember();
  const leaveGroupMutation = useLeaveGroup();
  const deleteGroupMutation = useDeleteGroup();

  // Modals state
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isRenameVisible, setIsRenameVisible] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [isDeleteVisible, setIsDeleteVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [selectedMember, setSelectedMember] = useState<GroupMemberItem | null>(null);
  const [isMemberActionVisible, setIsMemberActionVisible] = useState(false);
  const [isPromoteBeforeLeaveVisible, setIsPromoteBeforeLeaveVisible] = useState(false);
  const [isRecordPaymentVisible, setIsRecordPaymentVisible] = useState(false);

  const isAdmin = group?.my_role === 'admin';
  const activeMembers = members.filter((m) => m.status === 'active');
  const activeAdmins = activeMembers.filter((m) => m.role === 'admin');

  // GN2: Refetch on focus
  useFocusEffect(
    useCallback(() => {
      if (id) {
        refetchGroup();
        refetchMembers();
      }
    }, [id, refetchGroup, refetchMembers])
  );

  // GN1 & GM12: Handle group not found or caller no longer a member
  useEffect(() => {
    if (isGroupError && groupError) {
      const msg = toFriendlyMessage(groupError);
      showSnackbar({ message: msg });
      router.replace('/(tabs)');
    }
  }, [isGroupError, groupError, showSnackbar]);

  const handleRefresh = async () => {
    await Promise.all([refetchGroup(), refetchMembers()]);
  };

  // Open invite screen (GI1)
  const handleOpenInvite = () => {
    setIsMenuVisible(false);
    router.push({
      pathname: '/group/[id]/invite',
      params: { id: id ?? '' },
    } as any);
  };

  // Rename group (GE1, GE2, GE3)
  const handleOpenRename = () => {
    setIsMenuVisible(false);
    setRenameText(group?.name ?? '');
    setIsRenameVisible(true);
  };

  const handleSaveRename = async () => {
    const trimmed = renameText.trim().replace(/\s+/g, ' ');
    if (!trimmed || !id || isOffline || trimmed.length > MAX_NAME_LENGTH) return;

    try {
      await renameGroupMutation.mutateAsync({ groupId: id, name: trimmed });
      showSnackbar({ message: 'Group renamed' });
      setIsRenameVisible(false);
    } catch (err) {
      showSnackbar({ message: toFriendlyMessage(err) });
    }
  };

  // Member role change with Undo snackbar (GR3, GR4, GR5)
  const handleChangeRole = async (targetMember: GroupMemberItem, newRole: 'admin' | 'member') => {
    if (!id) return;
    if (isOffline) {
      showSnackbar({ message: 'You are offline. Connect to the internet to change roles.' });
      return;
    }

    const previousRole = targetMember.role;
    try {
      await setMemberRoleMutation.mutateAsync({
        groupId: id,
        userId: targetMember.user_id,
        role: newRole,
      });

      const actionText =
        newRole === 'admin'
          ? `Promoted ${targetMember.name} to admin`
          : `Removed admin role from ${targetMember.name}`;

      showSnackbar({
        message: actionText,
        action: {
          label: 'Undo',
          onPress: async () => {
            try {
              await setMemberRoleMutation.mutateAsync({
                groupId: id,
                userId: targetMember.user_id,
                role: previousRole,
              });
              showSnackbar({ message: `Reverted role change for ${targetMember.name}` });
            } catch (undoErr) {
              showSnackbar({ message: toFriendlyMessage(undoErr) });
            }
          },
        },
      });
    } catch (err) {
      showSnackbar({ message: toFriendlyMessage(err) });
    } finally {
      setIsMemberActionVisible(false);
      setSelectedMember(null);
    }
  };

  // Remove member (GM1, GM2, GM4)
  const handleConfirmRemoveMember = (targetMember: GroupMemberItem) => {
    setIsMemberActionVisible(false);

    Alert.alert(
      `Remove ${targetMember.name}?`,
      `Are you sure you want to remove ${targetMember.name} from "${group?.name}"? They will lose access to group expenses.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            try {
              await removeMemberMutation.mutateAsync({
                groupId: id,
                userId: targetMember.user_id,
              });
              showSnackbar({ message: `${targetMember.name} removed from group` });
            } catch (err) {
              const friendly = toFriendlyMessage(err);
              if (String(err).includes('member_not_settled') || friendly.includes('Settle up')) {
                Alert.alert('Settle up first', friendly, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Go to Balances', onPress: () => setActiveTab('balances') },
                ]);
              } else {
                showSnackbar({ message: friendly });
              }
            }
          },
        },
      ]
    );
  };

  // Leave group (GM6, GM8, GM9, GM14)
  const handleInitiateLeave = () => {
    setIsMenuVisible(false);

    if (isOffline) {
      showSnackbar({ message: 'You are offline. Connect to the internet to leave group.' });
      return;
    }

    // GM8: Last admin leaving while others exist
    if (isAdmin && activeAdmins.length === 1 && activeMembers.length > 1) {
      setIsPromoteBeforeLeaveVisible(true);
      return;
    }

    // GM9: Only active member in the group
    if (activeMembers.length <= 1) {
      Alert.alert(
        'Leave and Delete Group?',
        'You are the only member in this group. Leaving will permanently delete the group and its history for everyone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Leave & Delete',
            style: 'destructive',
            onPress: executeLeave,
          },
        ]
      );
      return;
    }

    // GM6: Standard leave
    Alert.alert(
      `Leave "${group?.name}"?`,
      'Are you sure you want to leave this group? You will no longer have access to its expenses and balances.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave Group',
          style: 'destructive',
          onPress: executeLeave,
        },
      ]
    );
  };

  const executeLeave = async () => {
    if (!id || leaveGroupMutation.isPending) return;
    try {
      const result = await leaveGroupMutation.mutateAsync(id);
      showSnackbar({
        message:
          result === 'group_deleted'
            ? 'Group deleted as last member left'
            : 'You left the group',
      });
      router.replace('/(tabs)');
    } catch (err) {
      const friendly = toFriendlyMessage(err);
      if (
        String(err).includes('member_not_settled') ||
        String(err).includes('group_not_settled') ||
        friendly.includes('Settle up')
      ) {
        Alert.alert('Settle up first', friendly, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go to Balances', onPress: () => setActiveTab('balances') },
        ]);
      } else if (friendly.includes('admin') || String(err).includes('last_admin')) {
        setIsPromoteBeforeLeaveVisible(true);
      } else {
        showSnackbar({ message: friendly });
      }
    }
  };

  // Delete group (GE4, GE5, GE6, GE8)
  const handleOpenDelete = () => {
    setIsMenuVisible(false);
    setDeleteConfirmText('');
    setIsDeleteVisible(true);
  };

  const handleExecuteDelete = async () => {
    if (!id || deleteConfirmText.trim() !== 'DELETE' || isOffline) return;

    try {
      await deleteGroupMutation.mutateAsync(id);
      showSnackbar({ message: 'Group permanently deleted' });
      setIsDeleteVisible(false);
      router.replace('/(tabs)');
    } catch (err) {
      const friendly = toFriendlyMessage(err);
      if (String(err).includes('group_not_settled') || friendly.includes('settle up')) {
        setIsDeleteVisible(false);
        Alert.alert('Settle up first', friendly, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go to Balances', onPress: () => setActiveTab('balances') },
        ]);
      } else {
        showSnackbar({ message: friendly });
      }
    }
  };

  // Promote member as prerequisite to leaving (GM8)
  const handlePromoteAndProceedLeave = async (targetUserId: string) => {
    if (!id) return;
    try {
      await setMemberRoleMutation.mutateAsync({
        groupId: id,
        userId: targetUserId,
        role: 'admin',
      });
      setIsPromoteBeforeLeaveVisible(false);
      showSnackbar({ message: 'New admin promoted. You can now leave.' });
      executeLeave();
    } catch (err) {
      showSnackbar({ message: toFriendlyMessage(err) });
    }
  };

  return (
    <Screen padding={false}>
      {/* Screen Header */}
      <AppHeader
        title={group ? group.name : 'Group'}
        subtitle={group ? `${group.member_count} members` : 'Loading...'}
        showBack
        onBack={() => router.back()}
        actions={[
          ...(isAdmin
            ? [
                {
                  icon: 'person-add-outline' as const,
                  onPress: handleOpenInvite,
                  accessibilityLabel: 'Invite members',
                },
              ]
            : []),
          {
            icon: 'ellipsis-vertical' as const,
            onPress: () => setIsMenuVisible(true),
            accessibilityLabel: 'Group options',
          },
        ]}
      />

      {isGroupLoading ? (
        <View style={{ padding: theme.spacing.lg }}>
          <LoadingSkeleton variant="card" count={3} />
        </View>
      ) : isGroupError ? (
        <View style={{ flex: 1, padding: theme.spacing.lg, justifyContent: 'center' }}>
          <ErrorState
            title="Could not load group"
            message={toFriendlyMessage(groupError)}
            onRetry={handleRefresh}
          />
        </View>
      ) : group ? (
        <View style={styles.container}>
          {/* Group Overview Banner */}
          <View
            style={[
              styles.overviewBanner,
              {
                backgroundColor: theme.colors.surface,
                borderBottomColor: theme.colors.outline,
                padding: theme.spacing.lg,
              },
            ]}
          >
            <View style={styles.overviewTopRow}>
              <View style={styles.overviewTextCol}>
                <View style={styles.nameRow}>
                  <Text
                    style={[
                      theme.typography.screenTitle,
                      { color: theme.colors.text, fontSize: 22, marginRight: 8 },
                    ]}
                    numberOfLines={1}
                  >
                    {group.name}
                  </Text>
                  {isAdmin && (
                    <View
                      style={[
                        styles.adminChip,
                        {
                          backgroundColor: theme.colors.secondaryContainer,
                          borderRadius: theme.radius.pill,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          theme.typography.caption,
                          { color: theme.colors.onSecondaryContainer, fontWeight: '700' },
                        ]}
                      >
                        Admin
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[theme.typography.caption, { color: theme.colors.muted, marginTop: 4 }]}>
                  Currency: {group.currency} · {group.member_count} members
                </Text>
              </View>

              {/* Avatar Stack */}
              <View style={styles.avatarStack}>
                {activeMembers.slice(0, 4).map((m, idx) => (
                  <View
                    key={m.user_id}
                    style={[
                      styles.avatarWrapper,
                      {
                        marginLeft: idx === 0 ? 0 : -12,
                        zIndex: 4 - idx,
                        borderColor: theme.colors.surface,
                      },
                    ]}
                  >
                    <Avatar
                      url={m.avatar_url}
                      name={m.name}
                      size={32}
                    />
                  </View>
                ))}
                {activeMembers.length > 4 && (
                  <View
                    style={[
                      styles.moreAvatarBadge,
                      {
                        backgroundColor: theme.colors.surfaceVariant,
                        borderColor: theme.colors.surface,
                        borderRadius: theme.radius.pill,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        theme.typography.caption,
                        { color: theme.colors.text, fontWeight: '700', fontSize: 10 },
                      ]}
                    >
                      +{activeMembers.length - 4}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Segmented Control */}
          <View
            style={[
              styles.segmentedBar,
              {
                backgroundColor: theme.colors.surfaceVariant,
                marginHorizontal: theme.spacing.lg,
                marginVertical: theme.spacing.md,
                borderRadius: theme.radius.sm,
              },
            ]}
          >
            {(['expenses', 'balances', 'members'] as TabKey[]).map((tab) => {
              const isSelected = activeTab === tab;
              const label =
                tab === 'expenses'
                  ? 'Expenses'
                  : tab === 'balances'
                  ? 'Balances'
                  : 'Members';

              return (
                <Pressable
                  key={tab}
                  testID={`tab-${tab}`}
                  onPress={() => setActiveTab(tab)}
                  style={[
                    styles.tabButton,
                    isSelected && [
                      styles.tabButtonActive,
                      { backgroundColor: theme.colors.surface },
                    ],
                  ]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text
                      style={[
                        theme.typography.body,
                        {
                          fontSize: 14,
                          fontWeight: isSelected ? '700' : '500',
                          color: isSelected ? theme.colors.primary : theme.colors.muted,
                        },
                      ]}
                    >
                      {label}
                    </Text>
                    {tab === 'balances' && pendingForMe > 0 && (
                      <View
                        style={[
                          styles.tabBadge,
                          { backgroundColor: theme.colors.secondaryContainer },
                        ]}
                        testID="balances-tab-pending-badge"
                      >
                        <Text
                          style={[
                            theme.typography.caption,
                            {
                              color: theme.colors.onSecondaryContainer,
                              fontWeight: '700',
                              fontSize: 10,
                            },
                          ]}
                        >
                          {pendingForMe}
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Tab Content */}
          <View style={styles.tabContentContainer}>
            {activeTab === 'expenses' && (
              <ExpenseList
                groupId={group?.id || id}
                members={members}
                currentUserId={user?.id ?? ''}
                onAddExpense={() =>
                  router.push({
                    pathname: '/group/[id]/add-expense',
                    params: { id: group?.id || id },
                  })
                }
                onExpensePress={(expense) =>
                  router.push({
                    pathname: '/group/[id]/expense/[expenseId]' as any,
                    params: { id: group?.id || id, expenseId: expense.id },
                  })
                }
              />
            )}

            {activeTab === 'balances' && (
              <GroupBalancesTab
                groupId={group?.id || id}
                groupName={group?.name}
                members={members}
                currentUserId={user?.id}
                onRecordPaymentPress={() => setIsRecordPaymentVisible(true)}
                onPaymentHistoryPress={() =>
                  router.push({
                    pathname: '/group/[id]/settlements' as any,
                    params: { id: group?.id || id },
                  })
                }
              />
            )}

            {activeTab === 'members' && (
              isMembersLoading ? (
                <View style={{ padding: theme.spacing.lg }}>
                  <LoadingSkeleton variant="card" count={3} />
                </View>
              ) : (
                <FlatList
                  data={activeMembers}
                  keyExtractor={(item) => item.user_id}
                  contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: 24 }}
                  refreshControl={
                    <RefreshControl
                      refreshing={isMembersRefetching}
                      onRefresh={handleRefresh}
                      colors={[theme.colors.primary]}
                    />
                  }
                ListHeaderComponent={
                  <View style={styles.membersListHeader}>
                    <Text style={[theme.typography.caption, { color: theme.colors.muted }]}>
                      {activeMembers.length} {activeMembers.length === 1 ? 'MEMBER' : 'MEMBERS'}
                    </Text>
                    {isAdmin && (
                      <Pressable
                        onPress={handleOpenInvite}
                        style={styles.addMemberPressable}
                      >
                        <Ionicons name="person-add" size={16} color={theme.colors.primary} />
                        <Text
                          style={[
                            theme.typography.caption,
                            { color: theme.colors.primary, fontWeight: '700', marginLeft: 4 },
                          ]}
                        >
                          Invite
                        </Text>
                      </Pressable>
                    )}
                  </View>
                }
                renderItem={({ item }) => {
                  const isCaller = item.user_id === user?.id;
                  const isItemAdmin = item.role === 'admin';
                  // Non-admins see no action menu (GR11)
                  // Admins see actions on other members, or on themselves if another admin exists (GR6)
                  const canAct =
                    isAdmin && (!isCaller || (isCaller && activeAdmins.length > 1));

                  return (
                    <View
                      style={[
                        styles.memberRow,
                        {
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.outline,
                          borderRadius: theme.radius.card,
                          padding: theme.spacing.md,
                          marginBottom: theme.spacing.sm,
                        },
                      ]}
                    >
                      <Avatar url={item.avatar_url} name={item.name} size={44} />

                      <View style={styles.memberInfo}>
                        <View style={styles.memberNameRow}>
                          <Text
                            style={[
                              theme.typography.body,
                              { color: theme.colors.text, fontWeight: '600', flexShrink: 1 },
                            ]}
                            numberOfLines={1}
                          >
                            {item.name}
                          </Text>
                          {isCaller && (
                            <Text
                              style={[
                                theme.typography.caption,
                                { color: theme.colors.primary, fontWeight: '700', marginLeft: 6 },
                              ]}
                            >
                              (You)
                            </Text>
                          )}
                        </View>

                        <View style={styles.memberSubRow}>
                          {isItemAdmin && (
                            <View
                              style={[
                                styles.roleBadge,
                                { backgroundColor: theme.colors.secondaryContainer },
                              ]}
                            >
                              <Text
                                style={[
                                  theme.typography.caption,
                                  { color: theme.colors.onSecondaryContainer, fontSize: 11, fontWeight: '700' },
                                ]}
                              >
                                Admin
                              </Text>
                            </View>
                          )}
                          {item.upi_id && (
                            <Text
                              style={[
                                theme.typography.caption,
                                { color: theme.colors.muted, marginLeft: isItemAdmin ? 8 : 0 },
                              ]}
                              numberOfLines={1}
                            >
                              UPI: {item.upi_id}
                            </Text>
                          )}
                        </View>
                      </View>

                      {canAct && (
                        <Pressable
                          onPress={() => {
                            setSelectedMember(item);
                            setIsMemberActionVisible(true);
                          }}
                          style={styles.moreButton}
                          accessibilityRole="button"
                          accessibilityLabel={`Options for ${item.name}`}
                          testID={`member-options-${item.user_id}`}
                        >
                          <Ionicons
                            name="ellipsis-vertical"
                            size={18}
                            color={theme.colors.muted}
                          />
                        </Pressable>
                      )}
                    </View>
                  );
                }}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* Overflow Menu Modal */}
      <Modal
        visible={isMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMenuVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsMenuVisible(false)}
        >
          <View
            style={[
              styles.menuCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.outline,
                borderRadius: theme.radius.card,
              },
            ]}
          >
            {isAdmin && (
              <>
                <Pressable
                  style={styles.menuItem}
                  onPress={handleOpenInvite}
                >
                  <Ionicons name="person-add-outline" size={20} color={theme.colors.text} />
                  <Text style={[styles.menuItemText, { color: theme.colors.text }]}>
                    Invite Members
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.menuItem}
                  onPress={handleOpenRename}
                >
                  <Ionicons name="pencil-outline" size={20} color={theme.colors.text} />
                  <Text style={[styles.menuItemText, { color: theme.colors.text }]}>
                    Rename Group
                  </Text>
                </Pressable>
              </>
            )}

            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setIsMenuVisible(false);
                setIsRecordPaymentVisible(true);
              }}
            >
              <Ionicons name="card-outline" size={20} color={theme.colors.text} />
              <Text style={[styles.menuItemText, { color: theme.colors.text }]}>
                Record a payment
              </Text>
            </Pressable>

            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setIsMenuVisible(false);
                router.push({
                  pathname: '/group/[id]/settlements' as any,
                  params: { id: group?.id || id },
                });
              }}
            >
              <Ionicons name="time-outline" size={20} color={theme.colors.text} />
              <Text style={[styles.menuItemText, { color: theme.colors.text }]}>
                Payment history
              </Text>
            </Pressable>

            <Pressable
              style={styles.menuItem}
              onPress={handleInitiateLeave}
            >
              <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
              <Text style={[styles.menuItemText, { color: theme.colors.error }]}>
                Leave Group
              </Text>
            </Pressable>

            {isAdmin && (
              <Pressable
                style={styles.menuItem}
                onPress={handleOpenDelete}
              >
                <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                <Text style={[styles.menuItemText, { color: theme.colors.error }]}>
                  Delete Group
                </Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Member Action Sheet Modal */}
      <Modal
        visible={isMemberActionVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMemberActionVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsMemberActionVisible(false)}
        >
          {selectedMember && (
            <View
              style={[
                styles.actionSheetCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.outline,
                  borderRadius: theme.radius.sheet,
                  padding: theme.spacing.lg,
                },
              ]}
            >
              <View style={styles.sheetHeader}>
                <Avatar
                  url={selectedMember.avatar_url}
                  name={selectedMember.name}
                  size={48}
                />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text
                    style={[theme.typography.sectionTitle, { color: theme.colors.text }]}
                    numberOfLines={1}
                  >
                    {selectedMember.name}
                  </Text>
                  <Text style={[theme.typography.caption, { color: theme.colors.muted }]}>
                    {selectedMember.role === 'admin' ? 'Group Admin' : 'Member'}
                  </Text>
                </View>
              </View>

              <View style={styles.sheetDivider} />

              {/* Role Toggle Option */}
              {selectedMember.role === 'member' ? (
                <AppButton
                  title="Make Admin"
                  icon="shield-checkmark-outline"
                  variant="secondary"
                  fullWidth
                  onPress={() => handleChangeRole(selectedMember, 'admin')}
                  disabled={isOffline}
                  testID="make-admin-button"
                />
              ) : (
                <AppButton
                  title="Remove Admin Role"
                  icon="shield-outline"
                  variant="secondary"
                  fullWidth
                  onPress={() => handleChangeRole(selectedMember, 'member')}
                  disabled={isOffline || (activeAdmins.length <= 1)}
                  testID="remove-admin-role-button"
                />
              )}

              {/* Removal Option (GM1, GR13) */}
              {selectedMember.user_id !== user?.id && (
                <View style={{ marginTop: 12 }}>
                  {selectedMember.role === 'admin' ? (
                    /* GR13: Cannot remove admin directly */
                    <View
                      style={[
                        styles.noticePill,
                        { backgroundColor: theme.colors.surfaceVariant },
                      ]}
                    >
                      <Ionicons
                        name="information-circle-outline"
                        size={16}
                        color={theme.colors.muted}
                      />
                      <Text
                        style={[
                          theme.typography.caption,
                          { color: theme.colors.muted, marginLeft: 6, flex: 1 },
                        ]}
                      >
                        Remove admin role first to remove them from group.
                      </Text>
                    </View>
                  ) : (
                    <AppButton
                      title="Remove From Group"
                      icon="person-remove-outline"
                      variant="danger"
                      fullWidth
                      onPress={() => handleConfirmRemoveMember(selectedMember)}
                      disabled={isOffline}
                      testID="remove-member-button"
                    />
                  )}
                </View>
              )}

              <View style={{ marginTop: 12 }}>
                <AppButton
                  title="Cancel"
                  variant="text"
                  fullWidth
                  onPress={() => setIsMemberActionVisible(false)}
                />
              </View>
            </View>
          )}
        </Pressable>
      </Modal>

      {/* Rename Modal (GE1, GE2, GE3) */}
      <Modal
        visible={isRenameVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsRenameVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.dialogCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.outline,
                borderRadius: theme.radius.card,
                padding: theme.spacing.lg,
              },
            ]}
          >
            <Text style={[theme.typography.sectionTitle, { color: theme.colors.text, marginBottom: 8 }]}>
              Rename Group
            </Text>

            <View
              style={[
                styles.textInputBox,
                {
                  borderColor: theme.colors.outline,
                  borderRadius: theme.radius.sm,
                  paddingHorizontal: theme.spacing.md,
                },
              ]}
            >
              <TextInput
                value={renameText}
                onChangeText={setRenameText}
                maxLength={MAX_NAME_LENGTH}
                autoFocus
                style={[
                  styles.dialogInput,
                  { color: theme.colors.text, fontSize: 16 },
                ]}
                placeholder="Group name"
                placeholderTextColor={theme.colors.muted}
                testID="rename-input"
              />
            </View>

            <View style={styles.counterRow}>
              <Text
                style={[
                  theme.typography.caption,
                  {
                    color:
                      renameText.length >= MAX_NAME_LENGTH
                        ? theme.colors.error
                        : theme.colors.muted,
                  },
                ]}
              >
                {`${renameText.length} / ${MAX_NAME_LENGTH}`}
              </Text>
            </View>

            <View style={styles.dialogActions}>
              <AppButton
                title="Cancel"
                variant="secondary"
                onPress={() => setIsRenameVisible(false)}
                style={{ flex: 1 }}
              />
              <AppButton
                title="Save"
                variant="primary"
                onPress={handleSaveRename}
                loading={renameGroupMutation.isPending}
                disabled={
                  renameText.trim().length === 0 ||
                  renameText.trim() === group?.name ||
                  renameText.length > MAX_NAME_LENGTH ||
                  isOffline
                }
                style={{ flex: 1 }}
                testID="save-rename-button"
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Group Modal (GE4, GE8) */}
      <Modal
        visible={isDeleteVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDeleteVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.dialogCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.error,
                borderRadius: theme.radius.card,
                padding: theme.spacing.lg,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="warning" size={24} color={theme.colors.error} style={{ marginRight: 8 }} />
              <Text style={[theme.typography.sectionTitle, { color: theme.colors.error, flex: 1 }]}>
                Delete Group Permanently
              </Text>
            </View>

            <Text style={[theme.typography.body, { color: theme.colors.text, marginBottom: 12 }]}>
              This action cannot be undone. All expenses, balances, and member history will be permanently deleted for everyone.
            </Text>

            <Text style={[theme.typography.caption, { color: theme.colors.muted, marginBottom: 8 }]}>
              Type <Text style={{ fontWeight: '800', color: theme.colors.error }}>DELETE</Text> to confirm:
            </Text>

            <View
              style={[
                styles.textInputBox,
                {
                  borderColor: theme.colors.outline,
                  borderRadius: theme.radius.sm,
                  paddingHorizontal: theme.spacing.md,
                },
              ]}
            >
              <TextInput
                value={deleteConfirmText}
                onChangeText={setDeleteConfirmText}
                autoCapitalize="characters"
                style={[
                  styles.dialogInput,
                  { color: theme.colors.text, fontSize: 16 },
                ]}
                placeholder="DELETE"
                placeholderTextColor={theme.colors.muted}
                testID="delete-confirm-input"
              />
            </View>

            <View style={[styles.dialogActions, { marginTop: 16 }]}>
              <AppButton
                title="Cancel"
                variant="secondary"
                onPress={() => setIsDeleteVisible(false)}
                style={{ flex: 1 }}
              />
              <AppButton
                title="Delete"
                variant="danger"
                onPress={handleExecuteDelete}
                loading={deleteGroupMutation.isPending}
                disabled={deleteConfirmText.trim() !== 'DELETE' || isOffline}
                style={{ flex: 1 }}
                testID="confirm-delete-group-button"
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* GM8: Make Someone Admin First Before Leaving */}
      <Modal
        visible={isPromoteBeforeLeaveVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPromoteBeforeLeaveVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.dialogCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.outline,
                borderRadius: theme.radius.card,
                padding: theme.spacing.lg,
              },
            ]}
          >
            <Text style={[theme.typography.sectionTitle, { color: theme.colors.text, marginBottom: 6 }]}>
              Make Someone Admin First
            </Text>
            <Text style={[theme.typography.body, { color: theme.colors.muted, marginBottom: 14 }]}>
              A group needs at least one admin. Choose a member to promote before leaving:
            </Text>

            <FlatList
              data={activeMembers.filter((m) => m.user_id !== user?.id)}
              keyExtractor={(item) => item.user_id}
              style={{ maxHeight: 200 }}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.promotePickRow,
                    {
                      borderBottomColor: theme.colors.outline,
                      paddingVertical: 10,
                    },
                  ]}
                  onPress={() => handlePromoteAndProceedLeave(item.user_id)}
                >
                  <Avatar url={item.avatar_url} name={item.name} size={36} />
                  <Text
                    style={[
                      theme.typography.body,
                      { color: theme.colors.text, flex: 1, marginLeft: 10 },
                    ]}
                  >
                    {item.name}
                  </Text>
                  <Text style={[theme.typography.caption, { color: theme.colors.primary, fontWeight: '700' }]}>
                    Make Admin & Leave
                  </Text>
                </Pressable>
              )}
            />

            <View style={{ marginTop: 16 }}>
              <AppButton
                title="Cancel"
                variant="secondary"
                fullWidth
                onPress={() => setIsPromoteBeforeLeaveVisible(false)}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Record Payment Sheet from Overflow Menu */}
      <SettleUpSheet
        visible={isRecordPaymentVisible}
        onClose={() => setIsRecordPaymentVisible(false)}
        groupId={group?.id || id}
        members={members}
        currentUserId={user?.id || ''}
        mode="record_payment"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overviewBanner: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  overviewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  overviewTextCol: {
    flex: 1,
    marginRight: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  adminChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrapper: {
    borderWidth: 2,
    borderRadius: 16,
  },
  moreAvatarBadge: {
    width: 28,
    height: 28,
    marginLeft: -10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  segmentedBar: {
    flexDirection: 'row',
    padding: 3,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  tabButtonActive: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    marginLeft: 6,
  },
  tabContentContainer: {
    flex: 1,
  },
  placeholderCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  membersListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  addMemberPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  roleBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  moreButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  menuCard: {
    position: 'absolute',
    top: 60,
    right: 16,
    width: 200,
    borderWidth: 1,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '500',
  },
  actionSheetCard: {
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sheetDivider: {
    height: 16,
  },
  noticePill: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
  },
  textInputBox: {
    borderWidth: 1,
    marginVertical: 8,
  },
  dialogInput: {
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  counterRow: {
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 12,
  },
  promotePickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
