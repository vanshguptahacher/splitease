import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppButton, AppHeader, Screen, useSnackbar } from '@/components';
import { useAppTheme } from '@/lib/theme';

export default function AddExpenseModalScreen() {
  const theme = useAppTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showSnackbar } = useSnackbar();

  return (
    <Screen padding={false}>
      <AppHeader
        title="Add Expense"
        subtitle={`Group #${id ?? ''}`}
        showBack
        onBack={() => router.back()}
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
          <View
            style={[
              styles.phaseBadge,
              {
                backgroundColor: theme.colors.oweContainer,
                borderRadius: theme.radius.pill,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.xs,
                marginBottom: theme.spacing.md,
              },
            ]}
          >
            <Text
              style={[
                theme.typography.caption,
                { color: theme.colors.owe, fontWeight: '700' },
              ]}
            >
              🚧 Modal Expense Flow coming in Phase 4
            </Text>
          </View>

          <Text style={[theme.typography.sectionTitle, { color: theme.colors.text }]}>
            Modal Dialog Window
          </Text>

          <Text
            style={[
              theme.typography.body,
              { color: theme.colors.muted, textAlign: 'center', marginTop: theme.spacing.sm, marginBottom: theme.spacing.xl },
            ]}
          >
            In Phase 4, this modal will have the fast 3-tap add flow: big amount pad, smart defaults (you paid, split equal), and live calculation preview.
          </Text>

          <View style={styles.buttonStack}>
            <AppButton
              title="Close Modal"
              variant="secondary"
              onPress={() => router.back()}
              fullWidth
            />
            <AppButton
              title="Simulate Quick Add"
              variant="primary"
              onPress={() => {
                showSnackbar({ message: 'Expense will be added in Phase 4!' });
                router.back();
              }}
              fullWidth
            />
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
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    alignItems: 'center',
  },
  phaseBadge: {
    alignSelf: 'center',
  },
  buttonStack: {
    width: '100%',
    gap: 12,
  },
});
