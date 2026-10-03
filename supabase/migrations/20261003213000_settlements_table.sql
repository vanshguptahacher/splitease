-- =============================================================================
-- Migration: settlements_table
-- Sub-phase 5.1: Database schema, constraints, indexes & privileges
-- =============================================================================

create table public.settlements (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.groups(id) on delete cascade,
  from_user          uuid not null references public.profiles(id),     -- no cascade, smart delete depends on this
  to_user            uuid not null references public.profiles(id),     -- no cascade, smart delete depends on this
  amount_minor       bigint not null,
  currency           text not null default 'INR',
  method             text not null,
  note               text,
  upi_txn_ref        text,                                             -- Phase 6
  status             text not null default 'pending',
  created_by         uuid not null references public.profiles(id),     -- no cascade, smart delete depends on this
  client_request_id  uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  status_changed_at  timestamptz not null default now(),
  confirmed_at       timestamptz,

  constraint settlements_amount   check (amount_minor between 1 and 1000000000),
  constraint settlements_currency check (currency = 'INR'),
  constraint settlements_method   check (method in ('cash', 'other', 'upi')),
  constraint settlements_status   check (status in ('pending', 'confirmed', 'disputed', 'cancelled')),
  constraint settlements_people   check (from_user <> to_user),
  constraint settlements_creator  check (created_by in (from_user, to_user)),
  constraint settlements_note_len check (note is null or char_length(note) <= 100),
  constraint settlements_confirmed_at check ((status = 'confirmed') = (confirmed_at is not null)),
  constraint settlements_request_unique unique (created_by, client_request_id)
);

-- No duplicate pending payments (same payer, receiver, amount in same group)
create unique index settlements_one_pending_same
  on public.settlements (group_id, from_user, to_user, amount_minor)
  where status = 'pending';

-- Performance indexes
create index settlements_group_list    on public.settlements (group_id, created_at desc, id desc);
create index settlements_group_pending on public.settlements (group_id) where status = 'pending';
create index settlements_from          on public.settlements (from_user);
create index settlements_to            on public.settlements (to_user);

-- Row Level Security: enabled with zero client privileges
alter table public.settlements enable row level security;
revoke all on public.settlements from public, anon, authenticated;
