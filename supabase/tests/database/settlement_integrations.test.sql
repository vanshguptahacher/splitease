begin;
select plan(37);

-- =============================================================================
-- Setup test fixtures (as postgres)
-- =============================================================================
set local role postgres;

insert into auth.users (id, email)
values
  ('22222222-0000-0000-0000-000000000001', 'sb_admin@example.com'),
  ('22222222-0000-0000-0000-000000000002', 'sb_payer@example.com'),
  ('22222222-0000-0000-0000-000000000003', 'sb_receiver@example.com'),
  ('22222222-0000-0000-0000-000000000004', 'sb_other@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, name)
values
  ('22222222-0000-0000-0000-000000000001', 'SB Admin'),
  ('22222222-0000-0000-0000-000000000002', 'SB Payer'),
  ('22222222-0000-0000-0000-000000000003', 'SB Receiver'),
  ('22222222-0000-0000-0000-000000000004', 'SB Other')
on conflict (id) do update set name = excluded.name;

insert into public.groups (id, name, currency, created_by)
values
  ('77777777-0000-0000-0000-000000000001', 'SB Integrations Group', 'INR', '22222222-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.group_members (group_id, user_id, role, status)
values
  ('77777777-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'admin', 'active'),
  ('77777777-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'member', 'active'),
  ('77777777-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003', 'member', 'active'),
  ('77777777-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004', 'member', 'active')
on conflict (group_id, user_id) do update set status = 'active', role = excluded.role;

-- -----------------------------------------------------------------------------
-- 1. SB1: member_is_settled & group_is_settled initially (0 expenses, 0 settlements)
-- -----------------------------------------------------------------------------
select ok(
  public.member_is_settled('77777777-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002'),
  'SB1: Member with zero balance and no settlements is settled'
);

select ok(
  public.group_is_settled('77777777-0000-0000-0000-000000000001'),
  'SB1: Group with zero balance and no settlements is settled'
);

-- -----------------------------------------------------------------------------
-- 2. Add an expense: Payer pays 30000 paise (₹300) split equally with Receiver
-- Payer net = +15000, Receiver net = -15000
-- -----------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-0000-0000-0000-000000000002", "role": "authenticated"}';

select is(
  (select char_length(public.add_expense(
    '77777777-0000-0000-0000-000000000001',
    gen_random_uuid(),
    'Dinner',
    30000,
    '22222222-0000-0000-0000-000000000002',
    'equal',
    jsonb_build_array(
      jsonb_build_object('user_id', '22222222-0000-0000-0000-000000000002'),
      jsonb_build_object('user_id', '22222222-0000-0000-0000-000000000003')
    ),
    'food',
    now()::date
  )::text)),
  36,
  'Expense added successfully'
);

set local role postgres;
select ok(
  not public.member_is_settled('77777777-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002'),
  'SB1: Payer with positive balance (+15000) is not settled'
);

select ok(
  not public.member_is_settled('77777777-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003'),
  'SB1: Receiver with negative balance (-15000) is not settled'
);

select ok(
  public.member_is_settled('77777777-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004'),
  'SB1: Other member not in expense has net 0 and is settled'
);

select ok(
  not public.group_is_settled('77777777-0000-0000-0000-000000000001'),
  'SB1: Group with non-zero balances is not settled'
);

-- -----------------------------------------------------------------------------
-- 3. SB2 (GM7): Leaving with non-zero balance is blocked
-- -----------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-0000-0000-0000-000000000003", "role": "authenticated"}';

select throws_ok(
  $$select public.leave_group('77777777-0000-0000-0000-000000000001')$$,
  'member_not_settled',
  'SB2 / GM7: Receiver cannot leave with negative balance'
);

set local "request.jwt.claims" to '{"sub": "22222222-0000-0000-0000-000000000002", "role": "authenticated"}';
select throws_ok(
  $$select public.leave_group('77777777-0000-0000-0000-000000000001')$$,
  'member_not_settled',
  'SB2 / GM7: Payer cannot leave with positive balance'
);

-- -----------------------------------------------------------------------------
-- 4. SB3 (GM2): Admin removes member with non-zero balance is blocked
-- -----------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-0000-0000-0000-000000000001", "role": "authenticated"}';

select throws_ok(
  $$select public.remove_member('77777777-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003')$$,
  'member_not_settled',
  'SB3 / GM2: Admin cannot remove unsettled member'
);

-- -----------------------------------------------------------------------------
-- 5. SB4 (GE5): Admin deleting group with non-zero balance is blocked
-- -----------------------------------------------------------------------------
select throws_ok(
  $$select public.delete_group('77777777-0000-0000-0000-000000000001')$$,
  'group_not_settled',
  'SB4 / GE5: Admin cannot delete group with unsettled balances'
);

-- -----------------------------------------------------------------------------
-- 6. SB5 (GD4): Deleting account when unsettled
-- -----------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-0000-0000-0000-000000000003", "role": "authenticated"}';

select is(
  (select count(*)::int from jsonb_to_recordset((public.account_deletion_blockers()->'unsettled_groups')) as x(id uuid)),
  1,
  'SB5 / GD4: account_deletion_blockers lists unsettled group for receiver'
);

select is(
  (select (x->>'my_net_minor')::bigint from jsonb_array_elements(public.account_deletion_blockers()->'unsettled_groups') x limit 1),
  -15000::bigint,
  'SB5 / GD4: account_deletion_blockers reports exact net (-15000 paise)'
);

select throws_ok(
  $$select public.delete_my_account()$$,
  'unsettled_balances',
  'SB5 / GD4: delete_my_account is blocked by unsettled balances'
);

-- -----------------------------------------------------------------------------
-- 7. Receiver pays back 15000 paise -> pending settlement created by receiver
-- Note: When Receiver creates payment to Payer (from Receiver to Payer),
-- since Receiver is the payer of the settlement, it is 'pending'!
-- -----------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-0000-0000-0000-000000000003", "role": "authenticated"}';

create temp table temp_settlement on commit drop as
select public.create_settlement(
  '77777777-0000-0000-0000-000000000001',
  gen_random_uuid(),
  '22222222-0000-0000-0000-000000000003', -- from receiver
  '22222222-0000-0000-0000-000000000002', -- to payer
  15000,
  'cash',
  'Paying dinner share'
) as id;

-- Even if net were 0, a pending settlement blocks leave/remove/delete
set local role postgres;
select ok(
  not public.member_is_settled('77777777-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003'),
  'SB1: Member with pending settlement is not settled'
);

select ok(
  not public.member_is_settled('77777777-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002'),
  'SB1: Recipient of pending settlement is not settled'
);

-- -----------------------------------------------------------------------------
-- 8. list_my_groups upgrade: check my_balance_minor and my_pending_actions
-- -----------------------------------------------------------------------------
-- For Payer (22222222-0000-0000-0000-000000000002):
-- Net is still +15000 (pending payment does not change net), and pending_for_me = 1
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-0000-0000-0000-000000000002", "role": "authenticated"}';

select is(
  (select my_balance_minor from public.list_my_groups() where group_id = '77777777-0000-0000-0000-000000000001'),
  15000::bigint,
  'list_my_groups returns correct my_balance_minor (+15000)'
);

select is(
  (select my_pending_actions from public.list_my_groups() where group_id = '77777777-0000-0000-0000-000000000001'),
  1::bigint,
  'list_my_groups returns 1 my_pending_actions waiting for confirmation'
);

-- -----------------------------------------------------------------------------
-- 9. Payer confirms the settlement -> nets become exactly 0
-- -----------------------------------------------------------------------------
select public.confirm_settlement((select id from temp_settlement));

set local role postgres;
select ok(
  public.member_is_settled('77777777-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002'),
  'SB7: Payer net is 0 and no pending -> settled'
);

select ok(
  public.member_is_settled('77777777-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003'),
  'SB7: Receiver net is 0 and no pending -> settled'
);

select ok(
  public.group_is_settled('77777777-0000-0000-0000-000000000001'),
  'SB8: Group where expenses exist but all debts are confirmed is settled'
);

-- -----------------------------------------------------------------------------
-- 10. list_activity enrichment: settlement activity has from_name and to_name
-- -----------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-0000-0000-0000-000000000002", "role": "authenticated"}';

select is(
  (select (details->>'from_name') from public.list_activity() where action = 'settlement_created' limit 1),
  'SB Receiver',
  'list_activity enriches details with from_name'
);

select is(
  (select (details->>'to_name') from public.list_activity() where action = 'settlement_created' limit 1),
  'SB Payer',
  'list_activity enriches details with to_name'
);

-- -----------------------------------------------------------------------------
-- 11. Disputed payment does NOT block leaving or deleting (D31 / Case ST15)
-- -----------------------------------------------------------------------------
-- Let's create an expense and dispute a payment, then settle net to 0
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-0000-0000-0000-000000000003", "role": "authenticated"}';

create temp table temp_disp_settlement on commit drop as
select public.create_settlement(
  '77777777-0000-0000-0000-000000000001',
  gen_random_uuid(),
  '22222222-0000-0000-0000-000000000003',
  '22222222-0000-0000-0000-000000000002',
  5000,
  'cash',
  'Disputed attempt'
) as id;

-- Payer disputes it
set local "request.jwt.claims" to '{"sub": "22222222-0000-0000-0000-000000000002", "role": "authenticated"}';
select public.dispute_settlement((select id from temp_disp_settlement));

-- Net is still 0 because disputed settlements do not change balance
set local role postgres;
select ok(
  public.member_is_settled('77777777-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003'),
  'D31 / ST15: Member with disputed payment (and 0 net) is settled'
);

select ok(
  public.group_is_settled('77777777-0000-0000-0000-000000000001'),
  'D31 / ST15: Group with disputed payment (and 0 net) is settled'
);

-- -----------------------------------------------------------------------------
-- 12. SB9: A balance off by even 1 paisa blocks leaving
-- -----------------------------------------------------------------------------
-- Add an expense of 1 paisa
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-0000-0000-0000-000000000002", "role": "authenticated"}';

select public.add_expense(
  '77777777-0000-0000-0000-000000000001',
  gen_random_uuid(),
  '1 paisa mismatch test',
  1,
  '22222222-0000-0000-0000-000000000002',
  'exact',
  jsonb_build_array(
    jsonb_build_object('user_id', '22222222-0000-0000-0000-000000000004', 'value', 1)
  ),
  'other',
  now()::date
);

set local role postgres;
select ok(
  not public.member_is_settled('77777777-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004'),
  'SB9: Balance of -1 paisa is not settled'
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-0000-0000-0000-000000000004", "role": "authenticated"}';
select throws_ok(
  $$select public.leave_group('77777777-0000-0000-0000-000000000001')$$,
  'member_not_settled',
  'SB9: Leave blocked when balance is off by exactly 1 paisa'
);

-- Pay the 1 paisa and confirm
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-0000-0000-0000-000000000002", "role": "authenticated"}';
-- Receiver (22222222-0000-0000-0000-000000000002) marks as received 1 paisa from other (22222222-0000-0000-0000-000000000004) -> confirmed instantly
select public.create_settlement(
  '77777777-0000-0000-0000-000000000001',
  gen_random_uuid(),
  '22222222-0000-0000-0000-000000000004',
  '22222222-0000-0000-0000-000000000002',
  1,
  'cash',
  '1 paisa paid'
);

set local role postgres;
select ok(
  public.member_is_settled('77777777-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004'),
  'SB9: After 1 paisa is settled, member is settled'
);

-- -----------------------------------------------------------------------------
-- 13. SB7: Real leave, remove, delete group, delete account all succeed when settled
-- -----------------------------------------------------------------------------
-- Member 4 leaves
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-0000-0000-0000-000000000004", "role": "authenticated"}';
select is(
  public.leave_group('77777777-0000-0000-0000-000000000001'),
  'left',
  'SB7: Settled member successfully leaves group'
);

-- Admin removes Member 3
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-0000-0000-0000-000000000001", "role": "authenticated"}';
select lives_ok(
  $$select public.remove_member('77777777-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003')$$,
  'SB7: Admin successfully removes settled member'
);

-- SB10: Member 4 rejoins group -> balance is 0
set local role postgres;
insert into public.invites (group_id, code, created_by, expires_at)
values ('77777777-0000-0000-0000-000000000001', 'TESTCADE', '22222222-0000-0000-0000-000000000001', now() + interval '1 day');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-0000-0000-0000-000000000004", "role": "authenticated"}';
select is(
  (select r_status from public.join_group('TESTCADE')),
  'joined',
  'SB10: Former member rejoins group'
);

set local role postgres;
select ok(
  public.member_is_settled('77777777-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004'),
  'SB10: Rejoined member has zero balance and is settled'
);

-- Member 2 deletes account while settled in all groups
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-0000-0000-0000-000000000002", "role": "authenticated"}';

select is(
  (select count(*)::int from jsonb_to_recordset((public.account_deletion_blockers()->'unsettled_groups')) as x(id uuid)),
  0,
  'SB7: account_deletion_blockers reports 0 unsettled groups for settled member'
);

select lives_ok(
  $$select public.delete_my_account()$$,
  'SB7: Settled member successfully deletes account'
);

-- Assert Member 2 was anonymized because settlements and expenses reference it (smart delete)
set local role postgres;
select is(
  (select name from public.profiles where id = '22222222-0000-0000-0000-000000000002'),
  'Deleted user',
  'BG2: Profile referenced by settlements is anonymized to Deleted user (not hard deleted)'
);

-- Admin deletes group
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-0000-0000-0000-000000000001", "role": "authenticated"}';

select lives_ok(
  $$select public.delete_group('77777777-0000-0000-0000-000000000001')$$,
  'SB7 / SB8: Admin deletes group where all members were settled'
);

set local role postgres;
select is_empty(
  'select 1 from public.groups where id = ''77777777-0000-0000-0000-000000000001''',
  'BG1: Group was permanently deleted'
);

rollback;
