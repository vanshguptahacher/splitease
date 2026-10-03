import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
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
const USER_DELETED = '33333333-3333-3333-3333-333333333333';
const GROUP_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EXP_1 = 'eeeeeeee-1111-1111-1111-eeeeeeeeeeee';
const EXP_2 = 'eeeeeeee-2222-2222-2222-eeeeeeeeeeee';

const mockUser = { id: USER_1, email: 'user1@example.com' };

const mockActivityItems: ActivityListItem[] = [
  {
    id: 1,
    group_id: GROUP_ID,
    group_name: 'Goa Trip',
    actor_id: USER_2,
    actor_name: 'Rahul',
    action: 'expense_added',
    ref_id: EXP_1,
    details: {
      description: 'Dinner',
      amount_minor: 120000, // ₹1,200
      category: 'food',
    },
    created_at: '2026-10-03T18:00:00Z',
    next_cursor: { created_at: '2026-10-03T18:00:00Z', id: 1 },
  },
  {
    id: 2,
    group_id: GROUP_ID,
    group_name: 'Goa Trip',
    actor_id: USER_2,
    actor_name: 'Rahul',
    action: 'expense_edited',
    ref_id: EXP_1,
    details: {
      description: 'Dinner',
      amount_minor: 150000, // ₹1,500
      old_amount_minor: 120000, // ₹1,200
    },
    created_at: '2026-10-03T18:30:00Z',
    next_cursor: { created_at: '2026-10-03T18:30:00Z', id: 2 },
  },
  {
    id: 3,
    group_id: GROUP_ID,
    group_name: 'Goa Trip',
    actor_id: USER_1, // Current user action -> "You"
    actor_name: 'Alice',
    action: 'expense_deleted',
    ref_id: EXP_2,
    details: {
      description: 'Taxi',
      amount_minor: 35000, // ₹350
    },
    created_at: '2026-10-03T19:00:00Z',
    next_cursor: { created_at: '2026-10-03T19:00:00Z', id: 3 },
  },
  {
    id: 4,
    group_id: GROUP_ID,
    group_name: 'Goa Trip',
    actor_id: USER_DELETED, // Deleted user
    actor_name: 'Deleted user',
    action: 'expense_restored',
    ref_id: EXP_2,
    details: {
      description: 'Taxi',
      amount_minor: 35000,
    },
    created_at: '2026-10-03T19:05:00Z',
    next_cursor: { created_at: '2026-10-03T19:05:00Z', id: 4 },
  },
];

const mockRefetch = jest.fn();
const mockFetchNextPage = jest.fn();

let mockUseActivityReturn: any = {
  data: { pages: [mockActivityItems] },
  isLoading: false,
  isError: false,
  error: null,
  refetch: mockRefetch,
  isRefetching: false,
  fetchNextPage: mockFetchNextPage,
  hasNextPage: false,
  isFetchingNextPage: false,
};

jest.mock('@/hooks', () => ({
  useActivity: () => mockUseActivityReturn,
  useAuth: () => ({
    user: mockUser,
    status: 'authenticated',
  }),
  useNetworkStatus: () => ({
    isOffline: false,
    isConnected: true,
  }),
}));

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  },
  useFocusEffect: (cb: () => void) => cb(),
}));

import {
  formatActivitySentence,
  formatMoneyCompact,
  formatTimeAgo,
} from '@/lib/activity/formatActivity';
import { ActivityListItem } from '@/lib/api/expenses';
import { ActivityRow } from '@/components/activity/ActivityRow';
import { ActivityList } from '@/components/activity/ActivityList';
import ActivityTabScreen from '@/app/(tabs)/activity';
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
        <PaperProvider theme={appLightTheme}>{ui}</PaperProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

