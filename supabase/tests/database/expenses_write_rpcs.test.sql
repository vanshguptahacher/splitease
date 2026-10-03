begin;
select plan(55);

-- =============================================================================
-- Setup fixtures (as postgres)
-- =============================================================================
set local role postgres;

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'admin@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'creator@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'othermember@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'outsider@example.com')
on conflict (id) do nothing;

insert into public.groups (id, name, created_by)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Trip Group', '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

insert into public.group_members (group_id, user_id, role, status)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'admin', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'member', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'member', 'active')
on conflict (group_id, user_id) do nothing;

-- =============================================================================
-- 1. Anonymous callers rejected (permission denied 42501)
-- =============================================================================
set local role anon;

select throws_ok(
  $$select public.add_expense('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), 'Dinner', 120000, '22222222-2222-2222-2222-222222222222', 'equal', '[{"user_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb, 'food', current_date)$$,
  '42501',
  null,
  '1: anon cannot call add_expense (permission denied)'
);

select throws_ok(
  $$select public.edit_expense(gen_random_uuid(), 1, 'Dinner', 120000, '22222222-2222-2222-2222-222222222222', 'equal', '[{"user_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb, 'food', current_date)$$,
  '42501',
  null,
  '2: anon cannot call edit_expense (permission denied)'
);

select throws_ok(
  $$select public.delete_expense(gen_random_uuid())$$,
  '42501',
  null,
  '3: anon cannot call delete_expense (permission denied)'
);

select throws_ok(
  $$select public.restore_expense(gen_random_uuid())$$,
  '42501',
  null,
  '4: anon cannot call restore_expense (permission denied)'
);

select throws_ok(
  $$select public.expense_is_locked(gen_random_uuid())$$,
  '42501',
  null,
  '5: anon cannot call expense_is_locked (helper is private)'
);

-- =============================================================================
-- 2. Non-member callers rejected (EZ3, EA9)
-- =============================================================================
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}';

select throws_ok(
  $$select public.add_expense('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), 'Dinner', 120000, '44444444-4444-4444-4444-444444444444', 'equal', '[{"user_id":"44444444-4444-4444-4444-444444444444"}]'::jsonb, 'food', current_date)$$,
  'not_a_member',
  '6: outsider rejected on add_expense with not_a_member'
);

select throws_ok(
  $$select public.expense_is_locked(gen_random_uuid())$$,
  '42501',
  null,
  '7: authenticated caller cannot call expense_is_locked (private helper)'
);

-- =============================================================================
-- 3. Validations in add_expense (EZ8-EZ12, Section 5 errors)
-- =============================================================================
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

-- Amount validation
select throws_ok(
  $$select public.add_expense('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), 'Test', 0, '22222222-2222-2222-2222-222222222222', 'equal', '[{"user_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb, 'food', current_date)$$,
  'invalid_amount',
  '8: amount < 1 paisa rejected with invalid_amount'
);

select throws_ok(
  $$select public.add_expense('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), 'Test', 1000000001, '22222222-2222-2222-2222-222222222222', 'equal', '[{"user_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb, 'food', current_date)$$,
  'invalid_amount',
  '9: amount > 1 crore paise rejected with invalid_amount'
);

-- Description validation
select throws_ok(
  $$select public.add_expense('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), repeat('a', 101), 10000, '22222222-2222-2222-2222-222222222222', 'equal', '[{"user_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb, 'food', current_date)$$,
  'invalid_description',
  '10: description > 100 characters rejected with invalid_description'
);

-- Category validation
select throws_ok(
  $$select public.add_expense('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), 'Test', 10000, '22222222-2222-2222-2222-222222222222', 'equal', '[{"user_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb, 'invalid_cat', current_date)$$,
  'invalid_category',
  '11: unknown category rejected with invalid_category'
);

-- Date validation
select throws_ok(
  $$select public.add_expense('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), 'Test', 10000, '22222222-2222-2222-2222-222222222222', 'equal', '[{"user_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb, 'food', current_date + 2)$$,
  'invalid_date',
  '12: date > tomorrow rejected with invalid_date'
);

select throws_ok(
  $$select public.add_expense('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), 'Test', 10000, '22222222-2222-2222-2222-222222222222', 'equal', '[{"user_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb, 'food', current_date - 3651)$$,
  'invalid_date',
  '13: date older than 10 years rejected with invalid_date'
);

-- Split type validation
select throws_ok(
  $$select public.add_expense('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), 'Test', 10000, '22222222-2222-2222-2222-222222222222', 'magic', '[{"user_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb, 'food', current_date)$$,
  'invalid_split_type',
  '14: invalid split type rejected with invalid_split_type'
);

-- Payer membership validation
select throws_ok(
  $$select public.add_expense('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), 'Test', 10000, '44444444-4444-4444-4444-444444444444', 'equal', '[{"user_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb, 'food', current_date)$$,
  'payer_not_member',
  '15: non-member payer rejected with payer_not_member'
);

-- Participant membership validation
select throws_ok(
  $$select public.add_expense('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), 'Test', 10000, '22222222-2222-2222-2222-222222222222', 'equal', '[{"user_id":"44444444-4444-4444-4444-444444444444"}]'::jsonb, 'food', current_date)$$,
  'participant_not_member',
  '16: non-member participant rejected with participant_not_member'
);

-- Participant validations from compute_shares
select throws_ok(
  $$select public.add_expense('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), 'Test', 10000, '22222222-2222-2222-2222-222222222222', 'equal', '[]'::jsonb, 'food', current_date)$$,
  'no_participants',
  '17: empty participants rejected with no_participants'
);

select throws_ok(
  $$select public.add_expense('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), 'Test', 10000, '22222222-2222-2222-2222-222222222222', 'equal', '[{"user_id":"22222222-2222-2222-2222-222222222222"},{"user_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb, 'food', current_date)$$,
  'duplicate_participant',
  '18: duplicate participant rejected with duplicate_participant'
);

select throws_ok(
  $$select public.add_expense('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), 'Test', 10000, '22222222-2222-2222-2222-222222222222', 'exact', '[{"user_id":"22222222-2222-2222-2222-222222222222","value":9999}]'::jsonb, 'food', current_date)$$,
  'splits_dont_add_up',
  '19: exact shares not adding up rejected with splits_dont_add_up'
);

select throws_ok(
  $$select public.add_expense('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), 'Test', 10000, '22222222-2222-2222-2222-222222222222', 'exact', '[{"user_id":"22222222-2222-2222-2222-222222222222","value":0}]'::jsonb, 'food', current_date)$$,
  'invalid_split_value',
  '20: exact share of 0 rejected with invalid_split_value'
);

select throws_ok(
  $$select public.add_expense('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), 'Test', 10000, '22222222-2222-2222-2222-222222222222', 'percent', '[{"user_id":"22222222-2222-2222-2222-222222222222","value":9999}]'::jsonb, 'food', current_date)$$,
  'splits_dont_add_up',
  '21: percent bp not adding to 10000 rejected with splits_dont_add_up'
);

select throws_ok(
  $$select public.add_expense('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', gen_random_uuid(), 'Test', 10000, '22222222-2222-2222-2222-222222222222', 'percent', '[{"user_id":"22222222-2222-2222-2222-222222222222","value":10001}]'::jsonb, 'food', current_date)$$,
  'invalid_split_value',
  '22: percent bp > 10000 rejected with invalid_split_value'
);

-- =============================================================================
-- 4. Successful add_expense & Activity Log (EA1, EQ1, EV1)
-- =============================================================================
select public.add_expense(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-1111-1111-1111-111111111111',
  E'  Dinner at Goa\n\t  ',
  10000, -- ₹100.00
  '22222222-2222-2222-2222-222222222222',
  'equal',
  '[{"user_id":"11111111-1111-1111-1111-111111111111"},{"user_id":"22222222-2222-2222-2222-222222222222"},{"user_id":"33333333-3333-3333-3333-333333333333"}]'::jsonb,
  'food',
  current_date
) as test_exp_id \gset

-- Switch to postgres to inspect table states (since authenticated has no select)
set local role postgres;

select isnt_empty(
  format('select 1 from public.expenses where id = ''%s'' and description = ''Dinner at Goa'' and amount_minor = 10000 and version = 1', :'test_exp_id'),
  '23: Expense created with cleaned description and version 1'
);

-- Verify splits sum equals amount
select results_eq(
  format('select sum(share_minor)::bigint from public.expense_splits where expense_id = ''%s''', :'test_exp_id'),
  $$values (10000::bigint)$$,
  '24: Expense splits sum exactly equals 10000 paise'
);

-- Verify activity log entry written
select results_eq(
  format('select action, (details->>''amount_minor'')::bigint from public.activity_log where ref_id = ''%s''', :'test_exp_id'),
  $$values ('expense_added'::text, 10000::bigint)$$,
  '25: Activity log entry created with expense_added and amount details'
);

-- =============================================================================
-- 5. Idempotency (EA6, EA7, EZ14)
-- =============================================================================
-- Re-submitting the exact same request id from the same user returns the existing expense
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select results_eq(
  format($$select public.add_expense(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-1111-1111-1111-111111111111',
    'Dinner at Goa',
    10000,
    '22222222-2222-2222-2222-222222222222',
    'equal',
    '[{"user_id":"11111111-1111-1111-1111-111111111111"},{"user_id":"22222222-2222-2222-2222-222222222222"},{"user_id":"33333333-3333-3333-3333-333333333333"}]'::jsonb,
    'food',
    current_date
  )$$),
  format($$values ('%s'::uuid)$$, :'test_exp_id'),
  '26: Duplicate add_expense returns the existing expense id (idempotent)'
);

set local role postgres;

-- Verify only ONE expense and ONE activity log entry exists for this request
select results_eq(
  format('select count(*)::int from public.expenses where client_request_id = ''bbbbbbbb-1111-1111-1111-111111111111'''),
  $$values (1)$$,
  '27: Exactly 1 expense row exists after duplicate add request'
);

select results_eq(
  format('select count(*)::int from public.activity_log where ref_id = ''%s''', :'test_exp_id'),
  $$values (1)$$,
  '28: Exactly 1 activity log entry exists after duplicate add request'
);

-- =============================================================================
-- 6. Permissions on edit_expense (EE1, EE2, EE3, EZ4)
-- =============================================================================
-- Member (non-creator, non-admin) tries to edit: rejected with not_allowed
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

select throws_ok(
  format($$select public.edit_expense(
    '%s',
    1,
    'Dinner edited by other member',
    12000,
    '22222222-2222-2222-2222-222222222222',
    'equal',
    '[{"user_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb,
    'food',
    current_date
  )$$, :'test_exp_id'),
  'not_allowed',
  '29: Non-creator member cannot edit expense (not_allowed)'
);

-- Creator edits their own expense: allowed, bumps version to 2
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select results_eq(
  format($$select public.edit_expense(
    '%s',
    1,
    'Dinner at Goa (Updated)',
    15000,
    '22222222-2222-2222-2222-222222222222',
    'equal',
    '[{"user_id":"11111111-1111-1111-1111-111111111111"},{"user_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb,
    'food',
    current_date
  )$$, :'test_exp_id'),
  $$values (2)$$,
  '30: Creator edits own expense successfully, new version is 2'
);

set local role postgres;

-- Verify activity log entry for edit
select results_eq(
  format('select action, (details->>''amount_minor'')::bigint, (details->>''old_amount_minor'')::bigint from public.activity_log where ref_id = ''%s'' order by id desc limit 1', :'test_exp_id'),
  $$values ('expense_edited'::text, 15000::bigint, 10000::bigint)$$,
  '31: Activity log reflects expense_edited with old and new amounts'
);

-- Admin edits someone else's expense: allowed, bumps version to 3
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select results_eq(
  format($$select public.edit_expense(
    '%s',
    2,
    'Dinner at Goa (Admin Edit)',
    15000,
    '22222222-2222-2222-2222-222222222222',
    'equal',
    '[{"user_id":"11111111-1111-1111-1111-111111111111"},{"user_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb,
    'food',
    current_date
  )$$, :'test_exp_id'),
  $$values (3)$$,
  '32: Admin edits expense successfully, new version is 3'
);

-- =============================================================================
-- 7. Version conflict / Optimistic concurrency (EE4)
-- =============================================================================
select throws_ok(
  format($$select public.edit_expense(
    '%s',
    2, -- Stale version (current is 3)
    'Stale edit attempt',
    15000,
    '22222222-2222-2222-2222-222222222222',
    'equal',
    '[{"user_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb,
    'food',
    current_date
  )$$, :'test_exp_id'),
  'expense_changed',
  '33: Stale expected_version rejected with expense_changed'
);

-- =============================================================================
-- 8. Atomic split replacement on edit (EE7)
-- =============================================================================
-- Change from equal to percent split
select results_eq(
  format($$select public.edit_expense(
    '%s',
    3,
    'Dinner Percent Split',
    20000,
    '22222222-2222-2222-2222-222222222222',
    'percent',
    '[{"user_id":"11111111-1111-1111-1111-111111111111","value":7500},{"user_id":"22222222-2222-2222-2222-222222222222","value":2500}]'::jsonb,
    'food',
    current_date
  )$$, :'test_exp_id'),
  $$values (4)$$,
  '34: Edit replacing split type to percent succeeds, version is 4'
);

set local role postgres;

select results_eq(
  format('select user_id, share_minor, percent_bp from public.expense_splits where expense_id = ''%s'' order by user_id', :'test_exp_id'),
  $$values
    ('11111111-1111-1111-1111-111111111111'::uuid, 15000::bigint, 7500::integer),
    ('22222222-2222-2222-2222-222222222222'::uuid, 5000::bigint, 2500::integer)$$,
  '35: Splits atomically replaced with new percentage shares'
);

-- =============================================================================
-- 9. Permissions & Behavior on delete_expense (ED1-ED3, ED7)
-- =============================================================================
-- Non-creator member tries to delete: rejected with not_allowed
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

select throws_ok(
  format('select public.delete_expense(''%s'')', :'test_exp_id'),
  'not_allowed',
  '36: Non-creator member cannot delete expense (not_allowed)'
);

-- Creator deletes their own expense: allowed
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select lives_ok(
  format('select public.delete_expense(''%s'')', :'test_exp_id'),
  '37: Creator deletes own expense successfully'
);

set local role postgres;

-- Check soft delete fields
select results_eq(
  format('select deleted_by, (deleted_at is not null), version from public.expenses where id = ''%s''', :'test_exp_id'),
  $$values ('22222222-2222-2222-2222-222222222222'::uuid, true, 5)$$,
  '38: Expense marked deleted with deleted_by and version bumped to 5'
);

-- Check activity log entry for deletion
select results_eq(
  format('select action from public.activity_log where ref_id = ''%s'' order by id desc limit 1', :'test_exp_id'),
  $$values ('expense_deleted'::text)$$,
  '39: Activity log reflects expense_deleted'
);

-- Idempotent delete (double tap): silent no-op (no extra log, no version bump)
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select lives_ok(
  format('select public.delete_expense(''%s'')', :'test_exp_id'),
  '40: Second delete_expense call succeeds silently (no-op)'
);

set local role postgres;

select results_eq(
  format('select version from public.expenses where id = ''%s''', :'test_exp_id'),
  $$values (5)$$,
  '41: Version remains 5 after duplicate delete'
);

select results_eq(
  format('select count(*)::int from public.activity_log where ref_id = ''%s'' and action = ''expense_deleted''', :'test_exp_id'),
  $$values (1)$$,
  '42: Exactly 1 expense_deleted activity log entry exists after duplicate delete'
);

-- Edit on deleted expense rejected with expense_not_found
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select throws_ok(
  format($$select public.edit_expense(
    '%s',
    5,
    'Attempt to edit deleted',
    20000,
    '22222222-2222-2222-2222-222222222222',
    'equal',
    '[{"user_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb,
    'food',
    current_date
  )$$, :'test_exp_id'),
  'expense_not_found',
  '43: Editing deleted expense rejected with expense_not_found'
);

-- =============================================================================
-- 10. Permissions & Behavior on restore_expense (ED4, ED5)
-- =============================================================================
-- Non-creator member tries to restore: rejected with not_allowed
set local "request.jwt.claims" to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

select throws_ok(
  format('select public.restore_expense(''%s'')', :'test_exp_id'),
  'not_allowed',
  '44: Non-creator member cannot restore expense (not_allowed)'
);

-- Admin restores the expense: allowed
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select lives_ok(
  format('select public.restore_expense(''%s'')', :'test_exp_id'),
  '45: Admin restores expense successfully'
);

set local role postgres;

-- Check soft delete fields cleared and version bumped
select results_eq(
  format('select deleted_by is null, deleted_at is null, version from public.expenses where id = ''%s''', :'test_exp_id'),
  $$values (true, true, 6)$$,
  '46: Expense restored: deleted fields cleared and version bumped to 6'
);

-- Check activity log entry for restore
select results_eq(
  format('select action from public.activity_log where ref_id = ''%s'' order by id desc limit 1', :'test_exp_id'),
  $$values ('expense_restored'::text)$$,
  '47: Activity log reflects expense_restored'
);

-- Duplicate restore: silent no-op
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select lives_ok(
  format('select public.restore_expense(''%s'')', :'test_exp_id'),
  '48: Second restore_expense call succeeds silently (no-op)'
);

set local role postgres;

select results_eq(
  format('select version from public.expenses where id = ''%s''', :'test_exp_id'),
  $$values (6)$$,
  '49: Version remains 6 after duplicate restore'
);

-- =============================================================================
-- 11. Locked Expenses (D15, EE8, EE12, ED6, EG3, EG7)
-- =============================================================================
-- Member 11111111-1111-1111-1111-111111111111 leaves group -> status becomes 'left'
set local role postgres;
update public.group_members
   set status = 'left', left_at = now()
 where group_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   and user_id = '11111111-1111-1111-1111-111111111111';

-- Now the expense involves user 1 who left -> expense is locked!
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

-- Edit locked expense rejected
select throws_ok(
  format($$select public.edit_expense(
    '%s',
    6,
    'Edit locked',
    20000,
    '22222222-2222-2222-2222-222222222222',
    'equal',
    '[{"user_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb,
    'food',
    current_date
  )$$, :'test_exp_id'),
  'expense_locked',
  '50: Editing a locked expense is blocked with expense_locked'
);

-- Delete locked expense rejected
select throws_ok(
  format('select public.delete_expense(''%s'')', :'test_exp_id'),
  'expense_locked',
  '51: Deleting a locked expense is blocked with expense_locked'
);

-- Member rejoins group -> lock automatically lifts! (EE12, EG7)
set local role postgres;
update public.group_members
   set status = 'active', left_at = null
 where group_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   and user_id = '11111111-1111-1111-1111-111111111111';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

-- Edit works again after member rejoins
select results_eq(
  format($$select public.edit_expense(
    '%s',
    6,
    'Unlocked and edited',
    20000,
    '22222222-2222-2222-2222-222222222222',
    'equal',
    '[{"user_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb,
    'food',
    current_date
  )$$, :'test_exp_id'),
  $$values (7)$$,
  '52: After member rejoins, expense automatically unlocks and edit succeeds'
);

-- =============================================================================
-- 12. Non-existent expense rejected with expense_not_found
-- =============================================================================
select throws_ok(
  $$select public.edit_expense(
    '99999999-9999-9999-9999-999999999999',
    1,
    'Not found',
    10000,
    '22222222-2222-2222-2222-222222222222',
    'equal',
    '[{"user_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb,
    'food',
    current_date
  )$$,
  'expense_not_found',
  '53: edit_expense on non-existent id rejected with expense_not_found'
);

select throws_ok(
  $$select public.delete_expense('99999999-9999-9999-9999-999999999999')$$,
  'expense_not_found',
  '54: delete_expense on non-existent id rejected with expense_not_found'
);

select throws_ok(
  $$select public.restore_expense('99999999-9999-9999-9999-999999999999')$$,
  'expense_not_found',
  '55: restore_expense on non-existent id rejected with expense_not_found'
);

select * from finish();
rollback;
