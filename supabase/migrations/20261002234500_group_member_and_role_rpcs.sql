-- Sub-phase 3.4: Member Management, Role Management, Group Deletion, and Account Deletion Integration

-- 1. set_member_role
create or replace function public.set_member_role(p_group uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_target  public.group_members;
  v_admins  int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'invalid_role';
  end if;

  -- lock the group row first
  perform 1 from public.groups g where g.id = p_group for update;
  if not found or not public.is_active_member(p_group) then
    raise exception 'not_a_member';
  end if;

  if not public.is_group_admin(p_group) then
    raise exception 'not_admin';
  end if;

  select * into v_target from public.group_members gm
   where gm.group_id = p_group and gm.user_id = p_user and gm.status = 'active';
  if not found then
    raise exception 'target_not_member';
  end if;

  -- idempotent: already has this role
  if v_target.role = p_role then
    return;
  end if;

  -- demoting an admin requires at least 2 active admins
  if p_role = 'member' then
    select count(*) into v_admins from public.group_members gm
     where gm.group_id = p_group and gm.role = 'admin' and gm.status = 'active';
    if v_admins <= 1 then
      raise exception 'last_admin';
    end if;
  end if;

  update public.group_members gm
     set role = p_role
   where gm.group_id = p_group and gm.user_id = p_user;
end;
$$;

-- 2. remove_member
create or replace function public.remove_member(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_target  public.group_members;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- lock group first
  perform 1 from public.groups g where g.id = p_group for update;
  if not found or not public.is_active_member(p_group) then
    raise exception 'not_a_member';
  end if;

  if not public.is_group_admin(p_group) then
    raise exception 'not_admin';
  end if;

  if p_user = v_uid then
    raise exception 'cannot_remove_self';
  end if;

  select * into v_target from public.group_members gm
   where gm.group_id = p_group and gm.user_id = p_user and gm.status = 'active';
  if not found then
    raise exception 'target_not_member';
  end if;

  if v_target.role = 'admin' then
    raise exception 'cannot_remove_admin';
  end if;

  if not public.member_is_settled(p_group, p_user) then
    raise exception 'member_not_settled';
  end if;

  update public.group_members gm
     set status = 'removed',
         left_at = now(),
         removed_by = v_uid
   where gm.group_id = p_group and gm.user_id = p_user;
end;
$$;

-- 3. leave_group
create or replace function public.leave_group(p_group uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid := auth.uid();
  v_me            public.group_members;
  v_active        int;
  v_other_admins  int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- lock group first
  perform 1 from public.groups g where g.id = p_group for update;
  select * into v_me from public.group_members gm
   where gm.group_id = p_group and gm.user_id = v_uid and gm.status = 'active';
  if not found then
    raise exception 'not_a_member';
  end if;

  if not public.member_is_settled(p_group, v_uid) then
    raise exception 'member_not_settled';
  end if;

  select count(*) into v_active from public.group_members gm
   where gm.group_id = p_group and gm.status = 'active';

  -- last person out deletes the group
  if v_active = 1 then
    delete from public.groups g where g.id = p_group;
    return 'group_deleted';
  end if;

  -- last admin cannot leave if other members exist
  if v_me.role = 'admin' then
    select count(*) into v_other_admins from public.group_members gm
     where gm.group_id = p_group and gm.role = 'admin'
       and gm.status = 'active' and gm.user_id <> v_uid;
    if v_other_admins = 0 then
      raise exception 'last_admin';
    end if;
  end if;

  update public.group_members gm
     set status = 'left',
         left_at = now(),
         role = 'member'
   where gm.group_id = p_group and gm.user_id = v_uid;

  return 'left';
end;
$$;

-- 4. delete_group
create or replace function public.delete_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- lock group first
  perform 1 from public.groups g where g.id = p_group for update;
  if not found or not public.is_active_member(p_group) then
    raise exception 'not_a_member';
  end if;

  if not public.is_group_admin(p_group) then
    raise exception 'not_admin';
  end if;

  if not public.group_is_settled(p_group) then
    raise exception 'group_not_settled';
  end if;

  delete from public.groups where id = p_group;
end;
$$;

-- 5. account_deletion_blockers
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
    raise exception 'not_authenticated';
  end if;

  -- Groups where caller is sole active admin and other active members exist
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', g.id, 'name', g.name)
      order by g.name
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

  -- Groups with unsettled balances
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', g.id, 'name', g.name)
      order by g.name
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

-- 6. delete_my_account(p_force boolean default false)
drop function if exists public.delete_my_account();

create or replace function public.delete_my_account(p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid := auth.uid();
  v_rec           record;
  v_active_count  int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- 1. Check sole admin blockers
  if exists (
    select 1
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
    )
  ) then
    raise exception 'sole_admin';
  end if;

  -- 2. Check unsettled balances unless forced
  if not p_force then
    if exists (
      select 1
      from public.group_members gm
      where gm.user_id = v_uid
        and gm.status = 'active'
        and not public.member_is_settled(gm.group_id, v_uid)
    ) then
      raise exception 'unsettled_balances';
    end if;
  end if;

  -- 3. Update memberships / delete single-member groups
  for v_rec in (
    select group_id
    from public.group_members
    where user_id = v_uid and status = 'active'
    order by group_id
  ) loop
    -- lock group row first
    perform 1 from public.groups where id = v_rec.group_id for update;

    select count(*) into v_active_count
    from public.group_members
    where group_id = v_rec.group_id and status = 'active';

    if v_active_count = 1 then
      delete from public.groups where id = v_rec.group_id;
    else
      update public.group_members
         set status = 'left',
             left_at = now(),
             role = 'member'
       where group_id = v_rec.group_id and user_id = v_uid;
    end if;
  end loop;

  -- 4. Anonymize profile
  update public.profiles
     set name = 'Deleted user',
         avatar_path = null,
         avatar_url = null,
         upi_id = null,
         deleted_at = now()
   where id = v_uid;

  -- 5. Delete login
  delete from auth.users where id = v_uid;
end;
$$;

-- Privileges
revoke execute on function public.set_member_role(uuid, uuid, text) from public, anon;
revoke execute on function public.remove_member(uuid, uuid)         from public, anon;
revoke execute on function public.leave_group(uuid)                 from public, anon;
revoke execute on function public.delete_group(uuid)                from public, anon;
revoke execute on function public.account_deletion_blockers()       from public, anon;
revoke execute on function public.delete_my_account(boolean)        from public, anon;

grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_member(uuid, uuid)         to authenticated;
grant execute on function public.leave_group(uuid)                 to authenticated;
grant execute on function public.delete_group(uuid)                to authenticated;
grant execute on function public.account_deletion_blockers()       to authenticated;
grant execute on function public.delete_my_account(boolean)        to authenticated;
