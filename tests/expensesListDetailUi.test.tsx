import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';

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

const USER_1 = '11111111-1111-1111-1111-111111111111';
const USER_2 = '22222222-2222-2222-2222-222222222222';
const USER_3 = '33333333-3333-3333-3333-333333333333';
const GROUP_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EXP_1 = 'eeeeeeee-1111-1111-1111-eeeeeeeeeeee';
const EXP_2 = 'eeeeeeee-2222-2222-2222-eeeeeeeeeeee';

const mockUser = { id: USER_1, email: 'user1@example.com' };

const mockGroup = {
  id: GROUP_ID,
  name: 'Goa Trip',
  currency: 'INR',
  created_by: USER_1,
  my_role: 'admin' as const,
  member_count: 3,
};

const mockMembers = [
  {
    user_id: USER_1,
    name: 'Alice',
    avatar_path: null,
    avatar_url: null,
    upi_id: null,
    role: 'admin' as const,
    status: 'active' as const,
    joined_at: '2026-10-01T00:00:00Z',
  },
  {
    user_id: USER_2,
    name: 'Bob',
    avatar_path: null,
    avatar_url: null,
    upi_id: null,
    role: 'member' as const,
    status: 'active' as const,
    joined_at: '2026-10-01T00:00:00Z',
  },
  {
    user_id: USER_3,
    name: 'Deleted user',
    avatar_path: null,
    avatar_url: null,
    upi_id: null,
    role: 'member' as const,
    status: 'left' as const,
    joined_at: '2026-10-01T00:00:00Z',
  },
];

const mockExpenses: ExpenseListItem[] = [
  {
    id: EXP_1,
    description: 'Dinner at Beach',
    category: 'food',
    amount_minor: 30000, // ₹300
    paid_by: USER_1, // Alice paid
    expense_date: '2026-10-03',
    created_by: USER_1,
    created_at: '2026-10-03T18:00:00Z',
    version: 1,
    participant_count: 3,
    my_share_minor: 10000,
    my_net_minor: 20000, // lent ₹200
    is_locked: false,
    can_edit: true,
    next_cursor: {
      expense_date: '2026-10-03',
      created_at: '2026-10-03T18:00:00Z',
      id: EXP_1,
    },
  },
  {
    id: EXP_2,
    description: 'Taxi Ride',
    category: 'travel',
    amount_minor: 60000, // ₹600
    paid_by: USER_2, // Bob paid
    expense_date: '2026-10-02',
    created_by: USER_2,
    created_at: '2026-10-02T15:00:00Z',
    version: 1,
    participant_count: 3,
    my_share_minor: 20000,
    my_net_minor: -20000, // owe ₹200
    is_locked: true, // locked
    can_edit: false,
    next_cursor: {
      expense_date: '2026-10-02',
      created_at: '2026-10-02T15:00:00Z',
      id: EXP_2,
    },
  },
];

const mockExpenseDetail: ExpenseDetailResponse = {
  expense: {
    id: EXP_1,
    group_id: GROUP_ID,
    description: 'Dinner at Beach',
    category: 'food',
    amount_minor: 30000,
    currency: 'INR',
    paid_by: USER_1,
    split_type: 'equal',
    expense_date: '2026-10-03',
    created_by: USER_1,
    created_at: '2026-10-03T18:00:00Z',
    updated_at: '2026-10-03T18:00:00Z',
    version: 1,
    deleted_at: null,
    deleted_by: null,
    client_request_id: null,
  },
  splits: [
    { user_id: USER_1, share_minor: 10000, percent_bp: null },
    { user_id: USER_2, share_minor: 10000, percent_bp: null },
    { user_id: USER_3, share_minor: 10000, percent_bp: null },
  ],
  is_locked: false,
  can_edit: true,
  can_restore: false,
  activity: [
    {
      id: 1,
      action: 'added this expense',
      actor_id: USER_1,
      actor_name: 'Alice',
      details: {},
      created_at: '2026-10-03T18:00:00Z',
    },
  ],
};

const mockMutateDelete = jest.fn();
const mockMutateRestore = jest.fn();
const mockRefetch = jest.fn();
const mockFetchNextPage = jest.fn();

let mockUseExpensesReturn: any = {
  data: { pages: [mockExpenses] },
  isLoading: false,
  isError: false,
  error: null,
  refetch: mockRefetch,
  isRefetching: false,
  fetchNextPage: mockFetchNextPage,
  hasNextPage: false,
  isFetchingNextPage: false,
};

let mockUseExpenseReturn: any = {
  data: mockExpenseDetail,
  isLoading: false,
  isError: false,
  error: null,
  refetch: mockRefetch,
  isRefetching: false,
};

