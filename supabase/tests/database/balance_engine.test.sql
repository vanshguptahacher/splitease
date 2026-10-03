begin;
select plan(16);

-- -----------------------------------------------------------------------------
-- Setup test fixtures (as postgres)
-- -----------------------------------------------------------------------------
set local role postgres;

insert into auth.users (id, email)
values
  ('11111111-2222-3333-4444-555555555551', 'baluser1@example.com'),
  ('11111111-2222-3333-4444-555555555552', 'baluser2@example.com'),
  ('11111111-2222-3333-4444-555555555553', 'baluser3@example.com'),
  ('11111111-2222-3333-4444-555555555554', 'baluser4@example.com')
on conflict (id) do nothing;

insert into public.groups (id, name, currency, created_by)
values
  ('eeeeeeee-1111-0000-0000-000000000001', 'Bal Group 1', 'INR', '11111111-2222-3333-4444-555555555551'),
  ('eeeeeeee-2222-0000-0000-000000000002', 'Bal Group 2', 'INR', '11111111-2222-3333-4444-555555555551')
on conflict (id) do nothing;

insert into public.group_members (group_id, user_id, role, status, left_at)
values
  ('eeeeeeee-1111-0000-0000-000000000001', '11111111-2222-3333-4444-555555555551', 'admin', 'active', null),
  ('eeeeeeee-1111-0000-0000-000000000001', '11111111-2222-3333-4444-555555555552', 'member', 'active', null),
  ('eeeeeeee-1111-0000-0000-000000000001', '11111111-2222-3333-4444-555555555553', 'member', 'active', null),
  -- Group 2: user1 active, user2 left
  ('eeeeeeee-2222-0000-0000-000000000002', '11111111-2222-3333-4444-555555555551', 'admin', 'active', null),
  ('eeeeeeee-2222-0000-0000-000000000002', '11111111-2222-3333-4444-555555555552', 'member', 'left', now())
on conflict (group_id, user_id) do nothing;

-- -----------------------------------------------------------------------------
-- 1. Security: Internal helpers are not callable by client roles (BZ7)
-- -----------------------------------------------------------------------------
set local role anon;

select throws_ok(
  'select * from public.compute_group_nets(''eeeeeeee-1111-0000-0000-000000000001'')',
  '42501',
  null,
  'anon cannot execute compute_group_nets'
);

select throws_ok(
  'select * from public.compute_simplified_debts(''eeeeeeee-1111-0000-0000-000000000001'')',
  '42501',
  null,
  'anon cannot execute compute_simplified_debts'
);

select throws_ok(
  'select public.get_group_balances(''eeeeeeee-1111-0000-0000-000000000001'')',
  '42501',
  null,
  'anon cannot execute get_group_balances'
);

