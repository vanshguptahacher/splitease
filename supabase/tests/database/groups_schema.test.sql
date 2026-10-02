begin;
select plan(33);

-- Setup test users in auth.users
set local role postgres;
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'user1@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'user2@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'user3@example.com')
on conflict (id) do nothing;

-- Setup test group where user1 is admin, user2 is member, user3 is non-member
insert into public.groups (id, name, currency, created_by)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Trip to Goa', 'INR', '11111111-1111-1111-1111-111111111111');

insert into public.group_members (group_id, user_id, role, status)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'admin', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'member', 'active');

insert into public.invites (id, group_id, code, created_by)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ABCDEF23', '11111111-1111-1111-1111-111111111111');

-- 1. Anonymous tests (all tables deny SELECT for anon role)
set local role anon;

select throws_ok(
  'select * from public.groups',
  '42501',
  null,
  'anon role cannot select from groups (permission denied)'
);

select throws_ok(
  'select * from public.group_members',
  '42501',
  null,
  'anon role cannot select from group_members (permission denied)'
);

select throws_ok(
  'select * from public.invites',
  '42501',
  null,
  'anon role cannot select from invites (permission denied)'
);

select throws_ok(
  'select * from public.invite_attempts',
  '42501',
  null,
  'anon role cannot select from invite_attempts (permission denied)'
);

-- 2. Non-member (user 3) tests (GS1)
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

select is_empty(
  'select * from public.groups where id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
  'Non-member cannot select group'
);

select is_empty(
  'select * from public.group_members where group_id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
  'Non-member cannot select group_members'
);

-- 3. Active member (user 2) tests
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select isnt_empty(
  'select * from public.groups where id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
  'Active member can select their group'
);

select is(
  (select count(*)::int from public.group_members where group_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  2,
  'Active member can select group members'
);

-- 4. Invites & invite_attempts table access for authenticated users (GS4, GS8)
select throws_ok(
  'select * from public.invites',
  '42501',
  null,
  'Authenticated users cannot select from invites directly (GS4)'
);

select throws_ok(
  'select * from public.invite_attempts',
  '42501',
  null,
  'Authenticated users cannot select from invite_attempts directly (GS8)'
);

-- 5. Direct write operations blocked for authenticated (GS2)
select throws_ok(
  'insert into public.groups (name, created_by) values (''Direct Insert'', ''22222222-2222-2222-2222-222222222222'')',
  '42501',
  null,
  'Direct insert on groups denied for authenticated (GS2)'
);

select throws_ok(
  'update public.groups set name = ''Hacked'' where id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
  '42501',
  null,
  'Direct update on groups denied for authenticated (GS2)'
);

select throws_ok(
  'delete from public.groups where id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
  '42501',
  null,
  'Direct delete on groups denied for authenticated (GS2)'
);

select throws_ok(
  'insert into public.group_members (group_id, user_id) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''33333333-3333-3333-3333-333333333333'')',
  '42501',
  null,
  'Direct insert on group_members denied for authenticated (GS2)'
);

select throws_ok(
  'update public.group_members set role = ''admin'' where user_id = ''22222222-2222-2222-2222-222222222222''',
  '42501',
  null,
  'Direct update on group_members denied for authenticated (GS2)'
);

select throws_ok(
  'delete from public.group_members where user_id = ''22222222-2222-2222-2222-222222222222''',
  '42501',
  null,
  'Direct delete on group_members denied for authenticated (GS2)'
);

select throws_ok(
  'insert into public.invites (group_id, code, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''XYZ12345'', ''22222222-2222-2222-2222-222222222222'')',
  '42501',
  null,
  'Direct insert on invites denied for authenticated (GS2)'
);

select throws_ok(
  'insert into public.invite_attempts (user_id, success) values (''22222222-2222-2222-2222-222222222222'', true)',
  '42501',
  null,
  'Direct insert on invite_attempts denied for authenticated (GS2)'
);

-- 6. Constraints validation (running as postgres)
set local role postgres;

-- Empty / whitespace name rejected (0 characters after trim)
select throws_ok(
  'insert into public.groups (name, created_by) values (''   '', ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'Check constraint groups_name_len rejects empty/spaces name'
);

-- Name > 50 characters rejected
select throws_ok(
  'insert into public.groups (name, created_by) values (''This group name is way too long and exceeds the maximum limit of fifty characters'', ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'Check constraint groups_name_len rejects name > 50 chars'
);

-- Non-INR currency rejected
select throws_ok(
  'insert into public.groups (name, currency, created_by) values (''USD Group'', ''USD'', ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'Check constraint groups_currency rejects currency other than INR'
);

-- Invalid group member role rejected
select throws_ok(
  'insert into public.group_members (group_id, user_id, role) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''33333333-3333-3333-3333-333333333333'', ''owner'')',
  '23514',
  null,
  'Check constraint rejects invalid member role (e.g. owner)'
);

-- Invalid member status rejected
select throws_ok(
  'insert into public.group_members (group_id, user_id, status) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''33333333-3333-3333-3333-333333333333'', ''banned'')',
  '23514',
  null,
  'Check constraint rejects invalid member status'
);

-- Invariant gm_left_consistency: active member cannot have left_at set
select throws_ok(
  'insert into public.group_members (group_id, user_id, status, left_at) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''33333333-3333-3333-3333-333333333333'', ''active'', now())',
  '23514',
  null,
  'gm_left_consistency rejects active row with left_at set'
);

-- Invariant gm_left_consistency: left member must have left_at set
select throws_ok(
  'insert into public.group_members (group_id, user_id, status, left_at) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''33333333-3333-3333-3333-333333333333'', ''left'', null)',
  '23514',
  null,
  'gm_left_consistency rejects left row with null left_at'
);

-- Invalid invite code format rejected (e.g. contains 0, 1, or lower case)
select throws_ok(
  'insert into public.invites (group_id, code, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''INVALID0'', ''11111111-1111-1111-1111-111111111111'')',
  '23514',
  null,
  'Check constraint invites_code_format rejects code with 0'
);

-- Partial unique index: second active invite for same group rejected
select throws_ok(
  'insert into public.invites (group_id, code, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''JKLM2345'', ''11111111-1111-1111-1111-111111111111'')',
  '23505',
  null,
  'invites_one_active_per_group prevents second unrevoked invite'
);

-- Revoking the old invite allows a new active invite to be inserted
update public.invites set revoked_at = now() where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select lives_ok(
  'insert into public.invites (group_id, code, created_by) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''JKLM2345'', ''11111111-1111-1111-1111-111111111111'')',
  'New invite can be created once previous invite is revoked'
);

-- 7. Helper functions validation
select matches(
  public.generate_invite_code(),
  '^[A-HJ-NP-Z2-9]{8}$',
  'generate_invite_code() generates valid 8-char code'
);

set local role authenticated;

-- Active member user 2
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select is(
  public.is_active_member('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  true,
  'is_active_member returns true for active member'
);

-- Non-member user 3
set local "request.jwt.claims" to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';
select is(
  public.is_active_member('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  false,
  'is_active_member returns false for non-member'
);

-- Admin user 1
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select is(
  public.is_group_admin('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  true,
  'is_group_admin returns true for admin user'
);

-- Non-admin member user 2
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select is(
  public.is_group_admin('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  false,
  'is_group_admin returns false for non-admin member'
);

select * from finish();
rollback;
