-- Migration: 20261003160000_expenses_write_rpcs.sql
-- Description: Sub-phase 4.3 - Expense Write RPCs: add, edit, delete, restore, and lock helper

-- 1. Helper: expense_is_locked(p_expense)
-- Returns true when the payer or any participant is not currently an active member of the expense's group
create or replace function public.expense_is_locked(p_expense uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.expenses e
    where e.id = p_expense
      and (
        not exists (
          select 1 from public.group_members gm
          where gm.group_id = e.group_id
            and gm.user_id = e.paid_by
            and gm.status = 'active'
        )
        or exists (
          select 1 from public.expense_splits s
          where s.expense_id = e.id
            and not exists (
              select 1 from public.group_members gm
              where gm.group_id = e.group_id
                and gm.user_id = s.user_id
                and gm.status = 'active'
            )
        )
      )
  );
$$;

revoke execute on function public.expense_is_locked(uuid) from public, anon, authenticated;

-- 2. add_expense
create or replace function public.add_expense(
  p_group uuid,
  p_client_request_id uuid,
  p_description text,
  p_amount_minor bigint,
  p_paid_by uuid,
  p_split_type text,
  p_participants jsonb,
  p_category text,
  p_expense_date date
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_desc     text := nullif(btrim(regexp_replace(coalesce(p_description, ''), '[[:cntrl:]]', '', 'g')), '');
  v_id       uuid;
  v_existing uuid;
  v_bad_user uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- SHARED lock on the group row: expense writes run together, but never interleave with membership changes
  perform 1 from public.groups g where g.id = p_group for share;
  if not found or not public.is_active_member(p_group) then
    raise exception 'not_a_member';
  end if;

  -- Idempotency: the same request id from the same user returns the same expense
  if p_client_request_id is not null then
    select e.id into v_existing
      from public.expenses e
     where e.created_by = v_uid
       and e.client_request_id = p_client_request_id;
    if found then
      return v_existing;
    end if;
  end if;

  -- Amount validation: ₹0.01 to ₹1,00,00,000 (1 to 1,000,000,000 paise)
  if p_amount_minor is null or p_amount_minor < 1 or p_amount_minor > 1000000000 then
    raise exception 'invalid_amount';
  end if;

  -- Description validation: max 100 chars
  if v_desc is not null and char_length(v_desc) > 100 then
    raise exception 'invalid_description';
  end if;

  -- Category validation: fixed 10 categories or null
  if p_category is not null and p_category not in (
    'food', 'groceries', 'travel', 'stay', 'fuel',
    'shopping', 'bills', 'entertainment', 'rent', 'other'
  ) then
    raise exception 'invalid_category';
  end if;

  -- Date validation: not later than tomorrow, not older than 10 years (3650 days)
  if p_expense_date is null or p_expense_date > current_date + 1 or p_expense_date < current_date - 3650 then
    raise exception 'invalid_date';
  end if;

  -- Split type validation
  if p_split_type is null or p_split_type not in ('equal', 'exact', 'percent') then
    raise exception 'invalid_split_type';
  end if;

  -- Payer must be an active member of the group
  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group and gm.user_id = p_paid_by and gm.status = 'active'
  ) then
    raise exception 'payer_not_member';
  end if;

  -- compute_shares validates structure, duplicates, counts, sums, and ranges.
  -- Then check that every participant is an active member of this group.
  select s.user_id into v_bad_user
    from public.compute_shares(p_split_type, p_amount_minor, p_participants) s
   where not exists (
     select 1 from public.group_members gm
     where gm.group_id = p_group and gm.user_id = s.user_id and gm.status = 'active'
   )
   limit 1;

  if v_bad_user is not null then
    raise exception 'participant_not_member' using detail = v_bad_user::text;
  end if;

  begin
    insert into public.expenses (
      group_id, description, amount_minor, paid_by, split_type,
      category, expense_date, created_by, client_request_id
    ) values (
      p_group, v_desc, p_amount_minor, p_paid_by, p_split_type,
      p_category, p_expense_date, v_uid, p_client_request_id
    ) returning id into v_id;
  exception when unique_violation then
    -- Concurrent duplicate request: return the existing row
    select e.id into v_existing
      from public.expenses e
     where e.created_by = v_uid and e.client_request_id = p_client_request_id;
    return v_existing;
  end;

  insert into public.expense_splits (expense_id, user_id, share_minor, percent_bp)
  select v_id, s.user_id, s.share_minor, s.percent_bp
    from public.compute_shares(p_split_type, p_amount_minor, p_participants) s;

  insert into public.activity_log (group_id, actor_id, action, ref_id, details)
  values (
    p_group,
    v_uid,
    'expense_added',
    v_id,
    jsonb_build_object(
      'description', v_desc,
      'amount_minor', p_amount_minor,
      'category', p_category
    )
  );

  return v_id;
