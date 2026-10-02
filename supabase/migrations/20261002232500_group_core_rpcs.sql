-- Migration: group_core_rpcs (Sub-phase 3.2)
-- Core RPCs for creating, listing, viewing, and renaming groups, plus fetching members
-- Functions: create_group, list_my_groups, get_group, get_group_members, rename_group

-- 1. create_group
create or replace function public.create_group(
  p_name text,
  p_client_request_id uuid default null
)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_name        text;
  v_group_count int;
  v_existing    public.groups;
  v_group       public.groups;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if char_length(v_name) < 1 or char_length(v_name) > 50 then
    raise exception 'invalid_name';
  end if;

  -- Idempotency check: if same request id was already processed for this user, return existing group
  if p_client_request_id is not null then
    select * into v_existing
    from public.groups g
    where g.created_by = v_uid and g.client_request_id = p_client_request_id;

    if found then
      return v_existing;
    end if;
  end if;

  -- Cap: user cannot have more than 50 active groups
  select count(*) into v_group_count
  from public.group_members gm
  where gm.user_id = v_uid and gm.status = 'active';

  if v_group_count >= 50 then
    raise exception 'group_limit_reached';
  end if;

  insert into public.groups (name, currency, created_by, client_request_id)
  values (v_name, 'INR', v_uid, p_client_request_id)
  returning * into v_group;

  insert into public.group_members (group_id, user_id, role, status)
  values (v_group.id, v_uid, 'admin', 'active');

  return v_group;
end;
$$;

-- 2. list_my_groups
create or replace function public.list_my_groups()
returns table (
  group_id uuid,
  name text,
  my_role text,
  member_count bigint,
  joined_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

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
    gm.joined_at
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  where gm.user_id = v_uid
    and gm.status = 'active'
  order by gm.joined_at desc;
end;
$$;

-- 3. get_group
create or replace function public.get_group(p_group uuid)
returns table (
  id uuid,
  name text,
  currency text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  my_role text,
  member_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_member public.group_members;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_member
  from public.group_members gm
  where gm.group_id = p_group and gm.user_id = v_uid and gm.status = 'active';

  if not found then
    raise exception 'not_a_member';
  end if;

  return query
  select
    g.id,
    g.name,
    g.currency,
    g.created_by,
    g.created_at,
    g.updated_at,
    v_member.role as my_role,
    (
      select count(*)
      from public.group_members gm_count
      where gm_count.group_id = g.id and gm_count.status = 'active'
    ) as member_count
  from public.groups g
  where g.id = p_group;
end;
$$;

-- 4. get_group_members
create or replace function public.get_group_members(
  p_group uuid,
  p_include_former boolean default false
)
returns table (
  user_id uuid,
  name text,
  avatar_path text,
  avatar_url text,
  upi_id text,
  role text,
  status text,
  joined_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  if not public.is_active_member(p_group) then
    raise exception 'not_a_member';
  end if;

  return query
  select
    gm.user_id,
    case when p.deleted_at is not null then 'Deleted user' else p.name end as name,
    case when p.deleted_at is not null then null else p.avatar_path end as avatar_path,
    case when p.deleted_at is not null then null else p.avatar_url end as avatar_url,
    case when gm.status = 'active' and p.deleted_at is null then p.upi_id else null end as upi_id,
    gm.role,
    gm.status,
    gm.joined_at
  from public.group_members gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = p_group
    and (
      (not coalesce(p_include_former, false) and gm.status = 'active')
      or
      (coalesce(p_include_former, false) and gm.status in ('active', 'left', 'removed'))
    )
  order by
    case when gm.user_id = v_uid then 0 else 1 end asc,
    case when gm.role = 'admin' and gm.status = 'active' then 0 else 1 end asc,
    lower(case when p.deleted_at is not null then 'Deleted user' else p.name end) asc,
    gm.joined_at asc;
end;
$$;

-- 5. rename_group
create or replace function public.rename_group(
  p_group uuid,
  p_name text
)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text;
  v_group public.groups;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if char_length(v_name) < 1 or char_length(v_name) > 50 then
    raise exception 'invalid_name';
  end if;

  -- Lock group row to serialize per group
  select * into v_group
  from public.groups g
  where g.id = p_group
  for update;

  if not found or not public.is_active_member(p_group) then
    raise exception 'not_a_member';
  end if;

  if not public.is_group_admin(p_group) then
    raise exception 'not_admin';
  end if;

  update public.groups g
     set name = v_name,
         updated_at = now()
   where g.id = p_group
  returning * into v_group;

  return v_group;
end;
$$;

-- Privileges: Revoke from public & anon, grant to authenticated
revoke execute on function public.create_group(text, uuid) from public, anon;
revoke execute on function public.list_my_groups() from public, anon;
revoke execute on function public.get_group(uuid) from public, anon;
revoke execute on function public.get_group_members(uuid, boolean) from public, anon;
revoke execute on function public.rename_group(uuid, text) from public, anon;

grant execute on function public.create_group(text, uuid) to authenticated;
grant execute on function public.list_my_groups() to authenticated;
grant execute on function public.get_group(uuid) to authenticated;
grant execute on function public.get_group_members(uuid, boolean) to authenticated;
grant execute on function public.rename_group(uuid, text) to authenticated;
