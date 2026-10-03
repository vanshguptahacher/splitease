begin;
select plan(16);

-- ========================================================
-- 1. Anonymous Caller Rejected
-- ========================================================
set local role anon;
select throws_ok(
  'select public.account_deletion_blockers()',
  '42501',
  null,
  'anon role cannot call account_deletion_blockers (permission denied)'
);

select throws_ok(
  'select public.delete_my_account()',
  '42501',
  null,
  'anon role cannot call delete_my_account (permission denied)'
);

-- ========================================================
-- 2. Blocking: sole_admin_groups
-- ========================================================
set local role postgres;
insert into auth.users (id, email)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'soleadmin@example.com')
on conflict (id) do nothing;

-- Mock account_deletion_blockers() to return non-empty sole_admin_groups
create or replace function public.account_deletion_blockers()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return jsonb_build_object(
    'sole_admin_groups', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'name', 'Blocking Group')),
    'unsettled_groups', '[]'::jsonb
  );
end;
$$;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}';

select throws_ok(
  'select public.delete_my_account()',
  'sole_admin',
  'delete_my_account() is blocked by sole_admin_groups'
);

-- Assert NOTHING was deleted (profile and auth user intact)
set local role postgres;
select isnt_empty(
  'select 1 from public.profiles where id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'' and name <> ''Deleted user''',
  'Profile is intact and not anonymized after sole_admin block'
);
select isnt_empty(
  'select 1 from auth.users where id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
  'Auth user is intact after sole_admin block'
);

-- ========================================================
-- 3. Blocking: unsettled_groups
-- ========================================================
create or replace function public.account_deletion_blockers()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return jsonb_build_object(
    'sole_admin_groups', '[]'::jsonb,
    'unsettled_groups', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'name', 'Owed Money Group'))
  );
end;
$$;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}';

select throws_ok(
  'select public.delete_my_account()',
  'unsettled_balances',
  'delete_my_account() is blocked by unsettled_groups'
);

set local role postgres;
select isnt_empty(
  'select 1 from public.profiles where id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'' and name <> ''Deleted user''',
  'Profile is intact and not anonymized after unsettled_balances block'
);
select isnt_empty(
  'select 1 from auth.users where id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
  'Auth user is intact after unsettled_balances block'
);

-- Restore account_deletion_blockers stub (empty blockers)
create or replace function public.account_deletion_blockers()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return jsonb_build_object(
    'sole_admin_groups', '[]'::jsonb,
    'unsettled_groups', '[]'::jsonb
  );
end;
$$;

-- ========================================================
-- 4. No References: Hard Delete Profile + Delete Auth User
-- ========================================================
insert into auth.users (id, email)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'noref@example.com')
on conflict (id) do nothing;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "role": "authenticated"}';

select lives_ok(
  'select public.delete_my_account()',
  'delete_my_account succeeds for unreferenced user'
);

set local role postgres;
select is_empty(
  'select 1 from public.profiles where id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''',
  'Unreferenced profile is HARD DELETED (row is gone)'
);
select is_empty(
  'select 1 from auth.users where id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''',
  'Auth user is deleted'
);

-- ========================================================
-- 5. Referenced Profile: Smart Delete Anonymizes Profile + Deletes Auth User
-- ========================================================
insert into auth.users (id, email)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'hasref@example.com')
on conflict (id) do nothing;

-- Create temporary referencing table with foreign key to public.profiles(id)
create table public.temp_expenses_test (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  amount int not null
);

insert into public.temp_expenses_test (profile_id, amount)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 50000);

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "cccccccc-cccc-cccc-cccc-cccccccccccc", "role": "authenticated"}';

select lives_ok(
  'select public.delete_my_account()',
  'delete_my_account succeeds for referenced user'
);

set local role postgres;
select isnt_empty(
  'select 1 from public.profiles where id = ''cccccccc-cccc-cccc-cccc-cccccccccccc''',
  'Referenced profile row STILL EXISTS'
);
select results_eq(
  'select name, avatar_path, avatar_url, upi_id, (deleted_at is not null) from public.profiles where id = ''cccccccc-cccc-cccc-cccc-cccccccccccc''',
  $$values ('Deleted user'::text, null::text, null::text, null::text, true)$$,
  'Referenced profile is anonymized: name Deleted user, null avatar/upi, deleted_at is set'
);
select is_empty(
  'select 1 from auth.users where id = ''cccccccc-cccc-cccc-cccc-cccccccccccc''',
  'Auth user is deleted even when profile is anonymized'
);

-- ========================================================
-- 6. Signing up again with same email creates brand-new profile (Case F6)
-- ========================================================
insert into auth.users (id, email)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'hasref@example.com');

select results_eq(
  'select name, deleted_at is null from public.profiles where id = ''dddddddd-dddd-dddd-dddd-dddddddddddd''',
  $$values ('hasref'::text, true)$$,
  'Case F6: Re-signing up with same email creates fresh brand-new profile with new ID'
);

select * from finish();
rollback;
