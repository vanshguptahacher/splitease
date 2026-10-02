import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  AppButton,
  AppHeader,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Screen,
  useSnackbar,
} from '@/components';
import { useJoinGroup, useNetworkStatus, usePreviewInvite } from '@/hooks';
import { clearPendingLink } from '@/lib/auth/pendingLink';
import { toFriendlyMessage } from '@/lib/errors';
import { formatInviteCode, parseInviteCode } from '@/lib/invite/parseCode';
import { useAppTheme } from '@/lib/theme';

export default function JoinPreviewScreen() {
  const theme = useAppTheme();
  const { showSnackbar } = useSnackbar();
  const { isOffline } = useNetworkStatus();
  const { code: rawCode } = useLocalSearchParams<{ code?: string }>();

  const normalizedCode = useMemo(() => parseInviteCode(rawCode), [rawCode]);

  // Handle malformed or missing code: redirect to manual join entry (Case GJ17)
  useEffect(() => {
    if (!rawCode || !normalizedCode) {
      router.replace('/group/join');
    }
  }, [rawCode, normalizedCode]);

  const {
    data: preview,
    isLoading: isPreviewLoading,
    error: previewError,
    refetch,
  } = usePreviewInvite(normalizedCode ?? undefined);

  const joinMutation = useJoinGroup();
  const [joinResultStatus, setJoinResultStatus] = useState<string | null>(null);

  // Clear pending link on final server response, never on network error (Case GJ16)
  useEffect(() => {
    if (preview && preview.status !== 'valid') {
      clearPendingLink();
    }
  }, [preview]);

  const handleBack = useCallback(() => {
    clearPendingLink();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, []);

  const handleJoin = useCallback(async () => {
    if (!normalizedCode) return;

    try {
      const result = await joinMutation.mutateAsync(normalizedCode);
      await clearPendingLink(); // Final result arrived

      if (result.r_status === 'joined') {
        showSnackbar({
          message: `Joined ${result.r_group_name || 'group'} successfully!`,
        });
        if (result.r_group_id) {
          router.replace({
            pathname: '/group/[id]',
            params: { id: result.r_group_id },
          });
        } else {
          router.replace('/(tabs)');
        }
      } else if (result.r_status === 'already_member') {
        showSnackbar({ message: "You're already in this group." });
        if (result.r_group_id) {
          router.replace({
            pathname: '/group/[id]',
            params: { id: result.r_group_id },
          });
        } else {
          router.replace('/(tabs)');
        }
      } else {
        setJoinResultStatus(result.r_status);
      }
    } catch (err) {
      // Keep pending link on network failure (Case GJ16)
      showSnackbar({ message: toFriendlyMessage(err) });
    }
  }, [normalizedCode, joinMutation, showSnackbar]);

  if (!normalizedCode) {
    return (
      <Screen padding={false}>
        <AppHeader title="Join Group" showBack onBack={handleBack} />
        <View style={styles.centerContainer}>
          <LoadingSkeleton count={1} height={120} />
        </View>
      </Screen>
    );
  }

  // Network / Loading State
  if (isPreviewLoading) {
    return (
      <Screen padding={false}>
        <AppHeader
          title="Join Group"
          subtitle={`Code: ${formatInviteCode(normalizedCode)}`}
          showBack
          onBack={handleBack}
        />
        <View style={[styles.content, { padding: theme.spacing.xl }]}>
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.outline,
                borderRadius: theme.radius.sheet,
                padding: theme.spacing.xl,
              },
            ]}
          >
            <LoadingSkeleton count={3} height={36} />
          </View>
        </View>
      </Screen>
    );
  }

  // Network error or fetch failure (Case GJ16: pending link is kept, retry offered)
  if (previewError && !preview) {
    return (
      <Screen padding={false}>
        <AppHeader
          title="Join Group"
          subtitle={`Code: ${formatInviteCode(normalizedCode)}`}
          showBack
          onBack={handleBack}
        />
        <View style={[styles.centerContainer, { padding: theme.spacing.xl }]}>
          <ErrorState
            title="Connection Error"
            message={toFriendlyMessage(previewError)}
            onRetry={refetch}
          />
        </View>
      </Screen>
    );
  }

  const effectiveStatus = joinResultStatus || preview?.status || 'invalid';

  // Non-valid statuses from preview or join (Section 5)
  if (effectiveStatus !== 'valid') {
    let title = 'Cannot Join Group';
    let message = 'Something went wrong. Please check your invite code.';
    let icon: any = 'alert-circle-outline';
    let actionTitle = 'Back to Groups';
    let onAction = handleBack;

    switch (effectiveStatus) {
      case 'already_member':
        title = 'Already a Member';
        message = "You're already in this group.";
        icon = 'checkmark-circle-outline';
        actionTitle = 'Go to Groups';
        break;
      case 'invalid':
        title = 'Code Not Found';
        message = 'Code not found. Check it and try again.';
        icon = 'key-outline';
        actionTitle = 'Try Another Code';
        onAction = () => router.replace('/group/join');
        break;
      case 'expired':
        title = 'Invite Expired';
        message = 'This invite has expired. Ask an admin for a new one.';
        icon = 'time-outline';
        break;
      case 'revoked':
        title = 'Invite Reset';
        message = 'This invite was reset by an admin. Ask for the new one.';
        icon = 'refresh-outline';
        break;
      case 'removed':
        title = 'Removed from Group';
        message = 'An admin removed you from this group. Ask for a new invite.';
        icon = 'ban-outline';
        break;
      case 'group_full':
        title = 'Group Full';
        message = 'This group is full.';
        icon = 'people-outline';
        break;
      case 'too_many_groups':
        title = 'Group Limit Reached';
        message = "You've reached the limit of 50 groups.";
        icon = 'folder-outline';
        break;
      case 'too_many_attempts':
        title = 'Too Many Attempts';
        message = 'Too many wrong codes. Try again in about 15 minutes.';
        icon = 'lock-closed-outline';
        break;
    }

    return (
      <Screen padding={false}>
        <AppHeader
          title="Join Group"
          subtitle={`Code: ${formatInviteCode(normalizedCode)}`}
          showBack
          onBack={handleBack}
        />
        <View style={[styles.centerContainer, { padding: theme.spacing.xl }]}>
          <EmptyState
            icon={icon}
            title={title}
            message={message}
            actionTitle={actionTitle}
            onAction={onAction}
          />
        </View>
      </Screen>
    );
  }

  // Valid preview state (Case GJ1, GJ18)
  // GJ18: Only group name, member count, and inviter's name. Nothing else.
  return (
    <Screen padding={false}>
      <AppHeader
        title="Group Invite"
        subtitle={`Code: ${formatInviteCode(normalizedCode)}`}
        showBack
        onBack={handleBack}
      />

      <View style={[styles.content, { padding: theme.spacing.xl }]}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outline,
              borderRadius: theme.radius.sheet,
              padding: theme.spacing.xl,
            },
          ]}
        >
          <Text
            style={[
              theme.typography.caption,
              { color: theme.colors.muted, textTransform: 'uppercase', marginBottom: theme.spacing.xs },
            ]}
          >
            You are invited to join
          </Text>

          <Text
            style={[
              theme.typography.screenTitle,
              { color: theme.colors.text, marginBottom: theme.spacing.md },
            ]}
            numberOfLines={2}
          >
            {preview?.group_name || 'Group'}
          </Text>

          <View
            style={[
              styles.infoBadgeRow,
              {
                backgroundColor: theme.colors.surfaceVariant,
                borderRadius: theme.radius.card,
                padding: theme.spacing.md,
                marginBottom: theme.spacing.xl,
              },
            ]}
          >
            <Text
              style={[
                theme.typography.body,
                { color: theme.colors.text, fontWeight: '600' },
              ]}
            >
              {preview?.member_count ?? 1}{' '}
              {preview?.member_count === 1 ? 'member' : 'members'}
            </Text>
            {Boolean(preview?.inviter_name) && (
              <Text
                style={[
                  theme.typography.caption,
                  { color: theme.colors.muted, marginTop: 4 },
                ]}
              >
                Invited by {preview?.inviter_name}
              </Text>
            )}
          </View>

          <View style={styles.buttonStack}>
            <AppButton
              title="Join Group"
              icon="person-add-outline"
              variant="primary"
              onPress={handleJoin}
              loading={joinMutation.isPending}
              disabled={joinMutation.isPending || isOffline}
              fullWidth
              testID="confirm-join-button"
            />

            <View style={{ marginTop: theme.spacing.sm }}>
              <AppButton
                title="Not Now"
                variant="text"
                onPress={handleBack}
                disabled={joinMutation.isPending}
                fullWidth
                testID="cancel-join-button"
              />
            </View>

            {isOffline && (
              <Text
                style={[
                  theme.typography.caption,
                  {
                    color: theme.colors.error,
                    textAlign: 'center',
                    marginTop: theme.spacing.sm,
                  },
                ]}
              >
                You are offline. Connect to internet to join this group.
              </Text>
            )}
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
  },
  infoBadgeRow: {
    width: '100%',
  },
  buttonStack: {
    width: '100%',
  },
});
