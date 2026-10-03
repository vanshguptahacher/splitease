-- =============================================================================
-- Migration: activity_actions_settlements
-- Sub-phase 5.1: Extend activity_log action check to include settlement events
-- =============================================================================

alter table public.activity_log drop constraint if exists activity_log_action_check;

alter table public.activity_log add constraint activity_log_action_check check (action in (
  'expense_added', 'expense_edited', 'expense_deleted', 'expense_restored',
  'settlement_created', 'settlement_confirmed', 'settlement_disputed', 'settlement_cancelled'
));
