begin;
select plan(48);

-- -----------------------------------------------------------------------------
-- Setup test fixtures (as postgres)
-- -----------------------------------------------------------------------------
set local role postgres;

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'expuser1@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'expuser2@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'expuser3@example.com')
on conflict (id) do nothing;

insert into public.groups (id, name, currency, created_by)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Expense Test Group', 'INR', '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

insert into public.group_members (group_id, user_id, role, status)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'admin', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'member', 'active')
on conflict (group_id, user_id) do nothing;

-- -----------------------------------------------------------------------------
-- 1. Anonymous permissions: clients cannot SELECT, INSERT, UPDATE, DELETE (EZ1)
-- -----------------------------------------------------------------------------
set local role anon;

select throws_ok(
  'select * from public.expenses',
  '42501',
  null,
  'anon cannot select from expenses'
);

select throws_ok(
  'insert into public.expenses (group_id, amount_minor, paid_by, split_type, expense_date, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', 1000, ''11111111-1111-1111-1111-111111111111'', ''equal'', current_date, ''11111111-1111-1111-1111-111111111111'')',
  '42501',
  null,
  'anon cannot insert into expenses'
);

select throws_ok(
  'update public.expenses set amount_minor = 2000',
  '42501',
  null,
  'anon cannot update expenses'
);

select throws_ok(
  'delete from public.expenses',
  '42501',
  null,
  'anon cannot delete from expenses'
);

select throws_ok(
  'select * from public.expense_splits',
  '42501',
  null,
  'anon cannot select from expense_splits'
);

select throws_ok(
  'insert into public.expense_splits (expense_id, user_id, share_minor) values (gen_random_uuid(), ''11111111-1111-1111-1111-111111111111'', 500)',
  '42501',
  null,
  'anon cannot insert into expense_splits'
);

select throws_ok(
  'update public.expense_splits set share_minor = 600',
  '42501',
  null,
  'anon cannot update expense_splits'
);

select throws_ok(
  'delete from public.expense_splits',
  '42501',
  null,
  'anon cannot delete from expense_splits'
);

select throws_ok(
  'select * from public.activity_log',
  '42501',
  null,
  'anon cannot select from activity_log'
);

select throws_ok(
  'insert into public.activity_log (group_id, actor_id, action) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''expense_added'')',
  '42501',
  null,
  'anon cannot insert into activity_log'
);

select throws_ok(
  'update public.activity_log set action = ''expense_edited''',
  '42501',
  null,
  'anon cannot update activity_log'
);

select throws_ok(
  'delete from public.activity_log',
  '42501',
  null,
  'anon cannot delete from activity_log'
);

-- -----------------------------------------------------------------------------
-- 2. Authenticated permissions: clients cannot SELECT, INSERT, UPDATE, DELETE (EZ1)
-- -----------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select throws_ok(
  'select * from public.expenses',
  '42501',
  null,
  'authenticated cannot select from expenses'
);

select throws_ok(
  'insert into public.expenses (group_id, amount_minor, paid_by, split_type, expense_date, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', 1000, ''11111111-1111-1111-1111-111111111111'', ''equal'', current_date, ''11111111-1111-1111-1111-111111111111'')',
  '42501',
  null,
  'authenticated cannot insert into expenses'
);

select throws_ok(
  'update public.expenses set amount_minor = 2000',
  '42501',
  null,
  'authenticated cannot update expenses'
);

select throws_ok(
  'delete from public.expenses',
  '42501',
  null,
  'authenticated cannot delete from expenses'
);

select throws_ok(
  'select * from public.expense_splits',
  '42501',
  null,
  'authenticated cannot select from expense_splits'
);

select throws_ok(
  'insert into public.expense_splits (expense_id, user_id, share_minor) values (gen_random_uuid(), ''11111111-1111-1111-1111-111111111111'', 500)',
  '42501',
  null,
  'authenticated cannot insert into expense_splits'
);

select throws_ok(
  'update public.expense_splits set share_minor = 600',
  '42501',
  null,
  'authenticated cannot update expense_splits'
);

