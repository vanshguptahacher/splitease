jest.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'https://mock.supabase.co',
    supabaseAnonKey: 'mock-anon-key',
  },
}));

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

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GroupBalancesTab } from '@/components/balances/GroupBalancesTab';
import { appLightTheme } from '@/lib/theme';
import { GroupMemberItem } from '@/types/database';
import * as settlementsHook from '@/hooks/useSettlements';
import * as networkHook from '@/hooks/useNetworkStatus';

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

import { SnackbarProvider } from '@/components/Snackbar';

async function renderWithProviders(ui: React.ReactElement) {
  return await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={appLightTheme}>
          <SnackbarProvider>{ui}</SnackbarProvider>
        </PaperProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

describe('GroupBalancesTab UI (Sub-phase 5.5, Cases BU1-BU9, BD1-BD6)', () => {
  const USER_A = '11111111-0000-0000-0000-000000000001';
  const USER_B = '22222222-0000-0000-0000-000000000002';
  const USER_C = '33333333-0000-0000-0000-000000000003';
  const USER_D = '44444444-0000-0000-0000-000000000004';

  const mockMembers: GroupMemberItem[] = [
    {
      user_id: USER_A,
      role: 'admin',
      status: 'active',
      name: 'Alice',
      joined_at: '2026-10-01T00:00:00Z',
      avatar_path: null,
      avatar_url: null,
      upi_id: null,
    },
    {
      user_id: USER_B,
      role: 'member',
      status: 'active',
      name: 'Bob',
      joined_at: '2026-10-01T00:00:00Z',
      avatar_path: null,
      avatar_url: null,
      upi_id: null,
    },
    {
      user_id: USER_C,
      role: 'member',
      status: 'active',
      name: 'Charlie',
      joined_at: '2026-10-01T00:00:00Z',
      avatar_path: null,
      avatar_url: null,
      upi_id: null,
    },
    {
      user_id: USER_D,
      role: 'member',
      status: 'active',
      name: 'Diana',
      joined_at: '2026-10-01T00:00:00Z',
      avatar_path: null,
      avatar_url: null,
      upi_id: null,
    },
  ];

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(networkHook, 'useNetworkStatus').mockReturnValue({
      isConnected: true,
      isInternetReachable: true,
      isOffline: false,
    });
  });

  it('renders loading skeleton when balances are loading (BU6)', async () => {
    jest.spyOn(settlementsHook, 'useGroupBalances').mockReturnValue({
      data: undefined,
      isLoading: true,
      isRefetching: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    } as any);

    const { getByTestId } = await renderWithProviders(
      <GroupBalancesTab groupId="group-1" members={mockMembers} currentUserId={USER_A} />
    );

    expect(getByTestId('balances-loading')).toBeTruthy();
  });

  it('renders error state with retry button on fetch error (BU6)', async () => {
    const mockRefetch = jest.fn();
    jest.spyOn(settlementsHook, 'useGroupBalances').mockReturnValue({
      data: undefined,
      isLoading: false,
      isRefetching: false,
      isError: true,
      error: new Error('Network request failed'),
      refetch: mockRefetch,
    } as any);

    const { getByText } = await renderWithProviders(
      <GroupBalancesTab groupId="group-1" members={mockMembers} currentUserId={USER_A} />
    );

    expect(getByText('Could not load balances')).toBeTruthy();
    expect(
      getByText('No internet connection. Please check your network and try again.')
    ).toBeTruthy();

    const retryBtn = getByText('Try Again');
    fireEvent.press(retryBtn);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('handles not_a_member error gracefully (BU9)', async () => {
    jest.spyOn(settlementsHook, 'useGroupBalances').mockReturnValue({
      data: undefined,
      isLoading: false,
      isRefetching: false,
      isError: true,
      error: new Error('not_a_member'),
      refetch: jest.fn(),
    } as any);

    const { getByText } = await renderWithProviders(
      <GroupBalancesTab groupId="group-1" members={mockMembers} currentUserId={USER_A} />
    );

    expect(getByText("You're no longer in this group")).toBeTruthy();
    expect(getByText('Back to Groups')).toBeTruthy();
  });

  it('renders "All settled up" empty state when no dues exist (BU5)', async () => {
    jest.spyOn(settlementsHook, 'useGroupBalances').mockReturnValue({
      data: {
        members: [
          { user_id: USER_A, net_minor: 0 },
          { user_id: USER_B, net_minor: 0 },
        ],
        payments: [],
        my_net_minor: 0,
        pending_for_me: 0,
      },
      isLoading: false,
      isRefetching: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    } as any);

    const { getByTestId, getAllByText } = await renderWithProviders(
      <GroupBalancesTab groupId="group-1" members={mockMembers} currentUserId={USER_A} />
    );

    const topCardText = getByTestId('balances-top-card-text');
    expect(topCardText.props.children).toBe('All settled up');

    expect(getByTestId('balances-empty-state')).toBeTruthy();
    const settledTexts = getAllByText('All settled up');
    expect(settledTexts.length).toBeGreaterThanOrEqual(1);
  });

  describe('Vector 1 Data Verification (BU1, BU2, BU3, BU7)', () => {
    // Vector 1: Alice paid ₹300 for Alice, Bob, Charlie (100 each)
    // Nets: Alice +200, Bob -100, Charlie -100
    // Payments: Bob->Alice 100, Charlie->Alice 100
    const vector1Data = {
      members: [
        { user_id: USER_A, net_minor: 20000 },
        { user_id: USER_B, net_minor: -10000 },
        { user_id: USER_C, net_minor: -10000 },
      ],
      payments: [
        { seq: 1, from_user: USER_B, to_user: USER_A, amount_minor: 10000 },
        { seq: 2, from_user: USER_C, to_user: USER_A, amount_minor: 10000 },
      ],
      my_net_minor: 20000,
      pending_for_me: 0,
    };

    it('from Alice perspective: displays "You are owed ₹200", suggestions with "Mark as received"', async () => {
      const mockMarkReceived = jest.fn();

      jest.spyOn(settlementsHook, 'useGroupBalances').mockReturnValue({
        data: vector1Data,
        isLoading: false,
        isRefetching: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      } as any);

      const { getByTestId, getByText } = await renderWithProviders(
        <GroupBalancesTab
          groupId="group-1"
          members={mockMembers}
          currentUserId={USER_A}
          onMarkReceivedPress={mockMarkReceived}
        />
      );

      // BU1: Top Card
      expect(getByTestId('balances-top-card-text').props.children).toBe('You are owed ₹200');

      // BU7: Copy line under suggestions
      expect(getByTestId('suggested-payments-copy').props.children).toBe(
        'Suggested payments update when expenses change.'
      );

      // BU2: Suggestions
      expect(getByText('Bob owes you ₹100')).toBeTruthy();
      expect(getByText('Charlie owes you ₹100')).toBeTruthy();

      const receiveBtn = getByTestId('suggested-action-mark_received-1');
      fireEvent.press(receiveBtn);
      expect(mockMarkReceived).toHaveBeenCalledWith(vector1Data.payments[0]);

      // BU3: Everyone's balances (You first, then largest)
      const aliceRow = getByTestId(`member-balance-row-${USER_A}`);
      expect(aliceRow).toBeTruthy();
      expect(getByText('gets back ₹200')).toBeTruthy();
    });

    it('from Bob perspective: displays "You owe ₹100", suggestions with "Settle up"', async () => {
      const mockSettleUp = jest.fn();

      jest.spyOn(settlementsHook, 'useGroupBalances').mockReturnValue({
        data: {
          ...vector1Data,
          my_net_minor: -10000,
        },
        isLoading: false,
        isRefetching: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      } as any);

      const { getByTestId, getByText } = await renderWithProviders(
        <GroupBalancesTab
          groupId="group-1"
          members={mockMembers}
          currentUserId={USER_B}
          onSettleUpPress={mockSettleUp}
        />
      );

      // BU1: Top card
      expect(getByTestId('balances-top-card-text').props.children).toBe('You owe ₹100');

      // BU2: Suggested row for Bob
      expect(getByText('You owe Alice ₹100')).toBeTruthy();
      const settleBtn = getByTestId('suggested-action-settle_up-1');
      fireEvent.press(settleBtn);
      expect(mockSettleUp).toHaveBeenCalledWith(vector1Data.payments[0]);

      // Suggested row for Charlie (Bob is not involved -> no button)
      expect(getByText('Charlie pays Alice ₹100')).toBeTruthy();
    });
  });

  describe('Vector 4 Data Verification (BS4: Collapsed suggested payments)', () => {
    // Vector 4: Alice paid ₹100 for Bob, Bob paid ₹100 for Charlie
    // Nets: Alice +100, Bob 0, Charlie -100
    // Suggestions: Charlie -> Alice ₹100 (Bob is bypassed)
    const vector4Data = {
      members: [
        { user_id: USER_A, net_minor: 10000 },
        { user_id: USER_B, net_minor: 0 },
        { user_id: USER_C, net_minor: -10000 },
      ],
      payments: [{ seq: 1, from_user: USER_C, to_user: USER_A, amount_minor: 10000 }],
      my_net_minor: 0,
      pending_for_me: 0,
    };

    it('from Bob perspective: Bob has 0 net, is settled, sees Charlie pays Alice', async () => {
      jest.spyOn(settlementsHook, 'useGroupBalances').mockReturnValue({
        data: vector4Data,
        isLoading: false,
        isRefetching: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      } as any);

      const { getByTestId, getByText } = await renderWithProviders(
        <GroupBalancesTab groupId="group-1" members={mockMembers} currentUserId={USER_B} />
      );

      // BU1: Top Card for settled member
      expect(getByTestId('balances-top-card-text').props.children).toBe('All settled up');

      // BU2: Collapsed payment
      expect(getByText('Charlie pays Alice ₹100')).toBeTruthy();

      // BU3: Bob shows as "settled"
      expect(getByText('settled')).toBeTruthy();
    });
  });

  describe('Vector 8 Data Verification (Overpayment handling)', () => {
    // Vector 8: Alice +50, Bob -100, Charlie +50
    // Suggestions: Bob->Alice 50, Bob->Charlie 50
    const vector8Data = {
      members: [
        { user_id: USER_B, net_minor: -10000 },
        { user_id: USER_A, net_minor: 5000 },
        { user_id: USER_C, net_minor: 5000 },
      ],
      payments: [
        { seq: 1, from_user: USER_B, to_user: USER_A, amount_minor: 5000 },
        { seq: 2, from_user: USER_B, to_user: USER_C, amount_minor: 5000 },
      ],
      my_net_minor: -10000,
      pending_for_me: 0,
    };

    it('from Bob perspective: displays both payments Bob owes', async () => {
      jest.spyOn(settlementsHook, 'useGroupBalances').mockReturnValue({
        data: vector8Data,
        isLoading: false,
        isRefetching: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      } as any);

      const { getByTestId, getByText } = await renderWithProviders(
        <GroupBalancesTab groupId="group-1" members={mockMembers} currentUserId={USER_B} />
      );

      expect(getByTestId('balances-top-card-text').props.children).toBe('You owe ₹100');
      expect(getByText('You owe Alice ₹50')).toBeTruthy();
      expect(getByText('You owe Charlie ₹50')).toBeTruthy();
    });
  });

  describe('Vector 11 Data Verification (4 members complex split)', () => {
    // Vector 11: Alice +400, Bob 0, Charlie -300, Diana -100
    // Suggestions: Charlie->Alice 300, Diana->Alice 100
    const vector11Data = {
      members: [
        { user_id: USER_A, net_minor: 40000 },
        { user_id: USER_C, net_minor: -30000 },
        { user_id: USER_D, net_minor: -10000 },
        { user_id: USER_B, net_minor: 0 },
      ],
      payments: [
        { seq: 1, from_user: USER_C, to_user: USER_A, amount_minor: 30000 },
        { seq: 2, from_user: USER_D, to_user: USER_A, amount_minor: 10000 },
      ],
      my_net_minor: 40000,
      pending_for_me: 0,
    };

    it('from Alice perspective: displays ₹400 owed and suggestions from Charlie and Diana', async () => {
      jest.spyOn(settlementsHook, 'useGroupBalances').mockReturnValue({
        data: vector11Data,
        isLoading: false,
        isRefetching: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      } as any);

      const { getByTestId, getByText } = await renderWithProviders(
        <GroupBalancesTab groupId="group-1" members={mockMembers} currentUserId={USER_A} />
      );

      expect(getByTestId('balances-top-card-text').props.children).toBe('You are owed ₹400');
      expect(getByText('Charlie owes you ₹300')).toBeTruthy();
      expect(getByText('Diana owes you ₹100')).toBeTruthy();

      // Everyone's balances check
      expect(getByText('gets back ₹400')).toBeTruthy();
      expect(getByText('owes ₹300')).toBeTruthy();
      expect(getByText('owes ₹100')).toBeTruthy();
      expect(getByText('settled')).toBeTruthy();
    });
  });

  describe('BU8: Offline banner and disabled actions', () => {
    it('displays offline banner and disables action buttons when offline', async () => {
      jest.spyOn(networkHook, 'useNetworkStatus').mockReturnValue({
        isConnected: false,
        isInternetReachable: false,
        isOffline: true,
      });

      const vector1Data = {
        members: [
          { user_id: USER_A, net_minor: 20000 },
          { user_id: USER_B, net_minor: -10000 },
        ],
        payments: [{ seq: 1, from_user: USER_B, to_user: USER_A, amount_minor: 10000 }],
        my_net_minor: -10000,
        pending_for_me: 0,
      };

      jest.spyOn(settlementsHook, 'useGroupBalances').mockReturnValue({
        data: vector1Data,
        isLoading: false,
        isRefetching: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      } as any);

      const { getByTestId, getByText } = await renderWithProviders(
        <GroupBalancesTab groupId="group-1" members={mockMembers} currentUserId={USER_B} />
      );

      // Offline banner is visible
      expect(getByTestId('balances-offline-banner')).toBeTruthy();
      expect(
        getByText("You're offline. Reconnect to record or settle payments.")
      ).toBeTruthy();

      // Action button is disabled
      const settleBtn = getByTestId('suggested-action-settle_up-1');
      expect(settleBtn.props.accessibilityState?.disabled).toBe(true);
    });
  });
});
