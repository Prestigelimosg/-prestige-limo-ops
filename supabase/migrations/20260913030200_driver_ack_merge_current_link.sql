-- Preserve the newest job revision when first acknowledgement races an Admin amendment.
-- Existing token verification and driver identity resolution still run before this transaction.
create function public.acknowledge_current_driver_job_link(
  p_booking_reference text,p_link_id uuid,p_token_hash text,p_driver_id bigint,
  p_name text,p_contact text,p_plate text,p_vehicle text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  b public.bookings%rowtype;
  l public.driver_job_links%rowtype;
  current_payload jsonb;
  details jsonb;
  ack_at timestamptz := clock_timestamp();
begin
  if p_driver_id is null or p_driver_id<=0 or coalesce(length(trim(p_name)),0) not between 1 and 160
    or coalesce(length(p_contact),0)>80 or coalesce(length(p_plate),0)>80 or coalesce(length(p_vehicle),0)>160
    or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid acknowledgement details'; end if;
  select * into b from public.bookings where booking_reference=p_booking_reference for update;
  if not found then raise exception 'Booking unavailable'; end if;
  select * into l from public.driver_job_links where id=p_link_id and booking_reference=p_booking_reference and token_hash=p_token_hash for update;
  if not found or l.link_status<>'active' or l.revoked_at is not null or l.expires_at is null or l.expires_at<=ack_at then
    raise exception 'Driver link unavailable';
  end if;
  if (b.driver_id is not null and b.driver_id<>p_driver_id)
    or (l.driver_id is not null and (b.driver_id is null or l.driver_id<>p_driver_id)) then
    raise exception 'Driver assignment changed';
  end if;
  if exists(select 1 from unnest(array[b.status,b.admin_internal_status,b.customer_facing_status]) s
    where lower(trim(s)) in ('archived','cancelled','canceled','complete','completed','declined','declined_internal','history','job completed','job_completed','deleted')) then
    raise exception 'Booking is terminal';
  end if;
  current_payload := l.safe_link_context->'driver_job_payload';
  if jsonb_typeof(current_payload) is distinct from 'object' then raise exception 'Job details unavailable'; end if;
  details := jsonb_build_object('assigned_driver_name',p_name,'assigned_driver_contact',coalesce(p_contact,''),
    'assigned_driver_plate',coalesce(p_plate,''),'assigned_driver_vehicle_model',coalesce(p_vehicle,''),
    'driver_name',p_name,'driver_contact',coalesce(p_contact,''),'driver_plate_number',coalesce(p_plate,''),'driver_vehicle_model',coalesce(p_vehicle,''));
  if nullif(l.safe_link_context->>'driver_acknowledged_at','') is not null then
    if not current_payload @> details then raise exception 'Already acknowledged details are locked'; end if;
    return to_jsonb(l);
  end if;
  update public.bookings set driver_id=p_driver_id,driver_name=p_name,driver_contact=nullif(p_contact,''),
    driver_plate_number=nullif(p_plate,''),vehicle_type_or_category=coalesce(nullif(p_vehicle,''),vehicle_type_or_category)
    where booking_reference=p_booking_reference;
  update public.driver_job_links set driver_id=p_driver_id,
    safe_link_context=l.safe_link_context || jsonb_build_object('driver_acknowledged_at',ack_at,'driver_job_payload',current_payload || details)
    where id=l.id returning * into l;
  return to_jsonb(l);
end;
$$;
revoke all on function public.acknowledge_current_driver_job_link(text,uuid,text,bigint,text,text,text,text) from public,anon,authenticated;
grant execute on function public.acknowledge_current_driver_job_link(text,uuid,text,bigint,text,text,text,text) to service_role;
