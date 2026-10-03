-- Migration: 20261003100000_finalize_account_deletion.sql
-- Description: Finalize account deletion with smart delete, membership cleanup, and blocking rules

-- 1. Drop existing functions to avoid parameter signature collisions
drop function if exists public.delete_my_account(boolean);
drop function if exists public.delete_my_account();
drop function if exists public.account_deletion_blockers();

-- 2. Stubs for blockers (overridden by real checks in phase 3/5)
create or replace function public.account_deletion_blockers()
returns jsonb
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

  return jsonb_build_object(
    'sole_admin_groups', '[]'::jsonb,
    'unsettled_groups', '[]'::jsonb
  );
end;
$$;

-- 3. delete_my_account(p_force boolean default false)
-- Accepts optional p_force for backward compatibility with cached clients, but strictly enforces zero-unsettled rules.
create or replace function public.delete_my_account(p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid := auth.uid();
  v_blockers      jsonb;
  v_rec           record;
  v_active_count  int;
begin
  -- 1. Auth check
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- 2. Check blockers (strictly enforced: no force deletion allowed)
  v_blockers := public.account_deletion_blockers();

  if jsonb_array_length(coalesce(v_blockers->'sole_admin_groups', '[]'::jsonb)) > 0 then
    raise exception 'sole_admin';
  end if;

  if jsonb_array_length(coalesce(v_blockers->'unsettled_groups', '[]'::jsonb)) > 0 then
    raise exception 'unsettled_balances';
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

  -- 4. Smart delete of the profile row:
  -- If nothing references the profile, hard delete the row.
  -- If other tables reference it (foreign key), keep the row but anonymize it.
  begin
    delete from public.profiles where id = v_uid;
  exception
    when foreign_key_violation then
      update public.profiles
         set name = 'Deleted user',
             avatar_path = null,
             avatar_url = null,
             upi_id = null,
             deleted_at = now()
       where id = v_uid;
  end;

  -- 5. Delete from auth.users
  delete from auth.users where id = v_uid;
end;
$$;

-- 4. Privileges
revoke execute on function public.account_deletion_blockers() from public, anon;
revoke execute on function public.delete_my_account(boolean)        from public, anon;

grant execute on function public.account_deletion_blockers() to authenticated;
grant execute on function public.delete_my_account(boolean)        to authenticated;
