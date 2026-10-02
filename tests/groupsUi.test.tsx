import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn().mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  }),
}));

import { SnackbarProvider } from '@/components/Snackbar';
import NewGroupScreen from '@/app/group/new';
import { appLightTheme } from '@/lib/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const initialMetrics = {
  frame: { x: 0, y: 0, width: 360, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderWithProviders(ui: React.ReactElement) {
  return await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={appLightTheme}>
          <SnackbarProvider>
            {ui}
          </SnackbarProvider>
        </PaperProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

describe('NewGroupScreen UI (Sub-phase 3.5, Cases GC1-GC4, GC6-GC8)', () => {
  it('renders input, character counter, and disabled create button initially', async () => {
    const { getByTestId } = await renderWithProviders(<NewGroupScreen />);

    const input = getByTestId('group-name-input');
    expect(input).toBeTruthy();

    const counter = getByTestId('name-counter');
    expect(counter.props.children).toBe('0 / 50');

    const submitBtn = getByTestId('create-group-submit-button');
    expect(submitBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it('keeps create button disabled when name is spaces-only (GC2)', async () => {
    const { getByTestId } = await renderWithProviders(<NewGroupScreen />);

    const input = getByTestId('group-name-input');
    fireEvent.changeText(input, '    ');

    await waitFor(() => {
      const counter = getByTestId('name-counter');
      expect(counter.props.children).toBe('4 / 50');
    });

    const submitBtn = getByTestId('create-group-submit-button');
    expect(submitBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it('enables create button when valid name is entered (GC1, GC4)', async () => {
    const { getByTestId } = await renderWithProviders(<NewGroupScreen />);

    const input = getByTestId('group-name-input');
    // Unicode Hindi + emojis (GC4)
    fireEvent.changeText(input, 'गोवा ट्रिप 🏖️');

    await waitFor(() => {
      const counter = getByTestId('name-counter');
      expect(counter.props.children).toBe('14 / 50');
    });

    const submitBtn = getByTestId('create-group-submit-button');
    expect(submitBtn.props.accessibilityState?.disabled).toBe(false);
  });

  it('enforces maxLength of 50 on the input (GC3)', async () => {
    const { getByTestId } = await renderWithProviders(<NewGroupScreen />);

    const input = getByTestId('group-name-input');
    expect(input.props.maxLength).toBe(50);
  });
});
