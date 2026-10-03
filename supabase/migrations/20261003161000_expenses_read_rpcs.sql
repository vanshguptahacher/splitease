-- Migration: 20261003161000_expenses_read_rpcs.sql
-- Description: Sub-phase 4.4 - Read RPCs: list_expenses, get_expense, list_activity, and list_my_groups upgrade

-- 1. Index optimization for activity feed keyset pagination
create index if not exists activity_log_feed on public.activity_log (created_at desc, id desc);

-- 2. list_expenses
create or replace function public.list_expenses(
  p_group uuid,
  p_limit int default 30,
  p_cursor jsonb default null
)
returns table (
  id uuid,
  description text,
  category text,
  amount_minor bigint,
  paid_by uuid,
  expense_date date,
  created_by uuid,
  created_at timestamptz,
  version int,
  participant_count bigint,
  my_share_minor bigint,
  my_net_minor bigint,
  is_locked boolean,
  can_edit boolean,
  next_cursor jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_is_admin boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not public.is_active_member(p_group) then
    raise exception 'not_a_member';
  end if;

  v_is_admin := public.is_group_admin(p_group);

  return query
  select
    e.id,
    e.description,
    e.category,
    e.amount_minor,
    e.paid_by,
    e.expense_date,
    e.created_by,
    e.created_at,
    e.version,
    (
      select count(*)
      from public.expense_splits s_cnt
      where s_cnt.expense_id = e.id
    ) as participant_count,
    coalesce(
      (
        select s_my.share_minor
        from public.expense_splits s_my
        where s_my.expense_id = e.id and s_my.user_id = v_uid
      ),
      0::bigint
    ) as my_share_minor,
    (
      (case when e.paid_by = v_uid then e.amount_minor else 0::bigint end)
      - coalesce(
          (
            select s_my.share_minor
            from public.expense_splits s_my
            where s_my.expense_id = e.id and s_my.user_id = v_uid
          ),
          0::bigint
        )
    ) as my_net_minor,
    public.expense_is_locked(e.id) as is_locked,
    (e.created_by = v_uid or v_is_admin) as can_edit,
    jsonb_build_object(
      'expense_date', e.expense_date,
      'created_at', e.created_at,
      'id', e.id
    ) as next_cursor
  from public.expenses e
  where e.group_id = p_group
    and e.deleted_at is null
    and (
      p_cursor is null
      or (e.expense_date, e.created_at, e.id) < (
        (p_cursor->>'expense_date')::date,
        (p_cursor->>'created_at')::timestamptz,
        (p_cursor->>'id')::uuid
      )
    )
  order by e.expense_date desc, e.created_at desc, e.id desc
  limit coalesce(nullif(p_limit, 0), 30);
end;
$$;

revoke execute on function public.list_expenses(uuid, int, jsonb) from public, anon;
grant execute on function public.list_expenses(uuid, int, jsonb) to authenticated;

-- 3. get_expense
create or replace function public.get_expense(p_expense uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_group       uuid;
  v_exp         record;
  v_splits      jsonb;
  v_activity    jsonb;
  v_is_locked   boolean;
  v_can_edit    boolean;
  v_can_restore boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select e.group_id into v_group from public.expenses e where e.id = p_expense;
  if not found then
    raise exception 'expense_not_found';
  end if;

  if not public.is_active_member(v_group) then
    raise exception 'not_a_member';
  end if;

  select
    e.id,
    e.group_id,
    e.description,
    e.amount_minor,
    e.currency,
    e.paid_by,
    e.split_type,
    e.category,
    e.expense_date,
    e.created_by,
    e.version,
    e.created_at,
    e.updated_at,
    e.deleted_at,
    e.deleted_by
  into v_exp
  from public.expenses e
  where e.id = p_expense;

  -- All splits
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', s.user_id,
        'share_minor', s.share_minor,
        'percent_bp', s.percent_bp
      ) order by s.user_id
    ),
    '[]'::jsonb
  ) into v_splits
  from public.expense_splits s
  where s.expense_id = p_expense;

  -- Lock helper
  v_is_locked := public.expense_is_locked(p_expense);

  -- Permissions
  v_can_edit := (v_exp.created_by = v_uid or public.is_group_admin(v_group))
                and v_exp.deleted_at is null
                and not v_is_locked;

  v_can_restore := (v_exp.created_by = v_uid or public.is_group_admin(v_group))
                   and v_exp.deleted_at is not null
                   and not v_is_locked;

  -- Last 10 activity entries (join name only, no email or UPI ID)
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'action', a.action,
        'actor_id', a.actor_id,
        'actor_name', coalesce(p.name, 'Deleted user'),
        'details', a.details,
        'created_at', a.created_at
      ) order by a.created_at desc, a.id desc
    ),
    '[]'::jsonb
  ) into v_activity
  from (
    select al.*
    from public.activity_log al
    where al.ref_id = p_expense
    order by al.created_at desc, al.id desc
    limit 10
  ) a
  left join public.profiles p on p.id = a.actor_id;

  return jsonb_build_object(
    'expense', to_jsonb(v_exp),
    'splits', v_splits,
    'is_locked', v_is_locked,
    'can_edit', v_can_edit,
    'can_restore', v_can_restore,
    'activity', v_activity
  );
