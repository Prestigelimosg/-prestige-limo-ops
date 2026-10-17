-- LOCAL PREPARATION ONLY. UNAPPLIED. No hosted authorization.
-- Same writer, one signature: remove the old overload inside the transaction.
-- SECURITY INVOKER and service-role-only execute remain mandatory.
begin;
do $baseline$ begin
  if not exists(select 1 from pg_proc where oid=to_regprocedure('public.apply_admin_driver_job_link(text,timestamptz,bigint,jsonb,text,text,text,timestamptz,text,text,jsonb)') and not prosecdef and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='e3c89763b5993b9dadd19981061d904f') or
     not exists(select 1 from pg_proc where oid=to_regprocedure('public.reserve_driver_job_link_delivery(text,uuid,bigint,text,text,uuid,text,text)') and not prosecdef and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='66f9433507c025e249a3afda26e15c22') then
    raise exception 'Existing Driver link/ACK delivery definitions changed; inspect before applying QA preparation.';
  end if;
end $baseline$;
drop function public.apply_admin_driver_job_link(text,timestamptz,bigint,jsonb,text,text,text,timestamptz,text,text,jsonb);
create or replace function public.apply_admin_driver_job_link(
  p_booking_reference text, p_expected_updated_at timestamptz, p_driver_id bigint,
  p_payload jsonb, p_revision text, p_token_hash text, p_ciphertext text,
  p_expires_at timestamptz, p_actor_role text, p_actor_label text, p_expected_driver_state jsonb,
  p_review_booking jsonb default null
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
    or (p_review_booking is null and coalesce(length(p_ciphertext),0) not between 20 and 1200)
    or (p_review_booking is not null and p_ciphertext is not null)
    or p_expires_at <= v_now or p_expires_at > v_now + interval '7 days'
    or p_expires_at is null then
    raise exception 'Invalid Driver Job Link request.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in (
    'assigned_driver_contact','assigned_driver_name','assigned_driver_plate','assigned_driver_vehicle_model',
    'booking_type','dropoff_location','flight_no','passenger_name','pickup_date','pickup_datetime',
    'pickup_location','pickup_time','route','status','waypoints','driver_remark')) then
    raise exception 'Invalid safe job fields.' using errcode='22023';
  end if;
  select * into b from public.bookings where booking_reference=p_booking_reference for update;
  if not found or b.updated_at is distinct from p_expected_updated_at then
    raise exception 'The saved booking changed. Reload before creating the link.' using errcode='40001';
  end if;
  -- Never publish an untagged legacy note or a stale/unsaved remark.
  if p_payload ? 'driver_remark' and (jsonb_typeof(p_payload->'driver_remark') <> 'string'
    or length(p_payload->>'driver_remark') > 500
    or (p_payload->>'driver_remark') ~* '[<>]|https?://|\$|\m(SGD|paynow|payout|invoice|billing|parser|debug|service_role)\M') then
    raise exception 'Invalid Driver Remark.' using errcode='22023';
  end if;
  if coalesce(p_payload->>'driver_remark','') is distinct from
    (case when left(coalesce(b.remarks,''),26) = 'prestige_driver_remark_v1:'
      then substring(b.remarks from 27) else '' end) then
    raise exception 'Save the Driver Remark before posting the job.' using errcode='40001';
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
  -- QA-only setup: full immutable expected ownership, not a reference prefix or label.
  if p_review_booking is not null then
    if p_actor_role is distinct from 'admin' or jsonb_typeof(p_review_booking) is distinct from 'object' or
       p_review_booking is distinct from jsonb_build_object(
         'bookingId',b.id,'bookingReference',b.booking_reference,'companyId',b.company_id,
         'bookerId',b.booker_id,'customerId',b.customer_id,'travelerId',b.traveler_id,'driverId',b.driver_id) or
       b.id is null or b.id <= 0 or b.company_id is null or b.company_id <= 0 or
       b.booker_id is null or b.booker_id <= 0 or b.customer_id is null or b.customer_id <= 0 or
       b.traveler_id is null or b.traveler_id <= 0 or b.driver_id is null or b.driver_id <= 0 or
       b.source_surface is distinct from 'admin_dashboard' or b.status is not null or
       b.admin_internal_status is distinct from 'draft' or b.customer_facing_status is distinct from 'received' or
       b.request_review_status is distinct from 'pending_review' or
       b.short_notice_review_status is distinct from 'not_required' or
       coalesce(b.change_review_status,'') <> '' or coalesce(b.cancellation_review_status,'') <> '' or
       b.customer_request_trip_group is not null then
      raise exception 'QA link scope changed.' using errcode='40001';
    end if;
    if exists(select 1 from public.driver_job_bid_offers where booking_reference=p_booking_reference) or
       exists(select 1 from public.driver_job_combo_members where booking_reference=p_booking_reference) or
       exists(select 1 from public.driver_job_status_events where booking_reference=p_booking_reference) then
      raise exception 'QA link history is not eligible.' using errcode='22023';
    end if;
    perform id from public.driver_job_links where booking_reference=p_booking_reference order by id for update;
    select count(*) into v_count from public.driver_job_links where booking_reference=p_booking_reference;
    if v_count > 0 then
      select * into l from public.driver_job_links where booking_reference=p_booking_reference order by created_at desc,id desc limit 1;
      if v_count <> 1 or l.link_status is distinct from 'active' or l.revoked_at is not null or
         l.expires_at is null or l.expires_at <= v_now or l.driver_id is distinct from b.driver_id or
         l.safe_link_context->>'link_purpose' is distinct from 'store_review_qa' or
         l.safe_link_context->'store_review_booking' is distinct from p_review_booking or
         l.safe_link_context ? 'native_handoff_ciphertext' or
         ((l.safe_link_context->'driver_job_payload') - array['driver_contact','driver_name','driver_plate_number','driver_vehicle_model']) is distinct from p_payload or
         l.safe_link_context->>'job_card_revision' is distinct from p_revision then
        raise exception 'Existing QA link cannot be replaced or broadened.' using errcode='22023';
      end if;
      return jsonb_build_object('link',to_jsonb(l),'disposition','reused');
    end if;
  elsif exists(select 1 from public.driver_job_links where booking_reference=p_booking_reference and
      (safe_link_context ? 'store_review_booking' or left(safe_link_context->>'link_purpose',12)='store_review')) then
    raise exception 'QA link cannot use ordinary issuance.' using errcode='22023';
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
          'job_card_revision',p_revision,'job_card_kind','amendment',
          'driver_ack_required_revision',p_revision,
          'driver_amendment_issued_at',v_now,
          'driver_amendment_ack_pending',nullif(l.safe_link_context->>'driver_acknowledged_at','') is not null), updated_at=v_now
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
        'link_purpose',case when p_review_booking is null then 'manual_driver_assignment_job_card' else 'store_review_qa' end) ||
        case when p_review_booking is null then jsonb_build_object('native_handoff_ciphertext',p_ciphertext)
          else jsonb_build_object('store_review_booking',p_review_booking) end,
      v_now,v_now,v_now,p_actor_role,left(p_actor_label,160),'admin_api') returning * into l;
    v_disposition:='created';
  end if;
  return jsonb_build_object('link',to_jsonb(l),'disposition',v_disposition);
