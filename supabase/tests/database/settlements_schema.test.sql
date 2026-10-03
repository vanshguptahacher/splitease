begin;
select plan(34);

-- -----------------------------------------------------------------------------
-- Setup test fixtures (as postgres)
-- -----------------------------------------------------------------------------
set local role postgres;

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'setuser1@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'setuser2@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'setuser3@example.com')
on conflict (id) do nothing;

insert into public.groups (id, name, currency, created_by)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Settlement Test Group', 'INR', '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

insert into public.group_members (group_id, user_id, role, status)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'admin', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'member', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'member', 'active')
on conflict (group_id, user_id) do nothing;

-- -----------------------------------------------------------------------------
-- 1. Anonymous permissions: clients cannot SELECT, INSERT, UPDATE, DELETE (BZ1)
-- -----------------------------------------------------------------------------
set local role anon;

select throws_ok(
  'select * from public.settlements',
  '42501',
  null,
  'anon cannot select from settlements'
);

select throws_ok(
  'insert into public.settlements (group_id, from_user, to_user, amount_minor, method, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 1000, ''cash'', ''11111111-1111-1111-1111-111111111111'')',
  '42501',
  null,
  'anon cannot insert into settlements'
);

select throws_ok(
  'update public.settlements set amount_minor = 2000',
  '42501',
  null,
  'anon cannot update settlements'
);

select throws_ok(
  'delete from public.settlements',
  '42501',
  null,
  'anon cannot delete from settlements'
);

-- -----------------------------------------------------------------------------
-- 2. Authenticated permissions: clients cannot SELECT, INSERT, UPDATE, DELETE (BZ1)
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

select throws_ok(
  'select * from public.settlements',
  '42501',
  null,
  'authenticated cannot select from settlements'
);

select throws_ok(
  'insert into public.settlements (group_id, from_user, to_user, amount_minor, method, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 1000, ''cash'', ''11111111-1111-1111-1111-111111111111'')',
  '42501',
  null,
  'authenticated cannot insert into settlements'
);

select throws_ok(
  'update public.settlements set amount_minor = 2000',
  '42501',
  null,
  'authenticated cannot update settlements'
);

select throws_ok(
  'delete from public.settlements',
  '42501',
  null,
  'authenticated cannot delete from settlements'
);

-- -----------------------------------------------------------------------------
-- 3. Constraints (as postgres)
-- -----------------------------------------------------------------------------
set local role postgres;

-- Amount bounds: 1 to 1,000,000,000 paise (₹0.01 to ₹1,00,00,000)
select throws_ok(
  'insert into public.settlements (group_id, from_user, to_user, amount_minor, method, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 0, ''cash'', ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'rejects amount_minor = 0 (below 1)'
);

select throws_ok(
  'insert into public.settlements (group_id, from_user, to_user, amount_minor, method, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 1000000001, ''cash'', ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'rejects amount_minor > 1,000,000,000'
);

-- Currency constraint: must be 'INR'
select throws_ok(
  'insert into public.settlements (group_id, from_user, to_user, amount_minor, currency, method, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 1000, ''USD'', ''cash'', ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'rejects non-INR currency'
);

-- Method constraint: cash, other, upi
select throws_ok(
  'insert into public.settlements (group_id, from_user, to_user, amount_minor, method, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 1000, ''bitcoin'', ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'rejects invalid payment method'
);

-- Status constraint: pending, confirmed, disputed, cancelled
select throws_ok(
  'insert into public.settlements (group_id, from_user, to_user, amount_minor, method, status, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 1000, ''cash'', ''completed'', ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'rejects invalid settlement status'
);

-- People constraint: from_user <> to_user
select throws_ok(
  'insert into public.settlements (group_id, from_user, to_user, amount_minor, method, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''11111111-1111-1111-1111-111111111111'', 1000, ''cash'', ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'rejects self-settlement (from_user = to_user)'
);

