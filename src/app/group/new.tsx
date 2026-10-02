import React, { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppButton, AppHeader, Screen, useSnackbar } from '@/components';
import { useCreateGroup, useNetworkStatus } from '@/hooks';
import { toFriendlyMessage } from '@/lib/errors';
import { useAppTheme } from '@/lib/theme';
import { generateUuid } from '@/lib/uuid';

const MAX_NAME_LENGTH = 50;

export default function NewGroupScreen() {
  const theme = useAppTheme();
  const { showSnackbar } = useSnackbar();
  const { isOffline } = useNetworkStatus();

  const [name, setName] = useState('');
  // Generate once per screen lifecycle so retries reuse the same client_request_id (GC8)
  const [clientRequestId] = useState(() => generateUuid());

  const createGroupMutation = useCreateGroup();

  const trimmedName = name.trim().replace(/\s+/g, ' ');
  const isCreateDisabled =
    trimmedName.length === 0 ||
    isOffline ||
    createGroupMutation.isPending;

  const handleCreate = async () => {
    if (isCreateDisabled) return;

    try {
      const group = await createGroupMutation.mutateAsync({
        name: trimmedName,
        clientRequestId,
      });

      showSnackbar({
        message: `Group "${group.name}" created!`,
      });

      // Replace screen with invite screen (GC1) so user can invite members immediately
      router.replace({
        pathname: '/group/[id]/invite',
        params: { id: group.id },
      } as any);
    } catch (err) {
      showSnackbar({
        message: toFriendlyMessage(err),
      });
    }
  };

  return (
    <Screen padding={false}>
      <AppHeader
        title="Create Group"
        subtitle="SplitEase"
        showBack
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={[styles.inner, { padding: theme.spacing.lg }]}>
            {/* Offline notice (GC7) */}
            {isOffline && (
              <View
                style={[
                  styles.offlineNotice,
                  {
                    backgroundColor: theme.colors.errorContainer,
                    borderRadius: theme.radius.sm,
                    padding: theme.spacing.md,
                    marginBottom: theme.spacing.lg,
                  },
                ]}
              >
                <Ionicons
                  name="cloud-offline-outline"
                  size={20}
                  color={theme.colors.error}
                  style={styles.offlineIcon}
                />
                <Text
                  style={[
                    theme.typography.caption,
                    { color: theme.colors.onErrorContainer, flex: 1 },
                  ]}
                >
                  You are offline. Connect to internet to create a group.
                </Text>
              </View>
            )}

            <Text
              style={[
                theme.typography.body,
                { color: theme.colors.text, fontWeight: '600', marginBottom: theme.spacing.xs },
              ]}
            >
              Group Name
            </Text>

            <View
              style={[
                styles.inputWrapper,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.outline,
                  borderRadius: theme.radius.sm,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: Platform.OS === 'ios' ? theme.spacing.md : theme.spacing.sm,
                },
              ]}
            >
              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.colors.text,
                    fontSize: 16,
                  },
                ]}
                placeholder="e.g. Goa Trip, Flat 402, Friday Dinner"
                placeholderTextColor={theme.colors.muted}
                value={name}
                onChangeText={setName}
                autoFocus
                maxLength={MAX_NAME_LENGTH}
                returnKeyType="done"
                onSubmitEditing={handleCreate}
                testID="group-name-input"
              />
            </View>

            {/* Character Counter (GC3) */}
            <View style={styles.counterRow}>
              <Text
                testID="name-counter"
                style={[
                  theme.typography.caption,
                  {
                    color:
                      name.length >= MAX_NAME_LENGTH
                        ? theme.colors.error
                        : theme.colors.muted,
                  },
                ]}
              >
                {`${name.length} / ${MAX_NAME_LENGTH}`}
              </Text>
            </View>

            <Text
              style={[
                theme.typography.caption,
                { color: theme.colors.muted, marginTop: theme.spacing.sm },
              ]}
            >
              You will automatically become an admin and can invite members after creating.
            </Text>
          </View>
        </TouchableWithoutFeedback>

        {/* Action Button pinned at bottom above keyboard */}
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: theme.colors.background,
              borderTopColor: theme.colors.outline,
              padding: theme.spacing.lg,
            },
          ]}
        >
          <AppButton
            title="Create Group"
            variant="primary"
            fullWidth
            onPress={handleCreate}
            disabled={isCreateDisabled}
            loading={createGroupMutation.isPending}
            testID="create-group-submit-button"
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
  },
  offlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  offlineIcon: {
    marginRight: 8,
  },
  inputWrapper: {
    borderWidth: 1,
  },
  input: {
    padding: 0,
    margin: 0,
  },
  counterRow: {
    alignItems: 'flex-end',
    marginTop: 6,
  },
  bottomBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
