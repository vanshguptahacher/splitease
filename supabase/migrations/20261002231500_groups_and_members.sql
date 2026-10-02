-- Migration: groups_and_members (Sub-phase 3.1)
-- Tables: groups, group_members, invites, invite_attempts
-- Constraints, indexes, RLS enabled, initial privilege revokes

-- 1. groups table
create table public.groups (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  currency           text not null default 'INR',
  created_by         uuid not null references public.profiles(id),
  client_request_id  uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint groups_name_len check (char_length(name) between 1 and 50),
  constraint groups_currency check (currency = 'INR'),          -- relax in Phase 7
  constraint groups_request_unique unique (created_by, client_request_id)
);

-- Trigger to normalize group name (trim, collapse whitespace) and maintain updated_at
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

create trigger groups_before_write
  before insert or update on public.groups
  for each row execute function public.groups_before_write();

-- 2. group_members table
create table public.group_members (
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
create index group_members_user_active  on public.group_members (user_id)  where status = 'active';
create index group_members_group_active on public.group_members (group_id) where status = 'active';

-- 3. invites table
create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  code        text not null unique,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  revoked_at  timestamptz,
  constraint invites_code_format check (code ~ '^[A-HJ-NP-Z2-9]{8}$')
);
create unique index invites_one_active_per_group on public.invites (group_id) where revoked_at is null;

-- 4. invite_attempts table (private, functions only)
create table public.invite_attempts (
  id            bigint generated always as identity primary key,
  user_id       uuid not null,
  attempted_at  timestamptz not null default now(),
  success       boolean not null
);
create index invite_attempts_user_time on public.invite_attempts (user_id, attempted_at desc);

-- 5. Row Level Security & Privileges
alter table public.groups          enable row level security;
alter table public.group_members   enable row level security;
alter table public.invites         enable row level security;
alter table public.invite_attempts enable row level security;

revoke all on public.groups, public.group_members, public.invites, public.invite_attempts
  from anon, authenticated;
grant select on public.groups, public.group_members to authenticated;
-- No insert/update/delete grants anywhere. invites and invite_attempts: no grants at all.
