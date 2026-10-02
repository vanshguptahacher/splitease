import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Alert,
  BackHandler,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from 'expo-router';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { TextInput, HelperText } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';

import {
  AppButton,
  AppHeader,
  Avatar,
  Screen,
  useSnackbar,
} from '@/components';
import { useAppTheme } from '@/lib/theme';
import { useAuth, useNetworkStatus, useProfile } from '@/hooks';
import { toFriendlyMessage } from '@/lib/errors';
import {
  profileFormSchema,
  ProfileFormValues,
  normalizeName,
  normalizeUpiId,
} from '@/lib/validators';
import {
  getAvatarDisplayUrl,
  pickAndProcessAvatar,
  uploadAvatarImage,
  deleteAvatarFile,
} from '@/lib/auth/avatar';

export default function AccountTabScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation();
  const { showSnackbar } = useSnackbar();
  const { isOffline } = useNetworkStatus();
  const { user, profile: authProfile, signOutAndReset } = useAuth();
  const {
    profile,
    refetch,
    updateProfile,
    isUpdating,
  } = useProfile(user?.id);

  const [signingOut, setSigningOut] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Form management with react-hook-form + Zod
  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty, isValid, errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    mode: 'onChange',
    defaultValues: {
      name: profile?.name || authProfile?.name || '',
      upi_id: profile?.upi_id || authProfile?.upi_id || '',
    },
  });

  const watchedName = useWatch({ control, name: 'name' }) || '';

  // Synchronize form when remote profile loads/updates and form is not dirty
  useEffect(() => {
    if (profile && !isDirty) {
      reset({
        name: profile.name || '',
        upi_id: profile.upi_id || '',
      });
    }
  }, [profile, isDirty, reset]);

  // Refetch profile on tab focus (Case D17)
  useFocusEffect(
    useCallback(() => {
      if (!isDirty) {
        refetch();
      }
    }, [isDirty, refetch])
  );

  // Intercept navigation if there are unsaved changes (Case D14)
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!isDirty) return;
      e.preventDefault();

      Alert.alert(
        'Discard changes?',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              reset();
              navigation.dispatch(e.data.action);
            },
          },
        ]
      );
    });

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isDirty) return false;

      Alert.alert(
        'Discard changes?',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              reset();
              BackHandler.exitApp();
            },
          },
        ]
      );
      return true;
    });

    return () => {
      unsubscribe();
      backHandler.remove();
    };
  }, [navigation, isDirty, reset]);

  // Profile Form Save Handler (Cases D1–D6, D15, D16)
  const onSubmit = async (data: ProfileFormValues) => {
    if (isOffline) {
      showSnackbar({ message: 'You are currently offline. Changes cannot be saved.' });
      return;
    }

    try {
      await updateProfile({
        name: normalizeName(data.name),
        upi_id: normalizeUpiId(data.upi_id),
        onboarded_at: profile?.onboarded_at || new Date().toISOString(),
      });
      reset(data);
      showSnackbar({ message: 'Profile saved' });
    } catch (err) {
      showSnackbar({ message: toFriendlyMessage(err) });
    }
  };

  // Avatar Picking & Upload (Cases D8–D12)
  const handlePickPhoto = async () => {
    if (isOffline) {
      showSnackbar({ message: 'Cannot upload photo while offline.' });
      return;
    }

    try {
      const result = await pickAndProcessAvatar();
      if (!result) {
        // Picker cancelled or permission dismissed (Case D9)
        return;
      }

      if (!user?.id) return;

      setIsUploadingPhoto(true);
      const oldAvatarPath = profile?.avatar_path;
      const newAvatarPath = await uploadAvatarImage(user.id, result.base64);

      await updateProfile({ avatar_path: newAvatarPath });

      // Best effort deletion of old photo (Case D12)
      if (oldAvatarPath) {
        deleteAvatarFile(oldAvatarPath).catch(() => {});
      }

      showSnackbar({ message: 'Profile photo updated' });
    } catch (err) {
      showSnackbar({ message: toFriendlyMessage(err) });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Avatar Removal (Case D13)
  const handleRemovePhoto = async () => {
    if (isOffline) {
      showSnackbar({ message: 'Cannot remove photo while offline.' });
      return;
    }

    try {
      setIsUploadingPhoto(true);
      const oldAvatarPath = profile?.avatar_path;

      await updateProfile({ avatar_path: null });

      if (oldAvatarPath) {
        deleteAvatarFile(oldAvatarPath).catch(() => {});
      }

      showSnackbar({ message: 'Profile photo removed' });
    } catch (err) {
      showSnackbar({ message: toFriendlyMessage(err) });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Prompt options for avatar photo
  const handleAvatarPress = () => {
    if (profile?.avatar_path) {
      Alert.alert('Profile Photo', 'Manage your profile photo', [
        { text: 'Choose New Photo', onPress: handlePickPhoto },
        { text: 'Remove Photo', style: 'destructive', onPress: handleRemovePhoto },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      handlePickPhoto();
    }
  };

  // Sign out handler
  const handleSignOut = async () => {
    if (isDirty) {
      Alert.alert(
        'Discard changes?',
        'You have unsaved changes. Are you sure you want to sign out?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign Out',
            style: 'destructive',
            onPress: async () => {
              reset();
              await performSignOut();
            },
          },
        ]
      );
      return;
    }
    await performSignOut();
  };

  const performSignOut = async () => {
    setSigningOut(true);
    try {
      await signOutAndReset();
      showSnackbar({ message: 'Signed out successfully' });
    } catch {
      showSnackbar({ message: 'Error signing out' });
    } finally {
      setSigningOut(false);
    }
  };

  const avatarDisplayUrl = getAvatarDisplayUrl(profile?.avatar_path, profile?.avatar_url);
  const provider = user?.app_metadata?.provider === 'google' ? 'Google' : 'Email';

  return (
    <Screen scrollable padding={false}>
      <AppHeader title="Account" subtitle="Profile & Settings" />

      <View style={[styles.content, { padding: theme.spacing.lg }]}>
        {/* Profile Card & Avatar Section */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outline,
              padding: theme.spacing.lg,
              borderRadius: theme.radius.card,
            },
          ]}
        >
          <View style={styles.avatarSection}>
            <View style={styles.avatarWrapper}>
              <Avatar
                url={avatarDisplayUrl}
                name={profile?.name || user?.email || 'User'}
                size={88}
              />
              {isUploadingPhoto ? (
                <View style={styles.avatarLoadingOverlay}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                </View>
              ) : (
                <Pressable
                  style={[styles.cameraBadge, { backgroundColor: theme.colors.primary }]}
                  onPress={handleAvatarPress}
                  accessibilityRole="button"
                  accessibilityLabel="Change profile photo"
                >
                  <Ionicons name="camera" size={16} color="#FFFFFF" />
                </Pressable>
              )}
            </View>
            <Text
              style={[
                theme.typography.caption,
                { color: theme.colors.muted, marginTop: 8 },
              ]}
            >
              Tap to change photo
            </Text>
          </View>

          {/* Profile Form */}
          <View style={styles.form}>
            {/* Display Name Input (Cases D1–D3) */}
            <View style={styles.inputContainer}>
              <Controller
                control={control}
                name="name"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    mode="outlined"
                    label="Display Name"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    maxLength={50}
                    error={Boolean(errors.name)}
                    left={<TextInput.Icon icon="account-outline" />}
                    textColor={theme.colors.text}
                  />
                )}
              />
              <View style={styles.inputMetaRow}>
                {errors.name?.message ? (
                  <HelperText type="error" visible style={styles.errorText}>
                    {errors.name.message}
                  </HelperText>
                ) : (
                  <View style={{ flex: 1 }} />
                )}
                <Text
                  style={[
                    theme.typography.caption,
                    {
                      color:
                        watchedName.length >= 50
                          ? theme.colors.error
                          : theme.colors.muted,
                    },
                  ]}
                >
                  {watchedName.length}/50
                </Text>
              </View>
            </View>

            {/* UPI ID Input (Cases D4–D7) */}
            <View style={styles.inputContainer}>
              <Controller
                control={control}
                name="upi_id"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    mode="outlined"
                    label="UPI ID (for receiving settlements)"
                    placeholder="e.g. rahul@oksbi"
                    value={value || ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    error={Boolean(errors.upi_id)}
                    left={<TextInput.Icon icon="bank-outline" />}
                    textColor={theme.colors.text}
                  />
                )}
              />
              {errors.upi_id?.message ? (
                <HelperText type="error" visible style={styles.errorText}>
                  {errors.upi_id.message}
                </HelperText>
              ) : (
                <Text
                  style={[
                    theme.typography.caption,
                    { color: theme.colors.muted, marginTop: 4, marginHorizontal: 4 },
                  ]}
                >
                  Only members of your groups can see your UPI ID.
                </Text>
              )}
            </View>

            {/* Save Profile Button (Cases D15, D16) */}
            <View style={{ marginTop: theme.spacing.md }}>
              <AppButton
                title="Save Changes"
                variant="primary"
                loading={isUpdating}
                disabled={!isDirty || !isValid || isOffline || isUpdating}
                onPress={handleSubmit(onSubmit)}
                fullWidth
              />
              {isOffline && (
                <Text
                  style={[
                    theme.typography.caption,
                    {
                      color: theme.colors.error,
                      textAlign: 'center',
                      marginTop: 6,
                    },
                  ]}
                >
                  You are offline. Reconnect to save changes.
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Account Details (Read-only, Case D18) */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outline,
              padding: theme.spacing.lg,
              borderRadius: theme.radius.card,
              marginTop: theme.spacing.lg,
            },
          ]}
        >
          <Text
            style={[
              theme.typography.sectionTitle,
              { color: theme.colors.text, marginBottom: theme.spacing.md },
            ]}
          >
            Account Details
          </Text>

          <View style={styles.readOnlyRow}>
            <View style={styles.readOnlyLabelRow}>
              <Ionicons name="mail-outline" size={18} color={theme.colors.muted} />
              <Text style={[theme.typography.body, { color: theme.colors.muted }]}>
                Email
              </Text>
            </View>
            <Text
              style={[
                theme.typography.body,
                { color: theme.colors.text, fontWeight: '500' },
              ]}
              numberOfLines={1}
            >
              {user?.email || 'Not available'}
            </Text>
          </View>

          <View
            style={[
              styles.divider,
              { backgroundColor: theme.colors.outline, marginVertical: theme.spacing.md },
            ]}
          />

          <View style={styles.readOnlyRow}>
            <View style={styles.readOnlyLabelRow}>
              <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.muted} />
              <Text style={[theme.typography.body, { color: theme.colors.muted }]}>
                Sign-In Method
              </Text>
            </View>
            <Text
              style={[
                theme.typography.body,
                { color: theme.colors.text, fontWeight: '500' },
              ]}
            >
              {provider}
            </Text>
          </View>
        </View>

        {/* Sign Out Action Row */}
        <View style={[styles.section, { marginTop: theme.spacing.xl }]}>
          <AppButton
            title="Sign Out"
            variant="danger"
            icon="log-out-outline"
            loading={signingOut}
            onPress={handleSignOut}
            fullWidth
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  card: {
    borderWidth: 1,
    width: '100%',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    elevation: 3,
  },
  form: {
    gap: 8,
  },
  inputContainer: {
    marginBottom: 4,
  },
  inputMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 2,
  },
  errorText: {
    paddingHorizontal: 0,
    marginVertical: 0,
  },
  readOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  readOnlyLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  section: {
    width: '100%',
  },
});
