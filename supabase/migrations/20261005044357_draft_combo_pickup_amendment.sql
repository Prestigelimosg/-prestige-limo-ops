-- Extend only the existing combo membership transaction for one TRF pickup
-- amendment. The ordinary selection path and every dispatch writer stay intact.
-- No new function, route, permission, table, child-row rewrite or Calendar writer.
do $repair$
declare
  target oid := to_regprocedure('public.define_driver_job_combo(text,jsonb,uuid,text,text)');
  body text;
  definition text;
begin
  select prosrc,pg_get_functiondef(oid) into body,definition from pg_proc where oid=target;
  if target is null or md5(body) is distinct from '77781fc7b0a7d0e2e5291550f0bf1883' then
    raise exception 'Draft combo pickup amendment: definition changed.';
  end if;
  definition:=replace(definition,'  n integer;','  n integer; prior_combo_write text;');
  definition:=replace(definition,$old$or x - array['booking_reference','updated_at'] <> '{}'::jsonb) then$old$,$new$or x - array['booking_reference','updated_at','pickup_at'] <> '{}'::jsonb
    or (x ? 'pickup_at' and (jsonb_typeof(x->'pickup_at') is distinct from 'string'
      or length(x->>'pickup_at') not between 20 and 40))) then$new$);
  definition:=replace(definition,$old$  if n=1 then$old$,$new$  -- Internal Update + Cal pickup amendment: reuse the same locked membership
  -- transaction, never combine a time edit with adding/removing trips.
  if exists(select 1 from jsonb_array_elements(p_members) x where x ? 'pickup_at') then
    if g.id is null or g.driver_id is not null or g.offer_key is not null
      or (select count(*) from jsonb_array_elements(p_members) x where x ? 'pickup_at')<>1
      or (select array_agg(r order by r) from unnest(refs) r) is distinct from
        (select array_agg(booking_reference order by booking_reference) from public.driver_job_combo_members where combo_id=g.id)
      or exists(select 1 from public.driver_job_links where booking_reference=any(refs))
      or exists(select 1 from public.driver_job_status_events where booking_reference=any(refs)) then
      raise exception 'Only an unchanged, unposted and unlinked draft combo can change pickup time.' using errcode='PT409';
    end if;
    g:=public.lock_driver_job_combo(g.id,p_expected_revision);
  end if;
  if n=1 then$new$);
  definition:=replace(definition,$old$  -- The published single-vehicle requirement is reviewed separately in the existing Pool control.$old$,$new$  if exists(select 1 from jsonb_array_elements(p_members) x where x ? 'pickup_at') then
    select x into member from jsonb_array_elements(p_members) x where x ? 'pickup_at';
    select * into b from public.bookings where booking_reference=member->>'booking_reference';
    if coalesce(upper(btrim(b.service_type)),'')<>'TRF'
      or not isfinite((member->>'pickup_at')::timestamptz)
      or (member->>'pickup_at')::timestamptz<=clock_timestamp()
      or (b.dropoff_datetime is not null and b.dropoff_datetime<=(member->>'pickup_at')::timestamptz) then
      raise exception 'Review the TRF pickup time and its saved end before updating the draft combo.' using errcode='22023';
    end if;
    prior_combo_write:=current_setting('prestige.combo_write',true);
    perform set_config('prestige.combo_write',g.id::text,true);
    update public.bookings set pickup_at=(member->>'pickup_at')::timestamptz,updated_at=clock_timestamp()
      where booking_reference=b.booking_reference;
    perform set_config('prestige.combo_write',coalesce(prior_combo_write,''),true);
  end if;
  -- The published single-vehicle requirement is reviewed separately in the existing Pool control.$new$);
  execute definition;
end;
$repair$;
