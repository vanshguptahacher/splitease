begin;
select plan(28);

-- Setup test users in auth.users
set local role postgres;
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'user1@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'user2@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'user3@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'user4@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'user5@example.com')
on conflict (id) do nothing;

-- Update profile display names and UPI IDs for sorting and privacy tests
update public.profiles set name = 'Alice Admin', upi_id = 'alice@oksbi' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set name = 'Bob Member', upi_id = 'bob@okhdfc' where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set name = 'Charlie NonMember', upi_id = 'charlie@okaxis' where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set name = 'David Former', upi_id = 'david@okicici' where id = '44444444-4444-4444-4444-444444444444';
update public.profiles set name = 'Eve Deleted', upi_id = 'eve@okpaytm', deleted_at = now() where id = '55555555-5555-5555-5555-555555555555';

-- ========================================================
-- 1. Anonymous callers rejected (permission denied 42501)
-- ========================================================
set local role anon;

select throws_ok(
  'select * from public.create_group(''Anon Group'')',
  '42501',
  null,
  'Anon cannot execute create_group'
);

select throws_ok(
  'select * from public.list_my_groups()',
  '42501',
  null,
  'Anon cannot execute list_my_groups'
);

select throws_ok(
  'select * from public.get_group(''11111111-1111-1111-1111-111111111111'')',
  '42501',
  null,
  'Anon cannot execute get_group'
);

select throws_ok(
  'select * from public.get_group_members(''11111111-1111-1111-1111-111111111111'')',
  '42501',
  null,
  'Anon cannot execute get_group_members'
);

select throws_ok(
  'select * from public.rename_group(''11111111-1111-1111-1111-111111111111'', ''New Name'')',
  '42501',
  null,
  'Anon cannot execute rename_group'
);

-- ========================================================
-- 2. create_group tests (as User 1)
-- ========================================================
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

-- Create group with valid name and request id
select lives_ok(
  'select * from public.create_group(''  Goa   Trip  '', ''a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1''::uuid)',
  'create_group creates group and trims/collapses spaces'
);

-- Check creator is admin
select is(
  (
    select gm.role
    from public.groups g
    join public.group_members gm on gm.group_id = g.id
    where g.client_request_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid
      and gm.user_id = '11111111-1111-1111-1111-111111111111'
  ),
  'admin',
  'Creator is automatically added as admin'
);

-- Retry safety with same client_request_id returns existing group
select is(
  (
    select id from public.create_group('Any Different Name', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid)
  ),
  (
    select id from public.groups where client_request_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid
  ),
  'create_group retry with same client_request_id returns existing group'
);

