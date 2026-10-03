import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelSettlement,
  confirmSettlement,
  createSettlement,
  CreateSettlementParams,
  disputeSettlement,
  getGroupBalances,
  getMyBalanceSummary,
  listSettlements,
  SettlementCursor,
} from '@/lib/api/settlements';
import { queryKeys } from '@/lib/queryKeys';
import {
  BalanceSummaryResult,
  GroupBalancesResult,
  SettlementListItem,
} from '@/types/database';

/**
 * Invalidates all finance-related query keys after a settlement or expense write:
 * ['group', id, 'balances'], ['group', id, 'settlements'], ['group', id, 'expenses'],
 * ['groups'], ['activity'], ['balanceSummary'] (Rule 5.5 Task 2).
 */
export function invalidateGroupFinances(queryClient: QueryClient, groupId?: string) {
  if (groupId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.groups.balances(groupId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.groups.settlements(groupId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.groups.expenses(groupId) });
  }
  queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.activity.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.balanceSummary });
}

/**
 * 1. useGroupBalances
 * Fetches single-snapshot group balances: member nets, suggestions, caller net, pending count.
 */
export function useGroupBalances(groupId: string | undefined) {
  return useQuery<GroupBalancesResult, Error>({
    queryKey: queryKeys.groups.balances(groupId ?? ''),
    queryFn: () => getGroupBalances(groupId!),
    enabled: Boolean(groupId),
  });
}

/**
 * 2. useMyBalanceSummary
 * Fetches server-computed home summary across all active groups.
 */
export function useMyBalanceSummary() {
  return useQuery<BalanceSummaryResult, Error>({
    queryKey: queryKeys.balanceSummary,
    queryFn: getMyBalanceSummary,
  });
}

/**
 * 3. useSettlements
 * Fetches settlement history for a group with caller action flags.
 */
export function useSettlements(
  groupId: string | undefined,
  limit = 30,
  cursor?: SettlementCursor | null
) {
  return useQuery<SettlementListItem[], Error>({
    queryKey: [...queryKeys.groups.settlements(groupId ?? ''), limit, cursor],
    queryFn: () => listSettlements(groupId!, limit, cursor),
    enabled: Boolean(groupId),
  });
}

/**
 * 4. useCreateSettlement
 * Creates a settlement; invalidates balances, settlements, summary, activity, groups.
 */
export function useCreateSettlement(defaultGroupId?: string) {
  const queryClient = useQueryClient();

  return useMutation<string, Error, CreateSettlementParams>({
    mutationFn: (params) => createSettlement(params),
    onSuccess: (_, variables) => {
      const gId = defaultGroupId || variables.groupId;
      invalidateGroupFinances(queryClient, gId);
    },
  });
}

/**
 * 5. useConfirmSettlement
 * Confirms a pending or disputed payment.
 */
export function useConfirmSettlement(groupId?: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { settlementId: string; groupId?: string } | string>({
    mutationFn: (arg) => {
      const settlementId = typeof arg === 'string' ? arg : arg.settlementId;
      return confirmSettlement(settlementId);
    },
    onSuccess: (_, arg) => {
      const gId = groupId || (typeof arg === 'object' ? arg.groupId : undefined);
      invalidateGroupFinances(queryClient, gId);
    },
  });
}

/**
 * 6. useDisputeSettlement
 * Marks payment as "I didn't receive this".
 */
export function useDisputeSettlement(groupId?: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { settlementId: string; groupId?: string } | string>({
    mutationFn: (arg) => {
      const settlementId = typeof arg === 'string' ? arg : arg.settlementId;
      return disputeSettlement(settlementId);
    },
    onSuccess: (_, arg) => {
      const gId = groupId || (typeof arg === 'object' ? arg.groupId : undefined);
      invalidateGroupFinances(queryClient, gId);
    },
  });
}

/**
 * 7. useCancelSettlement
 * Cancels pending/disputed payment, or undoes confirmed within 10 minutes.
 */
export function useCancelSettlement(groupId?: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { settlementId: string; groupId?: string } | string>({
    mutationFn: (arg) => {
      const settlementId = typeof arg === 'string' ? arg : arg.settlementId;
      return cancelSettlement(settlementId);
    },
    onSuccess: (_, arg) => {
      const gId = groupId || (typeof arg === 'object' ? arg.groupId : undefined);
      invalidateGroupFinances(queryClient, gId);
    },
  });
}