-- Creator constraint: created_by in (from_user, to_user)
select throws_ok(
  'insert into public.settlements (group_id, from_user, to_user, amount_minor, method, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 1000, ''cash'', ''33333333-3333-3333-3333-333333333333'')',
  '23514',
  null,
  'rejects creator who is neither payer nor receiver'
);

-- Note length constraint: <= 100 chars
select throws_ok(
  'insert into public.settlements (group_id, from_user, to_user, amount_minor, method, created_by, note) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 1000, ''cash'', ''11111111-1111-1111-1111-111111111111'', repeat(''x'', 101))',
  '23514',
  null,
  'rejects note longer than 100 characters'
);

select lives_ok(
  'insert into public.settlements (id, group_id, from_user, to_user, amount_minor, method, created_by, note) values (''10000000-0000-0000-0000-000000000001'', ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 1000, ''cash'', ''11111111-1111-1111-1111-111111111111'', repeat(''x'', 100))',
  'allows note of exactly 100 characters'
);

-- Confirmed_at constraint: (status = 'confirmed') = (confirmed_at is not null)
select throws_ok(
  'insert into public.settlements (group_id, from_user, to_user, amount_minor, method, status, confirmed_at, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 1000, ''cash'', ''confirmed'', null, ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'rejects confirmed status without confirmed_at'
);

select throws_ok(
  'insert into public.settlements (group_id, from_user, to_user, amount_minor, method, status, confirmed_at, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 1000, ''cash'', ''pending'', now(), ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'rejects pending status with confirmed_at'
);

select throws_ok(
  'insert into public.settlements (group_id, from_user, to_user, amount_minor, method, status, confirmed_at, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 1000, ''cash'', ''disputed'', now(), ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'rejects disputed status with confirmed_at'
);

select throws_ok(
  'insert into public.settlements (group_id, from_user, to_user, amount_minor, method, status, confirmed_at, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 1000, ''cash'', ''cancelled'', now(), ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'rejects cancelled status with confirmed_at'
);

select lives_ok(
  'insert into public.settlements (group_id, from_user, to_user, amount_minor, method, status, confirmed_at, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 2000, ''cash'', ''confirmed'', now(), ''22222222-2222-2222-2222-222222222222'')',
  'allows confirmed status with confirmed_at'
);

-- Idempotency unique constraint (created_by, client_request_id)
select throws_ok(
  'insert into public.settlements (group_id, from_user, to_user, amount_minor, method, created_by, client_request_id) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 3000, ''cash'', ''11111111-1111-1111-1111-111111111111'', ''99999999-9999-9999-9999-999999999999'');
   insert into public.settlements (group_id, from_user, to_user, amount_minor, method, created_by, client_request_id) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 4000, ''cash'', ''11111111-1111-1111-1111-111111111111'', ''99999999-9999-9999-9999-999999999999'');',
  '23505',
  null,
  'rejects duplicate client_request_id for same created_by'
);

-- -----------------------------------------------------------------------------
-- 4. Partial unique index: settlements_one_pending_same (Case SC15)
-- -----------------------------------------------------------------------------
-- Clean slate for index testing
delete from public.settlements where group_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- First pending payment
select lives_ok(
  'insert into public.settlements (id, group_id, from_user, to_user, amount_minor, method, status, created_by) values (''20000000-0000-0000-0000-000000000001'', ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 50000, ''cash'', ''pending'', ''11111111-1111-1111-1111-111111111111'')',
  'inserts initial pending payment'
);

-- Second pending payment with same group, payer, receiver, and amount must fail
select throws_ok(
  'insert into public.settlements (group_id, from_user, to_user, amount_minor, method, status, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 50000, ''cash'', ''pending'', ''11111111-1111-1111-1111-111111111111'')',
  '23505',
  null,
  'partial unique index blocks second pending payment with same payer, receiver, amount (SC15)'
);