-- Invalid name validations
select throws_ok(
  'select * from public.create_group('''')',
  'invalid_name',
  'Empty name rejected with invalid_name'
);

select throws_ok(
  'select * from public.create_group(''    '')',
  'invalid_name',
  'Spaces-only name rejected with invalid_name'
);

select throws_ok(
  'select * from public.create_group(''This group name is way too long and definitely exceeds fifty characters limit'')',
  'invalid_name',
  'Name > 50 characters rejected with invalid_name'
);

-- 50 active groups limit
set local role postgres;
-- Insert 49 more dummy groups for user 1 so total is 50
insert into public.groups (id, name, created_by)
select
  gen_random_uuid(),
  'Bulk Group ' || i,
  '11111111-1111-1111-1111-111111111111'
from generate_series(1, 49) i;

insert into public.group_members (group_id, user_id, role, status)
select
  g.id,
  '11111111-1111-1111-1111-111111111111',
  'admin',
  'active'
from public.groups g
where g.created_by = '11111111-1111-1111-1111-111111111111'
  and g.client_request_id is null;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select throws_ok(
  'select * from public.create_group(''51st Group'')',
  'group_limit_reached',
  'Attempting to create 51st group raises group_limit_reached'
);

-- ========================================================
-- 3. Setup members in the first group for read/members tests
-- ========================================================
set local role postgres;
-- Clean up the 49 bulk groups to keep tests clean
delete from public.groups where created_by = '11111111-1111-1111-1111-111111111111' and client_request_id is null;

-- Add user 2 (Bob Member, active)
insert into public.group_members (group_id, user_id, role, status)
select g.id, '22222222-2222-2222-2222-222222222222', 'member', 'active'
from public.groups g where g.client_request_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid;

-- Add user 4 (David Former, left)
insert into public.group_members (group_id, user_id, role, status, left_at)
select g.id, '44444444-4444-4444-4444-444444444444', 'member', 'left', now()
from public.groups g where g.client_request_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid;

-- Add user 5 (Eve Deleted, active)
insert into public.group_members (group_id, user_id, role, status)
select g.id, '55555555-5555-5555-5555-555555555555', 'member', 'active'
from public.groups g where g.client_request_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid;

-- ========================================================
-- 4. list_my_groups tests
-- ========================================================
-- User 2 (Bob Member) calls list_my_groups
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select is(
  (select count(*)::int from public.list_my_groups()),
  1,
  'list_my_groups returns 1 group for active member'
);

select is(
  (select my_role from public.list_my_groups() limit 1),
  'member',
  'list_my_groups reports my_role as member'
);

select is(
  (select member_count from public.list_my_groups() limit 1),
  3::bigint,
  'list_my_groups reports 3 active members (Alice, Bob, Eve)'
);

-- User 3 (Charlie NonMember) calls list_my_groups
set local "request.jwt.claims" to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';
select is_empty(
  'select * from public.list_my_groups()',
  'Non-member gets empty list from list_my_groups'
);

-- User 4 (David Former) calls list_my_groups
set local "request.jwt.claims" to '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}';
select is_empty(
  'select * from public.list_my_groups()',
  'Former member (status left) does not see group in list_my_groups'
);

-- ========================================================
-- 5. get_group tests
-- ========================================================
-- User 3 (non-member) throws not_a_member
set local "request.jwt.claims" to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';
select throws_ok(
  'select * from public.get_group((select id from public.groups where client_request_id = ''a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1''::uuid))',
  'not_a_member',
  'get_group raises not_a_member for non-member'
);

-- User 1 (active admin) gets group
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select is(
  (
    select my_role
    from public.get_group((select id from public.groups where client_request_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid))
  ),
  'admin',
  'get_group returns my_role = admin for admin caller'
);

-- ========================================================
-- 6. get_group_members tests
-- ========================================================
-- User 3 (non-member) throws not_a_member
set local "request.jwt.claims" to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';
select throws_ok(
  'select * from public.get_group_members((select id from public.groups where client_request_id = ''a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1''::uuid))',
  'not_a_member',
  'get_group_members raises not_a_member for non-member'
);

-- User 2 (Bob Member) calls get_group_members (default include_former = false)
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

-- Ordering check: Bob (caller, user 2) must be first row, then Alice (admin, user 1) second
select is(
  (
    select user_id
    from public.get_group_members((select id from public.groups where client_request_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid))
    limit 1
  ),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'get_group_members returns the caller first ("you")'
);

select is(
  (
    select user_id
    from public.get_group_members((select id from public.groups where client_request_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid))
    offset 1 limit 1
  ),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'get_group_members returns active admin second'
);

-- Deleted user appearance (Eve Deleted, user 5)
select is(
  (
    select name
    from public.get_group_members((select id from public.groups where client_request_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid))
    where user_id = '55555555-5555-5555-5555-555555555555'
  ),
  'Deleted user',
  'Deleted user appears with name "Deleted user"'
);

select is(
  (
    select upi_id
    from public.get_group_members((select id from public.groups where client_request_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid))
    where user_id = '55555555-5555-5555-5555-555555555555'
  ),
  null,
  'Deleted user has null upi_id'
);

-- Former member exclusion by default
select is(
  (
    select count(*)::int
    from public.get_group_members((select id from public.groups where client_request_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid))
    where user_id = '44444444-4444-4444-4444-444444444444'
  ),
  0,
  'Former member (David) is excluded when p_include_former is false'
);

-- Former member inclusion when p_include_former is true, BUT upi_id is null
select is(
  (
    select upi_id
    from public.get_group_members(
      (select id from public.groups where client_request_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid),
      true
    )
    where user_id = '44444444-4444-4444-4444-444444444444'
  ),
  null,
  'Former member UPI ID is null even when former members are included (GS10)'
);

-- ========================================================
-- 7. rename_group tests
-- ========================================================
-- User 2 (Bob Member, non-admin) calls rename_group -> raises not_admin
select throws_ok(
  'select * from public.rename_group((select id from public.groups where client_request_id = ''a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1''::uuid), ''New Name'')',
  'not_admin',
  'Non-admin caller cannot rename group (raises not_admin)'
);

-- User 1 (Alice Admin) calls rename_group -> success
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select is(
  (
    select name
    from public.rename_group(
      (select id from public.groups where client_request_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid),
      '  Goa   Trip   2026  '
    )
  ),
  'Goa Trip 2026',
  'Admin renames group and internal spaces are trimmed and collapsed'
);

select * from finish();
rollback;