end;
$$;

revoke execute on function public.add_expense(uuid, uuid, text, bigint, uuid, text, jsonb, text, date)
  from public, anon;
grant execute on function public.add_expense(uuid, uuid, text, bigint, uuid, text, jsonb, text, date)
  to authenticated;

-- 3. edit_expense
create or replace function public.edit_expense(
  p_expense uuid,
  p_expected_version int,
  p_description text,
  p_amount_minor bigint,
  p_paid_by uuid,
  p_split_type text,
  p_participants jsonb,
  p_category text,
  p_expense_date date
) returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_group    uuid;
  v_exp      public.expenses;
  v_desc     text := nullif(btrim(regexp_replace(coalesce(p_description, ''), '[[:cntrl:]]', '', 'g')), '');
  v_bad_user uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select e.group_id into v_group from public.expenses e where e.id = p_expense;
  if not found then
    raise exception 'expense_not_found';
  end if;

  -- 1) Group row: shared lock
  perform 1 from public.groups g where g.id = v_group for share;
  if not public.is_active_member(v_group) then
    raise exception 'not_a_member';
  end if;

  -- 2) Expense row: exclusive lock
  select * into v_exp from public.expenses e where e.id = p_expense for update;
  if not found or v_exp.deleted_at is not null then
    raise exception 'expense_not_found';
  end if;

  -- 3) Permissions: creator or group admin
  if not (v_exp.created_by = v_uid or public.is_group_admin(v_group)) then
    raise exception 'not_allowed';
  end if;

  -- 4) Locked check
  if public.expense_is_locked(p_expense) then
    raise exception 'expense_locked';
  end if;

  -- 5) Version check (optimistic concurrency)
  if v_exp.version <> p_expected_version then
    raise exception 'expense_changed';
  end if;

  -- Validations
  if p_amount_minor is null or p_amount_minor < 1 or p_amount_minor > 1000000000 then
    raise exception 'invalid_amount';
  end if;

  if v_desc is not null and char_length(v_desc) > 100 then
    raise exception 'invalid_description';
  end if;

  if p_category is not null and p_category not in (
    'food', 'groceries', 'travel', 'stay', 'fuel',
    'shopping', 'bills', 'entertainment', 'rent', 'other'
  ) then
    raise exception 'invalid_category';
  end if;

  if p_expense_date is null or p_expense_date > current_date + 1 or p_expense_date < current_date - 3650 then
    raise exception 'invalid_date';
  end if;

  if p_split_type is null or p_split_type not in ('equal', 'exact', 'percent') then
    raise exception 'invalid_split_type';
  end if;

  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = v_group and gm.user_id = p_paid_by and gm.status = 'active'
  ) then
    raise exception 'payer_not_member';
  end if;

  select s.user_id into v_bad_user
    from public.compute_shares(p_split_type, p_amount_minor, p_participants) s
   where not exists (
     select 1 from public.group_members gm
     where gm.group_id = v_group and gm.user_id = s.user_id and gm.status = 'active'
   )
   limit 1;

  if v_bad_user is not null then
    raise exception 'participant_not_member' using detail = v_bad_user::text;
  end if;

  update public.expenses
     set description = v_desc,
         amount_minor = p_amount_minor,
         paid_by = p_paid_by,
         split_type = p_split_type,
         category = p_category,
         expense_date = p_expense_date,
         version = version + 1,
         updated_at = now()
   where id = p_expense;

  delete from public.expense_splits where expense_id = p_expense;

  insert into public.expense_splits (expense_id, user_id, share_minor, percent_bp)
  select p_expense, s.user_id, s.share_minor, s.percent_bp
    from public.compute_shares(p_split_type, p_amount_minor, p_participants) s;

  insert into public.activity_log (group_id, actor_id, action, ref_id, details)
  values (
    v_group,
    v_uid,
    'expense_edited',
    p_expense,
    jsonb_build_object(
      'description', v_desc,
      'amount_minor', p_amount_minor,
      'old_amount_minor', v_exp.amount_minor
    )
  );

  return v_exp.version + 1;
