begin;
select plan(28);

-- Setup test users in auth.users
set local role postgres;
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'admin@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'member@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'outsider@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'leaver@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'removed@example.com'),
  ('66666666-6666-6666-6666-666666666666', 'capped@example.com')
on conflict (id) do nothing;

update public.profiles set name = 'Alice Admin' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set name = 'Bob Member' where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set name = 'Charlie Outsider' where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set name = 'David Leaver' where id = '44444444-4444-4444-4444-444444444444';
update public.profiles set name = 'Eve Removed' where id = '55555555-5555-5555-5555-555555555555';
update public.profiles set name = 'Frank Capped' where id = '66666666-6666-6666-6666-666666666666';

create temp table temp_vars (key text primary key, val text);
grant all on temp_vars to authenticated;

-- Create a primary test group
insert into public.groups (id, name, created_by)
values ('10000000-0000-0000-0000-000000000001', 'Trek Group', '11111111-1111-1111-1111-111111111111');

insert into public.group_members (group_id, user_id, role, status, left_at)
values
  ('10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'admin', 'active', null),
  ('10000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'member', 'active', null),
  ('10000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'member', 'left', now() - interval '1 hour'),
  ('10000000-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 'member', 'removed', now() - interval '10 minutes');

-- ========================================================
-- 1. Anonymous callers rejected
-- ========================================================
set local role anon;

select throws_ok(
  'select * from public.get_or_create_invite(''10000000-0000-0000-0000-000000000001'')',
  '42501',
  null,
  'Anon cannot execute get_or_create_invite'
);

select throws_ok(
  'select * from public.reset_invite(''10000000-0000-0000-0000-000000000001'')',
  '42501',
  null,
  'Anon cannot execute reset_invite'
);

select throws_ok(
  'select * from public.preview_invite(''ABCDEF23'')',
  '42501',
  null,
  'Anon cannot execute preview_invite'
);

select throws_ok(
  'select * from public.join_group(''ABCDEF23'')',
  '42501',
  null,
  'Anon cannot execute join_group'
);

-- ========================================================
-- 2. get_or_create_invite tests
-- ========================================================
set local role authenticated;
-- Non-admin member (Bob) raises not_admin
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select throws_ok(
  'select * from public.get_or_create_invite(''10000000-0000-0000-0000-000000000001'')',
  'not_admin',
  'Non-admin cannot get or create invite'
);

-- Admin (Alice) gets a new invite
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
insert into temp_vars (key, val)
select 'initial_code', code from public.get_or_create_invite('10000000-0000-0000-0000-000000000001');

select matches(
  (select val from temp_vars where key = 'initial_code'),
  '^[A-HJ-NP-Z2-9]{8}$',
  'get_or_create_invite generates valid 8-char code'
);

-- Calling again returns the exact same active code
select is(
  (select code from public.get_or_create_invite('10000000-0000-0000-0000-000000000001')),
  (select val from temp_vars where key = 'initial_code'),
  'get_or_create_invite is idempotent and returns the same active code'
);

-- ========================================================
-- 3. reset_invite tests
-- ========================================================
-- Bob cannot reset
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select throws_ok(
  'select * from public.reset_invite(''10000000-0000-0000-0000-000000000001'')',
  'not_admin',
  'Non-admin cannot reset invite'
);

-- Alice resets invite
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
insert into temp_vars (key, val)
select 'reset_code', code from public.reset_invite('10000000-0000-0000-0000-000000000001');

select isnt(
  (select val from temp_vars where key = 'reset_code'),
  (select val from temp_vars where key = 'initial_code'),
  'reset_invite generates a new code distinct from old'
);

-- Old invite is now marked revoked (verified under postgres role)
set local role postgres;
select is(
  (select count(*)::int from public.invites where group_id = '10000000-0000-0000-0000-000000000001' and revoked_at is not null),
  1,
  'Old invite was revoked'
);

-- ========================================================
-- 4. preview_invite tests
-- ========================================================
-- Active code preview by Charlie (outsider)
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

select is(
  (
    select status
    from public.preview_invite((select val from temp_vars where key = 'reset_code'))
  ),
  'valid',
  'preview_invite returns status valid for active code'
);

-- Input cleaning: lower-case with spaces & hyphens still matches
select is(
  (
    select status
    from public.preview_invite(
      lower('  ' || (select val from temp_vars where key = 'reset_code') || '  ')
    )
  ),
  'valid',
  'preview_invite cleans lowercase and whitespace'
);

-- Preview returns group details & inviter name
select is(
  (
    select inviter_name
    from public.preview_invite((select val from temp_vars where key = 'reset_code'))
  ),
  'Alice Admin',
  'preview_invite reveals inviter name'
);

-- Invalid code returns status 'invalid'
select is(
  (select status from public.preview_invite('NKNEXUS2')),
  'invalid',
  'preview_invite returns invalid for non-existent code'
);

-- Revoked code returns status 'revoked'
select is(
  (
    select status
    from public.preview_invite((select val from temp_vars where key = 'initial_code'))
  ),
  'revoked',
  'preview_invite returns revoked for reset code'
);

-- Expired code returns status 'expired'
set local role postgres;
insert into public.groups (id, name, created_by)
values ('30000000-0000-0000-0000-000000000003', 'Expired Group', '11111111-1111-1111-1111-111111111111');
insert into public.invites (group_id, code, created_by, created_at, expires_at, revoked_at)
values ('30000000-0000-0000-0000-000000000003', 'PASTEXP2', '11111111-1111-1111-1111-111111111111', now() - interval '8 days', now() - interval '1 day', null);

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';
select is(
  (select status from public.preview_invite('PASTEXP2')),
  'expired',
  'preview_invite handles unrevoked expired code'
);

-- Already member returns 'already_member'
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select is(
  (
    select status
    from public.preview_invite((select val from temp_vars where key = 'reset_code'))
  ),
  'already_member',
  'preview_invite returns already_member for active members'
);

-- ========================================================
-- 5. join_group tests
-- ========================================================
-- Charlie (outsider) joins with valid code
set local "request.jwt.claims" to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';
select is(
  (
    select r_status
    from public.join_group((select val from temp_vars where key = 'reset_code'))
  ),
  'joined',
  'join_group returns joined on valid code'
);

-- Verified membership inserted with role member and status active (as postgres)
set local role postgres;
select is(
  (
    select role
    from public.group_members
    where group_id = '10000000-0000-0000-0000-000000000001'
      and user_id = '33333333-3333-3333-3333-333333333333'
  ),
  'member',
  'Joined user has role member'
);

-- Double-tap idempotency: calling join_group again returns already_member
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';
select is(
  (
    select r_status
    from public.join_group((select val from temp_vars where key = 'reset_code'))
  ),
  'already_member',
  'join_group double tap returns already_member'
);

-- Rejoin test: David (leaver) joins again
set local "request.jwt.claims" to '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}';
select is(
  (
    select r_status
    from public.join_group((select val from temp_vars where key = 'reset_code'))
  ),
  'joined',
  'Former member who left can rejoin with valid invite'
);

set local role postgres;
select is(
  (
    select status
    from public.group_members
    where group_id = '10000000-0000-0000-0000-000000000001'
      and user_id = '44444444-4444-4444-4444-444444444444'
  ),
  'active',
  'Rejoined member status is updated to active'
);

-- Removed member test: Eve (removed) tries with old invite (created before removal)
set local role postgres;
insert into public.groups (id, name, created_by)
values ('40000000-0000-0000-0000-000000000004', 'Removal Group', '11111111-1111-1111-1111-111111111111');

insert into public.group_members (group_id, user_id, role, status, left_at)
values ('40000000-0000-0000-0000-000000000004', '55555555-5555-5555-5555-555555555555', 'member', 'removed', now() - interval '10 minutes');

-- Create an old invite created BEFORE Eve was removed (Eve left_at is now - 10 mins)
insert into public.invites (id, group_id, code, created_by, created_at, expires_at, revoked_at)
values (
  gen_random_uuid(),
  '40000000-0000-0000-0000-000000000004',
  'PASTDAT2',
  '11111111-1111-1111-1111-111111111111',
  now() - interval '20 minutes',
  now() + interval '6 days',
  null
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "55555555-5555-5555-5555-555555555555", "role": "authenticated"}';
select is(
  (select r_status from public.join_group('PASTDAT2')),
  'removed',
  'Removed member using invite created before removal is rejected with status removed (GJ12)'
);

-- But when admin creates a fresh invite AFTER removal, Eve can rejoin
set local role postgres;
update public.invites set revoked_at = now() where group_id = '40000000-0000-0000-0000-000000000004';
insert into public.invites (id, group_id, code, created_by, created_at, expires_at, revoked_at)
values (
  gen_random_uuid(),
  '40000000-0000-0000-0000-000000000004',
  'FRESHNW2',
  '11111111-1111-1111-1111-111111111111',
  now(),
  now() + interval '7 days',
  null
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "55555555-5555-5555-5555-555555555555", "role": "authenticated"}';
select is(
  (select r_status from public.join_group('FRESHNW2')),
  'joined',
  'Removed member using invite created after removal is accepted'
);

-- Group full test (group has 50 active members)
set local role postgres;
-- Add dummy members to bring group to 50 active members
with dummy as (
  select gen_random_uuid() as id, 'Dummy ' || i as name
  from generate_series(1, 49) i
),
ins_prof as (
  insert into public.profiles (id, name)
  select id, name from dummy
)
insert into public.group_members (group_id, user_id, role, status)
select '40000000-0000-0000-0000-000000000004', id, 'member', 'active'
from dummy;

-- Create fresh outsider user 7
insert into auth.users (id, email) values ('77777777-7777-7777-7777-777777777777', 'user7@example.com') on conflict (id) do nothing;
insert into public.profiles (id, name) values ('77777777-7777-7777-7777-777777777777', 'User 7') on conflict (id) do nothing;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "77777777-7777-7777-7777-777777777777", "role": "authenticated"}';
select is(
  (select r_status from public.join_group('FRESHNW2')),
  'group_full',
  'join_group returns group_full when group has 50 members'
);

-- User cap test: Frank (capped) is already in 50 active groups
set local role postgres;
-- Create 50 groups where Frank is active member
insert into public.groups (id, name, created_by)
select gen_random_uuid(), 'Capped Group ' || i, '11111111-1111-1111-1111-111111111111'
from generate_series(1, 50) i;

insert into public.group_members (group_id, user_id, role, status)
select g.id, '66666666-6666-6666-6666-666666666666', 'member', 'active'
from public.groups g where g.name like 'Capped Group%';

-- Create another non-full group with valid invite
insert into public.groups (id, name, created_by)
values ('20000000-0000-0000-0000-000000000002', 'Open Group', '11111111-1111-1111-1111-111111111111');
insert into public.invites (group_id, code, created_by)
values ('20000000-0000-0000-0000-000000000002', 'APPEND22', '11111111-1111-1111-1111-111111111111');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "66666666-6666-6666-6666-666666666666", "role": "authenticated"}';
select is(
  (select r_status from public.join_group('APPEND22')),
  'too_many_groups',
  'join_group returns too_many_groups when user is in 50 groups'
);

-- Rate limiting test: 10 failed attempts locks user for 15 minutes
set local role postgres;
insert into public.invite_attempts (user_id, success, attempted_at)
select '77777777-7777-7777-7777-777777777777', false, now() - interval '1 minute'
from generate_series(1, 10);

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "77777777-7777-7777-7777-777777777777", "role": "authenticated"}';
select is(
  (select r_status from public.join_group('APPEND22')),
  'too_many_attempts',
  'join_group returns too_many_attempts after 10 failed guesses'
);

select is(
  (select status from public.preview_invite('APPEND22')),
  'too_many_attempts',
  'preview_invite returns too_many_attempts after 10 failed guesses'
);

select * from finish();
rollback;
