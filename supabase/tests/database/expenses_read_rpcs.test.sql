begin;
select plan(42);

-- =============================================================================
-- Setup fixtures (as postgres)
-- =============================================================================
set local role postgres;

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'admin@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'payer@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'participant@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'uninvolved@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'outsider@example.com'),
  ('66666666-6666-6666-6666-666666666666', 'deletedactor@example.com')
on conflict (id) do nothing;

update public.profiles set name = 'Admin Alice' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set name = 'Payer Bob' where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set name = 'Participant Carol' where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set name = 'Uninvolved Dave' where id = '44444444-4444-4444-4444-444444444444';
update public.profiles set name = 'Deleted user', deleted_at = now() where id = '66666666-6666-6666-6666-666666666666';

-- Group A
insert into public.groups (id, name, created_by)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Read Test Group A', '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

insert into public.group_members (group_id, user_id, role, status, joined_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'admin', 'active', now() - interval '10 days'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'member', 'active', now() - interval '9 days'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'member', 'active', now() - interval '8 days'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'member', 'active', now() - interval '7 days')
on conflict (group_id, user_id) do nothing;

-- Group B (User 2 is in, but then leaves)
insert into public.groups (id, name, created_by)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Read Test Group B', '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

insert into public.group_members (group_id, user_id, role, status, joined_at, left_at)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'admin', 'active', now() - interval '5 days', null),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'member', 'left', now() - interval '4 days', now() - interval '1 hour')
on conflict (group_id, user_id) do nothing;

-- Add expenses to Group A
-- Expense 1: ₹120.00 (12000 paise). Paid by Bob (2). Split equally between Bob (2) and Carol (3). Dave (4) not involved.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select public.add_expense(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  gen_random_uuid(),
  'Dinner in Margao',
  12000, -- ₹120.00
  '22222222-2222-2222-2222-222222222222',
  'equal',
  '[{"user_id":"22222222-2222-2222-2222-222222222222"},{"user_id":"33333333-3333-3333-3333-333333333333"}]'::jsonb,
  'food',
  current_date
) as exp1_id \gset

-- Expense 2: ₹60.00 (6000 paise). Paid by Admin Alice (1). Split percent: Bob 50%, Carol 50%.
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select public.add_expense(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  gen_random_uuid(),
  'Taxi to Beach',
  6000,
  '11111111-1111-1111-1111-111111111111',
  'percent',
  '[{"user_id":"22222222-2222-2222-2222-222222222222","value":5000},{"user_id":"33333333-3333-3333-3333-333333333333","value":5000}]'::jsonb,
  'travel',
  current_date - 1
) as exp2_id \gset

-- Expense 3: Soft-deleted expense
select public.add_expense(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  gen_random_uuid(),
  'Old Groceries',
  5000,
  '11111111-1111-1111-1111-111111111111',
  'equal',
  '[{"user_id":"11111111-1111-1111-1111-111111111111"},{"user_id":"22222222-2222-2222-2222-222222222222"}]'::jsonb,
  'groceries',
  current_date - 2
) as exp3_id \gset

select public.delete_expense(:'exp3_id');

-- =============================================================================
-- 1. Anonymous Access Rejected (EZ1, EZ2)
-- =============================================================================
set local role anon;

select throws_ok(
  $$select * from public.list_expenses('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  '42501',
  null,
  '1: anon cannot execute list_expenses (permission denied)'
);

select throws_ok(
  format('select public.get_expense(''%s'')', :'exp1_id'),
  '42501',
  null,
  '2: anon cannot execute get_expense (permission denied)'
);

select throws_ok(
  $$select * from public.list_activity()$$,
  '42501',
  null,
  '3: anon cannot execute list_activity (permission denied)'
);

-- =============================================================================
-- 2. Non-member Access Rejected (EZ3, EG5)
-- =============================================================================
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "55555555-5555-5555-5555-555555555555", "role": "authenticated"}';