select throws_ok(
  'delete from public.expense_splits',
  '42501',
  null,
  'authenticated cannot delete from expense_splits'
);

select throws_ok(
  'select * from public.activity_log',
  '42501',
  null,
  'authenticated cannot select from activity_log'
);

select throws_ok(
  'insert into public.activity_log (group_id, actor_id, action) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''expense_added'')',
  '42501',
  null,
  'authenticated cannot insert into activity_log'
);

select throws_ok(
  'update public.activity_log set action = ''expense_edited''',
  '42501',
  null,
  'authenticated cannot update activity_log'
);

select throws_ok(
  'delete from public.activity_log',
  '42501',
  null,
  'authenticated cannot delete from activity_log'
);

-- -----------------------------------------------------------------------------
-- 3. Constraint checks (run as postgres)
-- -----------------------------------------------------------------------------
set local role postgres;

-- Amount minor checks (1 to 1000000000)
select throws_ok(
  'insert into public.expenses (group_id, amount_minor, paid_by, split_type, expense_date, created_by)
   values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', 0, ''11111111-1111-1111-1111-111111111111'', ''equal'', current_date, ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'amount_minor = 0 rejected by check constraint'
);

select throws_ok(
  'insert into public.expenses (group_id, amount_minor, paid_by, split_type, expense_date, created_by)
   values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', -10, ''11111111-1111-1111-1111-111111111111'', ''equal'', current_date, ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'negative amount_minor rejected by check constraint'
);

select throws_ok(
  'insert into public.expenses (group_id, amount_minor, paid_by, split_type, expense_date, created_by)
   values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', 1000000001, ''11111111-1111-1111-1111-111111111111'', ''equal'', current_date, ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'amount_minor > 1000000000 rejected by check constraint'
);

-- Split type check
select throws_ok(
  'insert into public.expenses (group_id, amount_minor, paid_by, split_type, expense_date, created_by)
   values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', 1000, ''11111111-1111-1111-1111-111111111111'', ''shares'', current_date, ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'invalid split_type rejected by check constraint'
);

-- Currency check
select throws_ok(
  'insert into public.expenses (group_id, amount_minor, currency, paid_by, split_type, expense_date, created_by)
   values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', 1000, ''USD'', ''11111111-1111-1111-1111-111111111111'', ''equal'', current_date, ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'currency != INR rejected by check constraint'
);

-- Category check
select throws_ok(
  'insert into public.expenses (group_id, amount_minor, paid_by, split_type, category, expense_date, created_by)
   values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', 1000, ''11111111-1111-1111-1111-111111111111'', ''equal'', ''flights'', current_date, ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'invalid category rejected by check constraint'
);

-- Description length check (max 100)
select throws_ok(
  'insert into public.expenses (group_id, amount_minor, paid_by, split_type, description, expense_date, created_by)
   values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', 1000, ''11111111-1111-1111-1111-111111111111'', ''equal'', repeat(''a'', 101), current_date, ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'description > 100 characters rejected by check constraint'
);

-- Deleted pair check: both deleted_at and deleted_by must be set or both null
select throws_ok(
  'insert into public.expenses (group_id, amount_minor, paid_by, split_type, expense_date, created_by, deleted_at, deleted_by)
   values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', 1000, ''11111111-1111-1111-1111-111111111111'', ''equal'', current_date, ''11111111-1111-1111-1111-111111111111'', now(), null)',
  '23514',
  null,
  'deleted_at set with deleted_by null rejected by check constraint'
);

select throws_ok(
  'insert into public.expenses (group_id, amount_minor, paid_by, split_type, expense_date, created_by, deleted_at, deleted_by)
   values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', 1000, ''11111111-1111-1111-1111-111111111111'', ''equal'', current_date, ''11111111-1111-1111-1111-111111111111'', null, ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'deleted_by set with deleted_at null rejected by check constraint'
);

-- Unique client_request_id per creator
insert into public.expenses (id, group_id, amount_minor, paid_by, split_type, expense_date, created_by, client_request_id)
values ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1000, '11111111-1111-1111-1111-111111111111', 'equal', current_date, '11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999');

