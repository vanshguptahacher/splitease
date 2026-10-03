-- Migration: 20261003153100_expense_split_sum_trigger.sql
-- Description: Sub-phase 4.1 - Constraint trigger to ensure sum of shares equals amount_minor

create or replace function public.check_expense_split_sum()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if tg_table_name = 'expenses' then
    v_id := new.id;
  else
    v_id := coalesce(new.expense_id, old.expense_id);
  end if;

  -- if the expense is gone (cascade delete), nothing to check
  if exists (select 1 from public.expenses e where e.id = v_id)
     and (select coalesce(sum(s.share_minor), 0) from public.expense_splits s where s.expense_id = v_id)
         <> (select e.amount_minor from public.expenses e where e.id = v_id)
  then
    raise exception 'splits_dont_add_up';
  end if;
  return null;
end;
$$;

create constraint trigger expense_splits_sum_check
  after insert or update or delete on public.expense_splits
  deferrable initially deferred
  for each row execute function public.check_expense_split_sum();

create constraint trigger expenses_sum_check
  after insert or update of amount_minor on public.expenses
  deferrable initially deferred
  for each row execute function public.check_expense_split_sum();

revoke execute on function public.check_expense_split_sum() from public, anon, authenticated;
