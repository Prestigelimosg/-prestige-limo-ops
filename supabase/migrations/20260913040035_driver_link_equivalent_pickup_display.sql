-- Preserve one Driver link when browser date display differs only by Sep / Sept.
-- No data backfill, notification send, Calendar, GPS or access-policy change.
create or replace function public.apply_admin_driver_job_link(
  p_booking_reference text, p_expected_updated_at timestamptz, p_driver_id bigint,
  p_payload jsonb, p_revision text, p_token_hash text, p_ciphertext text,
  p_expires_at timestamptz, p_actor_role text, p_actor_label text, p_expected_driver_state jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  b public.bookings%rowtype;
  l public.driver_job_links%rowtype;
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_disposition text;
  v_payload jsonb;
  v_equivalent_pickup_display boolean;
begin
  if p_actor_role not in ('admin','dispatcher') or p_actor_role is null
    or p_expected_updated_at is null or jsonb_typeof(p_payload) is distinct from 'object'
    or p_revision !~ '^[a-f0-9]{64}$' or p_revision is null
    or p_token_hash !~ '^[a-f0-9]{64}$' or p_token_hash is null
    or coalesce(length(p_ciphertext),0) not between 20 and 1200
    or p_expires_at <= v_now or p_expires_at > v_now + interval '7 days'
    or p_expires_at is null then
    raise exception 'Invalid Driver Job Link request.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in (
    'assigned_driver_contact','assigned_driver_name','assigned_driver_plate','assigned_driver_vehicle_model',
    'booking_type','dropoff_location','flight_no','passenger_name','pickup_date','pickup_datetime',
    'pickup_location','pickup_time','route','status','waypoints')) then
    raise exception 'Invalid safe job fields.' using errcode='22023';
  end if;
  select * into b from public.bookings where booking_reference=p_booking_reference for update;
  if not found or b.updated_at is distinct from p_expected_updated_at then
    raise exception 'The saved booking changed. Reload before creating the link.' using errcode='40001';
  end if;
  if b.driver_id is distinct from p_driver_id then
    raise exception 'The driver assignment changed. Reload the booking.' using errcode='40001';
  end if;
  -- ACK updates driver details without changing the booking timestamp. Compare that snapshot too.
  if jsonb_build_object('driver_name',b.driver_name,'driver_contact',b.driver_contact,
      'driver_plate_number',b.driver_plate_number,'vehicle_type_or_category',b.vehicle_type_or_category)
    is distinct from p_expected_driver_state then
    raise exception 'The saved driver details changed. Reload the booking.' using errcode='40001';
  end if;
  if exists(select 1 from unnest(array[b.status,b.admin_internal_status,b.customer_facing_status]) s
    where lower(btrim(s)) in ('cancelled','canceled','completed','complete','archived','deleted','declined','declined_internal','history','job completed','job_completed')) then
    raise exception 'A terminal booking cannot receive a Driver Job Link.' using errcode='22023';
  end if;
  if exists(select 1 from public.driver_job_bid_offers where booking_reference=p_booking_reference
    and offer_status='open' and closes_at>v_now) then
    raise exception 'Close the open Driver Pool offer before creating a link.' using errcode='22023';
  end if;
  -- Use the same booking-first lock order as the existing reassignment writer.
  perform id from public.driver_job_links where booking_reference=p_booking_reference order by id for update;
  select count(*) into v_count from public.driver_job_links where booking_reference=p_booking_reference
    and link_status='active' and revoked_at is null and expires_at>v_now;
  if v_count>1 then
    raise exception 'Existing duplicate job links require exact Admin review.' using errcode='22023';
  end if;
  -- Explicitly retired duplicates remain history, not the current active link.
  -- Keep newest-active ordering before access validation: no expired-row fallback.
  select * into l from public.driver_job_links where booking_reference=p_booking_reference
    and (v_count=0 or link_status='active')
    order by created_at desc,id desc limit 1;
  if v_count=1 then
    if l.link_status<>'active' or l.revoked_at is not null or l.expires_at<=v_now
      or l.driver_id is distinct from b.driver_id then
      raise exception 'Existing link access requires Admin review.' using errcode='22023';
    end if;
    if coalesce(length(l.safe_link_context->>'native_handoff_ciphertext'),0)<20 then
      raise exception 'Existing link cannot be recovered securely. Use explicit access recovery.' using errcode='22023';
    end if;
    v_payload := (l.safe_link_context->'driver_job_payload')
      - array['driver_contact','driver_name','driver_plate_number','driver_vehicle_model'];
    if jsonb_typeof(v_payload) is distinct from 'object' then
      raise exception 'Existing job revision requires Admin review.' using errcode='22023';
    end if;
    -- Chrome and iOS format September differently. Compare only this exact display variant;
    -- every other field, day, year and time still participates in amendment detection.
    v_equivalent_pickup_display :=
      (v_payload - 'pickup_datetime') = (p_payload - 'pickup_datetime')
      and (v_payload->>'pickup_datetime') is distinct from (p_payload->>'pickup_datetime')
      and regexp_replace(v_payload->>'pickup_datetime',
        '^([0-9]{1,2}) Sept ([0-9]{4}, [0-9]{4}hrs)$', '\1 Sep \2') =
        regexp_replace(p_payload->>'pickup_datetime',
        '^([0-9]{1,2}) Sept ([0-9]{4}, [0-9]{4}hrs)$', '\1 Sep \2');
    v_disposition := case when v_payload=p_payload or v_equivalent_pickup_display
      then 'reused' else 'amended' end;
    if v_disposition='amended' then
      update public.driver_job_links set
        safe_link_context=l.safe_link_context || jsonb_build_object(
          'driver_job_payload',p_payload || jsonb_strip_nulls(jsonb_build_object(
            'driver_contact',l.safe_link_context->'driver_job_payload'->'driver_contact',
            'driver_name',l.safe_link_context->'driver_job_payload'->'driver_name',
            'driver_plate_number',l.safe_link_context->'driver_job_payload'->'driver_plate_number',
            'driver_vehicle_model',l.safe_link_context->'driver_job_payload'->'driver_vehicle_model')),
          'job_card_revision',p_revision,'job_card_kind','amendment'), updated_at=v_now
        where id=l.id returning * into l;
    elsif not coalesce(v_equivalent_pickup_display,false)
      and l.safe_link_context->>'job_card_revision' is distinct from p_revision then
      -- Retain the complete stored row for display-only reuse, including delivery revision.
      -- ACK may have filled safe driver fields since issue; equal current payload is not an amendment.
      update public.driver_job_links set safe_link_context=l.safe_link_context || jsonb_build_object('job_card_revision',p_revision)
        where id=l.id returning * into l;
    end if;
  else
    insert into public.driver_job_links(booking_reference,driver_id,token_hash,link_status,
      expires_at,safe_link_context,issued_at,created_at,updated_at,actor_role,actor_label,source_surface)
    values(p_booking_reference,b.driver_id,p_token_hash,'active',p_expires_at,
      jsonb_build_object('driver_job_payload',p_payload,'job_card_revision',p_revision,
        'job_card_kind',case when l.id is null then 'new'
          when l.safe_link_context->>'job_card_revision' ~ '^[a-f0-9]{64}$' then
            case when (l.safe_link_context->'driver_job_payload')
              - array['driver_contact','driver_name','driver_plate_number','driver_vehicle_model'] = p_payload
              then 'reissued' else 'amendment' end
          else null end,
        'link_purpose','manual_driver_assignment_job_card','native_handoff_ciphertext',p_ciphertext),
      v_now,v_now,v_now,p_actor_role,left(p_actor_label,160),'admin_api') returning * into l;
    v_disposition:='created';
  end if;
  return jsonb_build_object('link',to_jsonb(l),'disposition',v_disposition);
end;
$$;
revoke all on function public.apply_admin_driver_job_link(text,timestamptz,bigint,jsonb,text,text,text,timestamptz,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.apply_admin_driver_job_link(text,timestamptz,bigint,jsonb,text,text,text,timestamptz,text,text,jsonb) to service_role;
