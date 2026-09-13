-- Reserve only the existing Driver link alert attempt. No provider call runs in SQL.
-- The booking -> link lock order matches link creation and acknowledgement.
create function public.reserve_driver_job_link_delivery(
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
  if p_mode is null or p_mode not in ('created','recovery','amendment','reminder')
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
  if p_driver_id is null or p_driver_id <= 0 or b.driver_id is distinct from p_driver_id or l.driver_id is distinct from p_driver_id then
    return jsonb_build_object('claimed',false,'reason','driver_mismatch');
  end if;
  if l.id is distinct from (select id from public.driver_job_links where booking_reference=p_booking_reference order by created_at desc,id desc limit 1) then
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

-- One bounded summary per requested link; growing audit history never truncates the count.
create function public.read_driver_ack_reminder_summaries(p_link_ids uuid[])
returns table(driver_job_link_id uuid,count bigint,last_sent_at timestamptz,last_provider_accepted boolean)
language sql security invoker set search_path = '' as $$
  select ids.id,
    (select count(*) from public.customer_driver_app_notification_outbox a where a.driver_job_link_id=ids.id and a.workflow_area='pending_driver_ack_reminder'),
    latest.created_at,
    case when latest.safe_context->>'provider_accepted' in ('true','false') then (latest.safe_context->>'provider_accepted')::boolean else null end
  from (select distinct unnest(p_link_ids) id) ids
  left join lateral (
    select created_at,safe_context from public.customer_driver_app_notification_outbox a
    where a.driver_job_link_id=ids.id and a.workflow_area in ('pending_driver_ack_reminder','driver_job_link_delivery')
    order by created_at desc,id desc limit 1
  ) latest on true;
$$;
revoke all on function public.read_driver_ack_reminder_summaries(uuid[]) from public,anon,authenticated;
grant execute on function public.read_driver_ack_reminder_summaries(uuid[]) to service_role;
