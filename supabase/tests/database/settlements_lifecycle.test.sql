begin;
select plan(43);

-- -----------------------------------------------------------------------------
-- Setup test fixtures (as postgres)
-- -----------------------------------------------------------------------------
set local role postgres;

insert into auth.users (id, email)
values
  ('11111111-9999-0000-0000-000000000001', 'payer@example.com'),
  ('11111111-9999-0000-0000-000000000002', 'receiver@example.com'),
  ('11111111-9999-0000-0000-000000000003', 'admin@example.com'),
  ('11111111-9999-0000-0000-000000000004', 'third@example.com'),
  ('11111111-9999-0000-0000-000000000005', 'outsider@example.com'),
  ('11111111-9999-0000-0000-000000000006', 'departed@example.com')
on conflict (id) do nothing;

insert into public.groups (id, name, currency, created_by)
values
  ('99999999-0000-0000-0000-000000000001', 'Settlement Lifecycle Group', 'INR', '11111111-9999-0000-0000-000000000003')
on conflict (id) do nothing;

insert into public.group_members (group_id, user_id, role, status, left_at)
values
  ('99999999-0000-0000-0000-000000000001', '11111111-9999-0000-0000-000000000001', 'member', 'active', null),
  ('99999999-0000-0000-0000-000000000001', '11111111-9999-0000-0000-000000000002', 'member', 'active', null),
  ('99999999-0000-0000-0000-000000000001', '11111111-9999-0000-0000-000000000003', 'admin',  'active', null),
  ('99999999-0000-0000-0000-000000000001', '11111111-9999-0000-0000-000000000004', 'member', 'active', null),
  ('99999999-0000-0000-0000-000000000001', '11111111-9999-0000-0000-000000000006', 'member', 'left', now())
on conflict (group_id, user_id) do nothing;

-- -----------------------------------------------------------------------------
-- 1. Creation Validations & Permissions (SC1 to SC9, SC15, SC16, BZ3, BZ4)
-- -----------------------------------------------------------------------------
set local role authenticated;

-- Outsider caller
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000005', true);
select throws_ok(
  'select public.create_settlement(''99999999-0000-0000-0000-000000000001'', null, ''11111111-9999-0000-0000-000000000001'', ''11111111-9999-0000-0000-000000000002'', 1000, ''cash'')',
  'P0001',
  'not_a_member',
  'outsider cannot create settlement (BZ3)'
);

-- Third party member (not payer, not receiver) cannot create (SC3)
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000004', true);
select throws_ok(
  'select public.create_settlement(''99999999-0000-0000-0000-000000000001'', null, ''11111111-9999-0000-0000-000000000001'', ''11111111-9999-0000-0000-000000000002'', 1000, ''cash'')',
  'P0001',
  'settlement_not_allowed',
  'third party member cannot create settlement for others (SC3)'
);

-- Admin cannot create settlement for others (BZ4)
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000003', true);
select throws_ok(
  'select public.create_settlement(''99999999-0000-0000-0000-000000000001'', null, ''11111111-9999-0000-0000-000000000001'', ''11111111-9999-0000-0000-000000000002'', 1000, ''cash'')',
  'P0001',
  'settlement_not_allowed',
  'admin cannot create settlement between other people (BZ4)'
);

-- Payer acting
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000001', true);

-- Self settlement
select throws_ok(
  'select public.create_settlement(''99999999-0000-0000-0000-000000000001'', null, ''11111111-9999-0000-0000-000000000001'', ''11111111-9999-0000-0000-000000000001'', 1000, ''cash'')',
  'P0001',
  'invalid_settlement',
  'self-settlement is rejected (SC4)'
);

-- Inactive member as receiver
select throws_ok(
  'select public.create_settlement(''99999999-0000-0000-0000-000000000001'', null, ''11111111-9999-0000-0000-000000000001'', ''11111111-9999-0000-0000-000000000006'', 1000, ''cash'')',
  'P0001',
  'receiver_not_member',
  'departed member as receiver is rejected (SC5)'
);

