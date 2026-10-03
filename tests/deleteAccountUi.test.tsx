import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DeleteAccountScreen from '@/app/account/delete';
import * as avatarApi from '@/lib/auth/avatar';
import * as googleAuth from '@/lib/auth/google';
import { supabase } from '@/lib/supabase/client';
import { appLightTheme } from '@/lib/theme';
import { SnackbarProvider } from '@/components/Snackbar';

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(),
    signIn: jest.fn(),
  },
  isSuccessResponse: (resp: any) => resp?.type === 'success',
  isCancelledResponse: (resp: any) => resp?.type === 'cancelled',
  isErrorWithCode: (err: any) => Boolean(err && typeof err === 'object' && 'code' in err),
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  },
}));

const mockProfileUpdate = jest.fn().mockReturnValue({
  eq: jest.fn().mockResolvedValue({ error: null }),
});

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(() => ({
      update: mockProfileUpdate,
    })),
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } },
        error: null,
      }),
    },
  },
}));

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
};

jest.mock('expo-router', () => ({
  router: mockRouter,
  useFocusEffect: jest.fn(),
  useRouter: () => mockRouter,
}));

const mockSignOutAndReset = jest.fn().mockResolvedValue(undefined);
const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  app_metadata: { provider: 'google' },
};

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    signOutAndReset: mockSignOutAndReset,
    status: 'authenticated',
  }),
}));

const mockProfile = {
  id: 'test-user-id',
  name: 'Test User',
  avatar_path: 'test-user-id/avatar.jpg',
  avatar_url: 'https://example.com/avatar.jpg',
  upi_id: 'test@upi',
};

jest.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({
    profile: mockProfile,
    isLoading: false,
  }),
}));

jest.mock('@/lib/auth/avatar');
jest.mock('@/lib/auth/google');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: 0 },
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

