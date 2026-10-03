import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  AppButton,
  AppHeader,
  EmptyState,
  ErrorState,
  GroupPickerModal,
  LoadingSkeleton,
  OfflineBanner,
  Screen,
  useSnackbar,
} from '@/components';
import { useAuth, useGroups, useNetworkStatus } from '@/hooks';
import { toFriendlyMessage } from '@/lib/errors';
import { formatTimeAgo } from '@/lib/activity/formatActivity';
import { useAppTheme } from '@/lib/theme';
import { GroupSummary } from '@/types/database';

export default function GroupsTabScreen() {
  const theme = useAppTheme();
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();
  const { isOffline } = useNetworkStatus();
  const { data: groups, isLoading, isError, error, refetch, isRefetching } = useGroups();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [groupPickerVisible, setGroupPickerVisible] = useState(false);

  // Refetch when tab comes into focus (GN2)
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const openAddExpense = () => {
    setSheetVisible(false);
    if (!groups || groups.length === 0) {
      showSnackbar({ message: 'Create or join a group first before adding an expense.' });
      return;
    }
    if (groups.length === 1) {
      router.push({
        pathname: '/group/[id]/add-expense',
        params: { id: groups[0].group_id },
      });
      return;
    }
    setGroupPickerVisible(true);
  };

  const openNewGroup = () => {
    setSheetVisible(false);
    router.push('/group/new');
  };

  const openJoinGroup = () => {
    setSheetVisible(false);
    router.push('/group/join');
  };

  const renderGroupCard = ({ item }: { item: GroupSummary }) => {
    const isAdmin = item.my_role === 'admin';
    const initial = (item.name || 'G').trim().charAt(0).toUpperCase();

    return (
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.outline,
            borderRadius: theme.radius.card,
            padding: theme.spacing.md,
            marginBottom: theme.spacing.md,
          },
        ]}
        onPress={() =>
          router.push({
            pathname: '/group/[id]',
            params: { id: item.group_id },
          })
        }
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Group ${item.name}, ${item.member_count} members${isAdmin ? ', Admin' : ''}`}
      >
        <View style={styles.cardRow}>
          {/* Avatar / Initial circle */}
          <View
            style={[
              styles.avatarCircle,
              {
                backgroundColor: theme.colors.primaryContainer,
                borderRadius: theme.radius.pill,
              },
            ]}
          >
            <Text
              style={[
                theme.typography.sectionTitle,
                { color: theme.colors.onPrimaryContainer, fontWeight: '700' },
              ]}
            >
              {initial}
            </Text>
          </View>

          {/* Group details */}
          <View style={styles.cardDetails}>
            <View style={styles.titleRow}>
              {/* Truncated for long names (GU2) */}
              <Text
                style={[
                  theme.typography.sectionTitle,
                  styles.groupName,
                  { color: theme.colors.text },
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {item.name}
              </Text>

              {/* Admin Badge */}
              {isAdmin && (
                <View
                  style={[
                    styles.adminBadge,
                    {
                      backgroundColor: theme.colors.secondaryContainer,
                      borderRadius: theme.radius.pill,
                      paddingHorizontal: theme.spacing.sm,
                      paddingVertical: 2,
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

            <Text
              style={[
                theme.typography.caption,
                { color: theme.colors.muted, marginTop: 4 },
              ]}
            >
              {item.member_count} {item.member_count === 1 ? 'member' : 'members'}
              {item.last_activity_at ? ` · Active ${formatTimeAgo(item.last_activity_at)}` : ''}
            </Text>
          </View>

          <Ionicons
            name="chevron-forward"
            size={20}
            color={theme.colors.muted}
            style={styles.chevron}
          />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Screen padding={false}>
      <AppHeader
        title="Groups"
        subtitle="SplitEase"
        actions={[
          {
            icon: 'add-outline',
            onPress: () => setSheetVisible(true),
            accessibilityLabel: 'Group actions',
          },
        ]}
      />

      {isOffline && <OfflineBanner />}

      <View style={styles.container}>
        {isLoading && !groups ? (
          <View style={{ padding: theme.spacing.lg }}>
            <LoadingSkeleton variant="card" count={4} />
          </View>
        ) : isError ? (
          <ErrorState
            title="Could not load groups"
            message={toFriendlyMessage(error)}
            onRetry={() => refetch()}
            retryTitle="Retry"
            retryLoading={isRefetching}
          />
        ) : groups && groups.length === 0 ? (
          // Empty State with Create and Join actions (GC10)
          <View style={styles.emptyContainer}>
            <EmptyState
              icon="people-outline"
              title="No groups yet"
              message="Create a group to start splitting expenses with friends, or join an existing group with an invite code."
              actionTitle="Create Group"
              onAction={openNewGroup}
            />
            <View style={{ marginTop: theme.spacing.md, width: '100%', maxWidth: 240, alignSelf: 'center' }}>
              <AppButton
                title="Join with Code"
                variant="secondary"
                icon="key-outline"
                onPress={openJoinGroup}
                fullWidth
              />
            </View>
          </View>
        ) : (
          // Virtualized List of groups (GC11, GC12, GU3)
          <FlatList
            data={groups}
            keyExtractor={(item) => item.group_id}
            renderItem={renderGroupCard}
            contentContainerStyle={[
              styles.listContent,
              { padding: theme.spacing.lg, paddingBottom: 100 },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                tintColor={theme.colors.primary}
                colors={[theme.colors.primary]}
              />
            }
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Floating Action Button (FAB) at bottom-right (GU5) */}
        {!isLoading && !isError && groups && groups.length > 0 && (
          <TouchableOpacity
            style={[
              styles.fab,
              {
                backgroundColor: theme.colors.primary,
                borderRadius: theme.radius.pill,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 6,
                elevation: 6,
              },
            ]}
            onPress={() => setSheetVisible(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Add or join group"
          >
            <Ionicons name="add" size={28} color={theme.colors.onPrimary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Bottom Action Sheet for Create / Join */}
      <Modal
        visible={sheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSheetVisible(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setSheetVisible(false)}
        >
          <Pressable
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.surface,
                borderTopLeftRadius: theme.radius.sheet,
                borderTopRightRadius: theme.radius.sheet,
                padding: theme.spacing.xl,
              },
            ]}
          >
            <View style={styles.sheetHandle} />

            <Text
              style={[
                theme.typography.sectionTitle,
                { color: theme.colors.text, marginBottom: theme.spacing.lg },
              ]}
            >
              Add or Join Group
            </Text>

            <TouchableOpacity
              style={[
                styles.sheetOption,
                {
                  backgroundColor: theme.colors.surfaceVariant,
                  borderRadius: theme.radius.card,
                  padding: theme.spacing.md,
                  marginBottom: theme.spacing.md,
                },
              ]}
              onPress={openAddExpense}
            >
              <View
                style={[
                  styles.sheetIconCircle,
                  { backgroundColor: theme.colors.primaryContainer },
                ]}
              >
                <Ionicons
                  name="receipt-outline"
                  size={22}
                  color={theme.colors.primary}
                />
              </View>
              <View style={styles.sheetOptionText}>
                <Text
                  style={[
                    theme.typography.body,
                    { color: theme.colors.text, fontWeight: '700' },
                  ]}
                >
                  Add Expense
                </Text>
                <Text
                  style={[
                    theme.typography.caption,
                    { color: theme.colors.muted, marginTop: 2 },
                  ]}
                >
                  Split an expense with a group
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.muted}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.sheetOption,
                {
                  backgroundColor: theme.colors.surfaceVariant,
                  borderRadius: theme.radius.card,
                  padding: theme.spacing.md,
                  marginBottom: theme.spacing.md,
                },
              ]}
              onPress={openNewGroup}
            >
              <View
                style={[
                  styles.sheetIconCircle,
                  { backgroundColor: theme.colors.primaryContainer },
                ]}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={24}
                  color={theme.colors.primary}
                />
              </View>
              <View style={styles.sheetOptionText}>
                <Text
                  style={[
                    theme.typography.body,
                    { color: theme.colors.text, fontWeight: '700' },
                  ]}
                >
                  Create Group
                </Text>
                <Text
                  style={[
                    theme.typography.caption,
                    { color: theme.colors.muted, marginTop: 2 },
                  ]}
                >
                  Start a new group and invite members
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.muted}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.sheetOption,
                {
                  backgroundColor: theme.colors.surfaceVariant,
                  borderRadius: theme.radius.card,
                  padding: theme.spacing.md,
                  marginBottom: theme.spacing.xl,
                },
              ]}
              onPress={openJoinGroup}
            >
              <View
                style={[
                  styles.sheetIconCircle,
                  { backgroundColor: theme.colors.secondaryContainer },
                ]}
              >
                <Ionicons
                  name="key-outline"
                  size={22}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.sheetOptionText}>
                <Text
                  style={[
                    theme.typography.body,
                    { color: theme.colors.text, fontWeight: '700' },
                  ]}
                >
                  Join with Code
                </Text>
                <Text
                  style={[
                    theme.typography.caption,
                    { color: theme.colors.muted, marginTop: 2 },
                  ]}
                >
                  Enter an 8-character invite code
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.muted}
              />
            </TouchableOpacity>

            <AppButton
              title="Cancel"
              variant="text"
              fullWidth
              onPress={() => setSheetVisible(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Quick Add Group Picker Modal */}
      <GroupPickerModal
        visible={groupPickerVisible}
        onClose={() => setGroupPickerVisible(false)}
        groups={groups ?? []}
        currentUserId={user?.id}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  listContent: {
    flexGrow: 1,
  },
  card: {
    borderWidth: 1,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardDetails: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupName: {
    flexShrink: 1,
    marginRight: 8,
  },
  adminBadge: {
    alignSelf: 'center',
  },
  chevron: {
    marginLeft: 8,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#888888',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sheetIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sheetOptionText: {
    flex: 1,
  },
});
