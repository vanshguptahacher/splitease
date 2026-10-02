-- Migration: group_helpers (Sub-phase 3.1)
-- Helper functions: is_active_member, is_group_admin, generate_invite_code
-- Stubs: member_is_settled, group_is_settled
-- RLS policies on groups and group_members

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
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- 32 symbols, no 0 O 1 I
  bytes bytea := extensions.gen_random_bytes(8);                   -- verify this schema in your project
  code  text  := '';
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return code;
end;
$$;

-- >>> STUBS. Phase 5 replaces these with real balance checks. Do not delete the calls. <<<
create or replace function public.member_is_settled(p_group uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select true; $$;

create or replace function public.group_is_settled(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select true; $$;

revoke execute on function public.is_active_member(uuid), public.is_group_admin(uuid),
  public.generate_invite_code(), public.member_is_settled(uuid, uuid), public.group_is_settled(uuid)
  from public, anon;

-- RLS policies call these as the signed-in user, so only these two need execute for authenticated:
grant execute on function public.is_active_member(uuid), public.is_group_admin(uuid) to authenticated;

-- RLS policies for groups and group_members
create policy groups_select_members on public.groups
  for select to authenticated using (public.is_active_member(id));

create policy group_members_select_members on public.group_members
  for select to authenticated using (public.is_active_member(group_id));