-- Bad amount (< 1)
select throws_ok(
  'select public.create_settlement(''99999999-0000-0000-0000-000000000001'', null, ''11111111-9999-0000-0000-000000000001'', ''11111111-9999-0000-0000-000000000002'', 0, ''cash'')',
  'P0001',
  'invalid_amount',
  'zero amount is rejected (SC6)'
);

-- Bad method
select throws_ok(
  'select public.create_settlement(''99999999-0000-0000-0000-000000000001'', null, ''11111111-9999-0000-0000-000000000001'', ''11111111-9999-0000-0000-000000000002'', 1000, ''upi'')',
  'P0001',
  'invalid_method',
  'upi method rejected in Phase 5 (SC7)'
);

-- Note > 100 chars
select throws_ok(
  'select public.create_settlement(''99999999-0000-0000-0000-000000000001'', null, ''11111111-9999-0000-0000-000000000001'', ''11111111-9999-0000-0000-000000000002'', 1000, ''cash'', repeat(''n'', 101))',
  'P0001',
  'invalid_note',
  'note > 100 chars is rejected (SC8)'
);

-- Payer creates payment -> status pending (SC1)
create temp table t_created as
select public.create_settlement(
  '99999999-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '11111111-9999-0000-0000-000000000001',
  '11111111-9999-0000-0000-000000000002',
  10000,
  'cash',
  'Lunch share'
) as id;

set local role postgres;
select is(
  (select status from public.settlements where id = (select id from t_created)),
  'pending',
  'payer-created settlement is pending (SC1)'
);

