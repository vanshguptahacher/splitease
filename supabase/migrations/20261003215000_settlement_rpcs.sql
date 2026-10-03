-- =============================================================================
-- Migration: settlement_rpcs
-- Sub-phase 5.3: Settlement write RPCs (create, confirm, dispute, cancel)
--                and read RPC (list_settlements)
-- =============================================================================

-- 1. Create settlement
create or replace function public.create_settlement(
  p_group uuid,
  p_client_request_id uuid,
  p_from_user uuid,
  p_to_user uuid,
  p_amount_minor bigint,
  p_method text,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  v_note     text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]]', '', 'g')), '');
  v_status   text;
  v_id       uuid;
  v_existing uuid;
  v_pending  int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- 1) Shared group lock
  perform 1 from public.groups g where g.id = p_group for share;
  if not found or not public.is_active_member(p_group) then
    raise exception 'not_a_member';
  end if;

  -- Idempotency check: if already created by this user with this client_request_id, return existing
  if p_client_request_id is not null then
    select s.id into v_existing from public.settlements s
     where s.created_by = v_uid and s.client_request_id = p_client_request_id;
    if found then return v_existing; end if;
  end if;

  -- Validation
  if p_from_user is null or p_to_user is null or p_from_user = p_to_user then
    raise exception 'invalid_settlement';
  end if;

  if v_uid not in (p_from_user, p_to_user) then
    raise exception 'settlement_not_allowed';
  end if;

  if p_amount_minor is null or p_amount_minor < 1 or p_amount_minor > 1000000000 then
    raise exception 'invalid_amount';
  end if;

  if p_method is null or p_method not in ('cash', 'other') then
    raise exception 'invalid_method';
  end if;

  if v_note is not null and char_length(v_note) > 100 then
    raise exception 'invalid_note';
  end if;

  -- Both people must be active members
  if not exists (select 1 from public.group_members gm
                  where gm.group_id = p_group and gm.user_id = p_from_user and gm.status = 'active') then
    raise exception 'payer_not_member' using detail = p_from_user::text;
  end if;

  if not exists (select 1 from public.group_members gm
                  where gm.group_id = p_group and gm.user_id = p_to_user and gm.status = 'active') then
    raise exception 'receiver_not_member' using detail = p_to_user::text;
  end if;

  -- Spam guard: max 10 pending payments per person per group
  select count(*) into v_pending from public.settlements s
   where s.group_id = p_group and s.created_by = v_uid and s.status = 'pending';
  if v_pending >= 10 then
    raise exception 'too_many_pending';
  end if;

  -- Pre-check duplicate pending (friendly check; unique index is the real guard)
  if exists (select 1 from public.settlements s
              where s.group_id = p_group and s.from_user = p_from_user and s.to_user = p_to_user
                and s.amount_minor = p_amount_minor and s.status = 'pending') then
    raise exception 'duplicate_pending';
  end if;

  -- Receiver records "I received" -> confirmed immediately; Payer records "I paid" -> pending
  v_status := case when v_uid = p_to_user then 'confirmed' else 'pending' end;

  begin
    insert into public.settlements
      (group_id, from_user, to_user, amount_minor, method, note, status,
       created_by, client_request_id, confirmed_at)
    values
      (p_group, p_from_user, p_to_user, p_amount_minor, p_method, v_note, v_status,
       v_uid, p_client_request_id, case when v_status = 'confirmed' then now() end)
    returning id into v_id;
  exception when unique_violation then
    if p_client_request_id is not null then
      select s.id into v_existing from public.settlements s
       where s.created_by = v_uid and s.client_request_id = p_client_request_id;
      if found then return v_existing; end if;
    end if;
    raise exception 'duplicate_pending';
  end;

  insert into public.activity_log (group_id, actor_id, action, ref_id, details)
  values (p_group, v_uid, 'settlement_created', v_id,
          jsonb_build_object('from_user', p_from_user, 'to_user', p_to_user,
                             'amount_minor', p_amount_minor, 'method', p_method, 'status', v_status));

  return v_id;
end;
$$;

revoke execute on function public.create_settlement(uuid, uuid, uuid, uuid, bigint, text, text) from public, anon;
grant  execute on function public.create_settlement(uuid, uuid, uuid, uuid, bigint, text, text) to authenticated;


