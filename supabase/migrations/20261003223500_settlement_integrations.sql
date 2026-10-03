-- Migration: 20261003223500_settlement_integrations.sql
-- Description: Sub-phase 5.4 - Replace Phase 3 settled stubs, wire real balances to account deletion,
-- upgrade list_my_groups with balance and pending actions, and enrich list_activity for settlements.

-- 1. Real member_is_settled check
create or replace function public.member_is_settled(p_group uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select n.net_minor from public.compute_group_nets(p_group) n
                    where n.member_id = p_user), 0) = 0
     and not exists (select 1 from public.settlements s
                      where s.group_id = p_group and s.status = 'pending'
                        and (s.from_user = p_user or s.to_user = p_user));
$$;

revoke execute on function public.member_is_settled(uuid, uuid) from public, anon;

-- 2. Real group_is_settled check
create or replace function public.group_is_settled(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.compute_group_nets(p_group) n where n.net_minor <> 0)
     and not exists (select 1 from public.settlements s
                      where s.group_id = p_group and s.status = 'pending');
$$;

revoke execute on function public.group_is_settled(uuid) from public, anon;

-- 3. Real account_deletion_blockers check
create or replace function public.account_deletion_blockers()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_sole_admin  jsonb;
  v_unsettled   jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- 1) Groups where caller is sole active admin and other active members exist
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', g.id, 'name', g.name)
      order by g.name, g.id
    ),
    '[]'::jsonb
  )
  into v_sole_admin
  from public.groups g
  where exists (
    select 1 from public.group_members gm
    where gm.group_id = g.id
      and gm.user_id = v_uid
      and gm.role = 'admin'
      and gm.status = 'active'
  )
  and exists (
    select 1 from public.group_members other
    where other.group_id = g.id
      and other.user_id <> v_uid
      and other.status = 'active'
  )
  and not exists (
    select 1 from public.group_members other_admin
    where other_admin.group_id = g.id
      and other_admin.user_id <> v_uid
      and other_admin.role = 'admin'
      and other_admin.status = 'active'
  );

  -- 2) Groups where caller is active member and not settled (non-zero net or pending settlement)
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'my_net_minor', coalesce((
          select n.net_minor from public.compute_group_nets(g.id) n
           where n.member_id = v_uid
        ), 0),
        'pending_count', (
          select count(*) from public.settlements s
           where s.group_id = g.id and s.status = 'pending'
             and (s.from_user = v_uid or s.to_user = v_uid)
        )
      )
      order by g.name, g.id
    ),
    '[]'::jsonb
  )
  into v_unsettled
  from public.groups g
  join public.group_members gm on gm.group_id = g.id
  where gm.user_id = v_uid
    and gm.status = 'active'
    and not public.member_is_settled(g.id, v_uid);

  return jsonb_build_object(
    'sole_admin_groups', v_sole_admin,
    'unsettled_groups', v_unsettled
  );
end;
$$;

revoke execute on function public.account_deletion_blockers() from public, anon;
grant  execute on function public.account_deletion_blockers() to authenticated;

-- 4. list_my_groups (gains my_balance_minor and my_pending_actions)
drop function if exists public.list_my_groups();

create or replace function public.list_my_groups()
returns table (
  group_id uuid,
  name text,
  my_role text,
  member_count bigint,
  joined_at timestamptz,
  last_activity_at timestamptz,
  my_balance_minor bigint,
  my_pending_actions bigint
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
    ) as last_activity_at,
    coalesce(
      (select n.net_minor from public.compute_group_nets(g.id) n where n.member_id = v_uid),
      0
    )::bigint as my_balance_minor,
    (
      select count(*) from public.settlements s
       where s.group_id = g.id and s.status = 'pending' and s.to_user = v_uid
    )::bigint as my_pending_actions
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
grant  execute on function public.list_my_groups() to authenticated;

-- 5. list_activity (server-side join for both people's names for settlement actions)
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
    case
      when a.action in ('settlement_created', 'settlement_confirmed', 'settlement_disputed', 'settlement_cancelled') then
        a.details || jsonb_build_object(
          'from_name', coalesce(p_from.name, 'Deleted user'),
          'to_name', coalesce(p_to.name, 'Deleted user')
        )
      else
        a.details
    end as details,
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
  left join public.profiles p_from on p_from.id = nullif(a.details->>'from_user', '')::uuid
  left join public.profiles p_to   on p_to.id   = nullif(a.details->>'to_user', '')::uuid
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
grant  execute on function public.list_activity(int, jsonb) to authenticated;
