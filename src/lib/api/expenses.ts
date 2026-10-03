import { supabase } from '@/lib/supabase/client';
import { Database, Json } from '@/types/database';

export type ExpenseRow = Database['public']['Tables']['expenses']['Row'];
export type SplitRow = Database['public']['Tables']['expense_splits']['Row'];

export interface SplitParticipantInput {
  user_id: string;
  value?: number;
}

export interface AddExpenseParams {
  groupId: string;
  clientRequestId?: string | null;
  description?: string | null;
  amountMinor: number;
  paidBy: string;
  splitType: 'equal' | 'exact' | 'percent';
  participants: SplitParticipantInput[];
  category?: string | null;
  expenseDate: string; // 'YYYY-MM-DD'
}

export interface EditExpenseParams {
  expenseId: string;
  expectedVersion: number;
  description?: string | null;
  amountMinor: number;
  paidBy: string;
  splitType: 'equal' | 'exact' | 'percent';
  participants: SplitParticipantInput[];
  category?: string | null;
  expenseDate: string;
}

export interface ExpenseCursor {
  expense_date: string;
  created_at: string;
  id: string;
}

export interface ExpenseListItem {
  id: string;
  description: string | null;
  category: string | null;
  amount_minor: number;
  paid_by: string;
  expense_date: string;
  created_by: string;
  created_at: string;
  version: number;
  participant_count: number;
  my_share_minor: number;
  my_net_minor: number;
  is_locked: boolean;
  can_edit: boolean;
  next_cursor: ExpenseCursor;
}

export interface ExpenseSplitItem {
  user_id: string;
  share_minor: number;
  percent_bp: number | null;
}

export interface ExpenseActivityItem {
  id: number;
  action: string;
  actor_id: string;
  actor_name: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface ExpenseDetailResponse {
  expense: ExpenseRow;
  splits: ExpenseSplitItem[];
  is_locked: boolean;
  can_edit: boolean;
  can_restore: boolean;
  activity: ExpenseActivityItem[];
}

export interface ActivityCursor {
  created_at: string;
  id: number;
}

export interface ActivityListItem {
  id: number;
  group_id: string;
  group_name: string;
  actor_id: string;
  actor_name: string;
  action: string;
  ref_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  next_cursor: ActivityCursor;
}

/**
 * 1. addExpense
 */
export async function addExpense(params: AddExpenseParams): Promise<string> {
  const { data, error } = await supabase.rpc('add_expense', {
    p_group: params.groupId,
    p_client_request_id: params.clientRequestId ?? null,
    p_description: params.description ?? null,
    p_amount_minor: params.amountMinor,
    p_paid_by: params.paidBy,
    p_split_type: params.splitType,
    p_participants: params.participants as unknown as Json,
    p_category: params.category ?? null,
    p_expense_date: params.expenseDate,
  });

  if (error) throw error;
  return data as string;
}

/**
 * 2. editExpense
 */
export async function editExpense(params: EditExpenseParams): Promise<number> {
  const { data, error } = await supabase.rpc('edit_expense', {
    p_expense: params.expenseId,
    p_expected_version: params.expectedVersion,
    p_description: params.description ?? null,
    p_amount_minor: params.amountMinor,
    p_paid_by: params.paidBy,
    p_split_type: params.splitType,
    p_participants: params.participants as unknown as Json,
    p_category: params.category ?? null,
    p_expense_date: params.expenseDate,
  });

  if (error) throw error;
  return data as number;
}

/**
 * 3. deleteExpense
 */
export async function deleteExpense(expenseId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_expense', {
    p_expense: expenseId,
  });

  if (error) throw error;
}

/**
 * 4. restoreExpense
 */
export async function restoreExpense(expenseId: string): Promise<void> {
  const { error } = await supabase.rpc('restore_expense', {
    p_expense: expenseId,
  });

  if (error) throw error;
}

/**
 * 5. listExpenses
 */
export async function listExpenses(
  groupId: string,
  limit = 30,
  cursor?: ExpenseCursor | null
): Promise<ExpenseListItem[]> {
  const { data, error } = await supabase.rpc('list_expenses', {
    p_group: groupId,
    p_limit: limit,
    p_cursor: (cursor ?? null) as unknown as Json,
  });

  if (error) throw error;
  return (data ?? []) as unknown as ExpenseListItem[];
}

/**
 * 6. getExpense
 */
export async function getExpense(expenseId: string): Promise<ExpenseDetailResponse> {
  const { data, error } = await supabase.rpc('get_expense', {
    p_expense: expenseId,
  });

  if (error) throw error;
  return data as unknown as ExpenseDetailResponse;
}

/**
 * 7. listActivity
 */
export async function listActivity(
  limit = 30,
  cursor?: ActivityCursor | null
): Promise<ActivityListItem[]> {
  const { data, error } = await supabase.rpc('list_activity', {
    p_limit: limit,
    p_cursor: (cursor ?? null) as unknown as Json,
  });

  if (error) throw error;
  return (data ?? []) as unknown as ActivityListItem[];
}
