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
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GroupBalancesTab } from '@/components/balances/GroupBalancesTab';
import { SettleUpSheet } from '@/components/balances/SettleUpSheet';
import { SnackbarProvider } from '@/components/Snackbar';
import { appLightTheme } from '@/lib/theme';
import { GroupMemberItem, SettlementListItem } from '@/types/database';
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

describe('Settle Flows UI (Sub-phase 5.6, Cases SC1-SC17, ST1-ST12, BU4, BU11, BU12)', () => {
  const GROUP_ID = 'test-group-settle-1111';
  const CURRENT_USER = '11111111-0000-0000-0000-000000000001';
  const USER_PRIYA = '22222222-0000-0000-0000-000000000002';
  const USER_RAHUL = '33333333-0000-0000-0000-000000000003';

  const sampleMembers: GroupMemberItem[] = [
    {
      user_id: CURRENT_USER,
      name: 'Vansh (You)',
      avatar_path: null,
      avatar_url: null,
      upi_id: 'vansh@upi',
      role: 'admin',
      status: 'active',
      joined_at: '2026-10-01T00:00:00Z',
    },
    {
      user_id: USER_PRIYA,
      name: 'Priya',
      avatar_path: null,
      avatar_url: null,
      upi_id: null,
      role: 'member',
      status: 'active',
      joined_at: '2026-10-01T00:00:00Z',
    },
    {
      user_id: USER_RAHUL,
      name: 'Rahul',
      avatar_path: null,
      avatar_url: null,
      upi_id: null,
      role: 'member',
      status: 'active',
      joined_at: '2026-10-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(networkHook, 'useNetworkStatus').mockReturnValue({
      isOffline: false,
      isConnected: true,
      isInternetReachable: true,
    });
  });

  describe('SettleUpSheet component', () => {
    it('renders settle_up mode with prefilled amount and live comparison sentence (SC10, SC11)', async () => {
      const { getByTestId, getByText } = await renderWithProviders(
        <SettleUpSheet
          visible={true}
          onClose={jest.fn()}
          groupId={GROUP_ID}
          members={sampleMembers}
          currentUserId={CURRENT_USER}
          mode="settle_up"
          initialCounterpartId={USER_PRIYA}
          initialAmountMinor={30000}
          expectedDueMinor={30000}
        />
      );

      expect(getByTestId('settle-up-sheet')).toBeTruthy();
      expect(getByText('Settle up')).toBeTruthy();
      expect(getByText('Priya')).toBeTruthy();
      expect(getByText('300')).toBeTruthy();
      expect(
        getByText("You'll be settled with Priya once they confirm.")
      ).toBeTruthy();
      expect(getByText('I paid Priya ₹300')).toBeTruthy();
    });

    it('updates live sentence when amount is edited (partial payment, SC12)', async () => {
      const { getByText } = await renderWithProviders(
        <SettleUpSheet
          visible={true}
          onClose={jest.fn()}
          groupId={GROUP_ID}
          members={sampleMembers}
          currentUserId={CURRENT_USER}
          mode="settle_up"
          initialCounterpartId={USER_PRIYA}
          initialAmountMinor={10000}
          expectedDueMinor={30000}
        />
      );

      expect(getByText("You'll still owe Priya ₹200.")).toBeTruthy();
      expect(getByText('I paid Priya ₹100')).toBeTruthy();
    });

    it('renders mark_received mode with receiver text (SC2, ST18)', async () => {
      const { getByText } = await renderWithProviders(
        <SettleUpSheet
          visible={true}
          onClose={jest.fn()}
          groupId={GROUP_ID}
          members={sampleMembers}
          currentUserId={CURRENT_USER}
          mode="mark_received"
          initialCounterpartId={USER_RAHUL}
          initialAmountMinor={50000}
          expectedDueMinor={50000}
        />
      );

      expect(getByText('Mark as received')).toBeTruthy();
      expect(getByText('Rahul')).toBeTruthy();
      expect(getByText("You'll be settled with Rahul.")).toBeTruthy();
      expect(getByText('I received ₹500 from Rahul')).toBeTruthy();
    });

    it('renders record_payment mode with direction toggles and member selector (SC14)', async () => {
      const { getByTestId, getByText } = await renderWithProviders(
        <SettleUpSheet
          visible={true}
          onClose={jest.fn()}
          groupId={GROUP_ID}
          members={sampleMembers}
          currentUserId={CURRENT_USER}
          mode="record_payment"
        />
      );

      expect(getByText('Record a payment')).toBeTruthy();
      expect(getByTestId('settle-direction-payer')).toBeTruthy();
      expect(getByTestId('settle-direction-receiver')).toBeTruthy();
      expect(getByText('I paid them')).toBeTruthy();
      expect(getByText('They paid me')).toBeTruthy();
      expect(getByTestId(`settle-member-${USER_PRIYA}`)).toBeTruthy();
      expect(getByTestId(`settle-member-${USER_RAHUL}`)).toBeTruthy();
    });

    it('disables submit button and shows explanation when offline (SC13)', async () => {
      jest.spyOn(networkHook, 'useNetworkStatus').mockReturnValue({
        isOffline: true,
        isConnected: false,
        isInternetReachable: false,
      });

      const { getByTestId, getByText } = await renderWithProviders(
        <SettleUpSheet
          visible={true}
          onClose={jest.fn()}
          groupId={GROUP_ID}
          members={sampleMembers}
          currentUserId={CURRENT_USER}
          mode="settle_up"
          initialCounterpartId={USER_PRIYA}
          initialAmountMinor={30000}
        />
      );

      expect(getByTestId('settle-offline-notice')).toBeTruthy();
      expect(
        getByText("You're offline. Reconnect to record or settle payments.")
      ).toBeTruthy();
      const submitBtn = getByTestId('settle-submit-btn');
      expect(submitBtn.props.accessibilityState?.disabled).toBe(true);
    });
  });

  describe('Pending section in GroupBalancesTab (BU4, ST1-ST6)', () => {
    it('renders pending section with confirm and dispute buttons for receiver', async () => {
      const mockSettlements: SettlementListItem[] = [
        {
          id: 's-pending-1',
          group_id: GROUP_ID,
          from_user: USER_RAHUL,
          to_user: CURRENT_USER,
          amount_minor: 30000,
          currency: 'INR',
          method: 'cash',
          note: null,
          status: 'pending',
          created_by: USER_RAHUL,
          created_at: '2026-10-04T01:00:00Z',
          status_changed_at: '2026-10-04T01:00:00Z',
          confirmed_at: null,
          can_confirm: true,
          can_dispute: true,
          can_cancel: false,
          can_undo: false,
          next_cursor: null,
        },
      ];

      jest.spyOn(settlementsHook, 'useGroupBalances').mockReturnValue({
        data: {
          members: [
            { user_id: CURRENT_USER, net_minor: -30000 },
            { user_id: USER_RAHUL, net_minor: 30000 },
          ],
          payments: [],
          my_net_minor: -30000,
          pending_for_me: 1,
        },
        isLoading: false,
        isRefetching: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      } as any);

      jest.spyOn(settlementsHook, 'useSettlements').mockReturnValue({
        data: mockSettlements,
        isLoading: false,
        isRefetching: false,
        refetch: jest.fn(),
      } as any);

      const mockConfirm = jest.fn();
      jest.spyOn(settlementsHook, 'useConfirmSettlement').mockReturnValue({
        mutate: mockConfirm,
        isPending: false,
      } as any);

      const { getByTestId, getByText } = await renderWithProviders(
        <GroupBalancesTab
          groupId={GROUP_ID}
          members={sampleMembers}
          currentUserId={CURRENT_USER}
        />
      );

      expect(getByTestId('balances-pending-section')).toBeTruthy();
      expect(getByText('Rahul says they paid you ₹300 (cash)')).toBeTruthy();
      expect(getByTestId('pending-confirm-btn-s-pending-1')).toBeTruthy();
      expect(getByTestId('pending-dispute-btn-s-pending-1')).toBeTruthy();

      // Trigger confirm
      fireEvent.press(getByTestId('pending-confirm-btn-s-pending-1'));
      expect(mockConfirm).toHaveBeenCalledWith('s-pending-1', expect.any(Object));
    });

    it('renders cancel button for payer waiting for confirmation', async () => {
      const mockSettlements: SettlementListItem[] = [
        {
          id: 's-pending-2',
          group_id: GROUP_ID,
          from_user: CURRENT_USER,
          to_user: USER_PRIYA,
          amount_minor: 25000,
          currency: 'INR',
          method: 'cash',
          note: null,
          status: 'pending',
          created_by: CURRENT_USER,
          created_at: '2026-10-04T01:00:00Z',
          status_changed_at: '2026-10-04T01:00:00Z',
          confirmed_at: null,
          can_confirm: false,
          can_dispute: false,
          can_cancel: true,
          can_undo: false,
          next_cursor: null,
        },
      ];

      jest.spyOn(settlementsHook, 'useGroupBalances').mockReturnValue({
        data: {
          members: [
            { user_id: CURRENT_USER, net_minor: 0 },
            { user_id: USER_PRIYA, net_minor: 0 },
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

      jest.spyOn(settlementsHook, 'useSettlements').mockReturnValue({
        data: mockSettlements,
        isLoading: false,
        isRefetching: false,
        refetch: jest.fn(),
      } as any);

      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId, getByText } = await renderWithProviders(
        <GroupBalancesTab
          groupId={GROUP_ID}
          members={sampleMembers}
          currentUserId={CURRENT_USER}
        />
      );

      expect(getByTestId('balances-pending-section')).toBeTruthy();
      expect(getByText('Waiting for Priya to confirm ₹250')).toBeTruthy();
      expect(getByTestId('pending-cancel-btn-s-pending-2')).toBeTruthy();

      fireEvent.press(getByTestId('pending-cancel-btn-s-pending-2'));
      expect(alertSpy).toHaveBeenCalledWith(
        'Cancel payment?',
        'Are you sure you want to cancel this payment?',
        expect.any(Array)
      );
    });
  });
});
