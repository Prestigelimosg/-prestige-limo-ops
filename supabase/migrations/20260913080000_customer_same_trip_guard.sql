-- Opt-in only for the existing authenticated Customer request writer. No backfill.
-- Apply before the compatible application. Old writers and all UPDATE paths are unchanged.
alter table public.bookings add column customer_request_trip_group jsonb;

create function public.customer_same_trip_text(p text) returns text
language sql immutable security invoker set search_path = '' as $$
 select lower(regexp_replace(trim(coalesce(p,'')), '\s+', ' ', 'g'));
$$;

create function public.customer_same_trip_key(p jsonb) returns jsonb
language sql immutable security invoker set search_path = '' as $$
 select jsonb_build_array(
  p->>'customer_id',p->>'company_id',p->>'booker_id',
  case when p->>'traveler_id' is not null then 'id:'||(p->>'traveler_id')
       else 'name:'||public.customer_same_trip_text(p->>'passenger_name') end,
  extract(epoch from (p->>'pickup_at')::timestamptz),
  public.customer_same_trip_text(p->>'pickup_location'),
  public.customer_same_trip_text(p->>'dropoff_location'),
  public.customer_same_trip_text(p->>'service_type'),
  public.customer_same_trip_text(p->>'vehicle_type_or_category'),
  public.customer_same_trip_text(p->>'flight_no'),p->>'pax_count',p->>'luggage_count',
  (select coalesce(jsonb_agg(public.customer_same_trip_text(s.value) order by s.ordinality),'[]'::jsonb)
     from jsonb_array_elements_text(coalesce(p->'stops','[]'::jsonb)) with ordinality s));
$$;

create function public.check_customer_same_trip(p_group jsonb)
returns table(duplicate boolean, public_reference text, in_progress boolean)
language plpgsql volatile security invoker set search_path = '' as $$
declare v_leg jsonb; v_existing record; v_stops jsonb; v_reserved jsonb;
begin
 if jsonb_typeof(p_group) is distinct from 'array' or jsonb_array_length(p_group) not between 1 and 2 then
  raise exception using errcode='PBD02',message='customer_trip_check_unavailable';
 end if;
 if not exists(select from pg_catalog.pg_trigger where tgrelid='public.bookings'::regclass
   and tgname='customer_same_trip_guard' and tgenabled in ('O','A')) then
  raise exception using errcode='PBD02',message='customer_trip_check_unavailable';
 end if;
 foreach v_leg in array array(select value from jsonb_array_elements(p_group)) loop
  if coalesce(v_leg->>'customer_id','') !~ '^[1-9][0-9]*$'
    or ((v_leg->>'company_id' is null) <> (v_leg->>'booker_id' is null))
    or coalesce(v_leg->>'booking_reference','') !~ '^CUST-[A-Za-z0-9-]+$'
    or v_leg->>'pickup_at' is null or public.customer_same_trip_text(v_leg->>'pickup_location')=''
    or public.customer_same_trip_text(v_leg->>'dropoff_location')=''
    or (v_leg->>'traveler_id' is null and public.customer_same_trip_text(v_leg->>'passenger_name')='') then
   raise exception using errcode='PBD02',message='customer_trip_check_unavailable';
  end if;
  for v_existing in
   select b.* from public.bookings b
   where b.customer_id=(v_leg->>'customer_id')::bigint
    and b.company_id is not distinct from (v_leg->>'company_id')::bigint
    and b.booker_id is not distinct from (v_leg->>'booker_id')::bigint
    and lower(trim(coalesce(b.status,''))) not in ('cancelled','canceled')
    and lower(trim(coalesce(b.request_review_status,''))) not in ('rejected','declined')
    and not exists(select from jsonb_array_elements(p_group) x where x->>'booking_reference'=b.booking_reference)
    and (b.pickup_at=(v_leg->>'pickup_at')::timestamptz
      or (b.customer_request_trip_group is not null and (b.created_at at time zone 'UTC')>clock_timestamp()-interval '5 minutes'))
   order by b.id
  loop
   -- Read current route evidence, not an old request snapshot after an amendment.
   select jsonb_agg(r.location order by r.sequence) into v_stops
     from public.booking_route_points r where r.booking_id=v_existing.id and r.point_type in ('stop','waypoint');
   if v_stops is null and not exists(select from public.booking_route_points r where r.booking_id=v_existing.id) then
    select x->'stops' into v_stops from jsonb_array_elements(v_existing.customer_request_trip_group) x
      where x->>'booking_reference'=v_existing.booking_reference;
   end if;
   if public.customer_same_trip_key(to_jsonb(v_existing)||jsonb_build_object('stops',coalesce(v_stops,'[]'::jsonb)))
      =public.customer_same_trip_key(v_leg) then
    return query select true,v_existing.public_booking_reference::text,false; return;
   end if;
   -- The first persisted leg temporarily fences the not-yet-persisted return leg.
   -- No timer or new table. Expired incomplete groups cannot accept a late worker.
   if (v_existing.created_at at time zone 'UTC')>clock_timestamp()-interval '5 minutes' then
    for v_reserved in select value from jsonb_array_elements(v_existing.customer_request_trip_group) loop
     if not exists(select from public.bookings b where b.booking_reference=v_reserved->>'booking_reference')
       and public.customer_same_trip_key(v_reserved)=public.customer_same_trip_key(v_leg) then
      return query select true,null::text,true; return;
     end if;
    end loop;
   end if;
  end loop;
 end loop;
 return query select false,null::text,false;
