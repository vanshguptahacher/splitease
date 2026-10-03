begin;
select plan(6);

set local role postgres;

-- -----------------------------------------------------------------------------
-- Property Testing Setup: 10 test users and fixed PRNG seed
-- -----------------------------------------------------------------------------
select setseed(0.42);

insert into auth.users (id, email)
values
  ('11111111-0000-0000-0000-000000000001', 'prop1@example.com'),
  ('11111111-0000-0000-0000-000000000002', 'prop2@example.com'),
  ('11111111-0000-0000-0000-000000000003', 'prop3@example.com'),
  ('11111111-0000-0000-0000-000000000004', 'prop4@example.com'),
  ('11111111-0000-0000-0000-000000000005', 'prop5@example.com'),
  ('11111111-0000-0000-0000-000000000006', 'prop6@example.com'),
  ('11111111-0000-0000-0000-000000000007', 'prop7@example.com'),
  ('11111111-0000-0000-0000-000000000008', 'prop8@example.com'),
  ('11111111-0000-0000-0000-000000000009', 'prop9@example.com'),
  ('11111111-0000-0000-0000-000000000010', 'prop10@example.com')
on conflict (id) do nothing;

create temp table prop_results (
  bc1_errors int not null default 0,
  bs1_errors int not null default 0,
  bs2_errors int not null default 0,
  bs3_errors int not null default 0,
  bs6_errors int not null default 0,
  bs7_errors int not null default 0
);
insert into prop_results values (0, 0, 0, 0, 0, 0);

-- Run property tests on 200 randomized groups
do $$
declare
  all_users uuid[] := array[
    '11111111-0000-0000-0000-000000000001'::uuid,
    '11111111-0000-0000-0000-000000000002'::uuid,
    '11111111-0000-0000-0000-000000000003'::uuid,
    '11111111-0000-0000-0000-000000000004'::uuid,
    '11111111-0000-0000-0000-000000000005'::uuid,
    '11111111-0000-0000-0000-000000000006'::uuid,
    '11111111-0000-0000-0000-000000000007'::uuid,
    '11111111-0000-0000-0000-000000000008'::uuid,
    '11111111-0000-0000-0000-000000000009'::uuid,
    '11111111-0000-0000-0000-000000000010'::uuid
  ];
  v_group_id uuid;
  v_m_count int;
  v_m_ids uuid[];
  v_exp_count int;
  v_set_count int;
  v_payer uuid;
  v_from uuid;
  v_to uuid;
  v_amt bigint;
  v_exp_id uuid;
  v_split_type text;
  v_status text;
  v_parts jsonb;
  v_sum_nets bigint;
  v_nonzero_count int;
  v_pay_count int;
  v_bs2_bad int;
  v_bs6_bad int;
  v_bs7_bad int;
  v_run1 text;
  v_run2 text;
  g int;
  e int;
  s int;
  p int;
  v_bc1 int := 0;
  v_bs1 int := 0;
  v_bs2 int := 0;
  v_bs3 int := 0;
  v_bs6 int := 0;
  v_bs7 int := 0;
