-- Migration: group_invite_rpcs (Sub-phase 3.3)
-- Invite RPCs: get_or_create_invite, reset_invite, preview_invite, join_group
-- All functions: SECURITY DEFINER, SET search_path = '', auth.uid() based, execute revoked from anon/public

-- 1. get_or_create_invite
create or replace function public.get_or_create_invite(p_group uuid)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_group public.groups;
  v_inv   public.invites;
  v_code  text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Lock group row to serialize per group
  select * into v_group from public.groups g where g.id = p_group for update;
  if not found or not public.is_active_member(p_group) then
    raise exception 'not_a_member';
  end if;

  if not public.is_group_admin(p_group) then
    raise exception 'not_admin';
  end if;

  -- Check for existing active (unrevoked) invite
  select * into v_inv from public.invites i
   where i.group_id = p_group and i.revoked_at is null;

  -- If found and not expired, return it
  if found and v_inv.expires_at > now() then
    return query select v_inv.code, v_inv.expires_at;
    return;
  end if;

  -- If found but expired, revoke it
  if found then
    update public.invites set revoked_at = now() where id = v_inv.id;
  end if;

  -- Generate new invite with unique code retry loop
  loop
    v_code := public.generate_invite_code();
    begin
      insert into public.invites (group_id, code, created_by, created_at, expires_at)
      values (p_group, v_code, v_uid, now(), now() + interval '7 days')
      returning * into v_inv;
      exit;
    exception when unique_violation then
      -- Loop and retry code generation
    end;
  end loop;

  return query select v_inv.code, v_inv.expires_at;
end;
$$;

-- 2. reset_invite
create or replace function public.reset_invite(p_group uuid)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_group public.groups;
  v_inv   public.invites;
  v_code  text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Lock group row
  select * into v_group from public.groups g where g.id = p_group for update;
  if not found or not public.is_active_member(p_group) then
    raise exception 'not_a_member';
  end if;

  if not public.is_group_admin(p_group) then
    raise exception 'not_admin';
  end if;

  -- Revoke current active invite if exists
  update public.invites set revoked_at = now()
   where group_id = p_group and revoked_at is null;

  -- Create new invite
  loop
    v_code := public.generate_invite_code();
    begin
      insert into public.invites (group_id, code, created_by, created_at, expires_at)
      values (p_group, v_code, v_uid, now(), now() + interval '7 days')
      returning * into v_inv;
      exit;
    exception when unique_violation then
      -- Loop and retry code generation
    end;
  end loop;

  return query select v_inv.code, v_inv.expires_at;
end;
$$;

