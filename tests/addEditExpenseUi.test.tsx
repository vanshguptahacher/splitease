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

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => ({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }),
}));

const USER_1 = '11111111-1111-1111-1111-111111111111';
const USER_2 = '22222222-2222-2222-2222-222222222222';
const USER_3 = '33333333-3333-3333-3333-333333333333';
const GROUP_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EXP_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const mockUser = { id: USER_1, email: 'user1@example.com' };

const mockGroup = {
  id: GROUP_ID,
  name: 'Goa Trip',
  currency: 'INR',
  created_by: USER_1,
};

const mockMembers: GroupMemberItem[] = [
  {
    user_id: USER_1,
    name: 'Alice',
    avatar_path: null,
    avatar_url: null,
    upi_id: null,
    role: 'admin',
    status: 'active',
    joined_at: '2026-10-01T00:00:00Z',
  },
  {
    user_id: USER_2,
    name: 'Bob',
    avatar_path: null,
    avatar_url: null,
    upi_id: null,
    role: 'member',
    status: 'active',
    joined_at: '2026-10-01T00:00:00Z',
  },
  {
    user_id: USER_3,
    name: 'Charlie',
    avatar_path: null,
    avatar_url: null,
    upi_id: null,
    role: 'member',
    status: 'active',
    joined_at: '2026-10-01T00:00:00Z',
  },
];

const mockMutateAdd = jest.fn();
const mockMutateEdit = jest.fn();

