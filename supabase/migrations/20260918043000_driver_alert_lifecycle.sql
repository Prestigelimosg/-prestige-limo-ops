-- Extend only the verified existing delivery reservation; abort on provider drift.
begin;
do $baseline$ begin
  if not exists (select 1 from pg_proc
    where oid=to_regprocedure('public.reserve_driver_job_link_delivery(text,uuid,bigint,text,text,uuid,text,text)')
      and not prosecdef
      and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='154056e817eba0584ca14deded45d3cd') then
    raise exception 'Driver link delivery changed. Inspect before applying alert lifecycle repair.';
  end if;
end $baseline$;
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
  -- Owner-approved Close stops only the current revision's alerts, not the link or booking.
  if p_mode='close_ack_alert' then
    if nullif(l.safe_link_context->>'driver_acknowledged_at','') is not null then
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
  if p_mode='reminder' and nullif(l.safe_link_context->>'driver_acknowledged_at','') is not null then
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
