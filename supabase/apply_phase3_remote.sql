-- ==============================================================================
-- SPLITEASE PHASE 3: REMOTE SUPABASE MIGRATION SCRIPT
-- Paste and run this script in your Supabase Dashboard SQL Editor:
-- https://supabase.com/dashboard/project/fhbtsdfrfmgeagtqonun/sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. groups, group_members, invites, invite_attempts tables & security
-- ------------------------------------------------------------------------------

create table if not exists public.groups (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  currency           text not null default 'INR',
  created_by         uuid not null references public.profiles(id),
  client_request_id  uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint groups_name_len check (char_length(name) between 1 and 50),
  constraint groups_currency check (currency = 'INR'),
  constraint groups_request_unique unique (created_by, client_request_id)
);

create or replace function public.groups_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name       := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists groups_before_write on public.groups;
create trigger groups_before_write
  before insert or update on public.groups
  for each row execute function public.groups_before_write();

create table if not exists public.group_members (
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null references public.profiles(id),
  role        text not null default 'member' check (role in ('admin', 'member')),
  status      text not null default 'active' check (status in ('active', 'left', 'removed')),
  joined_at   timestamptz not null default now(),
  left_at     timestamptz,
  removed_by  uuid references public.profiles(id),
  primary key (group_id, user_id),
  constraint gm_left_consistency check ((status = 'active') = (left_at is null))
);

create index if not exists group_members_user_active  on public.group_members (user_id)  where status = 'active';
create index if not exists group_members_group_active on public.group_members (group_id) where status = 'active';

create table if not exists public.invites (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  code        text not null unique,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  revoked_at  timestamptz,
  constraint invites_code_format check (code ~ '^[A-HJ-NP-Z2-9]{8}$')
);

create unique index if not exists invites_one_active_per_group on public.invites (group_id) where revoked_at is null;

create table if not exists public.invite_attempts (
  id            bigint generated always as identity primary key,
  user_id       uuid not null,
  attempted_at  timestamptz not null default now(),
  success       boolean not null
);

create index if not exists invite_attempts_user_time on public.invite_attempts (user_id, attempted_at desc);

alter table public.groups          enable row level security;
alter table public.group_members   enable row level security;
alter table public.invites         enable row level security;
alter table public.invite_attempts enable row level security;

revoke all on public.groups, public.group_members, public.invites, public.invite_attempts
  from anon, authenticated;
grant select on public.groups, public.group_members to authenticated;

-- ------------------------------------------------------------------------------
-- 2. Helper functions & RLS policies
-- ------------------------------------------------------------------------------

create or replace function public.is_active_member(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group
      and gm.user_id = (select auth.uid())
      and gm.status = 'active'
  );
$$;

create or replace function public.is_group_admin(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group
      and gm.user_id = (select auth.uid())
      and gm.status = 'active'
      and gm.role = 'admin'
  );
$$;

create or replace function public.generate_invite_code()
returns text language plpgsql set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  code  text  := '';
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return code;
end;
$$;