select throws_ok(
  'insert into public.expenses (group_id, amount_minor, paid_by, split_type, expense_date, created_by, client_request_id)
   values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', 2000, ''11111111-1111-1111-1111-111111111111'', ''equal'', current_date, ''11111111-1111-1111-1111-111111111111'', ''99999999-9999-9999-9999-999999999999'')',
  '23505',
  null,
  'duplicate (created_by, client_request_id) rejected by unique constraint'
);

-- expense_splits checks
select throws_ok(
  'insert into public.expense_splits (expense_id, user_id, share_minor)
   values (''11111111-0000-0000-0000-000000000001'', ''11111111-1111-1111-1111-111111111111'', -5)',
  '23514',
  null,
  'negative share_minor rejected by check constraint'
);

select throws_ok(
  'insert into public.expense_splits (expense_id, user_id, share_minor, percent_bp)
   values (''11111111-0000-0000-0000-000000000001'', ''11111111-1111-1111-1111-111111111111'', 500, 0)',
  '23514',
  null,
  'percent_bp = 0 rejected by check constraint'
);

select throws_ok(
  'insert into public.expense_splits (expense_id, user_id, share_minor, percent_bp)
   values (''11111111-0000-0000-0000-000000000001'', ''11111111-1111-1111-1111-111111111111'', 500, 10001)',
  '23514',
  null,
  'percent_bp = 10001 rejected by check constraint'
);

-- activity_log check
select throws_ok(
  'insert into public.activity_log (group_id, actor_id, action)
   values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''11111111-1111-1111-1111-111111111111'', ''unknown_action'')',
  '23514',
  null,
  'invalid action rejected by check constraint'
);

-- Clean up helper row for trigger tests
delete from public.expenses where id = '11111111-0000-0000-0000-000000000001';

-- -----------------------------------------------------------------------------
-- 4. Constraint trigger: shares must add up (EZ13)
-- -----------------------------------------------------------------------------

