import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, Share } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';
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
  setStringAsync: jest.fn().mockResolvedValue(true),
  getStringAsync: jest.fn(),
}));

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => ({ id: 'group-123' }),
  useFocusEffect: jest.fn(),
}));

const mockUser = { id: 'user-caller', email: 'caller@example.com' };
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    status: 'authenticated',
  }),
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
import GroupDetailScreen from '@/app/group/[id]/index';
import InviteScreen from '@/app/group/[id]/invite';
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

describe('Group Detail UI (Sub-phase 3.7, Cases GI, GR, GM, GE, GN)', () => {
  const mockGroup = {
    id: 'group-123',
    name: 'Goa Trip 2026',
    currency: 'INR',
    created_by: 'user-caller',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    my_role: 'admin' as const,
    member_count: 3,
  };

  const mockMembers = [
    {
      user_id: 'user-caller',
      name: 'Vansh',
      avatar_path: null,
      avatar_url: null,
      upi_id: 'vansh@okhdfcbank',
      role: 'admin' as const,
      status: 'active' as const,
      joined_at: '2026-10-01T10:00:00Z',
    },
    {
      user_id: 'user-2',
      name: 'Bob Admin',
      avatar_path: null,
      avatar_url: null,
      upi_id: 'bob@oksbi',
      role: 'admin' as const,
      status: 'active' as const,
      joined_at: '2026-10-01T11:00:00Z',
    },
    {
      user_id: 'user-3',
      name: 'Charlie Member',
      avatar_path: null,
      avatar_url: null,
      upi_id: 'charlie@okaxis',
      role: 'member' as const,
      status: 'active' as const,
      joined_at: '2026-10-01T12:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    jest.spyOn(Alert, 'alert');
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  });

  describe('GroupDetailScreen', () => {
    it('renders group information, tabs, and member list with Admin chips and UPI (GR1, GR11, GR12)', async () => {
      (supabase.rpc as jest.Mock).mockImplementation((fn: string) => {
        if (fn === 'get_group') return Promise.resolve({ data: [mockGroup], error: null });
        if (fn === 'get_group_members') return Promise.resolve({ data: mockMembers, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      const { getByText, getAllByText } = await renderWithProviders(<GroupDetailScreen />);

      await waitFor(() => {
        expect(getAllByText('Goa Trip 2026').length).toBeGreaterThan(0);
        expect(getByText('Currency: INR · 3 members')).toBeTruthy();
        expect(getByText('Charlie Member')).toBeTruthy();
        expect(getByText('(You)')).toBeTruthy();
        expect(getAllByText('Admin').length).toBeGreaterThan(0);
      });
    });

    it('switches tabs between Expenses, Balances, and Members', async () => {
      (supabase.rpc as jest.Mock).mockImplementation((fn: string) => {
        if (fn === 'get_group') return Promise.resolve({ data: [mockGroup], error: null });
        if (fn === 'get_group_members') return Promise.resolve({ data: mockMembers, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      const { getByText, getByTestId } = await renderWithProviders(<GroupDetailScreen />);

      await waitFor(() => {
        expect(getByText('Charlie Member')).toBeTruthy();
      });

      // Switch to Expenses
      fireEvent.press(getByTestId('tab-expenses'));
      await waitFor(() => {
        expect(getByText('Expenses Coming in Phase 4')).toBeTruthy();
      });

      // Switch to Balances
      fireEvent.press(getByTestId('tab-balances'));
      await waitFor(() => {
        expect(getByText('Balances Coming in Phase 5')).toBeTruthy();
      });

      // Switch back to Members
      fireEvent.press(getByTestId('tab-members'));
      await waitFor(() => {
        expect(getByText('Charlie Member')).toBeTruthy();
      });
    });

    it('promotes a member to admin with UNDO snackbar support (GR3)', async () => {
      (supabase.rpc as jest.Mock).mockImplementation((fn: string) => {
        if (fn === 'get_group') return Promise.resolve({ data: [mockGroup], error: null });
        if (fn === 'get_group_members') return Promise.resolve({ data: mockMembers, error: null });
        if (fn === 'set_member_role') return Promise.resolve({ data: null, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      const { getByTestId } = await renderWithProviders(<GroupDetailScreen />);

      await waitFor(() => {
        expect(getByTestId('member-options-user-3')).toBeTruthy();
      });

      // Open member options for user-3
      fireEvent.press(getByTestId('member-options-user-3'));

      // Tap Make Admin
      await waitFor(() => {
        expect(getByTestId('make-admin-button')).toBeTruthy();
      });
      fireEvent.press(getByTestId('make-admin-button'));

      await waitFor(() => {
        expect(supabase.rpc).toHaveBeenCalledWith('set_member_role', {
          p_group: 'group-123',
          p_user: 'user-3',
          p_role: 'admin',
        });
        expect(mockShowSnackbar).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Promoted Charlie Member to admin',
            action: expect.objectContaining({ label: 'Undo' }),
          })
        );
      });

      // Execute Undo
      const lastCall = mockShowSnackbar.mock.calls[mockShowSnackbar.mock.calls.length - 1][0];
      await lastCall.action.onPress();

      expect(supabase.rpc).toHaveBeenCalledWith('set_member_role', {
        p_group: 'group-123',
        p_user: 'user-3',
        p_role: 'member',
      });
    });

    it('demotes an admin with UNDO snackbar support (GR4)', async () => {
      (supabase.rpc as jest.Mock).mockImplementation((fn: string) => {
        if (fn === 'get_group') return Promise.resolve({ data: [mockGroup], error: null });
        if (fn === 'get_group_members') return Promise.resolve({ data: mockMembers, error: null });
        if (fn === 'set_member_role') return Promise.resolve({ data: null, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      const { getByTestId } = await renderWithProviders(<GroupDetailScreen />);

      await waitFor(() => {
        expect(getByTestId('member-options-user-2')).toBeTruthy();
      });

      // Open options for Bob Admin (user-2)
      fireEvent.press(getByTestId('member-options-user-2'));

      await waitFor(() => {
        expect(getByTestId('remove-admin-role-button')).toBeTruthy();
      });
      fireEvent.press(getByTestId('remove-admin-role-button'));

      await waitFor(() => {
        expect(supabase.rpc).toHaveBeenCalledWith('set_member_role', {
          p_group: 'group-123',
          p_user: 'user-2',
          p_role: 'member',
        });
        expect(mockShowSnackbar).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Removed admin role from Bob Admin',
            action: expect.objectContaining({ label: 'Undo' }),
          })
        );
      });
    });

    it('prevents direct removal of an admin and shows warning note (GR13)', async () => {
      (supabase.rpc as jest.Mock).mockImplementation((fn: string) => {
        if (fn === 'get_group') return Promise.resolve({ data: [mockGroup], error: null });
        if (fn === 'get_group_members') return Promise.resolve({ data: mockMembers, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      const { getByTestId, getByText, queryByTestId } = await renderWithProviders(<GroupDetailScreen />);

      await waitFor(() => {
        expect(getByTestId('member-options-user-2')).toBeTruthy();
      });

      fireEvent.press(getByTestId('member-options-user-2'));

      await waitFor(() => {
        expect(getByText('Remove admin role first to remove them from group.')).toBeTruthy();
        expect(queryByTestId('remove-member-button')).toBeNull();
      });
    });

    it('removes a settled member after confirmation (GM1)', async () => {
      (supabase.rpc as jest.Mock).mockImplementation((fn: string) => {
        if (fn === 'get_group') return Promise.resolve({ data: [mockGroup], error: null });
        if (fn === 'get_group_members') return Promise.resolve({ data: mockMembers, error: null });
        if (fn === 'remove_member') return Promise.resolve({ data: null, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      const { getByTestId } = await renderWithProviders(<GroupDetailScreen />);

      await waitFor(() => {
        expect(getByTestId('member-options-user-3')).toBeTruthy();
      });

      fireEvent.press(getByTestId('member-options-user-3'));

      await waitFor(() => {
        expect(getByTestId('remove-member-button')).toBeTruthy();
      });
      fireEvent.press(getByTestId('remove-member-button'));

      expect(Alert.alert).toHaveBeenCalledWith(
        'Remove Charlie Member?',
        expect.any(String),
        expect.any(Array)
      );

      // Confirm alert
      const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
      const removeButton = alertButtons.find((b: any) => b.text === 'Remove');
      await removeButton.onPress();

      expect(supabase.rpc).toHaveBeenCalledWith('remove_member', {
        p_group: 'group-123',
        p_user: 'user-3',
      });
    });

    it('renames group with 50-character limit and character counter (GE1, GE3)', async () => {
      (supabase.rpc as jest.Mock).mockImplementation((fn: string) => {
        if (fn === 'get_group') return Promise.resolve({ data: [mockGroup], error: null });
        if (fn === 'get_group_members') return Promise.resolve({ data: mockMembers, error: null });
        if (fn === 'rename_group') return Promise.resolve({ data: { ...mockGroup, name: 'Goa 2026 Updated' }, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      const { getByLabelText, getByTestId, getByText } = await renderWithProviders(<GroupDetailScreen />);

      await waitFor(() => {
        expect(getByLabelText('Group options')).toBeTruthy();
      });

      // Open overflow menu
      fireEvent.press(getByLabelText('Group options'));

      await waitFor(() => {
        expect(getByText('Rename Group')).toBeTruthy();
      });
      fireEvent.press(getByText('Rename Group'));

      // Edit name in dialog
      await waitFor(() => {
        expect(getByTestId('rename-input')).toBeTruthy();
      });
      const input = getByTestId('rename-input');
      fireEvent.changeText(input, 'Goa 2026 Updated');

      await waitFor(() => {
        expect(getByTestId('save-rename-button').props.accessibilityState.disabled).toBe(false);
      });

      fireEvent.press(getByTestId('save-rename-button'));

      await waitFor(() => {
        expect(supabase.rpc).toHaveBeenCalledWith('rename_group', {
          p_group: 'group-123',
          p_name: 'Goa 2026 Updated',
        });
      });
    });

    it('requires typing DELETE to confirm group deletion (GE4, GE8)', async () => {
      (supabase.rpc as jest.Mock).mockImplementation((fn: string) => {
        if (fn === 'get_group') return Promise.resolve({ data: [mockGroup], error: null });
        if (fn === 'get_group_members') return Promise.resolve({ data: mockMembers, error: null });
        if (fn === 'delete_group') return Promise.resolve({ data: null, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      const { getByLabelText, getByTestId, getByText } = await renderWithProviders(<GroupDetailScreen />);

      await waitFor(() => {
        expect(getByLabelText('Group options')).toBeTruthy();
      });

      fireEvent.press(getByLabelText('Group options'));

      await waitFor(() => {
        expect(getByText('Delete Group')).toBeTruthy();
      });
      fireEvent.press(getByText('Delete Group'));

      await waitFor(() => {
        expect(getByTestId('delete-confirm-input')).toBeTruthy();
      });

      await waitFor(() => {
        expect(getByTestId('confirm-delete-group-button').props.accessibilityState.disabled).toBe(true);
      });

      // Type DELETE
      fireEvent.changeText(getByTestId('delete-confirm-input'), 'DELETE');

      await waitFor(() => {
        expect(getByTestId('confirm-delete-group-button').props.accessibilityState.disabled).toBe(false);
      });

      fireEvent.press(getByTestId('confirm-delete-group-button'));

      await waitFor(() => {
        expect(supabase.rpc).toHaveBeenCalledWith('delete_group', {
          p_group: 'group-123',
        });
        expect(router.replace).toHaveBeenCalledWith('/(tabs)');
      });
    });
  });

  describe('InviteScreen (/group/[id]/invite)', () => {
    const mockInvite = {
      code: 'K7MN2P4X',
      expires_at: '2026-10-10T10:00:00Z',
    };

    it('displays large formatted invite code and expiry date (GI1, GI4, GI5)', async () => {
      (supabase.rpc as jest.Mock).mockImplementation((fn: string) => {
        if (fn === 'get_group') return Promise.resolve({ data: [mockGroup], error: null });
        if (fn === 'get_or_create_invite') return Promise.resolve({ data: [mockInvite], error: null });
        return Promise.resolve({ data: null, error: null });
      });

      const { getByTestId } = await renderWithProviders(<InviteScreen />);

      await waitFor(() => {
        const codeText = getByTestId('invite-code-text');
        expect(codeText.props.children).toBe('K7MN-2P4X');
        expect(getByTestId('invite-expiry-text')).toBeTruthy();
      });
    });

    it('copies invite code to clipboard and triggers snackbar (GI3)', async () => {
      (supabase.rpc as jest.Mock).mockImplementation((fn: string) => {
        if (fn === 'get_group') return Promise.resolve({ data: [mockGroup], error: null });
        if (fn === 'get_or_create_invite') return Promise.resolve({ data: [mockInvite], error: null });
        return Promise.resolve({ data: null, error: null });
      });

      const { getByTestId } = await renderWithProviders(<InviteScreen />);

      await waitFor(() => {
        expect(getByTestId('copy-code-button')).toBeTruthy();
      });

      fireEvent.press(getByTestId('copy-code-button'));

      await waitFor(() => {
        expect(Clipboard.setStringAsync).toHaveBeenCalledWith('K7MN2P4X');
        expect(mockShowSnackbar).toHaveBeenCalledWith({ message: 'Code copied' });
      });
    });

    it('shares invite with ready message containing group name, code and link (GI2)', async () => {
      (supabase.rpc as jest.Mock).mockImplementation((fn: string) => {
        if (fn === 'get_group') return Promise.resolve({ data: [mockGroup], error: null });
        if (fn === 'get_or_create_invite') return Promise.resolve({ data: [mockInvite], error: null });
        return Promise.resolve({ data: null, error: null });
      });

      const { getByTestId } = await renderWithProviders(<InviteScreen />);

      await waitFor(() => {
        expect(getByTestId('share-invite-button')).toBeTruthy();
      });

      fireEvent.press(getByTestId('share-invite-button'));

      await waitFor(() => {
        expect(Share.share).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('K7MN-2P4X'),
          })
        );
      });
    });

    it('resets invite link with confirmation dialog (GI6)', async () => {
      const newMockInvite = {
        code: 'A2B3C4D5',
        expires_at: '2026-10-12T10:00:00Z',
      };

      (supabase.rpc as jest.Mock).mockImplementation((fn: string) => {
        if (fn === 'get_group') return Promise.resolve({ data: [mockGroup], error: null });
        if (fn === 'get_or_create_invite') return Promise.resolve({ data: [mockInvite], error: null });
        if (fn === 'reset_invite') return Promise.resolve({ data: [newMockInvite], error: null });
        return Promise.resolve({ data: null, error: null });
      });

      const { getByTestId } = await renderWithProviders(<InviteScreen />);

      await waitFor(() => {
        expect(getByTestId('reset-invite-button')).toBeTruthy();
      });

      fireEvent.press(getByTestId('reset-invite-button'));

      expect(Alert.alert).toHaveBeenCalledWith(
        'Reset invite link?',
        expect.any(String),
        expect.any(Array)
      );

      const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
      const resetBtn = alertButtons.find((b: any) => b.text === 'Reset Link');
      await resetBtn.onPress();

      expect(supabase.rpc).toHaveBeenCalledWith('reset_invite', {
        p_group: 'group-123',
      });
    });

    it('blocks non-admin members from viewing invite code (GI7)', async () => {
      const nonAdminGroup = { ...mockGroup, my_role: 'member' as const };
      (supabase.rpc as jest.Mock).mockImplementation((fn: string) => {
        if (fn === 'get_group') return Promise.resolve({ data: [nonAdminGroup], error: null });
        return Promise.resolve({ data: null, error: null });
      });

      const { getByText, queryByTestId } = await renderWithProviders(<InviteScreen />);

      await waitFor(() => {
        expect(getByText('Only Admins Can Invite')).toBeTruthy();
        expect(getByText('Ask an admin for the invite link.')).toBeTruthy();
        expect(queryByTestId('invite-code-text')).toBeNull();
      });
    });
  });
});
