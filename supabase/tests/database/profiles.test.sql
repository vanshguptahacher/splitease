begin;
select plan(7);

-- Test 1: Anonymous cannot read profiles
set local role anon;
select throws_ok(
  'select * from public.profiles',
  '42501',
  null,
  'anon role cannot select from profiles (permission denied)'
);

-- Test 2: RLS blocks selecting other users' profiles
-- Create test user A and user B in auth.users
set local role postgres;
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'usera@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'userb@example.com')
on conflict (id) do nothing;

-- Verify trigger automatically created their profiles
select isnt_empty(
  'select * from public.profiles where id = ''11111111-1111-1111-1111-111111111111''',
  'Trigger automatically creates profile on auth user creation'
);

-- Test 3: As User A, cannot select User B's profile
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select is(
  (select count(*)::int from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  0,
  'User A cannot select User B profile'
);

-- Test 4: As User A, cannot update User B's profile
update public.profiles set name = 'Hacked' where id = '22222222-2222-2222-2222-222222222222';
set local role postgres;
select is(
  (select name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'userb',
  'User A cannot update User B profile'
);

-- Test 5: Check constraint rejects name > 50 chars
select throws_ok(
  'insert into public.profiles (id, name) values (gen_random_uuid(), ''This is an extremely long name that exceeds fifty characters limit'')',
  '23514',
  null,
  'Name > 50 characters is rejected by check constraint'
);

-- Test 6: Check constraint rejects invalid UPI ID format
select throws_ok(
  'insert into public.profiles (id, name, upi_id) values (gen_random_uuid(), ''Test User'', ''invalid_upi'')',
  '23514',
  null,
  'Invalid UPI ID format is rejected by check constraint'
);

-- Test 7: ensure_my_profile() is idempotent and creates profile if missing
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select isnt_empty(
  'select * from public.ensure_my_profile()',
  'ensure_my_profile() returns existing profile idempotently'
);

select * from finish();
rollback;