end;
$$;

revoke execute on function public.get_expense(uuid) from public, anon;
grant execute on function public.get_expense(uuid) to authenticated;

-- 4. list_activity
create or replace function public.list_activity(
  p_limit int default 30,
  p_cursor jsonb default null
)
returns table (
  id bigint,
  group_id uuid,
  group_name text,
  actor_id uuid,
  actor_name text,
  action text,
  ref_id uuid,
  details jsonb,
  created_at timestamptz,
  next_cursor jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  return query
  select
    a.id,
    a.group_id,
    g.name as group_name,
    a.actor_id,
    coalesce(p.name, 'Deleted user') as actor_name,
    a.action,
    a.ref_id,
    a.details,
    a.created_at,
    jsonb_build_object(
      'created_at', a.created_at,
      'id', a.id
    ) as next_cursor
  from public.activity_log a
  join public.groups g on g.id = a.group_id
  join public.group_members gm
    on gm.group_id = a.group_id
   and gm.user_id = v_uid
   and gm.status = 'active'
  left join public.profiles p on p.id = a.actor_id
  where (
    p_cursor is null
    or (a.created_at, a.id) < (
      (p_cursor->>'created_at')::timestamptz,
      (p_cursor->>'id')::bigint
    )
  )
  order by a.created_at desc, a.id desc
  limit coalesce(nullif(p_limit, 0), 30);
end;
$$;

revoke execute on function public.list_activity(int, jsonb) from public, anon;
grant execute on function public.list_activity(int, jsonb) to authenticated;

-- 5. list_my_groups (update with last_activity_at)
drop function if exists public.list_my_groups();

create or replace function public.list_my_groups()
returns table (
  group_id uuid,
  name text,
  my_role text,
  member_count bigint,
  joined_at timestamptz,
  last_activity_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  return query
  select
    g.id as group_id,
    g.name,
    gm.role as my_role,
    (
      select count(*)
      from public.group_members gm_count
      where gm_count.group_id = g.id
        and gm_count.status = 'active'
    ) as member_count,
    gm.joined_at,
    coalesce(
      (select max(a.created_at) from public.activity_log a where a.group_id = g.id),
      gm.joined_at
    ) as last_activity_at
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  where gm.user_id = v_uid
    and gm.status = 'active'
  order by coalesce(
    (select max(a.created_at) from public.activity_log a where a.group_id = g.id),
    gm.joined_at
  ) desc, g.id desc;
end;
$$;

revoke execute on function public.list_my_groups() from public, anon;
grant execute on function public.list_my_groups() to authenticated;