select is(
  (select confirmed_at from public.settlements where id = (select id from t_created)),
  null,
  'pending settlement has confirmed_at = null'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000001', true);

-- Idempotency (SC9)
select is(
  public.create_settlement(
    '99999999-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    '11111111-9999-0000-0000-000000000001',
    '11111111-9999-0000-0000-000000000002',
    10000,
    'cash',
    'Lunch share'
  ),
  (select id from t_created),
  'replay with same client_request_id returns existing id (SC9)'
);

-- Duplicate pending payment check (SC15)
select throws_ok(
  'select public.create_settlement(''99999999-0000-0000-0000-000000000001'', ''a0000000-0000-0000-0000-000000000002'', ''11111111-9999-0000-0000-000000000001'', ''11111111-9999-0000-0000-000000000002'', 10000, ''cash'')',
  'P0001',
  'duplicate_pending',
  'duplicate pending payment throws duplicate_pending (SC15)'
);

-- Receiver creates payment -> status confirmed at once (SC2)
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000002', true);

create temp table t_recv_created as
select public.create_settlement(
  '99999999-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000003',
  '11111111-9999-0000-0000-000000000001',
  '11111111-9999-0000-0000-000000000002',
  25000,
  'other',
  'Received in cash'
) as id;

set local role postgres;
select is(
  (select status from public.settlements where id = (select id from t_recv_created)),
  'confirmed',
  'receiver-created settlement is confirmed immediately (SC2)'
);

select isnt(
  (select confirmed_at from public.settlements where id = (select id from t_recv_created)),
  null,
  'receiver-created settlement has confirmed_at set'
);

-- -----------------------------------------------------------------------------
-- 2. Status Transitions & Permissions (ST1 to ST18)
-- -----------------------------------------------------------------------------
-- Testing on pending payment: (select id from t_created)
-- Payer tries to confirm own payment (ST7)
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000001', true);
select throws_ok(
  'select public.confirm_settlement((select id from t_created))',
  'P0001',
  'settlement_not_allowed',
  'payer cannot confirm own payment (ST7)'
);

-- Receiver tries to cancel pending payment (ST8)
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000002', true);
select throws_ok(
  'select public.cancel_settlement((select id from t_created))',
  'P0001',
  'settlement_not_allowed',
  'receiver cannot cancel pending payment (ST8)'
);

-- Third party tries to dispute (ST17)
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000004', true);
select throws_ok(
  'select public.dispute_settlement((select id from t_created))',
  'P0001',
  'settlement_not_allowed',
  'third party cannot dispute settlement (ST17)'
);

-- Receiver disputes pending payment (ST2)
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000002', true);
select lives_ok(
  'select public.dispute_settlement((select id from t_created))',
  'receiver disputes pending payment (ST2)'
);

set local role postgres;
select is(
  (select status from public.settlements where id = (select id from t_created)),
  'disputed',
  'settlement status changed to disputed'
);

-- Duplicate dispute is silent no-op (ST10)
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000002', true);
select lives_ok(
  'select public.dispute_settlement((select id from t_created))',
  'duplicate dispute is silent no-op (ST10)'
);

-- Receiver confirms disputed payment (ST3)
select lives_ok(
  'select public.confirm_settlement((select id from t_created))',
  'receiver confirms disputed payment (ST3)'
);

set local role postgres;
select is(
  (select status from public.settlements where id = (select id from t_created)),
  'confirmed',
  'disputed payment becomes confirmed (ST3)'
);

-- Duplicate confirm is silent no-op (ST10)
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000002', true);
select lives_ok(
  'select public.confirm_settlement((select id from t_created))',
  'duplicate confirm is silent no-op (ST10)'
);

-- Illegal transition: disputing a confirmed payment throws invalid_transition (ST9)
select throws_ok(
  'select public.dispute_settlement((select id from t_created))',
  'P0001',
  'invalid_transition',
  'disputing confirmed payment throws invalid_transition (ST9)'
);

-- -----------------------------------------------------------------------------
-- 3. 10-Minute Undo Window (ST6, ST12)
-- -----------------------------------------------------------------------------
-- Payer cannot cancel confirmed payment (ST8)
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000001', true);
select throws_ok(
  'select public.cancel_settlement((select id from t_created))',
  'P0001',
  'settlement_not_allowed',
  'payer cannot cancel/undo confirmed payment (ST8)'
);

-- Receiver undoes within 10 minutes (ST6)
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000002', true);
select lives_ok(
  'select public.cancel_settlement((select id from t_created))',
  'receiver undoes confirmed payment within 10 minutes (ST6)'
);

set local role postgres;
select is(
  (select status from public.settlements where id = (select id from t_created)),
  'cancelled',
  'undone payment status is cancelled'
);

select is(
  (select confirmed_at from public.settlements where id = (select id from t_created)),
  null,
  'undone payment cleared confirmed_at'
);

-- Duplicate cancel is silent no-op (ST10)
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000002', true);
select lives_ok(
  'select public.cancel_settlement((select id from t_created))',
  'duplicate cancel is silent no-op (ST10)'
);

-- Confirming a cancelled payment throws invalid_transition (ST9)
select throws_ok(
  'select public.confirm_settlement((select id from t_created))',
  'P0001',
  'invalid_transition',
  'confirming cancelled payment throws invalid_transition (ST9)'
);

-- Test undo window expiry (> 10 minutes) (ST12)
set local role postgres;
update public.settlements
   set status = 'confirmed', confirmed_at = now() - interval '11 minutes'
 where id = (select id from t_recv_created);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000002', true);
select throws_ok(
  'select public.cancel_settlement((select id from t_recv_created))',
  'P0001',
  'undo_window_passed',
  'undo after 10 minutes throws undo_window_passed (ST12)'
);

-- -----------------------------------------------------------------------------
-- 4. settlement_locked when a person has left (ST13, ST14)
-- -----------------------------------------------------------------------------
-- Create pending payment to departed user
set local role postgres;
insert into public.settlements (id, group_id, from_user, to_user, amount_minor, method, status, created_by)
values ('b0000000-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001',
        '11111111-9999-0000-0000-000000000006', '11111111-9999-0000-0000-000000000002', 1000, 'cash', 'disputed', '11111111-9999-0000-0000-000000000006');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000002', true);
select throws_ok(
  'select public.confirm_settlement(''b0000000-0000-0000-0000-000000000001'')',
  'P0001',
  'settlement_locked',
  'confirming disputed payment when person left throws settlement_locked (ST14)'
);

-- -----------------------------------------------------------------------------
-- 5. Spam guard: 10 pending payments limit (SC16)
-- -----------------------------------------------------------------------------
set local role postgres;
-- Clean existing pending in group
delete from public.settlements where group_id = '99999999-0000-0000-0000-000000000001';

-- Insert 10 pending payments created by payer
insert into public.settlements (group_id, from_user, to_user, amount_minor, method, status, created_by)
select '99999999-0000-0000-0000-000000000001',
       '11111111-9999-0000-0000-000000000001',
       '11111111-9999-0000-0000-000000000002',
       1000 + i,
       'cash',
       'pending',
       '11111111-9999-0000-0000-000000000001'
  from generate_series(1, 10) as i;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000001', true);

select throws_ok(
  'select public.create_settlement(''99999999-0000-0000-0000-000000000001'', null, ''11111111-9999-0000-0000-000000000001'', ''11111111-9999-0000-0000-000000000002'', 99999, ''cash'')',
  'P0001',
  'too_many_pending',
  '11th pending payment throws too_many_pending (SC16)'
);

-- -----------------------------------------------------------------------------
-- 6. Activity log entries (ST16)
-- -----------------------------------------------------------------------------
set local role postgres;
select is(
  (select count(*)::int from public.activity_log where group_id = '99999999-0000-0000-0000-000000000001' and action like 'settlement_%'),
  (select count(*)::int from public.activity_log where group_id = '99999999-0000-0000-0000-000000000001'),
  'all settlement operations wrote valid activity entries (ST16)'
);

-- -----------------------------------------------------------------------------
-- 7. list_settlements (SH1 to SH8)
-- -----------------------------------------------------------------------------
-- Keyset pagination & permission flags
-- Payer's perspective: can_cancel is true, can_confirm is false, can_dispute is false
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000001', true);

select is(
  (select can_cancel from public.list_settlements('99999999-0000-0000-0000-000000000001', 1) limit 1),
  true,
  'payer has can_cancel = true on pending settlement'
);

select is(
  (select can_confirm from public.list_settlements('99999999-0000-0000-0000-000000000001', 1) limit 1),
  false,
  'payer has can_confirm = false on pending settlement'
);

-- Receiver's perspective: can_confirm is true, can_dispute is true, can_cancel is false
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000002', true);

select is(
  (select can_confirm from public.list_settlements('99999999-0000-0000-0000-000000000001', 1) limit 1),
  true,
  'receiver has can_confirm = true on pending settlement'
);

select is(
  (select can_dispute from public.list_settlements('99999999-0000-0000-0000-000000000001', 1) limit 1),
  true,
  'receiver has can_dispute = true on pending settlement'
);

select is(
  (select can_cancel from public.list_settlements('99999999-0000-0000-0000-000000000001', 1) limit 1),
  false,
  'receiver has can_cancel = false on pending settlement'
);

-- Third party's perspective: all action flags false
select set_config('request.jwt.claim.sub', '11111111-9999-0000-0000-000000000004', true);

select is(
  (select can_confirm or can_dispute or can_cancel or can_undo from public.list_settlements('99999999-0000-0000-0000-000000000001', 1) limit 1),
  false,
  'third party member has all action flags = false'
);

-- Keyset pagination: page 1 of 5 items, page 2 of 5 items
create temp table t_page1 as
select * from public.list_settlements('99999999-0000-0000-0000-000000000001', 5);

select is(
  (select count(*)::int from t_page1),
  5,
  'list_settlements page 1 returns 5 items'
);

create temp table t_page2 as
select * from public.list_settlements(
  '99999999-0000-0000-0000-000000000001',
  5,
  (select next_cursor from t_page1 order by created_at asc, id asc limit 1)
);

select is(
  (select count(*)::int from t_page2),
  5,
  'list_settlements page 2 returns next 5 items'
);

select is(
  (select count(*)::int from t_page1 p1 join t_page2 p2 on p1.id = p2.id),
  0,
  'pagination has no overlapping items between page 1 and page 2'
);

rollback;
