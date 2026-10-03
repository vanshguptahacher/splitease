-- Migration: 20261003154000_compute_shares.sql
-- Description: Sub-phase 4.2 - SQL split engine function

create or replace function public.compute_shares(
  p_type text, p_amount bigint, p_participants jsonb
) returns table (user_id uuid, share_minor bigint, percent_bp integer)
language plpgsql immutable set search_path = '' as $$
declare
  v_count    int;
  v_distinct int;
  v_sum      bigint;
begin
  if p_participants is null
     or jsonb_typeof(p_participants) <> 'array'
     or jsonb_array_length(p_participants) = 0 then
    raise exception 'no_participants';
  end if;

  v_count := jsonb_array_length(p_participants);
  if v_count > 50 then raise exception 'too_many_participants'; end if;

  -- every element: an object with a valid uuid user_id
  if exists (
    select 1 from jsonb_array_elements(p_participants) e
    where jsonb_typeof(e) <> 'object'
       or coalesce(e ->> 'user_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'invalid_split_value';
  end if;

  select count(distinct (e ->> 'user_id')::uuid) into v_distinct
    from jsonb_array_elements(p_participants) e;
  if v_distinct <> v_count then raise exception 'duplicate_participant'; end if;

  if p_type = 'equal' then
    return query
      with p as (select (e ->> 'user_id')::uuid as uid from jsonb_array_elements(p_participants) e),
           n as (select uid, row_number() over (order by uid) as rn, count(*) over () as cnt from p)
      select n.uid,
             (p_amount / n.cnt) + case when n.rn <= (p_amount % n.cnt) then 1 else 0 end,
             null::integer
        from n
       order by n.uid;
    return;
  end if;

  if p_type = 'exact' then
    if exists (
      select 1 from jsonb_array_elements(p_participants) e
      where coalesce(jsonb_typeof(e -> 'value'), '') <> 'number'
         or coalesce(e ->> 'value', '') !~ '^[1-9][0-9]{0,9}$'
    ) then
      raise exception 'invalid_split_value';
    end if;

    select sum((e ->> 'value')::bigint) into v_sum from jsonb_array_elements(p_participants) e;
    if v_sum <> p_amount then raise exception 'splits_dont_add_up'; end if;

    return query
      select (e ->> 'user_id')::uuid as uid, (e ->> 'value')::bigint, null::integer
        from jsonb_array_elements(p_participants) e
       order by uid;
    return;
  end if;

  if p_type = 'percent' then
    if exists (
      select 1 from jsonb_array_elements(p_participants) e
      where coalesce(jsonb_typeof(e -> 'value'), '') <> 'number'
         or coalesce(e ->> 'value', '') !~ '^([1-9][0-9]{0,3}|10000)$'      -- 1 to 10000
    ) then
      raise exception 'invalid_split_value';
    end if;

    select sum((e ->> 'value')::bigint) into v_sum from jsonb_array_elements(p_participants) e;
    if v_sum <> 10000 then raise exception 'splits_dont_add_up'; end if;

    return query
      with p as (select (e ->> 'user_id')::uuid as uid, (e ->> 'value')::int as bp
                   from jsonb_array_elements(p_participants) e),
           c as (select uid, bp,
                        (p_amount * bp) / 10000 as base,
                        (p_amount * bp) % 10000 as frac
                   from p),
           t as (select sum(base) as s from c),
           r as (select c.*, row_number() over (order by c.frac desc, c.uid) as rn from c)
      select r.uid,
             r.base + case when r.rn <= (p_amount - (select s from t)) then 1 else 0 end,
             r.bp
        from r
       order by r.uid;
    return;
  end if;

  raise exception 'invalid_split_type';
end;
$$;

revoke execute on function public.compute_shares(text, bigint, jsonb) from public, anon, authenticated;