end;
$$;

revoke execute on function public.edit_expense(uuid, int, text, bigint, uuid, text, jsonb, text, date)
  from public, anon;
grant execute on function public.edit_expense(uuid, int, text, bigint, uuid, text, jsonb, text, date)
  to authenticated;

-- 4. delete_expense
create or replace function public.delete_expense(p_expense uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_group uuid;
  v_exp   public.expenses;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select e.group_id into v_group from public.expenses e where e.id = p_expense;
  if not found then
    raise exception 'expense_not_found';
  end if;

  -- 1) Group row: shared lock
  perform 1 from public.groups g where g.id = v_group for share;
  if not public.is_active_member(v_group) then
    raise exception 'not_a_member';
  end if;

  -- 2) Expense row: exclusive lock
  select * into v_exp from public.expenses e where e.id = p_expense for update;
  if not found then
    raise exception 'expense_not_found';
  end if;

  -- 3) Permissions: creator or group admin
  if not (v_exp.created_by = v_uid or public.is_group_admin(v_group)) then
    raise exception 'not_allowed';
  end if;

  -- 4) Locked check
  if public.expense_is_locked(p_expense) then
    raise exception 'expense_locked';
  end if;

  -- 5) Already deleted check: silent no-op (no log, no version bump)
  if v_exp.deleted_at is not null then
    return;
  end if;

  update public.expenses
     set deleted_at = now(),
         deleted_by = v_uid,
         version = version + 1,
         updated_at = now()
   where id = p_expense;

  insert into public.activity_log (group_id, actor_id, action, ref_id, details)
  values (
    v_group,
    v_uid,
    'expense_deleted',
    p_expense,
    jsonb_build_object(
      'description', v_exp.description,
      'amount_minor', v_exp.amount_minor
    )
  );
end;
$$;

revoke execute on function public.delete_expense(uuid) from public, anon;
grant execute on function public.delete_expense(uuid) to authenticated;

-- 5. restore_expense
create or replace function public.restore_expense(p_expense uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_group uuid;
  v_exp   public.expenses;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select e.group_id into v_group from public.expenses e where e.id = p_expense;
  if not found then
    raise exception 'expense_not_found';
  end if;

  -- 1) Group row: shared lock
  perform 1 from public.groups g where g.id = v_group for share;
  if not public.is_active_member(v_group) then
    raise exception 'not_a_member';
  end if;

  -- 2) Expense row: exclusive lock
  select * into v_exp from public.expenses e where e.id = p_expense for update;
  if not found then
    raise exception 'expense_not_found';
  end if;

  -- 3) Permissions: creator or group admin
  if not (v_exp.created_by = v_uid or public.is_group_admin(v_group)) then
    raise exception 'not_allowed';
  end if;

  -- 4) Locked check
  if public.expense_is_locked(p_expense) then
    raise exception 'expense_locked';
  end if;

  -- 5) Not deleted check: silent no-op (no log, no version bump)
  if v_exp.deleted_at is null then
    return;
  end if;

  update public.expenses
     set deleted_at = null,
         deleted_by = null,
         version = version + 1,
         updated_at = now()
   where id = p_expense;

  insert into public.activity_log (group_id, actor_id, action, ref_id, details)
  values (
    v_group,
    v_uid,
    'expense_restored',
    p_expense,
    jsonb_build_object(
      'description', v_exp.description,
      'amount_minor', v_exp.amount_minor
    )
  );
end;
$$;

revoke execute on function public.restore_expense(uuid) from public, anon;
grant execute on function public.restore_expense(uuid) to authenticated;