select throws_ok(
  $$select * from public.list_expenses('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'not_a_member',
  '4: outsider rejected on list_expenses with not_a_member'
);

select throws_ok(
  format('select public.get_expense(''%s'')', :'exp1_id'),
  'not_a_member',
  '5: outsider rejected on get_expense with not_a_member'
);

-- Outsider gets empty activity feed
select is_empty(
  $$select 1 from public.list_activity()$$,
  '6: outsider receives empty activity feed (no active groups)'
);

-- =============================================================================
-- 3. list_expenses: my_net_minor calculations (UX Rule 4, Case EL2)
-- =============================================================================
-- Case A: Payer & Participant (Bob on Expense 1: Paid 12000, Share 6000 -> Net +6000)
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select results_eq(
  format('select my_share_minor, my_net_minor from public.list_expenses(''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'') where id = ''%s''', :'exp1_id'),
  $$values (6000::bigint, 6000::bigint)$$,
  '7: Payer & participant sees positive net minor (you lent: 12000 paid - 6000 share = +6000)'
);

-- Case B: Participant only (Carol on Expense 1: Paid 0, Share 6000 -> Net -6000)
set local "request.jwt.claims" to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

select results_eq(
  format('select my_share_minor, my_net_minor from public.list_expenses(''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'') where id = ''%s''', :'exp1_id'),
  $$values (6000::bigint, -6000::bigint)$$,
  '8: Participant only sees negative net minor (you owe: 0 paid - 6000 share = -6000)'
);

-- Case C: Non-involved member (Dave on Expense 1: Paid 0, Share 0 -> Net 0)
set local "request.jwt.claims" to '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}';

select results_eq(
  format('select my_share_minor, my_net_minor from public.list_expenses(''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'') where id = ''%s''', :'exp1_id'),
  $$values (0::bigint, 0::bigint)$$,
  '9: Uninvolved member sees zero share and zero net minor (not involved)'
);

-- Case D: Payer only, not in split (Alice on Expense 2: Paid 6000, Share 0 -> Net +6000)
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select results_eq(
  format('select my_share_minor, my_net_minor from public.list_expenses(''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'') where id = ''%s''', :'exp2_id'),
  $$values (0::bigint, 6000::bigint)$$,
  '10: Payer not in split sees positive net minor equal to full amount paid'
);

-- =============================================================================
-- 4. list_expenses: Soft-deleted expenses omitted (ED9)
-- =============================================================================
select is_empty(
  format('select 1 from public.list_expenses(''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'') where id = ''%s''', :'exp3_id'),
  '11: Soft-deleted expense 3 does not appear in list_expenses'
);

-- =============================================================================
-- 5. list_expenses: can_edit & is_locked columns
-- =============================================================================
-- Creator (Bob) can_edit expense 1
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select results_eq(
  format('select can_edit, is_locked from public.list_expenses(''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'') where id = ''%s''', :'exp1_id'),
  $$values (true, false)$$,
  '12: Creator Bob can_edit expense 1 and is_locked is false'
);

-- Other member (Carol) cannot edit expense 1
set local "request.jwt.claims" to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

select results_eq(
  format('select can_edit from public.list_expenses(''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'') where id = ''%s''', :'exp1_id'),
  $$values (false)$$,
  '13: Non-creator, non-admin Carol cannot edit expense 1 (can_edit is false)'
);

-- Admin (Alice) can_edit expense 1
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select results_eq(
  format('select can_edit from public.list_expenses(''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'') where id = ''%s''', :'exp1_id'),
  $$values (true)$$,
  '14: Admin Alice can_edit expense 1 even though Bob created it'
);

-- Participant Carol leaves -> is_locked becomes true
set local role postgres;
update public.group_members
   set status = 'left', left_at = now()
 where group_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   and user_id = '33333333-3333-3333-3333-333333333333';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select results_eq(
  format('select is_locked from public.list_expenses(''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'') where id = ''%s''', :'exp1_id'),
  $$values (true)$$,
  '15: is_locked is true in list_expenses when participant Carol has left group'
);

-- Rejoin Carol
set local role postgres;
update public.group_members
   set status = 'active', left_at = null
 where group_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   and user_id = '33333333-3333-3333-3333-333333333333';

set local role authenticated;

-- =============================================================================
-- 6. list_expenses: Keyset Pagination (EL1, EL6)
-- =============================================================================
-- Page 1: limit 1
select next_cursor::text as p1_next_cursor from public.list_expenses('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, null) limit 1 \gset

select isnt(
  :'p1_next_cursor'::text,
  null::text,
  '16: Page 1 returns valid next_cursor'
);

-- Page 2: pass p1_next_cursor
select id::text as p2_id from public.list_expenses('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, :'p1_next_cursor'::jsonb) limit 1 \gset

select is(
  :'p2_id'::uuid,
  :'exp2_id'::uuid,
  '17: Page 2 returns second expense without duplication or gap'
);

-- =============================================================================
-- 7. get_expense: Comprehensive Detail (EL7)
-- =============================================================================
-- Valid call on active expense as Carol (non-creator member)
set local "request.jwt.claims" to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';
select public.get_expense(:'exp1_id') as detail_json \gset

select is(
  (:'detail_json'::jsonb -> 'expense' ->> 'id')::uuid,
  :'exp1_id'::uuid,
  '18: get_expense returns correct expense id'
);

select is(
  (:'detail_json'::jsonb -> 'expense' ->> 'amount_minor')::bigint,
  12000::bigint,
  '19: get_expense returns correct amount_minor'
);

select is(
  jsonb_array_length(:'detail_json'::jsonb -> 'splits'),
  2,
  '20: get_expense returns exactly 2 splits'
);

select is(
  (:'detail_json'::jsonb ->> 'is_locked')::boolean,
  false,
  '21: get_expense reports is_locked = false'
);

select is(
  (:'detail_json'::jsonb ->> 'can_edit')::boolean,
  false,
  '22: Carol cannot edit expense 1 (can_edit = false)'
);

select is(
  (:'detail_json'::jsonb ->> 'can_restore')::boolean,
  false,
  '23: Non-deleted expense has can_restore = false'
);

-- Detail on deleted expense (exp3)
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select public.get_expense(:'exp3_id') as del_json \gset

select isnt(
  :'del_json'::jsonb -> 'expense' ->> 'deleted_at',
  null,
  '24: get_expense on deleted expense returns non-null deleted_at'
);

select is(
  (:'del_json'::jsonb ->> 'can_restore')::boolean,
  true,
  '25: Admin has can_restore = true on deleted expense'
);

select is(
  (:'del_json'::jsonb ->> 'can_edit')::boolean,
  false,
  '26: Deleted expense has can_edit = false'
);

-- Non-existent expense
select throws_ok(
  $$select public.get_expense('99999999-9999-9999-9999-999999999999')$$,
  'expense_not_found',
  '27: get_expense throws expense_not_found for unknown id'
);

-- =============================================================================
-- 8. list_activity: Feed and Security (EV1-EV9)
-- =============================================================================
-- Alice (admin in group A and B) lists activity
select count(*)::int from public.list_activity() \gset act_alice_

select cmp_ok(
  :'act_alice_count'::int,
  '>=',
  3,
  '28: Alice sees activity entries from active groups'
);

-- Actor name is resolved without exposing email or UPI ID
select results_eq(
  format('select actor_name from public.list_activity() where ref_id = ''%s'' limit 1', :'exp1_id'),
  $$values ('Payer Bob'::text)$$,
  '29: list_activity resolves actor name correctly'
);

-- Add an activity entry with deleted actor
set local role postgres;
insert into public.activity_log (group_id, actor_id, action, ref_id, details)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', 'expense_added', :'exp1_id', '{}'::jsonb);

set local role authenticated;
select results_eq(
  format('select actor_name from public.list_activity() where actor_id = ''66666666-6666-6666-6666-666666666666'' limit 1'),
  $$values ('Deleted user'::text)$$,
  '30: Activity entry for deleted user displays "Deleted user"'
);

-- Verify activity from group B is hidden for Bob (who left group B) (EV6)
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

-- Add activity entry to Group B
set local role postgres;
insert into public.activity_log (group_id, actor_id, action, ref_id, details)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'expense_added', gen_random_uuid(), '{}'::jsonb);

set local role authenticated;
select is_empty(
  $$select 1 from public.list_activity() where group_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  '31: Activity from group B is hidden from Bob because Bob left group B'
);

-- Keyset pagination on activity feed
select next_cursor::text as act_p1_next_cursor from public.list_activity(2, null) limit 1 \gset

select isnt(
  :'act_p1_next_cursor'::text,
  null::text,
  '32: list_activity returns valid next_cursor'
);

select count(*)::int as act_p2_count from public.list_activity(2, :'act_p1_next_cursor'::jsonb) \gset

select cmp_ok(
  :'act_p2_count'::int,
  '>=',
  1,
  '33: list_activity keyset pagination returns next page'
);

-- =============================================================================
-- 9. list_my_groups upgrade: last_activity_at & Ordering (EG1)
-- =============================================================================
-- Alice lists my groups
-- Group A had recent activity today; Group B had activity earlier
select results_eq(
  $$select group_id from public.list_my_groups() limit 1$$,
  $$values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)$$,
  '34: list_my_groups orders group A first due to recent expense activity'
);

select isnt_empty(
  $$select 1 from public.list_my_groups() where group_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and last_activity_at is not null$$,
  '35: list_my_groups returns non-null last_activity_at'
);

-- Bob only in group A (since he left group B)
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select results_eq(
  $$select count(*)::int from public.list_my_groups()$$,
  $$values (1)$$,
  '36: Bob sees only 1 active group'
);

-- =============================================================================
-- 10. Privacy & Sanitization: No Emails or UPI IDs Exposed
-- =============================================================================
-- Verify get_expense activity items do not expose email/upi
select is(
  (:'detail_json'::jsonb -> 'activity' -> 0 ? 'email'),
  false,
  '37: get_expense activity entries do not contain email'
);

select is(
  (:'detail_json'::jsonb -> 'activity' -> 0 ? 'upi_id'),
  false,
  '38: get_expense activity entries do not contain upi_id'
);

-- Verify list_activity columns do not expose email/upi
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select is_empty(
  $$select 1 from public.list_activity() where details ? 'email' or details ? 'upi_id'$$,
  '39: list_activity details never contain email or upi_id'
);

-- Verify participant_count in list_expenses
select results_eq(
  format('select participant_count from public.list_expenses(''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'') where id = ''%s''', :'exp1_id'),
  $$values (2::bigint)$$,
  '40: list_expenses returns participant_count = 2'
);

select results_eq(
  format('select participant_count from public.list_expenses(''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'') where id = ''%s''', :'exp2_id'),
  $$values (2::bigint)$$,
  '41: list_expenses returns participant_count = 2 for percent split'
);

-- Verify list_expenses returns description & category cleanly
select results_eq(
  format('select description, category from public.list_expenses(''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'') where id = ''%s''', :'exp1_id'),
  $$values ('Dinner in Margao'::text, 'food'::text)$$,
  '42: list_expenses returns accurate description and category'
);

select * from finish();
rollback;
