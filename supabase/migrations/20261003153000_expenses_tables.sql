-- Migration: 20261003153000_expenses_tables.sql
-- Description: Sub-phase 4.1 - Create expenses, expense_splits, activity_log tables, indexes, and RLS

-- 1. expenses table
create table public.expenses (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.groups(id) on delete cascade,
  description        text,
  amount_minor       bigint not null,
  currency           text not null default 'INR',
  paid_by            uuid not null references public.profiles(id),   -- no cascade, smart delete depends on this
  split_type         text not null,
  category           text,
  expense_date       date not null,
  created_by         uuid not null references public.profiles(id),   -- no cascade, smart delete depends on this
  client_request_id  uuid,
  version            int  not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  deleted_by         uuid references public.profiles(id),            -- no cascade, smart delete depends on this

  constraint expenses_amount check (amount_minor between 1 and 1000000000),
  constraint expenses_currency check (currency = 'INR'),
  constraint expenses_split_type check (split_type in ('equal', 'exact', 'percent')),
  constraint expenses_category check (category is null or category in
    ('food','groceries','travel','stay','fuel','shopping','bills','entertainment','rent','other')),
  constraint expenses_description_len check (description is null or char_length(description) <= 100),
  constraint expenses_deleted_pair check ((deleted_at is null) = (deleted_by is null)),
  constraint expenses_request_unique unique (created_by, client_request_id)
);

create index expenses_group_list on public.expenses (group_id, expense_date desc, created_at desc, id desc)
  where deleted_at is null;

-- 2. expense_splits table
create table public.expense_splits (
  expense_id   uuid not null references public.expenses(id) on delete cascade,
  user_id      uuid not null references public.profiles(id),          -- no cascade, smart delete depends on this
  share_minor  bigint not null check (share_minor >= 0),
  percent_bp   int check (percent_bp between 1 and 10000),
  primary key (expense_id, user_id)
);

create index expense_splits_user on public.expense_splits (user_id);

-- 3. activity_log table
create table public.activity_log (
  id          bigint generated always as identity primary key,
  group_id    uuid not null references public.groups(id) on delete cascade,
  actor_id    uuid not null references public.profiles(id),           -- no cascade, smart delete depends on this
  action      text not null check (action in
                ('expense_added','expense_edited','expense_deleted','expense_restored')),
  ref_id      uuid,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index activity_log_group_time on public.activity_log (group_id, created_at desc);

-- 4. Enable Row Level Security (RLS) on all three tables
alter table public.expenses       enable row level security;
alter table public.expense_splits enable row level security;
alter table public.activity_log   enable row level security;

-- 5. Revoke all privileges from public, anon, and authenticated
-- Clients have NO direct table access; all reads and writes must go through RPC functions.
revoke all on public.expenses from public, anon, authenticated;
revoke all on public.expense_splits from public, anon, authenticated;
revoke all on public.activity_log from public, anon, authenticated;