describe('DeleteAccountScreen integration (Sub-phase 3.8, GD1–GD6, F1–F9)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    (avatarApi.deleteAvatarFile as jest.Mock).mockResolvedValue(undefined);
    (googleAuth.signInWithGoogle as jest.Mock).mockResolvedValue({
      user: { id: 'test-user-id', email: 'test@example.com' },
    });
  });

  it('runs preflight check on explain screen and enables continue when no blockers (GD5)', async () => {
    (supabase.rpc as jest.Mock).mockImplementation((fn: string) => {
      if (fn === 'account_deletion_blockers') {
        return Promise.resolve({
          data: { sole_admin_groups: [], unsettled_groups: [] },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const { getByTestId, queryByTestId } = await renderWithProviders(<DeleteAccountScreen />);

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('account_deletion_blockers');
    });

    expect(queryByTestId('sole-admin-blocker-card')).toBeNull();
    expect(queryByTestId('unsettled-blocker-card')).toBeNull();

    await waitFor(() => {
      const continueBtn = getByTestId('continue-to-verify-button');
      expect(continueBtn.props.accessibilityState.disabled).toBe(false);
    });
  });

  it('blocks deletion when user is sole admin of groups with others and opens group members tab (GD1, F7)', async () => {
    (supabase.rpc as jest.Mock).mockImplementation((fn: string) => {
      if (fn === 'account_deletion_blockers') {
        return Promise.resolve({
          data: {
            sole_admin_groups: [{ id: 'group-sole-1', name: 'Trip to Manali' }],
            unsettled_groups: [],
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const { getByTestId, getByText } = await renderWithProviders(<DeleteAccountScreen />);

    await waitFor(() => {
      expect(getByTestId('sole-admin-blocker-card')).toBeTruthy();
    });

    expect(getByText('Trip to Manali')).toBeTruthy();
    expect(getByText('Cannot Delete: Sole Admin')).toBeTruthy();

    const continueBtn = getByTestId('continue-to-verify-button');
    expect(continueBtn.props.accessibilityState.disabled).toBe(true);

    const manageBtn = getByTestId('manage-group-group-sole-1');
    fireEvent.press(manageBtn);

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/group/[id]',
      params: { id: 'group-sole-1', tab: 'members' },
    });
  });

  it('blocks continuation and keeps button disabled when user has unsettled balances (GD4, F8)', async () => {
    (supabase.rpc as jest.Mock).mockImplementation((fn: string) => {
      if (fn === 'account_deletion_blockers') {
        return Promise.resolve({
          data: {
            sole_admin_groups: [],
            unsettled_groups: [{ id: 'group-unsettled-1', name: 'Flat 402 Expenses' }],
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const { getByTestId, getByText } = await renderWithProviders(<DeleteAccountScreen />);

    await waitFor(() => {
      expect(getByTestId('unsettled-blocker-card')).toBeTruthy();
    });

    expect(getByText('Flat 402 Expenses')).toBeTruthy();
    expect(getByText('Cannot Delete: Unsettled Balances')).toBeTruthy();
    expect(getByText('Settle up with your groups first, then you can delete your account.')).toBeTruthy();

    const continueBtn = getByTestId('continue-to-verify-button');
    expect(continueBtn.props.accessibilityState.disabled).toBe(true);
  });

  it('aborts deletion before avatar removal if blockers appear before deletion (race condition)', async () => {
    let callCount = 0;
    (supabase.rpc as jest.Mock).mockImplementation((fn: string) => {
      if (fn === 'account_deletion_blockers') {
        callCount++;
        // First call on Explain screen: empty
        if (callCount === 1) {
          return Promise.resolve({
            data: { sole_admin_groups: [], unsettled_groups: [] },
            error: null,
          });
        }
        // Second call right before avatar removal: newly unsettled
        return Promise.resolve({
          data: {
            sole_admin_groups: [],
            unsettled_groups: [{ id: 'race-group', name: 'Race Group' }],
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const { getByTestId, getByText } = await renderWithProviders(<DeleteAccountScreen />);

    await waitFor(() => {
      expect(getByTestId('continue-to-verify-button').props.accessibilityState.disabled).toBe(false);
    });

    fireEvent.press(getByTestId('continue-to-verify-button'));

    await waitFor(() => {
      expect(getByTestId('verify-google-button')).toBeTruthy();
    });

    fireEvent.press(getByTestId('verify-google-button'));

    await waitFor(() => {
      expect(getByTestId('delete-account-input')).toBeTruthy();
    });

    fireEvent.changeText(getByTestId('delete-account-input'), 'DELETE');

    await waitFor(() => {
      expect(getByTestId('confirm-delete-account-button').props.accessibilityState.disabled).toBe(false);
    });

    fireEvent.press(getByTestId('confirm-delete-account-button'));

    await waitFor(() => {
      expect(getByText('Deletion Could Not Complete')).toBeTruthy();
      expect(getByText('Settle up with your groups first, then you can delete your account.')).toBeTruthy();
    });

    // Avatar files were NOT removed because blockers were caught beforehand
    expect(avatarApi.deleteAvatarFile).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalledWith('delete_my_account');
  });

  it('completes clean deletion without parameters when no blockers exist (GD2, GD3, GD6, F4)', async () => {
    (supabase.rpc as jest.Mock).mockImplementation((fn: string) => {
      if (fn === 'account_deletion_blockers') {
        return Promise.resolve({
          data: {
            sole_admin_groups: [],
            unsettled_groups: [],
          },
          error: null,
        });
      }
      if (fn === 'delete_my_account') {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const { getByTestId } = await renderWithProviders(<DeleteAccountScreen />);

    await waitFor(() => {
      expect(getByTestId('continue-to-verify-button').props.accessibilityState.disabled).toBe(false);
    });

    fireEvent.press(getByTestId('continue-to-verify-button'));

    await waitFor(() => {
      expect(getByTestId('verify-google-button')).toBeTruthy();
    });

    fireEvent.press(getByTestId('verify-google-button'));

    await waitFor(() => {
      expect(getByTestId('delete-account-input')).toBeTruthy();
    });

    fireEvent.changeText(getByTestId('delete-account-input'), 'DELETE');

    await waitFor(() => {
      expect(getByTestId('confirm-delete-account-button').props.accessibilityState.disabled).toBe(false);
    });

    fireEvent.press(getByTestId('confirm-delete-account-button'));

    await waitFor(() => {
      expect(avatarApi.deleteAvatarFile).toHaveBeenCalledWith('test-user-id/avatar.jpg');
      expect(supabase.rpc).toHaveBeenCalledWith('delete_my_account');
      expect(mockSignOutAndReset).toHaveBeenCalled();
      expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/goodbye');
    });
  });

  it('shows error screen, resets avatar_path to null, and allows retry if deleteMyAccount fails after avatar removal (F5)', async () => {
    (supabase.rpc as jest.Mock).mockImplementation((fn: string) => {
      if (fn === 'account_deletion_blockers') {
        return Promise.resolve({
          data: {
            sole_admin_groups: [],
            unsettled_groups: [],
          },
          error: null,
        });
      }
      if (fn === 'delete_my_account') {
        return Promise.resolve({ data: null, error: { message: 'Network error during deletion' } });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const { getByTestId, getByText } = await renderWithProviders(<DeleteAccountScreen />);

    await waitFor(() => {
      expect(getByTestId('continue-to-verify-button').props.accessibilityState.disabled).toBe(false);
    });

    fireEvent.press(getByTestId('continue-to-verify-button'));

    await waitFor(() => {
      expect(getByTestId('verify-google-button')).toBeTruthy();
    });

    fireEvent.press(getByTestId('verify-google-button'));

    await waitFor(() => {
      expect(getByTestId('delete-account-input')).toBeTruthy();
    });

    fireEvent.changeText(getByTestId('delete-account-input'), 'DELETE');

    await waitFor(() => {
      expect(getByTestId('confirm-delete-account-button').props.accessibilityState.disabled).toBe(false);
    });

    fireEvent.press(getByTestId('confirm-delete-account-button'));

    await waitFor(() => {
      expect(avatarApi.deleteAvatarFile).toHaveBeenCalledWith('test-user-id/avatar.jpg');
      expect(supabase.from).toHaveBeenCalledWith('profiles');
      expect(mockProfileUpdate).toHaveBeenCalledWith({ avatar_path: null });
      expect(getByText('Deletion Could Not Complete')).toBeTruthy();
      expect(getByText('Retry Deletion')).toBeTruthy();
    });
  });
});
