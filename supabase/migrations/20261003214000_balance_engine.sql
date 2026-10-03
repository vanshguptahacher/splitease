-- =============================================================================
-- Migration: balance_engine
-- Sub-phase 5.2: compute_group_nets, compute_simplified_debts,
--                get_group_balances, get_my_balance_summary
-- =============================================================================

-- 1. Internal: Net balance calculation per person in a group
create or replace function public.compute_group_nets(p_group uuid)
returns table (member_id uuid, net_minor bigint)
language sql stable security definer set search_path = '' as $$
  with paid as (
    select e.paid_by as uid, sum(e.amount_minor) as amt
      from public.expenses e
     where e.group_id = p_group and e.deleted_at is null
     group by e.paid_by
  ),
  owed as (
    select s.user_id as uid, sum(s.share_minor) as amt
      from public.expense_splits s
      join public.expenses e on e.id = s.expense_id
     where e.group_id = p_group and e.deleted_at is null
     group by s.user_id
  ),
  sent as (
    select st.from_user as uid, sum(st.amount_minor) as amt
      from public.settlements st
     where st.group_id = p_group and st.status = 'confirmed'
     group by st.from_user
  ),
  recv as (
    select st.to_user as uid, sum(st.amount_minor) as amt
      from public.settlements st
     where st.group_id = p_group and st.status = 'confirmed'
     group by st.to_user
  ),
  people as (
    select uid from paid
    union select uid from owed
    union select uid from sent
    union select uid from recv
    union select gm.user_id from public.group_members gm
           where gm.group_id = p_group and gm.status = 'active'
  )
  select p.uid,
         (coalesce(pa.amt, 0) - coalesce(ow.amt, 0) + coalesce(se.amt, 0) - coalesce(re.amt, 0))::bigint
    from people p
    left join paid pa on pa.uid = p.uid
    left join owed ow on ow.uid = p.uid
    left join sent se on se.uid = p.uid
    left join recv re on re.uid = p.uid;
$$;

-- Internal helper: clients have zero execute privileges
revoke execute on function public.compute_group_nets(uuid) from public, anon, authenticated;


-- 2. Internal: Compute simplified debt suggestions (greedy largest creditor & debtor)
create or replace function public.compute_simplified_debts(p_group uuid)
returns table (seq int, from_user uuid, to_user uuid, amount_minor bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  cred_ids uuid[];   cred_amt bigint[];
  debt_ids uuid[];   debt_amt bigint[];
  ci int;  di int;  k int;  v_pay bigint;  v_seq int := 0;
begin
  select array_agg(n.member_id order by n.net_minor desc, n.member_id),
         array_agg(n.net_minor order by n.net_minor desc, n.member_id)
    into cred_ids, cred_amt
    from public.compute_group_nets(p_group) n where n.net_minor > 0;

  select array_agg(n.member_id order by n.net_minor asc, n.member_id),
         array_agg(-n.net_minor order by n.net_minor asc, n.member_id)
    into debt_ids, debt_amt
    from public.compute_group_nets(p_group) n where n.net_minor < 0;

  loop
    ci := null; di := null;

    -- largest creditor (ties: smaller id)
    for k in 1 .. coalesce(array_length(cred_ids, 1), 0) loop
      if cred_amt[k] > 0 and (ci is null or cred_amt[k] > cred_amt[ci]
         or (cred_amt[k] = cred_amt[ci] and cred_ids[k] < cred_ids[ci])) then
        ci := k;
      end if;
    end loop;

    -- largest debtor (ties: smaller id)
    for k in 1 .. coalesce(array_length(debt_ids, 1), 0) loop
      if debt_amt[k] > 0 and (di is null or debt_amt[k] > debt_amt[di]
         or (debt_amt[k] = debt_amt[di] and debt_ids[k] < debt_ids[di])) then
        di := k;
      end if;
    end loop;

    exit when ci is null or di is null;

    v_pay := least(cred_amt[ci], debt_amt[di]);
    v_seq := v_seq + 1;
    return query select v_seq, debt_ids[di], cred_ids[ci], v_pay;

    cred_amt[ci] := cred_amt[ci] - v_pay;
    debt_amt[di] := debt_amt[di] - v_pay;
  end loop;
end;
$$;

-- Internal helper: clients have zero execute privileges
revoke execute on function public.compute_simplified_debts(uuid) from public, anon, authenticated;


-- 3. Client RPC: Single-call snapshot of group balances
create or replace function public.get_group_balances(p_group uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_active_member(p_group) then raise exception 'not_a_member'; end if;

  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', n.member_id, 'net_minor', n.net_minor)
                       order by n.net_minor desc, n.member_id)
        from public.compute_group_nets(p_group) n), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('seq', d.seq, 'from_user', d.from_user, 'to_user', d.to_user,
                                          'amount_minor', d.amount_minor) order by d.seq)
        from public.compute_simplified_debts(p_group) d), '[]'::jsonb),
    'my_net_minor', coalesce((
      select n.net_minor from public.compute_group_nets(p_group) n where n.member_id = v_uid), 0),
    'pending_for_me', (
      select count(*) from public.settlements s
       where s.group_id = p_group and s.status = 'pending' and s.to_user = v_uid)
  );
end;
$$;

revoke execute on function public.get_group_balances(uuid) from public, anon;
grant  execute on function public.get_group_balances(uuid) to authenticated;


-- 4. Client RPC: Cross-group balance summary for home screen
create or replace function public.get_my_balance_summary()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid              uuid := auth.uid();
  v_owed_to_me_minor bigint := 0;
  v_i_owe_minor      bigint := 0;
  v_groups_with_dues int := 0;
  v_pending_for_me   int := 0;
  r record;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  for r in
    select coalesce(n.net_minor, 0) as net
      from public.group_members gm
      cross join lateral public.compute_group_nets(gm.group_id) n
     where gm.user_id = v_uid
       and gm.status = 'active'
       and n.member_id = v_uid
  loop
    if r.net > 0 then
      v_owed_to_me_minor := v_owed_to_me_minor + r.net;
      v_groups_with_dues := v_groups_with_dues + 1;
    elsif r.net < 0 then
      v_i_owe_minor := v_i_owe_minor + (-r.net);
      v_groups_with_dues := v_groups_with_dues + 1;
    end if;
  end loop;

  select count(*) into v_pending_for_me
    from public.settlements s
    join public.group_members gm
      on gm.group_id = s.group_id
     and gm.user_id = v_uid
     and gm.status = 'active'
   where s.status = 'pending'
     and s.to_user = v_uid;

  return jsonb_build_object(
    'owed_to_me_minor', v_owed_to_me_minor,
    'i_owe_minor', v_i_owe_minor,
    'net_minor', v_owed_to_me_minor - v_i_owe_minor,
    'groups_with_dues', v_groups_with_dues,
    'pending_for_me', v_pending_for_me
  );
end;
$$;

revoke execute on function public.get_my_balance_summary() from public, anon;
grant  execute on function public.get_my_balance_summary() to authenticated;
