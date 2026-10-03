import {
  InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ActivityCursor,
  ActivityListItem,
  AddExpenseParams,
  EditExpenseParams,
  ExpenseCursor,
  ExpenseDetailResponse,
  ExpenseListItem,
  addExpense,
  deleteExpense,
  editExpense,
  getExpense,
  listActivity,
  listExpenses,
  restoreExpense,
} from '@/lib/api/expenses';
import { queryKeys } from '@/lib/queryKeys';

/**
 * 1. useExpenses
 * Keyset-paginated list of expenses for a specific group.
 */
export function useExpenses(groupId: string | undefined, limit = 30) {
  return useInfiniteQuery<
    ExpenseListItem[],
    Error,
    InfiniteData<ExpenseListItem[], ExpenseCursor | null>,
    readonly unknown[],
    ExpenseCursor | null
  >({
    queryKey: queryKeys.groups.expenses(groupId ?? ''),
    queryFn: ({ pageParam }) => listExpenses(groupId!, limit, pageParam),
    initialPageParam: null,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length < limit) return undefined;
      const lastItem = lastPage[lastPage.length - 1];
      return lastItem?.next_cursor ?? undefined;
    },
    enabled: Boolean(groupId),
  });
}

/**
 * 2. useExpense
 * Complete details, splits, lock state, and recent activity for a single expense.
 */
export function useExpense(expenseId: string | undefined) {
  return useQuery<ExpenseDetailResponse, Error>({
    queryKey: queryKeys.expenses.detail(expenseId ?? ''),
    queryFn: () => getExpense(expenseId!),
    enabled: Boolean(expenseId),
  });
}

/**
 * 3. useAddExpense
 * Mutation to add a new expense.
 * Automatically invalidates group expenses, activity, and groups summary list.
 */
export function useAddExpense(defaultGroupId?: string) {
  const queryClient = useQueryClient();

  return useMutation<string, Error, AddExpenseParams>({
    mutationFn: (params) => addExpense(params),
    onSuccess: (_, variables) => {
      const gId = defaultGroupId || variables.groupId;
      if (gId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.expenses(gId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.balances(gId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.settlements(gId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.activity.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.balanceSummary });
    },
  });
}

/**
 * 4. useEditExpense
 * Mutation to edit an existing expense with optimistic version check.
 */
export function useEditExpense(defaultGroupId?: string) {
  const queryClient = useQueryClient();

  return useMutation<number, Error, EditExpenseParams & { groupId?: string }>({
    mutationFn: (params) => editExpense(params),
    onSuccess: (_, variables) => {
      const gId = defaultGroupId || variables.groupId;
      if (gId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.expenses(gId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.balances(gId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.settlements(gId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.detail(variables.expenseId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.activity.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.balanceSummary });
    },
  });
}

/**
 * 5. useDeleteExpense
 * Mutation to soft-delete an expense.
 */
export function useDeleteExpense(defaultGroupId?: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { expenseId: string; groupId?: string } | string>({
    mutationFn: (arg) => {
      const expenseId = typeof arg === 'string' ? arg : arg.expenseId;
      return deleteExpense(expenseId);
    },
    onSuccess: (_, arg) => {
      const expenseId = typeof arg === 'string' ? arg : arg.expenseId;
      const gId = defaultGroupId || (typeof arg === 'object' ? arg.groupId : undefined);
      if (gId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.expenses(gId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.balances(gId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.settlements(gId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.detail(expenseId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.activity.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.balanceSummary });
    },
  });
}

/**
 * 6. useRestoreExpense
 * Mutation to restore a soft-deleted expense (Undo).
 */
export function useRestoreExpense(defaultGroupId?: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { expenseId: string; groupId?: string } | string>({
    mutationFn: (arg) => {
      const expenseId = typeof arg === 'string' ? arg : arg.expenseId;
      return restoreExpense(expenseId);
    },
    onSuccess: (_, arg) => {
      const expenseId = typeof arg === 'string' ? arg : arg.expenseId;
      const gId = defaultGroupId || (typeof arg === 'object' ? arg.groupId : undefined);
      if (gId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.expenses(gId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.balances(gId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.settlements(gId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.detail(expenseId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.activity.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.balanceSummary });
    },
  });
}

/**
 * 7. useActivity
 * Keyset-paginated feed of recent activity entries across all user's active groups.
 */
export function useActivity(limit = 30) {
  return useInfiniteQuery<ActivityListItem[], Error, InfiniteData<ActivityListItem[], ActivityCursor | null>, readonly unknown[], ActivityCursor | null>({
    queryKey: queryKeys.activity.all,
    queryFn: ({ pageParam }) => listActivity(limit, pageParam),
    initialPageParam: null,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length < limit) return undefined;
      const lastItem = lastPage[lastPage.length - 1];
      return lastItem?.next_cursor ?? undefined;
    },
  });
}
