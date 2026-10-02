-- 6.1 Profiles table, triggers, privileges, RLS
create table public.profiles (
  id            uuid primary key,   -- same value as auth.users.id. No foreign key on purpose:
                                    -- on account deletion the login is removed but this row is
                                    -- kept as an anonymized "Deleted user" so other members'
                                    -- ledgers stay intact (decision D2).
  name          text not null,
  avatar_url    text,               -- set only by the sign-up trigger (Google photo)
  avatar_path   text,               -- set by the app: '<uid>/<uuid>.jpg|png|webp'
  upi_id        text,
  onboarded_at  timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint profiles_name_len check (char_length(name) between 1 and 50),
  constraint profiles_upi_format check (
    upi_id is null or upi_id ~ '^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,63}$'
  ),
  constraint profiles_avatar_path_format check (
    avatar_path is null
    or avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')
  ),
  constraint profiles_avatar_url_host check (
    avatar_url is null or avatar_url ~ '^https://lh3\.googleusercontent\.com/'
  )
);

-- Normalize before the CHECK constraints run
create or replace function public.profiles_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name       := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.upi_id     := nullif(lower(btrim(new.upi_id)), '');
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_before_write
  before insert or update on public.profiles
  for each row execute function public.profiles_before_write();

-- RLS and privileges
alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (name, avatar_path, upi_id, onboarded_at) on public.profiles to authenticated;
-- No INSERT or DELETE grant: rows are created by the trigger / ensure_my_profile()
-- and removed (anonymized) by delete_my_account().

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- 6.2 Auto-create the profile on sign-up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta_name text := nullif(btrim(coalesce(
                        new.raw_user_meta_data ->> 'full_name',
                        new.raw_user_meta_data ->> 'name', '')), '');
  v_avatar    text := nullif(coalesce(
                        new.raw_user_meta_data ->> 'avatar_url',
                        new.raw_user_meta_data ->> 'picture', ''), '');
  v_name      text;
begin
  v_name := left(coalesce(
              v_meta_name,
              nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
              'User'), 50);

  -- Accept a photo only from Google's photo host (sign-up metadata can be user-supplied).
  -- Verify the exact host Google returns during testing and adjust the pattern if needed.
  if v_avatar is not null and v_avatar !~ '^https://lh3\.googleusercontent\.com/' then
    v_avatar := null;
  end if;

  insert into public.profiles (id, name, avatar_url, onboarded_at)
  values (new.id, v_name, v_avatar,
          case when v_meta_name is not null then now() else null end)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 6.3 RPC functions
create or replace function public.ensure_my_profile()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.profiles;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  insert into public.profiles (id, name)
  select u.id,
         left(coalesce(nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'User'), 50)
  from auth.users u
  where u.id = v_uid
  on conflict (id) do nothing;

  select * into v_row from public.profiles where id = v_uid;
  return v_row;
end;
$$;

create or replace function public.delete_my_account()
returns void
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

  -- >>> PHASE 3 / 5 HOOK: add checks here <<<
  --   F7: block if the user is the only admin of a group that has other members
  --   F8: report or require confirmation for unsettled balances

  update public.profiles
     set name = 'Deleted user',
         avatar_path = null,
         avatar_url = null,
         upi_id = null,
         deleted_at = now()
   where id = v_uid;

  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.ensure_my_profile()  from public, anon;
revoke execute on function public.delete_my_account()  from public, anon;
grant  execute on function public.ensure_my_profile()  to authenticated;
grant  execute on function public.delete_my_account()  to authenticated;
