import React, { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { AppButton, AppHeader, Screen, useSnackbar } from '@/components';
import { useNetworkStatus } from '@/hooks';
import {
  formatInviteCode,
  parseInviteCode,
  sanitizeCodeInput,
} from '@/lib/invite/parseCode';
import { useAppTheme } from '@/lib/theme';

export default function JoinGroupScreen() {
  const theme = useAppTheme();
  const { showSnackbar } = useSnackbar();
  const { isOffline } = useNetworkStatus();

  const [rawCode, setRawCode] = useState('');
  const [isPasting, setIsPasting] = useState(false);

  const parsedCode = useMemo(() => parseInviteCode(rawCode), [rawCode]);
  const isValid = Boolean(parsedCode);

  const handleTextChange = useCallback((text: string) => {
    const sanitized = sanitizeCodeInput(text);
    setRawCode(sanitized);

    // If user enters exactly 8 characters or 9 chars with hyphen and it parses, auto-format
    const parsed = parseInviteCode(sanitized);
    if (parsed && sanitized.replace(/[^A-Za-z0-9]/g, '').length === 8) {
      setRawCode(formatInviteCode(parsed));
    }
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      setIsPasting(true);
      const text = await Clipboard.getStringAsync();
      if (!text || !text.trim()) {
        showSnackbar({ message: 'Clipboard is empty.' });
        return;
      }

      const extracted = parseInviteCode(text);
      if (extracted) {
        setRawCode(formatInviteCode(extracted));
        showSnackbar({ message: `Invite code ${formatInviteCode(extracted)} detected!` });
        // Navigate directly to preview (Case GJ1, GJ8)
        router.push({
          pathname: '/join/[code]',
          params: { code: extracted },
        } as any);
      } else {
        showSnackbar({
          message: 'No valid 8-character invite code found in clipboard.',
        });
      }
    } catch {
      showSnackbar({ message: 'Could not read from clipboard.' });
    } finally {
      setIsPasting(false);
    }
  }, [showSnackbar]);

  const handleContinue = useCallback(() => {
    if (!parsedCode) return;
    router.push({
      pathname: '/join/[code]',
      params: { code: parsedCode },
    } as any);
  }, [parsedCode]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, []);

  return (
    <Screen padding={false}>
      <AppHeader
        title="Join Group"
        subtitle="Enter 8-character invite code"
        showBack
        onBack={handleBack}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { padding: theme.spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
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
                theme.typography.sectionTitle,
                { color: theme.colors.text, marginBottom: theme.spacing.xs },
              ]}
            >
              Enter Code or Link
            </Text>
            <Text
              style={[
                theme.typography.body,
                { color: theme.colors.muted, marginBottom: theme.spacing.xl },
              ]}
            >
              Paste an invite code or link shared by a group admin.
            </Text>

            <View
              style={[
                styles.inputContainer,
                {
                  backgroundColor: theme.colors.surfaceVariant,
                  borderColor: isValid ? theme.colors.primary : theme.colors.outline,
                  borderRadius: theme.radius.card,
                  paddingHorizontal: theme.spacing.lg,
                  paddingVertical: theme.spacing.md,
                },
              ]}
            >
              <TextInput
                value={rawCode}
                onChangeText={handleTextChange}
                placeholder="ABCD-EFGH"
                placeholderTextColor={theme.colors.muted}
                autoFocus
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={9}
                style={[
                  styles.codeInput,
                  {
                    color: theme.colors.text,
                  },
                ]}
                returnKeyType="done"
                onSubmitEditing={handleContinue}
                testID="join-code-input"
              />
            </View>

            <View style={styles.actionRow}>
              <AppButton
                title={isPasting ? 'Reading...' : 'Paste from Clipboard'}
                icon="clipboard-outline"
                variant="secondary"
                onPress={handlePaste}
                loading={isPasting}
                disabled={isPasting}
                style={styles.pasteButton}
                testID="paste-code-button"
              />
            </View>

            <View style={{ marginTop: theme.spacing.xl }}>
              <AppButton
                title="Continue to Preview"
                icon="arrow-forward-outline"
                variant="primary"
                onPress={handleContinue}
                disabled={!isValid || isOffline}
                fullWidth
                testID="continue-preview-button"
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
                You are offline. Connect to internet to join groups.
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
  },
  inputContainer: {
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  codeInput: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    width: '100%',
    paddingVertical: 8,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 4,
  },
  pasteButton: {
    minWidth: 200,
  },
});