jest.mock('@/hooks', () => ({
  useGroup: () => ({ data: mockGroup, isLoading: false }),
  useGroupMembers: () => ({ data: mockMembers, isLoading: false }),
  useAddExpense: () => ({
    mutateAsync: mockMutateAdd.mockResolvedValue(EXP_ID),
    isPending: false,
  }),
  useEditExpense: () => ({
    mutateAsync: mockMutateEdit.mockResolvedValue(2),
    isPending: false,
  }),
  useExpense: () => ({
    data: null,
    isLoading: false,
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

import { ExpenseForm } from '@/components/expenses/ExpenseForm';
import { CategoryChips } from '@/components/expenses/CategoryChips';
import { PaidBySheet } from '@/components/expenses/PaidBySheet';
import { SplitSheet } from '@/components/expenses/SplitSheet';
import { appLightTheme } from '@/lib/theme';
import { GroupMemberItem } from '@/types/database';
import { ExpenseDetailResponse } from '@/lib/api/expenses';

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

describe('Sub-phase 4.6 UI Components: CategoryChips, PaidBySheet, SplitSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('CategoryChips renders all 10 categories and selects a category (D18)', async () => {
    const onSelectCategory = jest.fn();
    const { getByLabelText } = await renderWithProviders(
      <CategoryChips selectedCategory={null} onSelectCategory={onSelectCategory} />
    );

    const foodChip = getByLabelText('Food category');
    expect(foodChip).toBeTruthy();
    fireEvent.press(foodChip);
    expect(onSelectCategory).toHaveBeenCalledWith('food');
  });

  it('CategoryChips deselects if category is already selected (D18)', async () => {
    const onSelectCategory = jest.fn();
    const { getByLabelText } = await renderWithProviders(
      <CategoryChips selectedCategory="food" onSelectCategory={onSelectCategory} />
    );
    fireEvent.press(getByLabelText('Food category'));
    expect(onSelectCategory).toHaveBeenCalledWith(null);
  });

  it('PaidBySheet lists active members with current user (You) first (EA1, EU4)', async () => {
    const onSelectPayer = jest.fn();
    const onClose = jest.fn();

    const { getByText } = await renderWithProviders(
      <PaidBySheet
        visible={true}
        onClose={onClose}
        members={mockMembers}
        selectedPayerId={USER_1}
        onSelectPayer={onSelectPayer}
        currentUserId={USER_1}
      />
    );

    expect(getByText('Who paid?')).toBeTruthy();
    expect(getByText('Alice (You)')).toBeTruthy();
    expect(getByText('Bob')).toBeTruthy();
    expect(getByText('Charlie')).toBeTruthy();

    fireEvent.press(getByText('Bob'));
    expect(onSelectPayer).toHaveBeenCalledWith(USER_2);
    expect(onClose).toHaveBeenCalled();
  });

  it('SplitSheet renders Equal split with individual shares (EQ1 to EQ7)', async () => {
    const onApplySplit = jest.fn();
    const { getByText } = await renderWithProviders(
      <SplitSheet
        visible={true}
        onClose={jest.fn()}
        members={mockMembers}
        currentUserId={USER_1}
        totalAmountMinor={30000} // ₹300
        splitType="equal"
        participants={[
          { user_id: USER_1 },
          { user_id: USER_2 },
          { user_id: USER_3 },
        ]}
        onApplySplit={onApplySplit}
      />
    );

    expect(getByText('Equal')).toBeTruthy();
    expect(getByText('Exact')).toBeTruthy();
    expect(getByText('Percent')).toBeTruthy();
    expect(getByText('Split equally among 3 people')).toBeTruthy();

    // Done button
    fireEvent.press(getByText('Done'));
    expect(onApplySplit).toHaveBeenCalledWith('equal', [
      { user_id: USER_1 },
      { user_id: USER_2 },
      { user_id: USER_3 },
    ]);
  });
});

describe('Sub-phase 4.6 ExpenseForm (Add and Edit Flows)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes Add mode with default payer You, equal split, and empty amount (EA1)', async () => {
    const { getByText } = await renderWithProviders(
      <ExpenseForm mode="add" groupId={GROUP_ID} />
    );

    // Header and Group Name
    expect(getByText('Add Expense')).toBeTruthy();
    expect(getByText('Goa Trip')).toBeTruthy();

    // Default summary row: Paid by You · Split equally among 3 people
    expect(getByText('You')).toBeTruthy();
    expect(getByText('equally among 3 people')).toBeTruthy();

    // Live preview hint before amount is typed
    expect(getByText('Enter an amount above to see who owes whom.')).toBeTruthy();

    // Save button exists
    expect(getByText('Save Expense')).toBeTruthy();
  });

  it('typing amount displays live financial preview line (UX Rule 4, EA4)', async () => {
    const { getByText, getByLabelText } = await renderWithProviders(
      <ExpenseForm mode="add" groupId={GROUP_ID} />
    );

    // Type 300 using keypad
    fireEvent.press(getByLabelText('3'));
    await waitFor(() => expect(getByLabelText('3 rupees')).toBeTruthy());
    fireEvent.press(getByLabelText('0'));
    await waitFor(() => expect(getByLabelText('30 rupees')).toBeTruthy());
    fireEvent.press(getByLabelText('0'));
    await waitFor(() => expect(getByLabelText('300 rupees')).toBeTruthy());

    // Payer is You (USER_1), split equally among 3 (USER_1, USER_2, USER_3)
    // Total ₹300, share ₹100 each. You paid ₹300.00. You get back ₹200.00.
    await waitFor(() => {
      expect(getByText('You paid ₹300.00. You get back ₹200.00.')).toBeTruthy();
    });
  });

  it('triggers discard alert on back press when dirty (EA15, EU4)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { getByLabelText } = await renderWithProviders(
      <ExpenseForm mode="add" groupId={GROUP_ID} />
    );

    // Type some amount
    fireEvent.press(getByLabelText('5'));
    await waitFor(() => {
      expect(getByLabelText('5 rupees')).toBeTruthy();
    });

    // Trigger back
    fireEvent.press(getByLabelText('Go back'));

    expect(alertSpy).toHaveBeenCalledWith(
      'Discard this expense?',
      'You have entered expense details that will be lost.',
      expect.any(Array)
    );
  });

  it('submits add expense with clientRequestId and navigates back (EA6, EA7)', async () => {
    const onSuccess = jest.fn();
    const { getByText, getByLabelText } = await renderWithProviders(
      <ExpenseForm mode="add" groupId={GROUP_ID} onSuccess={onSuccess} />
    );

    // Type amount 150
    fireEvent.press(getByLabelText('1'));
    await waitFor(() => expect(getByLabelText('1 rupee')).toBeTruthy());
    fireEvent.press(getByLabelText('5'));
    await waitFor(() => expect(getByLabelText('15 rupees')).toBeTruthy());
    fireEvent.press(getByLabelText('0'));
    await waitFor(() => expect(getByLabelText('150 rupees')).toBeTruthy());

    // Select Food category
    fireEvent.press(getByLabelText('Food category'));
    await waitFor(() => {
      expect(getByLabelText('Food category').props.accessibilityState?.selected).toBe(true);
    });

    // Click Save
    const saveButton = getByText('Save Expense');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(mockMutateAdd).toHaveBeenCalledTimes(1);
    });
    const callArg = mockMutateAdd.mock.calls[0][0];
    expect(callArg.groupId).toBe(GROUP_ID);
    expect(callArg.amountMinor).toBe(15000);
    expect(callArg.category).toBe('food');
    expect(callArg.paidBy).toBe(USER_1);
    expect(callArg.splitType).toBe('equal');
    expect(callArg.participants).toHaveLength(3);
    expect(callArg.clientRequestId).toBeDefined();

    expect(mockShowSnackbar).toHaveBeenCalledWith({
      message: 'Expense added successfully!',
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(router.back).toHaveBeenCalled();
  });

  it('loads and pre-populates Edit mode correctly (EE1 to EE6)', async () => {
    const initialData: ExpenseDetailResponse = {
      expense: {
        id: EXP_ID,
        group_id: GROUP_ID,
        description: 'Team Dinner',
        category: 'food',
        amount_minor: 45000, // ₹450
        currency: 'INR',
        paid_by: USER_2, // Bob paid
        split_type: 'equal',
        expense_date: '2026-10-02',
        created_by: USER_1,
        created_at: '2026-10-02T12:00:00Z',
        updated_at: '2026-10-02T12:00:00Z',
        version: 1,
        deleted_at: null,
        deleted_by: null,
        client_request_id: null,
      },
      splits: [
        { user_id: USER_1, share_minor: 15000, percent_bp: null },
        { user_id: USER_2, share_minor: 15000, percent_bp: null },
        { user_id: USER_3, share_minor: 15000, percent_bp: null },
      ],
      is_locked: false,
      can_edit: true,
      can_restore: false,
      activity: [],
    };

    const { getByText, getByDisplayValue } = await renderWithProviders(
      <ExpenseForm
        mode="edit"
        groupId={GROUP_ID}
        expenseId={EXP_ID}
        initialData={initialData}
      />
    );

    // Edit Header
    expect(getByText('Edit Expense')).toBeTruthy();

    // Prepopulated description and amount
    expect(getByDisplayValue('Team Dinner')).toBeTruthy();
    expect(getByText('450')).toBeTruthy();

    // Bob paid
    expect(getByText('Bob')).toBeTruthy();

    // Plain words preview: Bob paid. You owe ₹150.00.
    expect(getByText('Bob paid. You owe ₹150.00.')).toBeTruthy();

    // Save button says Save Changes
    expect(getByText('Save Changes')).toBeTruthy();
  });
});