-- 3. preview_invite
create or replace function public.preview_invite(p_code text)
returns table (
  status text,
  group_name text,
  member_count bigint,
  inviter_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_code         text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_inv          public.invites;
  v_group        public.groups;
  v_member       public.group_members;
  v_was_member   boolean;
  v_fails        int;
  v_members      bigint;
  v_my_groups    bigint;
  v_inviter_name text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Check brute force attempt limit (10 failed attempts within 15 minutes)
  select count(*) into v_fails from public.invite_attempts ia
   where ia.user_id = v_uid and ia.success = false
     and ia.attempted_at > now() - interval '15 minutes';
  if v_fails >= 10 then
    return query select 'too_many_attempts'::text, null::text, null::bigint, null::text;
    return;
  end if;

  select * into v_inv from public.invites i where i.code = v_code;
  if not found then
    insert into public.invite_attempts (user_id, success) values (v_uid, false);
    return query select 'invalid'::text, null::text, null::bigint, null::text;
    return;
  end if;

  if v_inv.revoked_at is not null then
    return query select 'revoked'::text, null::text, null::bigint, null::text;
    return;
  end if;

  if v_inv.expires_at <= now() then
    return query select 'expired'::text, null::text, null::bigint, null::text;
    return;
  end if;

  select * into v_group from public.groups g where g.id = v_inv.group_id;
  if not found then
    return query select 'invalid'::text, null::text, null::bigint, null::text;
    return;
  end if;

  select * into v_member from public.group_members gm
   where gm.group_id = v_group.id and gm.user_id = v_uid;
  v_was_member := found;

  if v_was_member and v_member.status = 'active' then
    return query select 'already_member'::text, v_group.name, null::bigint, null::text;
    return;
  end if;

  -- Removed member: only invites created after removal are allowed
  if v_was_member and v_member.status = 'removed' and v_inv.created_at <= v_member.left_at then
    return query select 'removed'::text, v_group.name, null::bigint, null::text;
    return;
  end if;

  select count(*) into v_members from public.group_members gm
   where gm.group_id = v_group.id and gm.status = 'active';
  if v_members >= 50 then
    return query select 'group_full'::text, null::text, null::bigint, null::text;
    return;
  end if;

  select count(*) into v_my_groups from public.group_members gm
   where gm.user_id = v_uid and gm.status = 'active';
  if v_my_groups >= 50 then
    return query select 'too_many_groups'::text, null::text, null::bigint, null::text;
    return;
  end if;

  -- Get inviter name
  select case when p.deleted_at is not null then 'Deleted user' else p.name end into v_inviter_name
  from public.profiles p where p.id = v_inv.created_by;

  return query select 'valid'::text, v_group.name, v_members, v_inviter_name;
end;
$$;

-- 4. join_group
create or replace function public.join_group(p_code text)
returns table (
  r_status text,
  r_group_id uuid,
  r_group_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_code       text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_inv        public.invites;
  v_group      public.groups;
  v_member     public.group_members;
  v_was_member boolean;
  v_fails      int;
  v_members    int;
  v_my_groups  int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select count(*) into v_fails from public.invite_attempts ia
   where ia.user_id = v_uid and ia.success = false
     and ia.attempted_at > now() - interval '15 minutes';
  if v_fails >= 10 then
    return query select 'too_many_attempts'::text, null::uuid, null::text;
    return;
  end if;

  select * into v_inv from public.invites i where i.code = v_code;
  if not found then
    insert into public.invite_attempts (user_id, success) values (v_uid, false);
    return query select 'invalid'::text, null::uuid, null::text;
    return;
  end if;

  if v_inv.revoked_at is not null then
    return query select 'revoked'::text, null::uuid, null::text;
    return;
  end if;

  if v_inv.expires_at <= now() then
    return query select 'expired'::text, null::uuid, null::text;
    return;
  end if;

  -- Lock the group first (serialized per group)
  select * into v_group from public.groups g where g.id = v_inv.group_id for update;
  if not found then
    return query select 'invalid'::text, null::uuid, null::text;
    return;
  end if;

  select * into v_member from public.group_members gm
   where gm.group_id = v_group.id and gm.user_id = v_uid;
  v_was_member := found;

  if v_was_member and v_member.status = 'active' then
    return query select 'already_member'::text, v_group.id, v_group.name;
    return;
  end if;

  -- Removed by an admin: only an invite created AFTER the removal lets them back in
  if v_was_member and v_member.status = 'removed' and v_inv.created_at <= v_member.left_at then
    return query select 'removed'::text, null::uuid, v_group.name;
    return;
  end if;

  select count(*) into v_members from public.group_members gm
   where gm.group_id = v_group.id and gm.status = 'active';
  if v_members >= 50 then
    return query select 'group_full'::text, null::uuid, null::text;
    return;
  end if;

  select count(*) into v_my_groups from public.group_members gm
   where gm.user_id = v_uid and gm.status = 'active';
  if v_my_groups >= 50 then
    return query select 'too_many_groups'::text, null::uuid, null::text;
    return;
  end if;

  if v_was_member then
    update public.group_members gm
       set status = 'active', role = 'member', left_at = null,
           removed_by = null, joined_at = now()
     where gm.group_id = v_group.id and gm.user_id = v_uid;
  else
    insert into public.group_members (group_id, user_id, role, status, joined_at)
    values (v_group.id, v_uid, 'member', 'active', now());
  end if;

  insert into public.invite_attempts (user_id, success) values (v_uid, true);
  return query select 'joined'::text, v_group.id, v_group.name;
end;
$$;

-- Revoke execute from public & anon, grant to authenticated
revoke execute on function public.get_or_create_invite(uuid) from public, anon;
revoke execute on function public.reset_invite(uuid) from public, anon;
revoke execute on function public.preview_invite(text) from public, anon;
revoke execute on function public.join_group(text) from public, anon;

grant execute on function public.get_or_create_invite(uuid) to authenticated;
grant execute on function public.reset_invite(uuid) to authenticated;
grant execute on function public.preview_invite(text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