-- Expense with no splits (sum is 0, amount is 1000)
select throws_ok(
  'set constraints all immediate;
   insert into public.expenses (id, group_id, amount_minor, paid_by, split_type, expense_date, created_by)
   values (''22222222-0000-0000-0000-000000000002'', ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', 1000, ''11111111-1111-1111-1111-111111111111'', ''equal'', current_date, ''11111111-1111-1111-1111-111111111111'');',
  'P0001',
  'splits_dont_add_up',
  'trigger rejects expense with no splits when constraints checked'
);

-- Expense with splits summing to 999 instead of 1000
select throws_ok(
  'set constraints all immediate;
   insert into public.expenses (id, group_id, amount_minor, paid_by, split_type, expense_date, created_by)
   values (''33333333-0000-0000-0000-000000000003'', ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', 1000, ''11111111-1111-1111-1111-111111111111'', ''equal'', current_date, ''11111111-1111-1111-1111-111111111111'');
   insert into public.expense_splits (expense_id, user_id, share_minor)
   values
     (''33333333-0000-0000-0000-000000000003'', ''11111111-1111-1111-1111-111111111111'', 500),
     (''33333333-0000-0000-0000-000000000003'', ''22222222-2222-2222-2222-222222222222'', 499);',
  'P0001',
  'splits_dont_add_up',
  'trigger rejects splits summing to 999 for amount 1000'
);

-- Expense with splits summing to 1001 instead of 1000
select throws_ok(
  'set constraints all immediate;
   insert into public.expenses (id, group_id, amount_minor, paid_by, split_type, expense_date, created_by)
   values (''44444444-0000-0000-0000-000000000004'', ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', 1000, ''11111111-1111-1111-1111-111111111111'', ''equal'', current_date, ''11111111-1111-1111-1111-111111111111'');
   insert into public.expense_splits (expense_id, user_id, share_minor)
   values
     (''44444444-0000-0000-0000-000000000004'', ''11111111-1111-1111-1111-111111111111'', 500),
     (''44444444-0000-0000-0000-000000000004'', ''22222222-2222-2222-2222-222222222222'', 501);',
  'P0001',
  'splits_dont_add_up',
  'trigger rejects splits summing to 1001 for amount 1000'
);

-- Expense with exact matching splits succeeds
select lives_ok(
  'insert into public.expenses (id, group_id, amount_minor, paid_by, split_type, expense_date, created_by)
   values (''55555555-0000-0000-0000-000000000005'', ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', 1000, ''11111111-1111-1111-1111-111111111111'', ''equal'', current_date, ''11111111-1111-1111-1111-111111111111'');
   insert into public.expense_splits (expense_id, user_id, share_minor)
   values
     (''55555555-0000-0000-0000-000000000005'', ''11111111-1111-1111-1111-111111111111'', 500),
     (''55555555-0000-0000-0000-000000000005'', ''22222222-2222-2222-2222-222222222222'', 500);
   set constraints all immediate;',
  'expense with matching splits succeeds under deferred constraint check'
);

-- Updating amount_minor causing mismatch is rejected
select throws_ok(
  'update public.expenses set amount_minor = 1200 where id = ''55555555-0000-0000-0000-000000000005'';
   set constraints all immediate;',
  'P0001',
  'splits_dont_add_up',
  'updating amount_minor without updating splits is rejected by trigger'
);

-- Reset constraints back to deferred for subsequent operations
set constraints all deferred;

-- Reset back to 1000 for cascade tests
update public.expenses set amount_minor = 1000 where id = '55555555-0000-0000-0000-000000000005';
insert into public.activity_log (group_id, actor_id, action, ref_id)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'expense_added', '55555555-0000-0000-0000-000000000005');

-- -----------------------------------------------------------------------------
-- 5. Cascade delete on groups (EG4)
-- -----------------------------------------------------------------------------
-- Deleting the group must cascade to expenses, expense_splits, and activity_log
delete from public.groups where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select is(
  (select count(*)::int from public.expenses where id = '55555555-0000-0000-0000-000000000005'),
  0,
  'deleting group cascades to delete expenses'
);

select is(
  (select count(*)::int from public.expense_splits where expense_id = '55555555-0000-0000-0000-000000000005'),
  0,
  'deleting group cascades to delete expense_splits'
);

select is(
  (select count(*)::int from public.activity_log where group_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'deleting group cascades to delete activity_log'
);

-- -----------------------------------------------------------------------------
-- 6. No cascade on profiles (FK failure proves no cascade - smart delete rule)
-- -----------------------------------------------------------------------------
-- Setup fresh group and expense referencing user 1 and user 2
insert into public.groups (id, name, currency, created_by)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'FK Test Group', 'INR', '11111111-1111-1111-1111-111111111111');

insert into public.group_members (group_id, user_id, role, status)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'admin', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'member', 'active');

insert into public.expenses (id, group_id, amount_minor, paid_by, split_type, expense_date, created_by)
values ('66666666-0000-0000-0000-000000000006', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1000, '11111111-1111-1111-1111-111111111111', 'equal', current_date, '11111111-1111-1111-1111-111111111111');

insert into public.expense_splits (expense_id, user_id, share_minor)
values
  ('66666666-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 500),
  ('66666666-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', 500);

insert into public.activity_log (group_id, actor_id, action, ref_id)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'expense_added', '66666666-0000-0000-0000-000000000006');

-- Deleting profile referenced by paid_by / created_by in expenses must fail with foreign_key_violation (23503)
select throws_ok(
  'delete from public.profiles where id = ''11111111-1111-1111-1111-111111111111''',
  '23503',
  null,
  'deleting profile referenced as paid_by / created_by in expenses fails (no cascade)'
);

-- Deleting profile referenced by expense_splits must fail with foreign_key_violation (23503)
select throws_ok(
  'delete from public.profiles where id = ''22222222-2222-2222-2222-222222222222''',
  '23503',
  null,
  'deleting profile referenced in expense_splits fails (no cascade)'
);

rollback;
