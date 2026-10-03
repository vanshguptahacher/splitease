import { supabase } from '@/lib/supabase/client';
import {
  BalanceSummaryResult,
  GroupBalancesResult,
  Json,
  SettlementListItem,
  SettlementMethod,
} from '@/types/database';

export interface CreateSettlementParams {
  groupId: string;
  clientRequestId?: string | null;
  fromUser: string;
  toUser: string;
  amountMinor: number;
  method: SettlementMethod;
  note?: string | null;
}

export interface SettlementCursor {
  created_at: string;
  id: string;
}

/**
 * 1. getGroupBalances
 * Single RPC snapshot returning all member nets, simplified debt suggestions,
 * caller's net minor, and pending payments count (Cases BU1-BU3, BC14).
 * No direct table access.
 */
export async function getGroupBalances(groupId: string): Promise<GroupBalancesResult> {
  const { data, error } = await supabase.rpc('get_group_balances', {
    p_group: groupId,
  });

  if (error) throw error;
  return data as unknown as GroupBalancesResult;
}

/**
 * 2. getMyBalanceSummary
 * Server-computed summary across all active groups for the caller (Cases HO1, HO7).
 * No direct table access.
 */
export async function getMyBalanceSummary(): Promise<BalanceSummaryResult> {
  const { data, error } = await supabase.rpc('get_my_balance_summary', {});

  if (error) throw error;
  return data as unknown as BalanceSummaryResult;
}

/**
 * 3. listSettlements
 * Paginated list of settlements in a group with action flags (Cases SH1-SH8).
 * Keyset pagination on (created_at, id). No direct table access.
 */
export async function listSettlements(
  groupId: string,
  limit = 30,
  cursor?: SettlementCursor | null
): Promise<SettlementListItem[]> {
  const { data, error } = await supabase.rpc('list_settlements', {
    p_group: groupId,
    p_limit: limit,
    p_cursor: (cursor as unknown as Json) ?? null,
  });

  if (error) throw error;
  return (data || []) as SettlementListItem[];
}

/**
 * 4. createSettlement
 * Creates a settlement. If receiver creates it, confirms instantly.
 * If payer creates it, status is pending (Cases SC1-SC17).
 * No direct table access.
 */
export async function createSettlement(params: CreateSettlementParams): Promise<string> {
  const { data, error } = await supabase.rpc('create_settlement', {
    p_group: params.groupId,
    p_client_request_id: params.clientRequestId ?? null,
    p_from_user: params.fromUser,
    p_to_user: params.toUser,
    p_amount_minor: params.amountMinor,
    p_method: params.method,
    p_note: params.note ?? null,
  });

  if (error) throw error;
  return data as string;
}

/**
 * 5. confirmSettlement
 * Receiver confirms a pending or disputed payment (Cases ST1, ST3).
 * No direct table access.
 */
export async function confirmSettlement(settlementId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_settlement', {
    p_settlement: settlementId,
  });

  if (error) throw error;
}

/**
 * 6. disputeSettlement
 * Receiver marks payment as "I didn't receive this" (Case ST2).
 * No direct table access.
 */
export async function disputeSettlement(settlementId: string): Promise<void> {
  const { error } = await supabase.rpc('dispute_settlement', {
    p_settlement: settlementId,
  });

  if (error) throw error;
}

/**
 * 7. cancelSettlement
 * Payer cancels pending/disputed payment, or receiver undoes confirmed within 10m (Cases ST4, ST5, ST6).
 * No direct table access.
 */
export async function cancelSettlement(settlementId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_settlement', {
    p_settlement: settlementId,
  });

  if (error) throw error;
}