-- 2. Confirm settlement (Receiver only)
create or replace function public.confirm_settlement(p_settlement uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_group uuid;
  v_s     public.settlements;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select s.group_id into v_group from public.settlements s where s.id = p_settlement;
  if not found then raise exception 'settlement_not_found'; end if;

  -- 1) Shared group lock
  perform 1 from public.groups g where g.id = v_group for share;
  if not public.is_active_member(v_group) then raise exception 'not_a_member'; end if;

  -- 2) Exclusive settlement lock
  select * into v_s from public.settlements s where s.id = p_settlement for update;
  if not found then raise exception 'settlement_not_found'; end if;

  -- Silent no-op if already confirmed
  if v_s.status = 'confirmed' then return; end if;

  -- Receiver only
  if v_uid <> v_s.to_user then raise exception 'settlement_not_allowed'; end if;

  -- Only pending or disputed can be confirmed
  if v_s.status not in ('pending', 'disputed') then
    raise exception 'invalid_transition';
  end if;

  -- Both members must still be active
  if not exists (select 1 from public.group_members gm where gm.group_id = v_group
                  and gm.user_id = v_s.from_user and gm.status = 'active')
     or not exists (select 1 from public.group_members gm where gm.group_id = v_group
                  and gm.user_id = v_s.to_user and gm.status = 'active') then
    raise exception 'settlement_locked';
  end if;

  update public.settlements
     set status = 'confirmed',
         confirmed_at = now(),
         status_changed_at = now(),
         updated_at = now()
   where id = p_settlement;

  insert into public.activity_log (group_id, actor_id, action, ref_id, details)
  values (v_group, v_uid, 'settlement_confirmed', p_settlement,
          jsonb_build_object('from_user', v_s.from_user, 'to_user', v_s.to_user,
                             'amount_minor', v_s.amount_minor, 'previous_status', v_s.status));
end;
$$;

revoke execute on function public.confirm_settlement(uuid) from public, anon;
grant  execute on function public.confirm_settlement(uuid) to authenticated;


-- 3. Dispute settlement (Receiver only, from pending only)
create or replace function public.dispute_settlement(p_settlement uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_group uuid;
  v_s     public.settlements;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select s.group_id into v_group from public.settlements s where s.id = p_settlement;
  if not found then raise exception 'settlement_not_found'; end if;

  -- 1) Shared group lock
  perform 1 from public.groups g where g.id = v_group for share;
  if not public.is_active_member(v_group) then raise exception 'not_a_member'; end if;

  -- 2) Exclusive settlement lock
  select * into v_s from public.settlements s where s.id = p_settlement for update;
  if not found then raise exception 'settlement_not_found'; end if;

  -- Silent no-op if already disputed
  if v_s.status = 'disputed' then return; end if;

  -- Receiver only
  if v_uid <> v_s.to_user then raise exception 'settlement_not_allowed'; end if;

  -- Only pending can be disputed
  if v_s.status <> 'pending' then
    raise exception 'invalid_transition';
  end if;

  update public.settlements
     set status = 'disputed',
         confirmed_at = null,
         status_changed_at = now(),
         updated_at = now()
   where id = p_settlement;

  insert into public.activity_log (group_id, actor_id, action, ref_id, details)
  values (v_group, v_uid, 'settlement_disputed', p_settlement,
          jsonb_build_object('from_user', v_s.from_user, 'to_user', v_s.to_user,
                             'amount_minor', v_s.amount_minor));
end;
$$;

revoke execute on function public.dispute_settlement(uuid) from public, anon;
grant  execute on function public.dispute_settlement(uuid) to authenticated;