end;
$$;
revoke all on function public.apply_admin_driver_job_link(text,timestamptz,bigint,jsonb,text,text,text,timestamptz,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.apply_admin_driver_job_link(text,timestamptz,bigint,jsonb,text,text,text,timestamptz,text,text,jsonb,jsonb) to service_role;

create or replace function public.reserve_driver_job_link_delivery(
  p_booking_reference text, p_link_id uuid, p_driver_id bigint,
  p_mode text, p_revision text, p_request_id uuid, p_actor_role text, p_actor_label text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  b public.bookings%rowtype;
  l public.driver_job_links%rowtype;
  a public.customer_driver_app_notification_outbox%rowtype;
  last_attempt timestamptz;
  reminder_count bigint;
  event_key_value text;
  current_revision text;
  delivery_mode text := p_mode;
begin
  if p_mode is null or p_mode not in ('created','recovery','amendment','reminder','close_ack_alert')
    or p_request_id is null or p_actor_role is null
    or p_actor_role not in ('admin','dispatcher','system')
    or (p_actor_role = 'system' and p_mode <> 'reminder') then
    raise exception 'Invalid Driver link delivery request';
  end if;
  select * into b from public.bookings where booking_reference=p_booking_reference for update;
  if not found then return jsonb_build_object('claimed',false,'reason','invalid_link'); end if;
  select * into l from public.driver_job_links where id=p_link_id and booking_reference=p_booking_reference for update;
  if not found or l.link_status <> 'active' or l.revoked_at is not null or l.expires_at <= now()
    or l.expires_at is null then return jsonb_build_object('claimed',false,'reason','invalid_link'); end if;
  if exists (select 1 from unnest(array[b.status,b.admin_internal_status,b.customer_facing_status]) s
    where lower(trim(s)) in ('archived','cancelled','canceled','complete','completed','declined','declined_internal','history','job completed','job_completed','deleted')) then
    return jsonb_build_object('claimed',false,'reason','terminal_booking');
  end if;
  -- Durable QA restriction applies to every delivery mode, regardless of config expiry.
  if l.safe_link_context ? 'store_review_booking' or left(l.safe_link_context->>'link_purpose',12)='store_review' then
    return jsonb_build_object('claimed',false,'reason','invalid_link');
  end if;
  -- Owner-approved Close stops only the current revision's alerts, not the link or booking.
  if p_mode='close_ack_alert' then
    if nullif(l.safe_link_context->>'driver_acknowledged_at','') is not null and coalesce(l.safe_link_context->>'driver_amendment_ack_pending','false')<>'true' then
      return jsonb_build_object('claimed',false,'reason','acknowledged');
    end if;
    if l.id is distinct from (select id from public.driver_job_links
      where booking_reference=p_booking_reference and link_status='active'
      order by created_at desc,id desc limit 1) then
      return jsonb_build_object('claimed',false,'reason','stale_link');
    end if;
    update public.driver_job_links set safe_link_context=coalesce(safe_link_context,'{}'::jsonb)||
      jsonb_build_object('ack_alert_closed_at',now(),'ack_alert_closed_revision',coalesce(safe_link_context->>'job_card_revision','')),
      updated_at=now() where id=l.id;
    update public.customer_driver_app_notification_outbox set notification_status='dismissed',updated_at=now()
      where driver_job_link_id=l.id and delivery_surface='driver_app' and notification_status='queued'
      and workflow_area in ('driver_job_link_delivery','pending_driver_ack_reminder');
    return jsonb_build_object('claimed',true,'reason','alert_closed','driver_id',l.driver_id);
  end if;
  if p_mode='reminder' and l.safe_link_context->>'ack_alert_closed_at' is not null
    and coalesce(l.safe_link_context->>'ack_alert_closed_revision','')=coalesce(l.safe_link_context->>'job_card_revision','') then
    return jsonb_build_object('claimed',false,'reason','alert_closed');
  end if;
  if p_driver_id is null or p_driver_id <= 0 or b.driver_id is distinct from p_driver_id or l.driver_id is distinct from p_driver_id then
    return jsonb_build_object('claimed',false,'reason','driver_mismatch');
  end if;
  -- Match Create Link and native opening after explicit duplicate retirement.
  if (select count(*) from public.driver_job_links where booking_reference=p_booking_reference
      and link_status='active' and revoked_at is null and expires_at>now()) <> 1
    or l.id is distinct from (select id from public.driver_job_links
      where booking_reference=p_booking_reference and link_status='active'
      order by created_at desc,id desc limit 1) then
    return jsonb_build_object('claimed',false,'reason','stale_link');
  end if;
  if p_mode='reminder' and nullif(l.safe_link_context->>'driver_acknowledged_at','') is not null and coalesce(l.safe_link_context->>'driver_amendment_ack_pending','false')<>'true' then
    return jsonb_build_object('claimed',false,'reason','acknowledged');
  end if;
  current_revision := l.safe_link_context->>'job_card_revision';
  if p_mode <> 'reminder' and (current_revision is null or current_revision is distinct from p_revision) then
    return jsonb_build_object('claimed',false,'reason','stale_link');
  end if;
  -- A retried request can see "reused" after an amendment committed but its alert was not yet reserved.
  if p_mode <> 'reminder' and l.safe_link_context->>'job_card_kind'='amendment' and not exists (
    select 1 from public.customer_driver_app_notification_outbox where driver_job_link_id=l.id
    and workflow_area='driver_job_link_delivery' and safe_context->>'job_card_revision'=current_revision
  ) then delivery_mode := 'amendment'; end if;
  event_key_value := 'driver-link-delivery:' || l.id::text || ':' || p_request_id::text;
  select * into a from public.customer_driver_app_notification_outbox where event_key=event_key_value;
  if found then return jsonb_build_object('claimed',false,'reason','already_requested'); end if;
  select max(created_at), count(*) filter (where workflow_area='pending_driver_ack_reminder')
    into last_attempt,reminder_count from public.customer_driver_app_notification_outbox
    where driver_job_link_id=l.id and workflow_area in ('driver_job_link_delivery','pending_driver_ack_reminder');
  if p_mode='reminder' and greatest(coalesce(l.issued_at,l.created_at),last_attempt) > now()-interval '15 minutes' then
    return jsonb_build_object('claimed',false,'reason','cooldown');
  end if;
  if p_mode <> 'reminder' and last_attempt > now()-interval '60 seconds'
    and not (delivery_mode='amendment' and not exists (
      select 1 from public.customer_driver_app_notification_outbox where driver_job_link_id=l.id
      and workflow_area='driver_job_link_delivery' and safe_context->>'job_card_revision'=current_revision
    )) then return jsonb_build_object('claimed',false,'reason','cooldown'); end if;
  -- An explicit newly reserved Create Link delivery starts a fresh alert on this same private link.
  if p_mode<>'reminder' then
    update public.driver_job_links set safe_link_context=safe_link_context-'ack_alert_closed_at'-'ack_alert_closed_revision'
      where id=l.id;
  end if;
  insert into public.customer_driver_app_notification_outbox (
    booking_reference,driver_job_link_id,event_key,workflow_area,notification_status,notification_type,
    delivery_surface,priority,safe_title,safe_message,safe_context,actor_role,actor_label,source_surface
  ) values (
    p_booking_reference,l.id,event_key_value,
    case when p_mode='reminder' then 'pending_driver_ack_reminder' else 'driver_job_link_delivery' end,
    case when delivery_mode='amendment' then 'queued' else 'archived' end,'system_notice','driver_app','high','Prestige Driver',
    case when p_mode='reminder' then 'Job acknowledgement needed. Tap to review.' else 'Job update available. Tap to review.' end,
    jsonb_build_object('delivery_kind',delivery_mode,'job_card_revision',current_revision,'provider_accepted',null,
      'reminder_attempt',case when p_mode='reminder' then reminder_count+1 else null end),
    p_actor_role,left(p_actor_label,160),case when p_actor_role='system' then 'system' else 'admin_api' end
  ) returning * into a;
  return jsonb_build_object('claimed',true,'reason','reserved','audit_id',a.id,'safe_context',a.safe_context,
    'reminder_count',reminder_count+case when p_mode='reminder' then 1 else 0 end,
    'next_available_at',a.created_at+interval '15 minutes');
end;
$$;
revoke all on function public.reserve_driver_job_link_delivery(text,uuid,bigint,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_driver_job_link_delivery(text,uuid,bigint,text,text,uuid,text,text) to service_role;



commit;