describe('Sub-phase 4.8 Activity feed & Group ordering (EV1 to EV9, EG1, EG2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseActivityReturn = {
      data: { pages: [mockActivityItems] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isRefetching: false,
      fetchNextPage: mockFetchNextPage,
      hasNextPage: false,
      isFetchingNextPage: false,
    };
  });

  describe('formatMoneyCompact', () => {
    it('trims .00 paise when zero, preserving integer representation', () => {
      expect(formatMoneyCompact(120000)).toBe('₹1,200');
      expect(formatMoneyCompact(35000)).toBe('₹350');
      expect(formatMoneyCompact(100)).toBe('₹1');
    });

    it('keeps fractional paise when non-zero', () => {
      expect(formatMoneyCompact(120050)).toBe('₹1,200.50');
      expect(formatMoneyCompact(35075)).toBe('₹350.75');
    });
  });

  describe('formatTimeAgo', () => {
    const fixedNow = new Date('2026-10-03T20:00:00Z');

    it('formats seconds to Just now', () => {
      expect(formatTimeAgo('2026-10-03T19:59:30Z', fixedNow)).toBe('Just now');
    });

    it('formats minutes ago', () => {
      expect(formatTimeAgo('2026-10-03T19:45:00Z', fixedNow)).toBe('15m ago');
    });

    it('formats hours ago (EV2)', () => {
      expect(formatTimeAgo('2026-10-03T18:00:00Z', fixedNow)).toBe('2h ago');
    });

    it('formats yesterday and days ago', () => {
      expect(formatTimeAgo('2026-10-02T15:00:00Z', fixedNow)).toBe('Yesterday');
      expect(formatTimeAgo('2026-09-30T10:00:00Z', fixedNow)).toBe('3d ago');
    });
  });

  describe('formatActivitySentence (EV2, EV3, EV4, EV5)', () => {
    const fixedNow = new Date('2026-10-03T20:00:00Z');

    it('formats expense added sentence with group and relative time (EV2)', () => {
      const res = formatActivitySentence(mockActivityItems[0], USER_1, fixedNow);
      expect(res.sentence).toBe("Rahul added 'Dinner' ₹1,200 · Goa Trip · 2h ago");
      expect(res.actor).toBe('Rahul');
      expect(res.actionType).toBe('added');
      expect(res.iconColorType).toBe('success');
    });

    it('formats expense edited sentence showing amount change (EV3)', () => {
      const res = formatActivitySentence(mockActivityItems[1], USER_1, fixedNow);
      expect(res.sentence).toBe("Rahul changed 'Dinner' ₹1,200 → ₹1,500 · Goa Trip · 1h ago");
      expect(res.actionType).toBe('edited');
      expect(res.iconColorType).toBe('primary');
    });

    it('formats user own action as "You" (EV4)', () => {
      const res = formatActivitySentence(mockActivityItems[2], USER_1, fixedNow);
      expect(res.sentence).toBe("You deleted 'Taxi' ₹350 · Goa Trip · 1h ago");
      expect(res.actor).toBe('You');
      expect(res.actionType).toBe('deleted');
      expect(res.iconColorType).toBe('danger');
    });

    it('formats deleted user as "Deleted user" (EV5)', () => {
      const res = formatActivitySentence(mockActivityItems[3], USER_1, fixedNow);
      expect(res.sentence).toBe("Deleted user restored 'Taxi' ₹350 · Goa Trip · 55m ago");
      expect(res.actor).toBe('Deleted user');
      expect(res.actionType).toBe('restored');
      expect(res.iconColorType).toBe('success');
    });
  });

  describe('ActivityRow component', () => {
    it('renders row with formatted text and handles tap', async () => {
      const onPress = jest.fn();
      const { getByText } = await renderWithProviders(
        <ActivityRow
          item={mockActivityItems[0]}
          currentUserId={USER_1}
          onPress={onPress}
        />
      );

      expect(getByText('Rahul ')).toBeTruthy();
      expect(getByText("'Dinner'")).toBeTruthy();
      expect(getByText(' ₹1,200')).toBeTruthy();
      expect(getByText('Goa Trip')).toBeTruthy();

      fireEvent.press(getByText('Rahul '));
      expect(onPress).toHaveBeenCalledWith(mockActivityItems[0]);
    });
  });

  describe('ActivityList component (EV7, EV8)', () => {
    it('renders empty state when there are no activity entries (EV7)', async () => {
      mockUseActivityReturn = {
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

      const { getByText } = await renderWithProviders(<ActivityList />);
      expect(getByText('No activity yet')).toBeTruthy();
      expect(
        getByText('When expenses are added, edited, or deleted in your groups, they will show up here.')
      ).toBeTruthy();
    });

    it('renders activity feed and taps an entry navigating to expense (EV8)', async () => {
      const { getAllByText, getByText } = await renderWithProviders(<ActivityList />);

      expect(getAllByText('Rahul ').length).toBe(2);
      expect(getByText('You ')).toBeTruthy();

      // Tap an entry with ref_id
      fireEvent.press(getAllByText('Rahul ')[0]);
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/group/[id]/expense/[expenseId]',
        params: { id: GROUP_ID, expenseId: EXP_1 },
      });
    });

    it('taps an entry without ref_id navigating to group (EV8 fallback)', async () => {
      const itemWithoutRef: ActivityListItem = {
        ...mockActivityItems[0],
        id: 99,
        ref_id: null,
      };

      mockUseActivityReturn = {
        data: { pages: [[itemWithoutRef]] },
        isLoading: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
        isRefetching: false,
        fetchNextPage: mockFetchNextPage,
        hasNextPage: false,
        isFetchingNextPage: false,
      };

      const { getByText } = await renderWithProviders(<ActivityList />);
      fireEvent.press(getByText('Rahul '));
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/group/[id]',
        params: { id: GROUP_ID },
      });
    });

    it('renders error state when fetch fails', async () => {
      mockUseActivityReturn = {
        data: null,
        isLoading: false,
        isError: true,
        error: new Error('network_error'),
        refetch: mockRefetch,
        isRefetching: false,
        fetchNextPage: mockFetchNextPage,
        hasNextPage: false,
        isFetchingNextPage: false,
      };

      const { getByText } = await renderWithProviders(<ActivityList />);
      expect(getByText('Could not load activity')).toBeTruthy();
      expect(getByText('Try Again')).toBeTruthy();

      fireEvent.press(getByText('Try Again'));
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe('ActivityTabScreen', () => {
    it('renders header and activity list', async () => {
      const { getAllByText, getByText } = await renderWithProviders(<ActivityTabScreen />);
      expect(getByText('Activity')).toBeTruthy();
      expect(getByText('Recent transactions & updates')).toBeTruthy();
      expect(getAllByText('Rahul ').length).toBe(2);
    });
  });
});