-- 4. Cancel settlement (Payer cancels pending/disputed; Receiver undoes confirmed within 10 min)
create or replace function public.cancel_settlement(p_settlement uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_group uuid;
  v_s     public.settlements;
  v_undo  boolean := false;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select s.group_id into v_group from public.settlements s where s.id = p_settlement;
  if not found then raise exception 'settlement_not_found'; end if;

  -- 1) Shared group lock
  perform 1 from public.groups g where g.id = v_group for share;
  if not public.is_active_member(v_group) then raise exception 'not_a_member'; end if;

  -- 2) Exclusive settlement lock
  select * into v_s from public.settlements s where s.id = p_settlement for update;
  if not found then raise exception 'settlement_not_found'; end if;

  -- Silent no-op if already cancelled
  if v_s.status = 'cancelled' then return; end if;

  if v_s.status in ('pending', 'disputed') then
    if v_uid <> v_s.from_user then raise exception 'settlement_not_allowed'; end if;
  elsif v_s.status = 'confirmed' then
    if v_uid <> v_s.to_user then raise exception 'settlement_not_allowed'; end if;
    if v_s.confirmed_at < now() - interval '10 minutes' then
      raise exception 'undo_window_passed';
    end if;
    if not exists (select 1 from public.group_members gm where gm.group_id = v_group
                    and gm.user_id = v_s.from_user and gm.status = 'active')
       or not exists (select 1 from public.group_members gm where gm.group_id = v_group
                    and gm.user_id = v_s.to_user and gm.status = 'active') then
      raise exception 'settlement_locked';
    end if;
    v_undo := true;
  else
    raise exception 'invalid_transition';
  end if;

  update public.settlements
     set status = 'cancelled',
         confirmed_at = null,
         status_changed_at = now(),
         updated_at = now()
   where id = p_settlement;

  insert into public.activity_log (group_id, actor_id, action, ref_id, details)
  values (v_group, v_uid, 'settlement_cancelled', p_settlement,
          jsonb_build_object('from_user', v_s.from_user, 'to_user', v_s.to_user,
                             'amount_minor', v_s.amount_minor, 'undo', v_undo));
end;
$$;

revoke execute on function public.cancel_settlement(uuid) from public, anon;
grant  execute on function public.cancel_settlement(uuid) to authenticated;


-- 5. List settlements with keyset pagination & caller permission flags
create or replace function public.list_settlements(
  p_group uuid,
  p_limit int default 30,
  p_cursor jsonb default null
)
returns table (
  id uuid,
  group_id uuid,
  from_user uuid,
  to_user uuid,
  amount_minor bigint,
  currency text,
  method text,
  note text,
  status text,
  created_by uuid,
  created_at timestamptz,
  status_changed_at timestamptz,
  confirmed_at timestamptz,
  can_confirm boolean,
  can_dispute boolean,
  can_cancel boolean,
  can_undo boolean,
  next_cursor jsonb
)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_active_member(p_group) then raise exception 'not_a_member'; end if;

  return query
  with active_members as (
    select gm.user_id
      from public.group_members gm
     where gm.group_id = p_group and gm.status = 'active'
  )
  select
    s.id,
    s.group_id,
    s.from_user,
    s.to_user,
    s.amount_minor,
    s.currency,
    s.method,
    s.note,
    s.status,
    s.created_by,
    s.created_at,
    s.status_changed_at,
    s.confirmed_at,
    -- can_confirm: receiver only, status pending/disputed, both members currently active
    (s.to_user = v_uid
     and s.status in ('pending', 'disputed')
     and exists (select 1 from active_members am where am.user_id = s.from_user)
     and exists (select 1 from active_members am where am.user_id = s.to_user)) as can_confirm,
    -- can_dispute: receiver only, status pending
    (s.to_user = v_uid and s.status = 'pending') as can_dispute,
    -- can_cancel: payer only, status pending/disputed
    (s.from_user = v_uid and s.status in ('pending', 'disputed')) as can_cancel,
    -- can_undo: receiver only, status confirmed within 10 minutes, both members currently active
    (s.to_user = v_uid
     and s.status = 'confirmed'
     and s.confirmed_at >= now() - interval '10 minutes'
     and exists (select 1 from active_members am where am.user_id = s.from_user)
     and exists (select 1 from active_members am where am.user_id = s.to_user)) as can_undo,
    jsonb_build_object(
      'created_at', s.created_at,
      'id', s.id
    ) as next_cursor
  from public.settlements s
  where s.group_id = p_group
    and (
      p_cursor is null
      or (s.created_at, s.id) < (
        (p_cursor->>'created_at')::timestamptz,
        (p_cursor->>'id')::uuid
      )
    )
  order by s.created_at desc, s.id desc
  limit coalesce(nullif(p_limit, 0), 30);
end;
$$;

revoke execute on function public.list_settlements(uuid, int, jsonb) from public, anon;
grant  execute on function public.list_settlements(uuid, int, jsonb) to authenticated;
