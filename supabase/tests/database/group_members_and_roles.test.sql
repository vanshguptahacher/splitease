begin;
select plan(41);

-- Setup test users in auth.users
set local role postgres;
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'admin1@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'admin2@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'member1@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'member2@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'outsider@example.com'),
  ('66666666-6666-6666-6666-666666666666', 'del_user@example.com')
on conflict (id) do nothing;

update public.profiles set name = 'Alice Admin1' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set name = 'Bob Admin2' where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set name = 'Charlie Member1' where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set name = 'David Member2' where id = '44444444-4444-4444-4444-444444444444';
update public.profiles set name = 'Eve Outsider' where id = '55555555-5555-5555-5555-555555555555';
update public.profiles set name = 'Frank DelUser' where id = '66666666-6666-6666-6666-666666666666';

create temp table temp_vars (key text primary key, val text);
grant all on temp_vars to authenticated;

-- Setup primary test group with 2 admins and 2 members
insert into public.groups (id, name, created_by)
values ('10000000-0000-0000-0000-000000000001', 'Role Test Group', '11111111-1111-1111-1111-111111111111');

insert into public.group_members (group_id, user_id, role, status)
values
  ('10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'admin', 'active'),
  ('10000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'admin', 'active'),
  ('10000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'member', 'active'),
  ('10000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'member', 'active');

-- ========================================================
-- 1. Anonymous callers rejected (permission denied)
-- ========================================================
set local role anon;

select throws_ok(
  'select public.set_member_role(''10000000-0000-0000-0000-000000000001'', ''33333333-3333-3333-3333-333333333333'', ''admin'')',
  '42501',
  null,
  'Anon cannot execute set_member_role'
);

select throws_ok(
  'select public.remove_member(''10000000-0000-0000-0000-000000000001'', ''33333333-3333-3333-3333-333333333333'')',
  '42501',
  null,
  'Anon cannot execute remove_member'
);

select throws_ok(
  'select public.leave_group(''10000000-0000-0000-0000-000000000001'')',
  '42501',
  null,
  'Anon cannot execute leave_group'
);

select throws_ok(
  'select public.delete_group(''10000000-0000-0000-0000-000000000001'')',
  '42501',
  null,
  'Anon cannot execute delete_group'
);

-- ========================================================
-- 2. Outsider callers rejected (not_a_member)
-- ========================================================
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "55555555-5555-5555-5555-555555555555", "role": "authenticated"}';

select throws_ok(
  'select public.set_member_role(''10000000-0000-0000-0000-000000000001'', ''33333333-3333-3333-3333-333333333333'', ''admin'')',
  'not_a_member',
  'Outsider cannot call set_member_role'
);

select throws_ok(
  'select public.remove_member(''10000000-0000-0000-0000-000000000001'', ''33333333-3333-3333-3333-333333333333'')',
  'not_a_member',
  'Outsider cannot call remove_member'
);

select throws_ok(
  'select public.leave_group(''10000000-0000-0000-0000-000000000001'')',
  'not_a_member',
  'Outsider cannot call leave_group'
);

select throws_ok(
  'select public.delete_group(''10000000-0000-0000-0000-000000000001'')',
  'not_a_member',
  'Outsider cannot call delete_group'
);

-- ========================================================
-- 3. Non-admin members rejected from admin actions (not_admin)
-- ========================================================
set local "request.jwt.claims" to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

select throws_ok(
  'select public.set_member_role(''10000000-0000-0000-0000-000000000001'', ''44444444-4444-4444-4444-444444444444'', ''admin'')',
  'not_admin',
  'Regular member cannot promote or demote'
);

select throws_ok(
  'select public.remove_member(''10000000-0000-0000-0000-000000000001'', ''44444444-4444-4444-4444-444444444444'')',
  'not_admin',
  'Regular member cannot remove members'
);

select throws_ok(
  'select public.delete_group(''10000000-0000-0000-0000-000000000001'')',
  'not_admin',
  'Regular member cannot delete group'
);

-- ========================================================
-- 4. Admin Role Management (set_member_role)
-- ========================================================
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

-- Invalid role
select throws_ok(
  'select public.set_member_role(''10000000-0000-0000-0000-000000000001'', ''33333333-3333-3333-3333-333333333333'', ''owner'')',
  'invalid_role',
  'Invalid role string rejected'
);

-- Promote member to admin
select lives_ok(
  'select public.set_member_role(''10000000-0000-0000-0000-000000000001'', ''33333333-3333-3333-3333-333333333333'', ''admin'')',
  'Admin promotes member1 to admin'
);

set local role postgres;
select results_eq(
  'select role from public.group_members where group_id = ''10000000-0000-0000-0000-000000000001'' and user_id = ''33333333-3333-3333-3333-333333333333''',
  $$values ('admin')$$,
  'Member1 role is now admin'
);

-- Idempotency check
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select lives_ok(
  'select public.set_member_role(''10000000-0000-0000-0000-000000000001'', ''33333333-3333-3333-3333-333333333333'', ''admin'')',
  'Promoting already admin is idempotent (no-op)'
);

-- Demote an admin (3 admins exist now: admin1, admin2, member1)
select lives_ok(
  'select public.set_member_role(''10000000-0000-0000-0000-000000000001'', ''33333333-3333-3333-3333-333333333333'', ''member'')',
  'Admin demotes member1 back to member'
);

-- Demote self when another admin exists (admin2 demotes self, admin1 remains)
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select lives_ok(
  'select public.set_member_role(''10000000-0000-0000-0000-000000000001'', ''22222222-2222-2222-2222-222222222222'', ''member'')',
  'Admin2 demotes themselves to member while admin1 exists'
);

-- Demote last admin (only admin1 remains as admin)
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select throws_ok(
  'select public.set_member_role(''10000000-0000-0000-0000-000000000001'', ''11111111-1111-1111-1111-111111111111'', ''member'')',
  'last_admin',
  'Cannot demote the last remaining admin'
);

-- Cannot set role for someone who is not an active member
select throws_ok(
  'select public.set_member_role(''10000000-0000-0000-0000-000000000001'', ''55555555-5555-5555-5555-555555555555'', ''admin'')',
  'target_not_member',
  'Cannot change role of a non-member'
);

-- ========================================================
-- 5. Member Removal (remove_member)
-- ========================================================
-- Cannot remove self
select throws_ok(
  'select public.remove_member(''10000000-0000-0000-0000-000000000001'', ''11111111-1111-1111-1111-111111111111'')',
  'cannot_remove_self',
  'Admin cannot remove themselves directly (must use Leave)'
);

-- Cannot remove an admin directly
-- Promote member1 back to admin to test removing admin
select public.set_member_role('10000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'admin');

select throws_ok(
  'select public.remove_member(''10000000-0000-0000-0000-000000000001'', ''33333333-3333-3333-3333-333333333333'')',
  'cannot_remove_admin',
  'Admin cannot remove another admin without demoting first'
);

-- Demote member1, then remove member1
select public.set_member_role('10000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'member');

select lives_ok(
  'select public.remove_member(''10000000-0000-0000-0000-000000000001'', ''33333333-3333-3333-3333-333333333333'')',
  'Admin removes member1 after demotion'
);

set local role postgres;
select results_eq(
  'select status, removed_by from public.group_members where group_id = ''10000000-0000-0000-0000-000000000001'' and user_id = ''33333333-3333-3333-3333-333333333333''',
  $$values ('removed'::text, '11111111-1111-1111-1111-111111111111'::uuid)$$,
  'Member1 status is removed and removed_by is admin1'
);

-- ========================================================
-- 6. Leaving Group (leave_group)
-- ========================================================
-- Regular member leaves (member2)
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}';

select results_eq(
  'select public.leave_group(''10000000-0000-0000-0000-000000000001'')',
  $$values ('left'::text)$$,
  'Member2 leaves group successfully returning left'
);

set local role postgres;
select results_eq(
  'select status, role from public.group_members where group_id = ''10000000-0000-0000-0000-000000000001'' and user_id = ''44444444-4444-4444-4444-444444444444''',
  $$values ('left'::text, 'member'::text)$$,
  'Member2 status is left and role is member'
);

-- Last admin tries to leave while another member (admin2 who is now member) exists
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select throws_ok(
  'select public.leave_group(''10000000-0000-0000-0000-000000000001'')',
  'last_admin',
  'Last admin cannot leave when other active members remain'
);

-- Admin who is not the last admin can leave:
-- First promote admin2 back to admin, then admin1 leaves
select public.set_member_role('10000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'admin');

select results_eq(
  'select public.leave_group(''10000000-0000-0000-0000-000000000001'')',
  $$values ('left'::text)$$,
  'Admin1 leaves group successfully when admin2 is also admin'
);

-- Sole member leaves: group is deleted
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select results_eq(
  'select public.leave_group(''10000000-0000-0000-0000-000000000001'')',
  $$values ('group_deleted'::text)$$,
  'Sole member leaves group, group is deleted returning group_deleted'
);

set local role postgres;
select is_empty(
  'select 1 from public.groups where id = ''10000000-0000-0000-0000-000000000001''',
  'Group row was deleted cascade upon sole member leaving'
);

-- ========================================================
-- 7. Delete Group (delete_group)
-- ========================================================
-- Create a group to test delete_group
insert into public.groups (id, name, created_by)
values ('10000000-0000-0000-0000-000000000002', 'Group To Delete', '11111111-1111-1111-1111-111111111111');

insert into public.group_members (group_id, user_id, role, status)
values ('10000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'admin', 'active');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select lives_ok(
  'select public.delete_group(''10000000-0000-0000-0000-000000000002'')',
  'Admin deletes group'
);

set local role postgres;
select is_empty(
  'select 1 from public.groups where id = ''10000000-0000-0000-0000-000000000002''',
  'Group was deleted'
);

-- ========================================================
-- 8. Stubs Switched to False (GM2, GM7, GE5, GD4)
-- ========================================================
-- Create test group with admin and member
insert into public.groups (id, name, created_by)
values ('10000000-0000-0000-0000-000000000003', 'Unsettled Group', '11111111-1111-1111-1111-111111111111');

insert into public.group_members (group_id, user_id, role, status)
values
  ('10000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'admin', 'active'),
  ('10000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'member', 'active');

-- Temporarily redefine member_is_settled to return false
create or replace function public.member_is_settled(p_group uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select false; $$;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select throws_ok(
  'select public.remove_member(''10000000-0000-0000-0000-000000000003'', ''33333333-3333-3333-3333-333333333333'')',
  'member_not_settled',
  'GM2: remove_member blocked when member_is_settled is false'
);

select throws_ok(
  'select public.leave_group(''10000000-0000-0000-0000-000000000003'')',
  'member_not_settled',
  'GM7: leave_group blocked when member_is_settled is false'
);

-- Temporarily redefine group_is_settled to return false
set local role postgres;
create or replace function public.group_is_settled(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select false; $$;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select throws_ok(
  'select public.delete_group(''10000000-0000-0000-0000-000000000003'')',
  'group_not_settled',
  'GE5: delete_group blocked when group_is_settled is false'
);

-- Restore stubs to return true
set local role postgres;
create or replace function public.member_is_settled(p_group uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select true; $$;

create or replace function public.group_is_settled(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select true; $$;

-- Clean up test group 3
delete from public.groups where id = '10000000-0000-0000-0000-000000000003';

-- ========================================================
-- 9. Account Deletion Blockers & delete_my_account (GD1 to GD6)
-- ========================================================
-- Setup user 66666666-6666-6666-6666-666666666666:
-- 1. Sole admin of group A (which also has member 33333333) -> blocks account deletion
-- 2. Member of group B (with admin 11111111) -> marked left on account deletion
-- 3. Sole member of group C -> deleted on account deletion

insert into public.groups (id, name, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Sole Admin Group', '66666666-6666-6666-6666-666666666666'),
  ('10000000-0000-0000-0000-00000000000b', 'Co-Member Group', '11111111-1111-1111-1111-111111111111'),
  ('10000000-0000-0000-0000-00000000000c', 'Solo Group', '66666666-6666-6666-6666-666666666666');

insert into public.group_members (group_id, user_id, role, status) values
  ('10000000-0000-0000-0000-00000000000a', '66666666-6666-6666-6666-666666666666', 'admin', 'active'),
  ('10000000-0000-0000-0000-00000000000a', '33333333-3333-3333-3333-333333333333', 'member', 'active'),
  ('10000000-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111', 'admin', 'active'),
  ('10000000-0000-0000-0000-00000000000b', '66666666-6666-6666-6666-666666666666', 'member', 'active'),
  ('10000000-0000-0000-0000-00000000000c', '66666666-6666-6666-6666-666666666666', 'admin', 'active');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "66666666-6666-6666-6666-666666666666", "role": "authenticated"}';

-- Check blockers
select is(
  (public.account_deletion_blockers()->'sole_admin_groups'->0->>'name')::text,
  'Sole Admin Group'::text,
  'account_deletion_blockers returns Sole Admin Group'
);

select throws_ok(
  'select public.delete_my_account(false)',
  'sole_admin',
  'GD1: delete_my_account blocked by sole_admin check'
);

-- Now remove the blocker: promote member 33333333 to admin in Group A
set local role postgres;
update public.group_members set role = 'admin'
 where group_id = '10000000-0000-0000-0000-00000000000a' and user_id = '33333333-3333-3333-3333-333333333333';

-- Now call delete_my_account
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "66666666-6666-6666-6666-666666666666", "role": "authenticated"}';

select lives_ok(
  'select public.delete_my_account(false)',
  'delete_my_account succeeds when no sole_admin blockers exist'
);

set local role postgres;
-- Check Group A: user status is left
select results_eq(
  'select status from public.group_members where group_id = ''10000000-0000-0000-0000-00000000000a'' and user_id = ''66666666-6666-6666-6666-666666666666''',
  $$values ('left'::text)$$,
  'GD3: Group A membership is marked left'
);

-- Check Group C (solo group): deleted
select is_empty(
  'select 1 from public.groups where id = ''10000000-0000-0000-0000-00000000000c''',
  'GD2: Solo group C was deleted automatically'
);

-- Check Profile: anonymized
select results_eq(
  'select name, avatar_path, upi_id from public.profiles where id = ''66666666-6666-6666-6666-666666666666''',
  $$values ('Deleted user'::text, null::text, null::text)$$,
  'GD6: Profile is anonymized with Deleted user and null avatar/upi'
);

-- Check Auth: deleted from auth.users
select is_empty(
  'select 1 from auth.users where id = ''66666666-6666-6666-6666-666666666666''',
  'User is deleted from auth.users'
);

rollback;
