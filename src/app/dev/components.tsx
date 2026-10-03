import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  AmountDisplay,
  AmountKeypad,
  AppButton,
  AppHeader,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  MoneyText,
  Screen,
  useSnackbar,
} from '@/components';
import { useAppTheme } from '@/lib/theme';

export default function ComponentShowcaseScreen() {
  const theme = useAppTheme();
  const { showSnackbar } = useSnackbar();
  const [btnLoading, setBtnLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [shouldCrash, setShouldCrash] = useState(false);
  const [keypadAmount, setKeypadAmount] = useState('');

  // Dev-only screen safety check
  if (!__DEV__) {
    return null;
  }

  if (shouldCrash) {
    throw new Error('Deliberate test error: ErrorBoundary successfully caught component render crash!');
  }

  const handleTestLoading = () => {
    setBtnLoading(true);
    setTimeout(() => {
      setBtnLoading(false);
      showSnackbar({ message: 'Action completed successfully!' });
    }, 1500);
  };

  const handleShowUndoSnackbar = () => {
    showSnackbar({
      message: 'Expense "Dinner at Social" deleted',
      action: {
        label: 'UNDO',
        onPress: () => {
          showSnackbar({ message: 'Expense restored!' });
        },
      },
    });
  };

  return (
    <Screen scrollable padding={false}>
      <AppHeader
        title="UI Component Showcase"
        subtitle="Sub-phase 1.4 Base Components"
        showBack
        onBack={() => router.back()}
        actions={[
          {
            icon: 'refresh-outline',
            onPress: () => showSnackbar({ message: 'Header action pressed' }),
            accessibilityLabel: 'Refresh',
          },
        ]}
      />

      <View style={[styles.content, { padding: theme.spacing.lg }]}>
        {/* Section 1: Money Text */}
        <View style={styles.section}>
          <Text style={[theme.typography.sectionTitle, { color: theme.colors.text }]}>
            1. MoneyText (Indian Grouping & Tone)
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.muted, marginBottom: theme.spacing.md }]}>
            Always stored as paise. Indian grouping with color & text labels.
          </Text>

          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}>
            <MoneyText amountMinor={12345678} size="hero" showLabel tone="owed" />
            <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />
            <MoneyText amountMinor={-25000} size="lg" showLabel tone="owe" />
            <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />
            <MoneyText amountMinor={0} size="md" showLabel tone="neutral" />
            <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />
            <MoneyText amountMinor={5} size="sm" showLabel tone="owed" customLabel="tiny fraction" />
          </View>
        </View>

        {/* Section 2: Buttons */}
        <View style={styles.section}>
          <Text style={[theme.typography.sectionTitle, { color: theme.colors.text }]}>
            2. AppButton (Variants & States)
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.muted, marginBottom: theme.spacing.md }]}>
            All interactive targets are at least 48dp height.
          </Text>

          <View style={styles.buttonStack}>
            <AppButton
              title="Primary Button"
              icon="add-circle-outline"
              onPress={() => showSnackbar({ message: 'Primary button pressed' })}
              fullWidth
            />
            <AppButton
              title="Secondary Button"
              variant="secondary"
              icon="people-outline"
              onPress={() => showSnackbar({ message: 'Secondary button pressed' })}
              fullWidth
            />
            <AppButton
              title={btnLoading ? 'Processing...' : 'Toggle Loading State'}
              variant="primary"
              loading={btnLoading}
              onPress={handleTestLoading}
              fullWidth
            />
            <AppButton
              title="Danger Button"
              variant="danger"
              icon="trash-outline"
              onPress={() => showSnackbar({ message: 'Danger pressed' })}
              fullWidth
            />
            <AppButton
              title="Text / Plain Button"
              variant="text"
              onPress={() => showSnackbar({ message: 'Text button pressed' })}
              fullWidth
            />
            <AppButton
              title="Disabled Button"
              disabled
              onPress={() => {}}
              fullWidth
            />
          </View>
        </View>

        {/* Section 3: Snackbar (Undo) */}
        <View style={styles.section}>
          <Text style={[theme.typography.sectionTitle, { color: theme.colors.text }]}>
            3. Snackbar (Undo Flow)
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.muted, marginBottom: theme.spacing.md }]}>
            UX Principle 4: Undo instead of confirm dialogs.
          </Text>

          <View style={styles.buttonStack}>
            <AppButton
              title="Trigger Delete & UNDO Snackbar"
              variant="primary"
              icon="arrow-undo-outline"
              onPress={handleShowUndoSnackbar}
              fullWidth
            />
          </View>
        </View>

        {/* Section 4: Loading Skeletons */}
        <View style={styles.section}>
          <Text style={[theme.typography.sectionTitle, { color: theme.colors.text }]}>
            4. LoadingSkeleton (Animated Opacity)
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.muted, marginBottom: theme.spacing.md }]}>
            Pure React Native Animated opacity pulse. No extra libraries.
          </Text>

          <Text style={[theme.typography.caption, { color: theme.colors.text, fontWeight: '700', marginBottom: 8 }]}>
            Row Variant (List items)
          </Text>
          <LoadingSkeleton variant="row" count={2} />

          <Text style={[theme.typography.caption, { color: theme.colors.text, fontWeight: '700', marginVertical: 8 }]}>
            Card Variant
          </Text>
          <LoadingSkeleton variant="card" />
        </View>

        {/* Section 5: Empty State */}
        <View style={styles.section}>
          <Text style={[theme.typography.sectionTitle, { color: theme.colors.text }]}>
            5. EmptyState
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.muted, marginBottom: theme.spacing.md }]}>
            UX Principle 8: No dead ends. One clear next action.
          </Text>

          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}>
            <EmptyState
              icon="people-outline"
              title="No Groups Yet"
              message="Create a group for your roommates, trip, or family to start splitting expenses."
              actionTitle="Create Group"
              onAction={() => showSnackbar({ message: 'Create Group action clicked' })}
            />
          </View>
        </View>

        {/* Section 6: Error State */}
        <View style={styles.section}>
          <Text style={[theme.typography.sectionTitle, { color: theme.colors.text }]}>
            6. ErrorState
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.muted, marginBottom: theme.spacing.md }]}>
            Friendly human message with retry capability.
          </Text>

          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}>
            <ErrorState
              title="Could not load expenses"
              message="The server took too long to respond. Check your connection and try again."
              retryTitle={`Try Again (${retryCount})`}
              onRetry={() => {
                setRetryCount((prev) => prev + 1);
                showSnackbar({ message: 'Retrying request...' });
              }}
            />
          </View>
        </View>

        {/* Section 7: Error Boundary Deliberate Crash Test */}
        <View style={styles.section}>
          <Text style={[theme.typography.sectionTitle, { color: theme.colors.text }]}>
            7. ErrorBoundary Deliberate Crash Test
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.muted, marginBottom: theme.spacing.md }]}>
            {'Throws a deliberate runtime error to verify ErrorBoundary recovers gracefully with "Try Again".'}
          </Text>

          <View style={styles.buttonStack}>
            <AppButton
              title="Throw Test Error (Test ErrorBoundary)"
              variant="danger"
              icon="bug-outline"
              onPress={() => setShouldCrash(true)}
              fullWidth
            />
          </View>
        </View>

        {/* Section 8: Expenses Foundations (AmountKeypad, AmountDisplay, Categories) */}
        <View style={styles.section}>
          <Text style={[theme.typography.sectionTitle, { color: theme.colors.text }]}>
            8. Expenses Foundations (Keypad & Display)
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.muted, marginBottom: theme.spacing.md }]}>
            Live keypad entry with Indian grouping (EM1), 2-decimal limit (EM2), 1-crore max (EM5), and long-press clear (EM7).
          </Text>

          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}>
            <AmountDisplay amountText={keypadAmount} />
            <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />
            <AmountKeypad
              value={keypadAmount}
              onChange={setKeypadAmount}
              onExceedMax={() =>
                showSnackbar({ message: 'Enter an amount between ₹0.01 and ₹1,00,00,000.' })
              }
            />
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 28,
  },
  section: {
    width: '100%',
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  buttonStack: {
    gap: 12,
  },
});
