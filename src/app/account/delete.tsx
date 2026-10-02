import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';

import {
  AppButton,
  AppHeader,
  LoadingSkeleton,
  Screen,
  useSnackbar,
} from '@/components';
import { useAppTheme } from '@/lib/theme';
import {
  useAccountDeletionBlockers,
  useAuth,
  useProfile,
} from '@/hooks';
import { deleteMyAccount } from '@/lib/api/groups';
import { supabase } from '@/lib/supabase/client';
import { toFriendlyMessage } from '@/lib/errors';
import { signInWithGoogle } from '@/lib/auth/google';
import { deleteAvatarFile } from '@/lib/auth/avatar';

type DeleteStep = 'explain' | 'verify' | 'confirm' | 'deleting' | 'error';

export default function DeleteAccountScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { showSnackbar } = useSnackbar();
  const { user, signOutAndReset } = useAuth();
  const { profile } = useProfile(user?.id);

  // Preflight check on Explain screen (GD5)
  const {
    data: blockers,
    isLoading: isBlockersLoading,
    refetch: refetchBlockers,
  } = useAccountDeletionBlockers();

  const [step, setStep] = useState<DeleteStep>('explain');
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [unsettledConfirmed, setUnsettledConfirmed] = useState(false);

  const isGoogleUser = user?.app_metadata?.provider === 'google';

  const soleAdminGroups = blockers?.sole_admin_groups ?? [];
  const unsettledGroups = blockers?.unsettled_groups ?? [];
  const hasSoleAdminBlocker = soleAdminGroups.length > 0;
  const hasUnsettledBlocker = unsettledGroups.length > 0;

  // Refresh blockers whenever the screen is focused
  useFocusEffect(
    useCallback(() => {
      refetchBlockers();
    }, [refetchBlockers])
  );

  // Step 2: Re-authenticate to confirm identity (Case F2)
  const handleVerifyIdentity = async () => {
    setIsVerifying(true);
    setErrorMessage(null);
    try {
      if (isGoogleUser) {
        const result = await signInWithGoogle();
        if ('cancelled' in result) {
          return;
        }
        if ('error' in result) {
          showSnackbar({ message: result.error });
          return;
        }

        // Verify the re-authenticated user matches current user
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();
        if (
          currentUser?.email &&
          user?.email &&
          currentUser.email.toLowerCase() !== user.email.toLowerCase()
        ) {
          showSnackbar({
            message: 'Selected account does not match current account.',
          });
          return;
        }
      }
      setStep('confirm');
    } catch (err) {
      showSnackbar({ message: toFriendlyMessage(err) });
    } finally {
      setIsVerifying(false);
    }
  };

  // Step 4: Execute Account Deletion (Cases F4, F5, GD2, GD3, GD4, GD6)
  const executeAccountDeletion = async () => {
    setStep('deleting');
    setErrorMessage(null);

    try {
      // 1. Delete avatar files from storage if present (best effort, ignore not found)
      if (profile?.avatar_path) {
        await deleteAvatarFile(profile.avatar_path).catch(() => {});
      }

      // 2. Execute delete_my_account RPC (with force flag if confirmed unsettled balances)
      await deleteMyAccount(unsettledConfirmed);

      // 3. Clean sign out and reset local state
      await signOutAndReset();

      // 4. Navigate to Goodbye screen
      router.replace('/(auth)/goodbye' as any);
    } catch (err) {
      setErrorMessage(toFriendlyMessage(err));
      setStep('error');
    }
  };

  return (
    <Screen scrollable padding={false}>
      <AppHeader
        title="Delete Account"
        subtitle={
          step === 'explain'
            ? 'Read before continuing'
            : step === 'verify'
              ? 'Step 1 of 2: Verification'
              : 'Step 2 of 2: Final confirmation'
        }
        showBack={step !== 'deleting'}
        onBack={() => {
          if (step === 'confirm') setStep('verify');
          else if (step === 'verify') setStep('explain');
          else router.back();
        }}
      />

      <ScrollView contentContainerStyle={[styles.content, { padding: theme.spacing.lg }]}>
        {/* Step 1: Explain Screen (Case F1, GD1, GD4, GD5) */}
        {step === 'explain' && (
          <View style={styles.stepContainer}>
            <View
              style={[
                styles.warningBanner,
                {
                  backgroundColor: theme.colors.errorContainer,
                  borderColor: theme.colors.error,
                },
              ]}
            >
              <Ionicons name="warning-outline" size={28} color={theme.colors.error} />
              <View style={styles.bannerText}>
                <Text style={[theme.typography.sectionTitle, { color: theme.colors.onErrorContainer }]}>
                  Permanent Action
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.onErrorContainer, marginTop: 2 }]}>
                  Once deleted, your account cannot be recovered.
                </Text>
              </View>
            </View>

            {/* Blockers Preflight Loading */}
            {isBlockersLoading && (
              <View style={{ marginTop: theme.spacing.lg }}>
                <LoadingSkeleton variant="card" count={1} />
              </View>
            )}

            {/* Sole Admin Blocker Warning (GD1, F7) */}
            {hasSoleAdminBlocker && (
              <View
                testID="sole-admin-blocker-card"
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.colors.errorContainer,
                    borderColor: theme.colors.error,
                    borderRadius: theme.radius.card,
                    padding: theme.spacing.lg,
                    marginTop: theme.spacing.lg,
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Ionicons name="shield-outline" size={24} color={theme.colors.error} style={{ marginRight: 8 }} />
                  <Text style={[theme.typography.sectionTitle, { color: theme.colors.onErrorContainer, flex: 1 }]}>
                    Cannot Delete: Sole Admin
                  </Text>
                </View>
                <Text style={[theme.typography.body, { color: theme.colors.onErrorContainer, marginBottom: 12 }]}>
                  You are the only admin of the following groups with active members. A group needs at least one admin. Make someone else admin or delete the group first:
                </Text>

                {soleAdminGroups.map((g: any) => (
                  <View
                    key={g.id}
                    style={[
                      styles.groupBlockerRow,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.outline,
                        borderRadius: theme.radius.sm,
                        padding: theme.spacing.md,
                        marginBottom: 8,
                      },
                    ]}
                  >
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text
                        style={[
                          theme.typography.body,
                          { color: theme.colors.text, fontWeight: '700' },
                        ]}
                        numberOfLines={1}
                      >
                        {g.name}
                      </Text>
                      <Text style={[theme.typography.caption, { color: theme.colors.muted, marginTop: 2 }]}>
                        Make someone admin or delete this group
                      </Text>
                    </View>
                    <AppButton
                      title="Make someone admin"
                      variant="secondary"
                      onPress={() =>
                        router.push({
                          pathname: '/group/[id]',
                          params: { id: g.id, tab: 'members' },
                        } as any)
                      }
                      testID={`manage-group-${g.id}`}
                    />
                  </View>
                ))}
              </View>
            )}

            {/* Unsettled Balances Blocker (GD4, F8) */}
            {hasUnsettledBlocker && (
              <View
                testID="unsettled-blocker-card"
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.colors.errorContainer,
                    borderColor: theme.colors.error,
                    borderRadius: theme.radius.card,
                    padding: theme.spacing.lg,
                    marginTop: theme.spacing.lg,
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Ionicons name="wallet-outline" size={24} color={theme.colors.error} style={{ marginRight: 8 }} />
                  <Text style={[theme.typography.sectionTitle, { color: theme.colors.onErrorContainer, flex: 1 }]}>
                    Unsettled Balances
                  </Text>
                </View>
                <Text style={[theme.typography.body, { color: theme.colors.onErrorContainer, marginBottom: 8 }]}>
                  You have active balances in the following groups:
                </Text>

                {unsettledGroups.map((g: any) => (
                  <Text
                    key={g.id}
                    style={[
                      theme.typography.body,
                      { color: theme.colors.onErrorContainer, fontWeight: '600', marginLeft: 8, marginBottom: 4 },
                    ]}
                  >
                    • {g.name}
                  </Text>
                ))}

                <Pressable
                  onPress={() => setUnsettledConfirmed(!unsettledConfirmed)}
                  style={styles.checkboxRow}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: unsettledConfirmed }}
                  testID="unsettled-checkbox"
                >
                  <Ionicons
                    name={unsettledConfirmed ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={theme.colors.error}
                  />
                  <Text style={[theme.typography.body, { color: theme.colors.onErrorContainer, marginLeft: 8, flex: 1 }]}>
                    I understand others will see me as Deleted user and my share remains recorded.
                  </Text>
                </Pressable>
              </View>
            )}

            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.outline,
                  borderRadius: theme.radius.card,
                  padding: theme.spacing.lg,
                  marginTop: theme.spacing.lg,
                },
              ]}
            >
              <Text style={[theme.typography.sectionTitle, { color: theme.colors.text, marginBottom: 12 }]}>
                What happens when you delete your account:
              </Text>

              <View style={styles.listItem}>
                <Ionicons name="close-circle-outline" size={20} color={theme.colors.error} />
                <Text style={[theme.typography.body, { color: theme.colors.text, flex: 1 }]}>
                  Your name, profile photo, and UPI ID will be permanently removed.
                </Text>
              </View>

              <View style={styles.listItem}>
                <Ionicons name="close-circle-outline" size={20} color={theme.colors.error} />
                <Text style={[theme.typography.body, { color: theme.colors.text, flex: 1 }]}>
                  Your login credentials will be removed from SplitEase.
                </Text>
              </View>

              <View style={styles.listItem}>
                <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.primary} />
                <Text style={[theme.typography.body, { color: theme.colors.muted, flex: 1 }]}>
                  Past expenses and balances will be preserved as &quot;Deleted user&quot; so other group members&apos;
                  ledgers stay balanced.
                </Text>
              </View>

              <View style={styles.listItem}>
                <Ionicons name="trash-outline" size={20} color={theme.colors.primary} />
                <Text style={[theme.typography.body, { color: theme.colors.muted, flex: 1 }]}>
                  Groups where you are the only member will be permanently deleted with your account.
                </Text>
              </View>
            </View>

            <View style={[styles.actions, { marginTop: theme.spacing.xl }]}>
              <AppButton
                title="Continue to Verify"
                variant="danger"
                onPress={() => setStep('verify')}
                disabled={
                  isBlockersLoading ||
                  hasSoleAdminBlocker ||
                  (hasUnsettledBlocker && !unsettledConfirmed)
                }
                fullWidth
                testID="continue-to-verify-button"
              />
              <View style={{ marginTop: 12 }}>
                <AppButton
                  title="Keep My Account"
                  variant="secondary"
                  onPress={() => router.back()}
                  fullWidth
                />
              </View>
            </View>
          </View>
        )}

        {/* Step 2: Re-authenticate Identity (Case F2) */}
        {step === 'verify' && (
          <View style={styles.stepContainer}>
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.outline,
                  borderRadius: theme.radius.card,
                  padding: theme.spacing.lg,
                },
              ]}
            >
              <Text style={[theme.typography.sectionTitle, { color: theme.colors.text, marginBottom: 8 }]}>
                Confirm Identity
              </Text>
              <Text style={[theme.typography.body, { color: theme.colors.muted, marginBottom: 20 }]}>
                Please confirm your identity by authenticating with your current sign-in method:
                {' '}<Text style={{ fontWeight: '700', color: theme.colors.text }}>{user?.email}</Text>
              </Text>

              <AppButton
                title="Confirm with Google"
                variant="primary"
                icon="logo-google"
                loading={isVerifying}
                onPress={handleVerifyIdentity}
                fullWidth
                testID="verify-google-button"
              />
            </View>

            <View style={{ marginTop: 16 }}>
              <AppButton
                title="Cancel"
                variant="text"
                onPress={() => router.back()}
                fullWidth
              />
            </View>
          </View>
        )}

        {/* Step 3: Type DELETE Confirmation (Case F3) */}
        {step === 'confirm' && (
          <View style={styles.stepContainer}>
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.outline,
                  borderRadius: theme.radius.card,
                  padding: theme.spacing.lg,
                },
              ]}
            >
              <Text style={[theme.typography.sectionTitle, { color: theme.colors.error, marginBottom: 8 }]}>
                Final Confirmation
              </Text>
              <Text style={[theme.typography.body, { color: theme.colors.text, marginBottom: 16 }]}>
                To confirm permanent deletion, please type{' '}
                <Text style={{ fontWeight: '800', color: theme.colors.error }}>DELETE</Text> in the box below:
              </Text>

              <TextInput
                mode="outlined"
                label="Type DELETE"
                placeholder="DELETE"
                value={deleteConfirmationText}
                onChangeText={setDeleteConfirmationText}
                autoCapitalize="characters"
                autoCorrect={false}
                textColor={theme.colors.text}
                testID="delete-account-input"
              />

              <View style={{ marginTop: 24 }}>
                <AppButton
                  title="Permanently Delete Account"
                  variant="danger"
                  icon="trash-outline"
                  disabled={deleteConfirmationText.trim() !== 'DELETE'}
                  onPress={executeAccountDeletion}
                  fullWidth
                  testID="confirm-delete-account-button"
                />
              </View>
            </View>

            <View style={{ marginTop: 16 }}>
              <AppButton
                title="Cancel"
                variant="text"
                onPress={() => router.back()}
                fullWidth
              />
            </View>
          </View>
        )}

        {/* Step 4: Deleting Progress (Case F4) */}
        {step === 'deleting' && (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.colors.error} />
            <Text style={[theme.typography.sectionTitle, { color: theme.colors.text, marginTop: 20 }]}>
              Deleting account...
            </Text>
            <Text style={[theme.typography.caption, { color: theme.colors.muted, marginTop: 8, textAlign: 'center' }]}>
              Cleaning up avatar files, anonymizing data, and removing authentication session.
            </Text>
          </View>
        )}

        {/* Error / Retry State (Case F5) */}
        {step === 'error' && (
          <View style={styles.stepContainer}>
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.errorContainer,
                  borderColor: theme.colors.error,
                  borderRadius: theme.radius.card,
                  padding: theme.spacing.lg,
                },
              ]}
            >
              <Ionicons name="alert-circle" size={36} color={theme.colors.error} />
              <Text style={[theme.typography.sectionTitle, { color: theme.colors.onErrorContainer, marginTop: 12 }]}>
                Deletion Could Not Complete
              </Text>
              <Text style={[theme.typography.body, { color: theme.colors.onErrorContainer, marginTop: 8 }]}>
                {errorMessage || 'A network error occurred. Your account is still intact.'}
              </Text>

              <View style={{ marginTop: 20 }}>
                <AppButton
                  title="Retry Deletion"
                  variant="danger"
                  onPress={executeAccountDeletion}
                  fullWidth
                />
              </View>
            </View>

            <View style={{ marginTop: 16 }}>
              <AppButton
                title="Back to Safety"
                variant="secondary"
                onPress={() => router.back()}
                fullWidth
              />
            </View>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  stepContainer: {
    width: '100%',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 14,
  },
  bannerText: {
    flex: 1,
  },
  card: {
    borderWidth: 1,
    width: '100%',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  groupBlockerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 4,
  },
  actions: {
    width: '100%',
  },
});
