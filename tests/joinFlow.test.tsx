import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

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

jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn(),
}));

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: jest.fn(),
}));

const mockShowSnackbar = jest.fn();
jest.mock('@/components/Snackbar', () => {
  const actual = jest.requireActual('@/components/Snackbar');
  return {
    ...actual,
    useSnackbar: () => ({
      showSnackbar: mockShowSnackbar,
      hideSnackbar: jest.fn(),
    }),
  };
});

import { supabase } from '@/lib/supabase/client';
import { SnackbarProvider } from '@/components/Snackbar';
import JoinGroupScreen from '@/app/group/join';
import JoinPreviewScreen from '@/app/join/[code]';
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

describe('Join Flow UI (Sub-phase 3.6, Cases GJ1-GJ18)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  describe('JoinGroupScreen (/group/join)', () => {
    it('renders input, paste button, and disabled continue button initially', async () => {
      const { getByTestId } = await renderWithProviders(<JoinGroupScreen />);

      const input = getByTestId('join-code-input');
      expect(input).toBeTruthy();

      const continueBtn = getByTestId('continue-preview-button');
      expect(continueBtn.props.accessibilityState.disabled).toBe(true);
    });

    it('enables continue button when a valid 8-character code is entered', async () => {
      const { getByTestId } = await renderWithProviders(<JoinGroupScreen />);

      const input = getByTestId('join-code-input');
      fireEvent.changeText(input, 'ABCD-EFGH');

      await waitFor(() => {
        const continueBtn = getByTestId('continue-preview-button');
        expect(continueBtn.props.accessibilityState.disabled).toBe(false);
      });

      const continueBtn = getByTestId('continue-preview-button');
      fireEvent.press(continueBtn);
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/join/[code]',
        params: { code: 'ABCDEFGH' },
      });
    });

    it('extracts invite code from pasted link text (Case GJ8)', async () => {
      (Clipboard.getStringAsync as jest.Mock).mockResolvedValueOnce(
        'Join my group on SplitEase! https://splitease.app/join/WXYZ-89AB'
      );

      const { getByTestId } = await renderWithProviders(<JoinGroupScreen />);

      const pasteBtn = getByTestId('paste-code-button');
      fireEvent.press(pasteBtn);

      await waitFor(() => {
        expect(router.push).toHaveBeenCalledWith({
          pathname: '/join/[code]',
          params: { code: 'WXYZ89AB' },
        });
      });
    });
  });

  describe('JoinPreviewScreen (/join/[code])', () => {
    it('redirects to /group/join if code is missing or malformed (Case GJ17)', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ code: '' });

      await renderWithProviders(<JoinPreviewScreen />);

      await waitFor(() => {
        expect(router.replace).toHaveBeenCalledWith('/group/join');
      });
    });

    it('displays group details on valid code (Case GJ1, GJ18)', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ code: 'ABCD2345' });
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: [
          {
            status: 'valid',
            group_name: 'Goa Trip 2026',
            member_count: 5,
            inviter_name: 'Rahul Sharma',
          },
        ],
        error: null,
      });

      const { findByText } = await renderWithProviders(<JoinPreviewScreen />);

      expect(await findByText('Goa Trip 2026')).toBeTruthy();
      expect(await findByText('5 members')).toBeTruthy();
      expect(await findByText('Invited by Rahul Sharma')).toBeTruthy();
    });

    it('joins group when Join Group is tapped (Case GJ1, GJ14)', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ code: 'ABCD2345' });
      (supabase.rpc as jest.Mock)
        .mockResolvedValueOnce({
          data: [
            {
              status: 'valid',
              group_name: 'Goa Trip 2026',
              member_count: 5,
              inviter_name: 'Rahul Sharma',
            },
          ],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [
            {
              r_status: 'joined',
              r_group_id: 'group-123',
              r_group_name: 'Goa Trip 2026',
            },
          ],
          error: null,
        });

      const { findByTestId } = await renderWithProviders(<JoinPreviewScreen />);

      const joinBtn = await findByTestId('confirm-join-button');
      fireEvent.press(joinBtn);

      await waitFor(() => {
        expect(supabase.rpc).toHaveBeenCalledWith('join_group', {
          p_code: 'ABCD2345',
        });
        expect(router.replace).toHaveBeenCalledWith({
          pathname: '/group/[id]',
          params: { id: 'group-123' },
        });
      });
    });

    it('displays already_member state if user is already in group (Case GJ4)', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ code: 'ABCD2345' });
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: [
          {
            status: 'already_member',
            group_name: 'Goa Trip 2026',
            member_count: 5,
            inviter_name: null,
          },
        ],
        error: null,
      });

      const { findByText } = await renderWithProviders(<JoinPreviewScreen />);

      expect(await findByText('Already a Member')).toBeTruthy();
      expect(await findByText("You're already in this group.")).toBeTruthy();
    });

    it('displays expired state when code has expired (Case GJ5)', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ code: 'ABCD2345' });
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: [
          {
            status: 'expired',
            group_name: null,
            member_count: null,
            inviter_name: null,
          },
        ],
        error: null,
      });

      const { findByText } = await renderWithProviders(<JoinPreviewScreen />);

      expect(await findByText('Invite Expired')).toBeTruthy();
      expect(
        await findByText('This invite has expired. Ask an admin for a new one.')
      ).toBeTruthy();
    });

    it('displays group_full state when group reaches 50 members (Case GJ9)', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ code: 'ABCD2345' });
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: [
          {
            status: 'group_full',
            group_name: null,
            member_count: null,
            inviter_name: null,
          },
        ],
        error: null,
      });

      const { findByText } = await renderWithProviders(<JoinPreviewScreen />);

      expect(await findByText('Group Full')).toBeTruthy();
      expect(await findByText('This group is full.')).toBeTruthy();
    });
  });
});
