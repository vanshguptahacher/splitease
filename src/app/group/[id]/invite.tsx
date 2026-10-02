import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import {
  AppButton,
  AppHeader,
  ErrorState,
  LoadingSkeleton,
  Screen,
  useSnackbar,
} from '@/components';
import { useGroup, useInvite, useNetworkStatus, useResetInvite } from '@/hooks';
import { toFriendlyMessage } from '@/lib/errors';
import { formatInviteCode } from '@/lib/invite/parseCode';
import { useAppTheme } from '@/lib/theme';

export default function InviteScreen() {
  const theme = useAppTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showSnackbar } = useSnackbar();
  const { isOffline } = useNetworkStatus();

  const {
    data: group,
    isLoading: isGroupLoading,
    error: groupError,
  } = useGroup(id);

  const isAdmin = group?.my_role === 'admin';

  const {
    data: invite,
    isLoading: isInviteLoading,
    isError: isInviteError,
    error: inviteError,
    refetch: refetchInvite,
  } = useInvite(isAdmin ? id : undefined);

  const resetInviteMutation = useResetInvite();
  const [isResetting, setIsResetting] = useState(false);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace({
        pathname: '/group/[id]',
        params: { id: id ?? '' },
      } as any);
    }
  };

  const handleCopyCode = async () => {
    if (!invite?.code) return;
    try {
      await Clipboard.setStringAsync(invite.code);
      showSnackbar({ message: 'Code copied' });
    } catch {
      showSnackbar({ message: 'Failed to copy code' });
    }
  };

  const handleShare = async () => {
    if (!invite?.code || !group) return;
    const code = invite.code;
    const formattedCode = formatInviteCode(code);
    const link = `splitease://join/${code}`;
    const message = `Join my group "${group.name}" on SplitEase!\n\nInvite code: ${formattedCode}\nLink: ${link}\n\nOpen SplitEase and use this code to join.`;

    try {
      await Share.share({
        title: `Join ${group.name} on SplitEase`,
        message,
        url: Platform.OS === 'ios' ? link : undefined,
      });
    } catch {
      showSnackbar({ message: 'Failed to share invite' });
    }
  };

  const handleResetInvite = () => {
    if (isOffline) {
      showSnackbar({ message: 'You are offline. Connect to the internet to reset invite link.' });
      return;
    }

    Alert.alert(
      'Reset invite link?',
      'The current code and link will stop working immediately. Anyone who has not joined yet will need the new link.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Link',
          style: 'destructive',
          onPress: async () => {
            setIsResetting(true);
            try {
              await resetInviteMutation.mutateAsync(id!);
              showSnackbar({ message: 'Invite link reset' });
            } catch (err) {
              const friendly = toFriendlyMessage(err);
              showSnackbar({ message: friendly });
              // If demoted while on screen (GI10), navigate back
              if (friendly.includes('admin') || String(err).includes('not_admin')) {
                handleBack();
              }
            } finally {
              setIsResetting(false);
            }
          },
        },
      ]
    );
  };

  const formatExpiry = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <Screen padding={false}>
      <AppHeader
        title="Invite Members"
        subtitle={group?.name ?? 'SplitEase'}
        showBack
        onBack={handleBack}
      />

      <View style={[styles.content, { padding: theme.spacing.lg }]}>
        {isGroupLoading || (isAdmin && isInviteLoading) ? (
          <View style={{ width: '100%' }}>
            <LoadingSkeleton variant="card" count={2} />
          </View>
        ) : groupError ? (
          <ErrorState
            title="Could not load group"
            message={toFriendlyMessage(groupError)}
            onRetry={handleBack}
          />
        ) : !isAdmin ? (
          /* Non-admin protection (GI7) */
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.outline,
                borderRadius: theme.radius.sheet,
                padding: theme.spacing.xl,
                alignItems: 'center',
              },
            ]}
          >
            <Ionicons
              name="lock-closed-outline"
              size={48}
              color={theme.colors.muted}
              style={{ marginBottom: theme.spacing.md }}
            />
            <Text
              style={[
                theme.typography.sectionTitle,
                { color: theme.colors.text, textAlign: 'center', marginBottom: 8 },
              ]}
            >
              Only Admins Can Invite
            </Text>
            <Text
              style={[
                theme.typography.body,
                { color: theme.colors.muted, textAlign: 'center', marginBottom: theme.spacing.xl },
              ]}
            >
              Ask an admin for the invite link.
            </Text>
            <AppButton
              title="Back to Group"
              variant="secondary"
              onPress={handleBack}
              fullWidth
            />
          </View>
        ) : isInviteError ? (
          /* Offline or error state (GI11) */
          <ErrorState
            title="Could not load invite"
            message={toFriendlyMessage(inviteError)}
            onRetry={() => refetchInvite()}
          />
        ) : invite ? (
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
                { color: theme.colors.muted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1 },
              ]}
            >
              Group Invite Code
            </Text>

            {/* Large letter-spaced Code Display (GI4) */}
            <Pressable
              onPress={handleCopyCode}
              accessibilityRole="button"
              accessibilityLabel="Copy invite code"
              style={({ pressed }) => [
                styles.codeContainer,
                {
                  backgroundColor: theme.colors.surfaceVariant,
                  borderColor: theme.colors.outline,
                  borderRadius: theme.radius.card,
                  paddingVertical: theme.spacing.lg,
                  paddingHorizontal: theme.spacing.xl,
                  marginVertical: theme.spacing.lg,
                },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text
                testID="invite-code-text"
                style={[
                  styles.codeText,
                  { color: theme.colors.primary },
                ]}
              >
                {formatInviteCode(invite.code)}
              </Text>
              <View style={styles.tapToCopyRow}>
                <Ionicons name="copy-outline" size={14} color={theme.colors.muted} />
                <Text
                  style={[
                    theme.typography.caption,
                    { color: theme.colors.muted, marginLeft: 4 },
                  ]}
                >
                  Tap to copy code
                </Text>
              </View>
            </Pressable>

            {/* Expiry display (GI5) */}
            <View style={styles.expiryRow}>
              <Ionicons name="time-outline" size={16} color={theme.colors.muted} />
              <Text
                testID="invite-expiry-text"
                style={[
                  theme.typography.caption,
                  { color: theme.colors.muted, marginLeft: 6 },
                ]}
              >
                Expires on {formatExpiry(invite.expires_at)}
              </Text>
            </View>

            {/* Action buttons */}
            <View style={styles.buttonStack}>
              <AppButton
                title="Share Invite"
                icon="share-social-outline"
                variant="primary"
                onPress={handleShare}
                fullWidth
                testID="share-invite-button"
              />
              <AppButton
                title="Copy Code"
                icon="copy-outline"
                variant="secondary"
                onPress={handleCopyCode}
                fullWidth
                testID="copy-code-button"
              />
              <View style={{ marginTop: theme.spacing.md }}>
                <AppButton
                  title="Reset Link"
                  icon="refresh-outline"
                  variant="text"
                  onPress={handleResetInvite}
                  loading={isResetting || resetInviteMutation.isPending}
                  disabled={isOffline || isResetting}
                  fullWidth
                  testID="reset-invite-button"
                />
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderWidth: 1,
  },
  codeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  codeText: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'center',
  },
  tapToCopyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  buttonStack: {
    width: '100%',
    gap: 12,
  },
});