create or replace function public.member_is_settled(p_group uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select true; $$;

create or replace function public.group_is_settled(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select true; $$;

revoke execute on function public.is_active_member(uuid), public.is_group_admin(uuid),
  public.generate_invite_code(), public.member_is_settled(uuid, uuid), public.group_is_settled(uuid)
  from public, anon;

grant execute on function public.is_active_member(uuid), public.is_group_admin(uuid) to authenticated;

drop policy if exists groups_select_members on public.groups;
create policy groups_select_members on public.groups
  for select to authenticated using (public.is_active_member(id));

drop policy if exists group_members_select_members on public.group_members;
create policy group_members_select_members on public.group_members
  for select to authenticated using (public.is_active_member(group_id));

-- ------------------------------------------------------------------------------
-- 3. Core group RPCs
-- ------------------------------------------------------------------------------

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

  if p_client_request_id is not null then
    select * into v_existing
    from public.groups g
    where g.created_by = v_uid and g.client_request_id = p_client_request_id;

    if found then
      return v_existing;
    end if;
  end if;

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

-- ------------------------------------------------------------------------------
-- 4. Invite RPCs
-- ------------------------------------------------------------------------------

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

  select * into v_group from public.groups g where g.id = p_group for update;
  if not found or not public.is_active_member(p_group) then
    raise exception 'not_a_member';
  end if;

  if not public.is_group_admin(p_group) then
    raise exception 'not_admin';
  end if;

  select * into v_inv from public.invites i
   where i.group_id = p_group and i.revoked_at is null;

  if found and v_inv.expires_at > now() then
    return query select v_inv.code, v_inv.expires_at;
    return;
  end if;

  if found then
    update public.invites set revoked_at = now() where id = v_inv.id;
  end if;

  loop
    v_code := public.generate_invite_code();
    begin
      insert into public.invites (group_id, code, created_by, created_at, expires_at)
      values (p_group, v_code, v_uid, now(), now() + interval '7 days')
      returning * into v_inv;
      exit;
    exception when unique_violation then
    end;
  end loop;

  return query select v_inv.code, v_inv.expires_at;
end;
$$;

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

  select * into v_group from public.groups g where g.id = p_group for update;
  if not found or not public.is_active_member(p_group) then
    raise exception 'not_a_member';
  end if;

  if not public.is_group_admin(p_group) then
    raise exception 'not_admin';
  end if;

  update public.invites set revoked_at = now()
   where group_id = p_group and revoked_at is null;

  loop
    v_code := public.generate_invite_code();
    begin
      insert into public.invites (group_id, code, created_by, created_at, expires_at)
      values (p_group, v_code, v_uid, now(), now() + interval '7 days')
      returning * into v_inv;
      exit;
    exception when unique_violation then
    end;
  end loop;

  return query select v_inv.code, v_inv.expires_at;
end;
$$;

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

  select case when p.deleted_at is not null then 'Deleted user' else p.name end into v_inviter_name
  from public.profiles p where p.id = v_inv.created_by;

  return query select 'valid'::text, v_group.name, v_members, v_inviter_name;
end;
$$;

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

revoke execute on function public.get_or_create_invite(uuid) from public, anon;
revoke execute on function public.reset_invite(uuid) from public, anon;
revoke execute on function public.preview_invite(text) from public, anon;
revoke execute on function public.join_group(text) from public, anon;

grant execute on function public.get_or_create_invite(uuid) to authenticated;
grant execute on function public.reset_invite(uuid) to authenticated;
grant execute on function public.preview_invite(text) to authenticated;
grant execute on function public.join_group(text) to authenticated;

-- ------------------------------------------------------------------------------
-- 5. Member management, Role management, Leave, Delete group & Account deletion
-- ------------------------------------------------------------------------------

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
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_role not in ('admin', 'member') then raise exception 'invalid_role'; end if;

  perform 1 from public.groups g where g.id = p_group for update;
  if not found or not public.is_active_member(p_group) then raise exception 'not_a_member'; end if;
  if not public.is_group_admin(p_group) then raise exception 'not_admin'; end if;

  select * into v_target from public.group_members gm
   where gm.group_id = p_group and gm.user_id = p_user and gm.status = 'active';
  if not found then raise exception 'target_not_member'; end if;

  if v_target.role = p_role then return; end if;

  if p_role = 'member' then
    select count(*) into v_admins from public.group_members gm
     where gm.group_id = p_group and gm.role = 'admin' and gm.status = 'active';
    if v_admins <= 1 then raise exception 'last_admin'; end if;
  end if;

  update public.group_members gm
     set role = p_role
   where gm.group_id = p_group and gm.user_id = p_user;
end;
$$;

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
  if v_uid is null then raise exception 'not_authenticated'; end if;

  perform 1 from public.groups g where g.id = p_group for update;
  if not found or not public.is_active_member(p_group) then raise exception 'not_a_member'; end if;
  if not public.is_group_admin(p_group) then raise exception 'not_admin'; end if;

  if p_user = v_uid then raise exception 'cannot_remove_self'; end if;

  select * into v_target from public.group_members gm
   where gm.group_id = p_group and gm.user_id = p_user and gm.status = 'active';
  if not found then raise exception 'target_not_member'; end if;

  if v_target.role = 'admin' then raise exception 'cannot_remove_admin'; end if;

  if not public.member_is_settled(p_group, p_user) then raise exception 'member_not_settled'; end if;

  update public.group_members gm
     set status = 'removed', left_at = now(), removed_by = v_uid
   where gm.group_id = p_group and gm.user_id = p_user;
end;
$$;

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
  if v_uid is null then raise exception 'not_authenticated'; end if;

  perform 1 from public.groups g where g.id = p_group for update;
  select * into v_me from public.group_members gm
   where gm.group_id = p_group and gm.user_id = v_uid and gm.status = 'active';
  if not found then raise exception 'not_a_member'; end if;

  if not public.member_is_settled(p_group, v_uid) then raise exception 'member_not_settled'; end if;

  select count(*) into v_active from public.group_members gm
   where gm.group_id = p_group and gm.status = 'active';

  if v_active = 1 then
    delete from public.groups g where g.id = p_group;
    return 'group_deleted';
  end if;

  if v_me.role = 'admin' then
    select count(*) into v_other_admins from public.group_members gm
     where gm.group_id = p_group and gm.role = 'admin'
       and gm.status = 'active' and gm.user_id <> v_uid;
    if v_other_admins = 0 then raise exception 'last_admin'; end if;
  end if;

  update public.group_members gm
     set status = 'left', left_at = now(), role = 'member'
   where gm.group_id = p_group and gm.user_id = v_uid;

  return 'left';
end;
$$;

create or replace function public.delete_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  perform 1 from public.groups g where g.id = p_group for update;
  if not found or not public.is_active_member(p_group) then raise exception 'not_a_member'; end if;
  if not public.is_group_admin(p_group) then raise exception 'not_admin'; end if;

  if not public.group_is_settled(p_group) then raise exception 'group_not_settled'; end if;

  delete from public.groups where id = p_group;
end;
$$;

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
  if v_uid is null then raise exception 'not_authenticated'; end if;

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
  if v_uid is null then raise exception 'not_authenticated'; end if;

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

  for v_rec in (
    select group_id
    from public.group_members
    where user_id = v_uid and status = 'active'
    order by group_id
  ) loop
    perform 1 from public.groups where id = v_rec.group_id for update;

    select count(*) into v_active_count
    from public.group_members
    where group_id = v_rec.group_id and status = 'active';

    if v_active_count = 1 then
      delete from public.groups where id = v_rec.group_id;
    else
      update public.group_members
         set status = 'left', left_at = now(), role = 'member'
       where group_id = v_rec.group_id and user_id = v_uid;
    end if;
  end loop;

  update public.profiles
     set name = 'Deleted user', avatar_path = null, avatar_url = null,
         upi_id = null, deleted_at = now()
   where id = v_uid;

  delete from auth.users where id = v_uid;
end;
$$;

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