select throws_ok(
  'select public.get_my_balance_summary()',
  '42501',
  null,
  'anon cannot execute get_my_balance_summary'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-2222-3333-4444-555555555551', true);

select throws_ok(
  'select * from public.compute_group_nets(''eeeeeeee-1111-0000-0000-000000000001'')',
  '42501',
  null,
  'authenticated cannot execute internal compute_group_nets'
);

select throws_ok(
  'select * from public.compute_simplified_debts(''eeeeeeee-1111-0000-0000-000000000001'')',
  '42501',
  null,
  'authenticated cannot execute internal compute_simplified_debts'
);

-- -----------------------------------------------------------------------------
-- 2. Client RPC: get_group_balances
-- -----------------------------------------------------------------------------
-- Non-member access throws not_a_member (BZ3)
select set_config('request.jwt.claim.sub', '11111111-2222-3333-4444-555555555554', true); -- user4 is not in group 1
select throws_ok(
  'select public.get_group_balances(''eeeeeeee-1111-0000-0000-000000000001'')',
  'P0001',
  'not_a_member',
  'non-member throws not_a_member on get_group_balances (BZ3)'
);

-- Active member access succeeds and returns correct snapshot (BC14)
set local role postgres;
-- Setup expense: user1 paid 30000 paise, split 10000 each among user1, user2, user3
insert into public.expenses (id, group_id, amount_minor, paid_by, split_type, expense_date, created_by)
values ('eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-1111-0000-0000-000000000001', 30000, '11111111-2222-3333-4444-555555555551', 'equal', current_date, '11111111-2222-3333-4444-555555555551');

insert into public.expense_splits (expense_id, user_id, share_minor)
values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-2222-3333-4444-555555555551', 10000),
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-2222-3333-4444-555555555552', 10000),
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-2222-3333-4444-555555555553', 10000);

-- Insert pending payment from user2 to user1 of 5000 paise
insert into public.settlements (id, group_id, from_user, to_user, amount_minor, method, status, created_by)
values ('eeeeeeee-9999-0000-0000-000000000001', 'eeeeeeee-1111-0000-0000-000000000001', '11111111-2222-3333-4444-555555555552', '11111111-2222-3333-4444-555555555551', 5000, 'cash', 'pending', '11111111-2222-3333-4444-555555555552');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-2222-3333-4444-555555555551', true);

select is(
  (public.get_group_balances('eeeeeeee-1111-0000-0000-000000000001') ->> 'my_net_minor')::bigint,
  20000::bigint,
  'get_group_balances returns correct my_net_minor (+20000 paise for user1)'
);

select is(
  (public.get_group_balances('eeeeeeee-1111-0000-0000-000000000001') ->> 'pending_for_me')::int,
  1,
  'get_group_balances returns pending_for_me count = 1 for user1'
);

select is(
  jsonb_array_length(public.get_group_balances('eeeeeeee-1111-0000-0000-000000000001') -> 'members'),
  3,
  'get_group_balances returns all 3 group members'
);

select is(
  jsonb_array_length(public.get_group_balances('eeeeeeee-1111-0000-0000-000000000001') -> 'payments'),
  2,
  'get_group_balances returns 2 simplified payments'
);

-- Receiver user2's perspective: owes 10000 paise, pending_for_me = 0
select set_config('request.jwt.claim.sub', '11111111-2222-3333-4444-555555555552', true);

select is(
  (public.get_group_balances('eeeeeeee-1111-0000-0000-000000000001') ->> 'my_net_minor')::bigint,
  (-10000)::bigint,
  'get_group_balances returns my_net_minor = -10000 for user2'
);

select is(
  (public.get_group_balances('eeeeeeee-1111-0000-0000-000000000001') ->> 'pending_for_me')::int,
  0,
  'get_group_balances returns pending_for_me = 0 for user2 (user2 is payer, not receiver)'
);

-- -----------------------------------------------------------------------------
-- 3. Client RPC: get_my_balance_summary (HO1, HO7, HO10)
-- -----------------------------------------------------------------------------
-- User 1 summary:
-- In Group 1: owed 20000 paise, pending_for_me = 1
-- In Group 2: net 0 (no expenses)
-- Overall: owed_to_me = 20000, i_owe = 0, net = 20000, groups_with_dues = 1, pending_for_me = 1
select set_config('request.jwt.claim.sub', '11111111-2222-3333-4444-555555555551', true);

select is(
  public.get_my_balance_summary(),
  jsonb_build_object(
    'owed_to_me_minor', 20000,
    'i_owe_minor', 0,
    'net_minor', 20000,
    'groups_with_dues', 1,
    'pending_for_me', 1
  ),
  'get_my_balance_summary returns correct summary for user 1'
);

-- User 2 summary:
-- In Group 1: active, owes 10000 paise
-- In Group 2: status = left (must NOT be counted)
-- Overall: owed_to_me = 0, i_owe = 10000, net = -10000, groups_with_dues = 1, pending_for_me = 0
select set_config('request.jwt.claim.sub', '11111111-2222-3333-4444-555555555552', true);

select is(
  public.get_my_balance_summary(),
  jsonb_build_object(
    'owed_to_me_minor', 0,
    'i_owe_minor', 10000,
    'net_minor', -10000,
    'groups_with_dues', 1,
    'pending_for_me', 0
  ),
  'get_my_balance_summary returns correct summary for user 2 (excludes left groups HO6)'
);

-- User 4 (in no active groups): all 0
select set_config('request.jwt.claim.sub', '11111111-2222-3333-4444-555555555554', true);

select is(
  public.get_my_balance_summary(),
  jsonb_build_object(
    'owed_to_me_minor', 0,
    'i_owe_minor', 0,
    'net_minor', 0,
    'groups_with_dues', 0,
    'pending_for_me', 0
  ),
  'get_my_balance_summary returns all 0 for user with no active groups'
);

rollback;