end;
$$;

create function public.enforce_customer_same_trip() returns trigger
language plpgsql volatile security invoker set search_path = '' as $$
declare v_self jsonb; v_first public.bookings%rowtype; v_match record; v_base text;
begin
 if new.customer_request_trip_group is null then return new; end if;
 if new.source_surface is distinct from 'customer_booking_request'
  or jsonb_typeof(new.customer_request_trip_group) is distinct from 'array'
  or jsonb_array_length(new.customer_request_trip_group) not between 1 and 2 then
  raise exception using errcode='PBD02',message='customer_trip_check_unavailable';
 end if;
 -- Account serialization covers both legs even when competing groups have different outbound trips.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  new.customer_id::text||':'||coalesce(new.company_id::text,'')||':'||coalesce(new.booker_id::text,''), 1709));
 select x into v_self from jsonb_array_elements(new.customer_request_trip_group) x
  where x->>'booking_reference'=new.booking_reference;
 if v_self is null or public.customer_same_trip_key(v_self) is distinct from
    public.customer_same_trip_key(to_jsonb(new)||jsonb_build_object('stops',v_self->'stops')) then
  raise exception using errcode='PBD02',message='customer_trip_check_unavailable';
 end if;
 if exists(select from jsonb_array_elements(new.customer_request_trip_group) x
   where x->>'customer_id' is distinct from v_self->>'customer_id'
    or x->>'company_id' is distinct from v_self->>'company_id'
    or x->>'booker_id' is distinct from v_self->>'booker_id') then
  raise exception using errcode='PBD02',message='customer_trip_check_unavailable';
 end if;
 if jsonb_array_length(new.customer_request_trip_group)=2 then
  v_base:=regexp_replace(new.customer_request_trip_group->0->>'booking_reference','-OUT$','');
  if new.customer_request_trip_group->0->>'booking_reference' <> v_base||'-OUT'
   or new.customer_request_trip_group->1->>'booking_reference' <> v_base||'-RET' then
   raise exception using errcode='PBD02',message='customer_trip_check_unavailable';
  end if;
  if new.booking_reference=v_base||'-RET' then
   select * into v_first from public.bookings where booking_reference=v_base||'-OUT';
   if not found or v_first.customer_request_trip_group is distinct from new.customer_request_trip_group
    or (v_first.created_at at time zone 'UTC')<=clock_timestamp()-interval '5 minutes'
    or lower(trim(coalesce(v_first.status,''))) in ('cancelled','canceled')
    or lower(trim(coalesce(v_first.request_review_status,''))) in ('rejected','declined') then
    raise exception using errcode='PBD02',message='customer_trip_check_unavailable';
   end if;
  end if;
 end if;
 select * into v_match from public.check_customer_same_trip(new.customer_request_trip_group);
 if v_match.duplicate then
  raise exception using errcode='PBD01',message='customer_trip_duplicate',
   detail=jsonb_build_object('public_reference',v_match.public_reference,'in_progress',v_match.in_progress)::text;
 end if;
 return new;
end;
$$;
create trigger customer_same_trip_guard before insert on public.bookings
 for each row execute function public.enforce_customer_same_trip();
revoke all on function public.customer_same_trip_text(text),public.customer_same_trip_key(jsonb),
 public.check_customer_same_trip(jsonb),public.enforce_customer_same_trip() from public,anon,authenticated;
grant execute on function public.customer_same_trip_text(text),public.customer_same_trip_key(jsonb),
 public.check_customer_same_trip(jsonb),public.enforce_customer_same_trip() to service_role;