begin
  for g in 1..200 loop
    v_group_id := gen_random_uuid();
    v_m_count := 2 + floor(random() * 9)::int; -- 2 to 10 members
    v_m_ids := all_users[1:v_m_count];

    insert into public.groups (id, name, currency, created_by)
    values (v_group_id, 'Prop Group ' || g, 'INR', v_m_ids[1]);

    for p in 1..v_m_count loop
      insert into public.group_members (group_id, user_id, role, status)
      values (v_group_id, v_m_ids[p], 'member', 'active');
    end loop;

    -- Generate 1 to 15 random expenses
    v_exp_count := 1 + floor(random() * 15)::int;
    for e in 1..v_exp_count loop
      v_exp_id := gen_random_uuid();
      v_payer := v_m_ids[1 + floor(random() * v_m_count)::int];
      v_amt := 100 + floor(random() * 1000000)::bigint;

      -- Random split type: 60% equal, 40% exact
      if random() < 0.6 then
        v_split_type := 'equal';
        -- pick random subset of members (at least 1)
        select jsonb_agg(jsonb_build_object('user_id', uid))
          into v_parts
          from (select unnest(v_m_ids) as uid order by random() limit (1 + floor(random() * v_m_count)::int)) sub;

        insert into public.expenses (id, group_id, amount_minor, paid_by, split_type, expense_date, created_by)
        values (v_exp_id, v_group_id, v_amt, v_payer, v_split_type, current_date, v_payer);

        insert into public.expense_splits (expense_id, user_id, share_minor, percent_bp)
        select v_exp_id, s.user_id, s.share_minor, s.percent_bp
          from public.compute_shares('equal', v_amt, v_parts) s;
      else
        v_split_type := 'exact';
        -- Split exact between 2 members: split amount into (v_amt / 2) and (v_amt - v_amt / 2)
        declare
          u1 uuid := v_m_ids[1];
          u2 uuid := v_m_ids[2];
          s1 bigint := v_amt / 2;
          s2 bigint := v_amt - s1;
        begin
          insert into public.expenses (id, group_id, amount_minor, paid_by, split_type, expense_date, created_by)
          values (v_exp_id, v_group_id, v_amt, v_payer, v_split_type, current_date, v_payer);

          insert into public.expense_splits (expense_id, user_id, share_minor)
          values (v_exp_id, u1, s1), (v_exp_id, u2, s2);
        end;
      end if;

      -- 15% soft-delete, and occasionally restore
      if random() < 0.15 then
        update public.expenses set deleted_at = now(), deleted_by = v_payer where id = v_exp_id;
        if random() < 0.4 then
          update public.expenses set deleted_at = null, deleted_by = null where id = v_exp_id;
        end if;
      end if;
    end loop;

    -- Generate 0 to 4 random settlements
    v_set_count := floor(random() * 5)::int;
    for s in 1..v_set_count loop
      v_from := v_m_ids[1 + floor(random() * v_m_count)::int];
      v_to := v_m_ids[1 + floor(random() * v_m_count)::int];
      if v_from <> v_to then
        v_amt := 50 + floor(random() * 50000)::bigint;
        -- status: 50% confirmed, 20% pending, 15% disputed, 15% cancelled
        declare
          r_stat float := random();
        begin
          if r_stat < 0.50 then
            v_status := 'confirmed';
          elsif r_stat < 0.70 then
            v_status := 'pending';
          elsif r_stat < 0.85 then
            v_status := 'disputed';
          else
            v_status := 'cancelled';
          end if;

          insert into public.settlements (group_id, from_user, to_user, amount_minor, method, status, created_by, confirmed_at)
          values (v_group_id, v_from, v_to, v_amt, 'cash', v_status, v_from, case when v_status = 'confirmed' then now() end)
          on conflict do nothing;
        end;
      end if;
    end loop;

    -- -------------------------------------------------------------------------
    -- Assert Invariants on Group g
    -- -------------------------------------------------------------------------
    -- BC1: sum of all nets is exactly 0
    select coalesce(sum(net_minor), 0) into v_sum_nets from public.compute_group_nets(v_group_id);
    if v_sum_nets <> 0 then v_bc1 := v_bc1 + 1; end if;

    -- BS1: count of payments <= max(0, non_zero_members - 1)
    select count(*) into v_nonzero_count from public.compute_group_nets(v_group_id) where net_minor <> 0;
    select count(*) into v_pay_count from public.compute_simplified_debts(v_group_id);
    if v_pay_count > greatest(0, v_nonzero_count - 1) then v_bs1 := v_bs1 + 1; end if;

    -- BS2: applying suggested payments brings every balance to exactly 0
    with applied as (
      select n.member_id,
             (n.net_minor + coalesce(se.amt, 0) - coalesce(re.amt, 0))::bigint as final_net
        from public.compute_group_nets(v_group_id) n
        left join (select from_user, sum(amount_minor) as amt from public.compute_simplified_debts(v_group_id) group by from_user) se on se.from_user = n.member_id
        left join (select to_user, sum(amount_minor) as amt from public.compute_simplified_debts(v_group_id) group by to_user) re on re.to_user = n.member_id
    )
    select count(*) into v_bs2_bad from applied where final_net <> 0;
    if v_bs2_bad > 0 then v_bs2 := v_bs2 + 1; end if;

    -- BS3: Deterministic: calling twice yields identical output
    select coalesce(string_agg(seq || ':' || from_user || ':' || to_user || ':' || amount_minor, ',' order by seq), '')
      into v_run1 from public.compute_simplified_debts(v_group_id);
    select coalesce(string_agg(seq || ':' || from_user || ':' || to_user || ':' || amount_minor, ',' order by seq), '')
      into v_run2 from public.compute_simplified_debts(v_group_id);
    if v_run1 <> v_run2 then v_bs3 := v_bs3 + 1; end if;

    -- BS6: Every payment has amount > 0, from debtor (net < 0) to creditor (net > 0)
    select count(*) into v_bs6_bad
      from public.compute_simplified_debts(v_group_id) d
      join public.compute_group_nets(v_group_id) n_from on n_from.member_id = d.from_user
      join public.compute_group_nets(v_group_id) n_to on n_to.member_id = d.to_user
     where d.amount_minor <= 0 or n_from.net_minor >= 0 or n_to.net_minor <= 0;
    if v_bs6_bad > 0 then v_bs6 := v_bs6 + 1; end if;

    -- BS7: Person with zero net balance never appears in suggestions
    select count(*) into v_bs7_bad
      from public.compute_simplified_debts(v_group_id) d
      join public.compute_group_nets(v_group_id) n on n.member_id in (d.from_user, d.to_user)
     where n.net_minor = 0;
    if v_bs7_bad > 0 then v_bs7 := v_bs7 + 1; end if;

  end loop;

  update prop_results
     set bc1_errors = v_bc1,
         bs1_errors = v_bs1,
         bs2_errors = v_bs2,
         bs3_errors = v_bs3,
         bs6_errors = v_bs6,
         bs7_errors = v_bs7;
end;
$$;

select is(
  (select bc1_errors from prop_results),
  0,
  'BC1: sum of all nets is exactly 0 in all 200 random groups'
);

select is(
  (select bs1_errors from prop_results),
  0,
  'BS1: suggested payments count <= n - 1 in all 200 random groups'
);

select is(
  (select bs2_errors from prop_results),
  0,
  'BS2: applying suggestions brings every balance to 0 in all 200 random groups'
);

select is(
  (select bs3_errors from prop_results),
  0,
  'BS3: identical deterministic output on repeat calls in all 200 random groups'
);

select is(
  (select bs6_errors from prop_results),
  0,
  'BS6: each payment is amount > 0, from debtor to creditor in all 200 random groups'
);

select is(
  (select bs7_errors from prop_results),
  0,
  'BS7: zero-balance members never appear in suggestions in all 200 random groups'
);

rollback;