jest.mock('@/hooks', () => ({
  useGroup: () => ({ data: mockGroup, isLoading: false }),
  useGroupMembers: () => ({ data: mockMembers, isLoading: false }),
  useExpenses: () => mockUseExpensesReturn,
  useExpense: () => mockUseExpenseReturn,
  useDeleteExpense: () => ({
    mutateAsync: mockMutateDelete.mockResolvedValue(undefined),
    isPending: false,
  }),
  useRestoreExpense: () => ({
    mutateAsync: mockMutateRestore.mockResolvedValue(undefined),
    isPending: false,
  }),
  useAuth: () => ({
    user: mockUser,
    status: 'authenticated',
  }),
  useNetworkStatus: () => ({
    isOffline: false,
    isConnected: true,
  }),
  useProfile: () => ({
    data: null,
    isLoading: false,
  }),
}));

const mockShowSnackbar = jest.fn();
jest.mock('@/components', () => {
  const actual = jest.requireActual('@/components');
  return {
    ...actual,
    useSnackbar: () => ({
      showSnackbar: mockShowSnackbar,
      hideSnackbar: jest.fn(),
    }),
  };
});

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  },
  useLocalSearchParams: () => ({ id: GROUP_ID, expenseId: EXP_1 }),
  useFocusEffect: (cb: () => void) => cb(),
}));

import { formatExpenseEffect } from '@/lib/expenses/formatEffect';
import { groupExpensesByDate } from '@/lib/expenses/date';
import { ExpenseRow } from '@/components/expenses/ExpenseRow';
import { ExpenseList } from '@/components/expenses/ExpenseList';
import ExpenseDetailScreen from '@/app/group/[id]/expense/[expenseId]/index';
import { ExpenseDetailResponse, ExpenseListItem } from '@/lib/api/expenses';
import { appLightTheme } from '@/lib/theme';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 360, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <QueryClientProvider client={qc}>
        <PaperProvider theme={appLightTheme}>
          {ui}
        </PaperProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