-- Pending payment with different amount is allowed
select lives_ok(
  'insert into public.settlements (group_id, from_user, to_user, amount_minor, method, status, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 60000, ''cash'', ''pending'', ''11111111-1111-1111-1111-111111111111'')',
  'allows pending payment with different amount'
);

-- Pending payment with reversed direction is allowed (SC17)
select lives_ok(
  'insert into public.settlements (group_id, from_user, to_user, amount_minor, method, status, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''22222222-2222-2222-2222-222222222222'', ''11111111-1111-1111-1111-111111111111'', 50000, ''cash'', ''pending'', ''22222222-2222-2222-2222-222222222222'')',
  'allows pending payment in opposite direction with same amount (SC17)'
);

-- When first payment is confirmed, inserting another pending payment with same details is allowed
update public.settlements
set status = 'confirmed', confirmed_at = now()
where id = '20000000-0000-0000-0000-000000000001';

select lives_ok(
  'insert into public.settlements (id, group_id, from_user, to_user, amount_minor, method, status, created_by) values (''20000000-0000-0000-0000-000000000002'', ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 50000, ''cash'', ''pending'', ''11111111-1111-1111-1111-111111111111'')',
  'allows new pending payment once previous confirmed'
);

-- When that payment is cancelled, another pending payment can be inserted
update public.settlements
set status = 'cancelled'
where id = '20000000-0000-0000-0000-000000000002';

select lives_ok(
  'insert into public.settlements (group_id, from_user, to_user, amount_minor, method, status, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''22222222-2222-2222-2222-222222222222'', 50000, ''cash'', ''pending'', ''11111111-1111-1111-1111-111111111111'')',
  'allows new pending payment once previous cancelled'
);

-- -----------------------------------------------------------------------------
-- 5. activity_log action constraint (extended for settlements)
-- -----------------------------------------------------------------------------
select lives_ok(
  'insert into public.activity_log (group_id, actor_id, action) values
     (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''settlement_created''),
     (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''settlement_confirmed''),
     (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''settlement_disputed''),
     (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''settlement_cancelled'')',
  'activity_log accepts all four settlement action types'
);

select throws_ok(
  'insert into public.activity_log (group_id, actor_id, action) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''settlement_refunded'')',
  '23514',
  null,
  'activity_log rejects unknown settlement action'
);

-- -----------------------------------------------------------------------------
-- 6. Cascade delete on groups (Case BG1)
-- -----------------------------------------------------------------------------
insert into public.groups (id, name, currency, created_by)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Cascade Group', 'INR', '11111111-1111-1111-1111-111111111111');

insert into public.settlements (id, group_id, from_user, to_user, amount_minor, method, created_by)
values ('30000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 1000, 'cash', '11111111-1111-1111-1111-111111111111');

delete from public.groups where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

select is(
  (select count(*)::int from public.settlements where id = '30000000-0000-0000-0000-000000000001'),
  0,
  'deleting group cascades to delete settlements (BG1)'
);

-- -----------------------------------------------------------------------------
-- 7. No cascade on profiles (Case BG2)
-- -----------------------------------------------------------------------------
insert into public.groups (id, name, currency, created_by)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'FK Profile Test Group', 'INR', '11111111-1111-1111-1111-111111111111');

insert into public.settlements (id, group_id, from_user, to_user, amount_minor, method, created_by)
values ('40000000-0000-0000-0000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 1000, 'cash', '11111111-1111-1111-1111-111111111111');

select throws_ok(
  'delete from public.profiles where id = ''11111111-1111-1111-1111-111111111111''',
  '23503',
  null,
  'deleting profile referenced as from_user in settlements fails (no cascade, BG2)'
);

select throws_ok(
  'delete from public.profiles where id = ''22222222-2222-2222-2222-222222222222''',
  '23503',
  null,
  'deleting profile referenced as to_user in settlements fails (no cascade, BG2)'
);

rollback;