describe('Sub-phase 4.7 Expenses List & Detail (EL1 to EL12, ED1 to ED10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseExpensesReturn = {
      data: { pages: [mockExpenses] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isRefetching: false,
      fetchNextPage: mockFetchNextPage,
      hasNextPage: false,
      isFetchingNextPage: false,
    };
    mockUseExpenseReturn = {
      data: mockExpenseDetail,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isRefetching: false,
    };
  });

  describe('formatExpenseEffect (EL2 plain-words effect logic)', () => {
    it('returns "you lent ₹X" when user paid and net is positive', () => {
      const res = formatExpenseEffect(
        { paid_by: USER_1, amount_minor: 30000, my_net_minor: 20000, my_share_minor: 10000 },
        USER_1
      );
      expect(res.text).toBe('you lent ₹200.00');
      expect(res.type).toBe('lent');
    });

    it('returns "you paid ₹X" when user paid solo (no other participants)', () => {
      const res = formatExpenseEffect(
        { paid_by: USER_1, amount_minor: 15000, my_net_minor: 0, my_share_minor: 15000 },
        USER_1
      );
      expect(res.text).toBe('you paid ₹150.00');
      expect(res.type).toBe('paid');
    });

    it('returns "you owe ₹X" when someone else paid and user has share', () => {
      const res = formatExpenseEffect(
        { paid_by: USER_2, amount_minor: 60000, my_net_minor: -20000, my_share_minor: 20000 },
        USER_1
      );
      expect(res.text).toBe('you owe ₹200.00');
      expect(res.type).toBe('owe');
    });

    it('returns "not involved" when someone else paid and user is not in split', () => {
      const res = formatExpenseEffect(
        { paid_by: USER_2, amount_minor: 60000, my_net_minor: 0, my_share_minor: 0 },
        USER_1
      );
      expect(res.text).toBe('not involved');
      expect(res.type).toBe('not_involved');
    });
  });

  describe('groupExpensesByDate (EL1, EL11 date sectioning)', () => {
    it('groups expenses by calendar date', () => {
      const sections = groupExpensesByDate(mockExpenses);
      expect(sections).toHaveLength(2);
      expect(sections[0].date).toBe('2026-10-03');
      expect(sections[0].data).toHaveLength(1);
      expect(sections[1].date).toBe('2026-10-02');
      expect(sections[1].data).toHaveLength(1);
    });
  });

  describe('ExpenseRow component (EL2, EL3, EL4, EL5, EL12)', () => {
    it('renders row with emoji, title, payer, amount and effect', async () => {
      const onPress = jest.fn();
      const { getByText } = await renderWithProviders(
        <ExpenseRow
          expense={mockExpenses[0]}
          currentUserId={USER_1}
          payerName="Alice"
          onPress={onPress}
        />
      );

      expect(getByText('🍽️')).toBeTruthy();
      expect(getByText('Dinner at Beach')).toBeTruthy();
      expect(getByText('You paid')).toBeTruthy();
      expect(getByText('₹300.00')).toBeTruthy();
      expect(getByText('you lent ₹200.00')).toBeTruthy();

      fireEvent.press(getByText('Dinner at Beach'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('renders locked badge for locked expense (EL12)', async () => {
      const { getByLabelText, getByText } = await renderWithProviders(
        <ExpenseRow
          expense={mockExpenses[1]}
          currentUserId={USER_1}
          payerName="Bob"
          onPress={jest.fn()}
        />
      );

      expect(getByLabelText('Locked expense')).toBeTruthy();
      expect(getByText('Bob paid')).toBeTruthy();
      expect(getByText('you owe ₹200.00')).toBeTruthy();
    });
  });

  describe('ExpenseList component (EL1, EL10)', () => {
    it('renders empty state when there are no expenses', async () => {
      mockUseExpensesReturn = {
        data: { pages: [[]] },
        isLoading: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
        isRefetching: false,
        fetchNextPage: mockFetchNextPage,
        hasNextPage: false,
        isFetchingNextPage: false,
      };

      const onAdd = jest.fn();
      const { getByText } = await renderWithProviders(
        <ExpenseList
          groupId={GROUP_ID}
          members={mockMembers}
          currentUserId={USER_1}
          onAddExpense={onAdd}
          onExpensePress={jest.fn()}
        />
      );

      expect(getByText('No expenses yet. Add the first one.')).toBeTruthy();
      fireEvent.press(getByText('Add an Expense'));
      expect(onAdd).toHaveBeenCalledTimes(1);
    });

    it('renders list with sections and expenses', async () => {
      const onExpensePress = jest.fn();
      const { getByText } = await renderWithProviders(
        <ExpenseList
          groupId={GROUP_ID}
          members={mockMembers}
          currentUserId={USER_1}
          onAddExpense={jest.fn()}
          onExpensePress={onExpensePress}
        />
      );

      expect(getByText('Dinner at Beach')).toBeTruthy();
      expect(getByText('Taxi Ride')).toBeTruthy();

      fireEvent.press(getByText('Dinner at Beach'));
      expect(onExpensePress).toHaveBeenCalledWith(mockExpenses[0]);
    });
  });

  describe('ExpenseDetailScreen (EL7, EL12, ED1 to ED5, EE3, EE8)', () => {
    it('renders full detail: amount, category, payer, and split breakdown', async () => {
      const { getByText } = await renderWithProviders(<ExpenseDetailScreen />);

      // Title & Category
      expect(getByText('Dinner at Beach')).toBeTruthy();
      expect(getByText('Food')).toBeTruthy();

      // Amount
      expect(getByText('₹300.00')).toBeTruthy();

      // Meta: Paid by You
      expect(getByText('Paid by You')).toBeTruthy();

      // Effect banner
      expect(getByText('you lent ₹200.00')).toBeTruthy();

      // Splits table
      expect(getByText('Split (3 people)')).toBeTruthy();
      expect(getByText('Alice (You)')).toBeTruthy();
      expect(getByText('Bob')).toBeTruthy();
      expect(getByText('Deleted user')).toBeTruthy();

      // Action buttons (canEdit = true, isLocked = false)
      expect(getByText('Edit Expense')).toBeTruthy();
      expect(getByText('Delete Expense')).toBeTruthy();
    });

    it('displays lock banner and hides Edit/Delete buttons when locked (EL12, EE8)', async () => {
      mockUseExpenseReturn = {
        data: {
          ...mockExpenseDetail,
          is_locked: true,
          can_edit: false,
        },
        isLoading: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
        isRefetching: false,
      };

      const { getByText, queryByText } = await renderWithProviders(<ExpenseDetailScreen />);

      expect(
        getByText("This expense includes someone who left the group, so it's locked. It cannot be edited or deleted.")
      ).toBeTruthy();

      // Buttons hidden
      expect(queryByText('Edit Expense')).toBeNull();
      expect(queryByText('Delete Expense')).toBeNull();
    });

    it('deleting an expense shows 8s UNDO snackbar, and pressing UNDO calls restore (ED1, ED4)', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByText } = await renderWithProviders(<ExpenseDetailScreen />);

      // Press Delete button
      fireEvent.press(getByText('Delete Expense'));

      expect(alertSpy).toHaveBeenCalledWith(
        'Delete Expense?',
        expect.stringContaining('Are you sure you want to delete this expense?'),
        expect.any(Array)
      );

      // Confirm Delete from Alert buttons
      const deleteAction = alertSpy.mock.calls[0][2]?.find((b: any) => b.text === 'Delete');
      expect(deleteAction).toBeDefined();

      await deleteAction?.onPress?.();

      expect(mockMutateDelete).toHaveBeenCalledWith({ expenseId: EXP_1, groupId: GROUP_ID });
      expect(router.back).toHaveBeenCalled();

      // Verify 8-second snackbar with UNDO action
      expect(mockShowSnackbar).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Expense deleted',
          duration: 8000,
          action: expect.objectContaining({
            label: 'UNDO',
            onPress: expect.any(Function),
          }),
        })
      );

      // Trigger UNDO action
      const undoAction = mockShowSnackbar.mock.calls[0][0].action;
      await undoAction.onPress();

      expect(mockMutateRestore).toHaveBeenCalledWith({ expenseId: EXP_1, groupId: GROUP_ID });
      expect(mockShowSnackbar).toHaveBeenCalledWith({ message: 'Expense restored' });
    });
  });
});
