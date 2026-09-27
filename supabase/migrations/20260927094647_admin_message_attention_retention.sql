-- Shared Admin attention is independent of the recipient's queued/read state.
alter table public.customer_driver_app_notification_outbox
  add column admin_attention_done_at timestamptz;

-- Existing closed jobs receive a full fresh grace period, not an inferred closure.
-- No UPDATE/backfill is issued, so existing booking triggers/providers are not run.
alter table public.bookings add column message_retention_anchor_at timestamptz default current_timestamp;
alter table public.bookings alter column message_retention_anchor_at drop default;

create function public.track_job_message_retention_closure() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare next_status text; previous_status text;
begin
  next_status := lower(coalesce(nullif(nullif(lower(new.admin_internal_status), 'draft'), ''), new.status, ''));
  if tg_op = 'UPDATE' then
    previous_status := lower(coalesce(nullif(nullif(lower(old.admin_internal_status), 'draft'), ''), old.status, ''));
  end if;
  if next_status not in ('completed','cancelled') then
    new.message_retention_anchor_at := null;
  elsif tg_op = 'INSERT' or previous_status is distinct from next_status then
    new.message_retention_anchor_at := statement_timestamp();
  else
    new.message_retention_anchor_at := old.message_retention_anchor_at;
  end if;
  return new;
end;
$$;
revoke all on function public.track_job_message_retention_closure() from public, anon, authenticated;
create trigger track_job_message_retention_closure
before insert or update of admin_internal_status, status on public.bookings
for each row execute function public.track_job_message_retention_closure();

-- Server-only bounded cleanup. Lock the booking before deleting so reopening
-- cannot race a stale eligibility read. No booking/report/invoice is deleted.
create function public.cleanup_job_message_retention() returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare deleted_count integer; candidate_count integer;
begin
  with eligible as materialized (
    select m.id,m.booking_reference from public.customer_driver_app_notification_outbox m
    where m.notification_type='trip_update'
      and ((m.created_at at time zone 'Asia/Singapore') + interval '3 months') at time zone 'Asia/Singapore' <= statement_timestamp()
      and (
        (m.workflow_area='admin_driver_job_messages' and m.delivery_surface='driver_app' and (
          (m.actor_role='driver' and m.safe_context->>'direction'='driver_to_admin') or
          (m.actor_role in ('admin','dispatcher') and coalesce(m.safe_context->>'direction','admin_to_driver')='admin_to_driver')
        )) or
        (m.workflow_area='admin_customer_job_messages' and m.delivery_surface='customer_app'
          and m.actor_role in ('admin','dispatcher') and m.safe_context->>'audience'='admin_customer') or
        (m.workflow_area='customer_driver_quick_replies' and (
          (m.delivery_surface='driver_app' and m.actor_role='customer' and m.safe_context->>'direction'='customer_to_driver') or
          (m.delivery_surface='customer_app' and m.actor_role='driver' and m.safe_context->>'direction'='driver_to_customer')
        ))
      )
  ), closed as materialized (
    select b.booking_reference from public.bookings b
    where lower(coalesce(nullif(nullif(lower(b.admin_internal_status),'draft'),''),b.status,'')) in ('completed','cancelled')
      and b.message_retention_anchor_at is not null
      and ((b.message_retention_anchor_at at time zone 'Asia/Singapore') + interval '3 months') at time zone 'Asia/Singapore' <= statement_timestamp()
      and exists(select 1 from eligible m where m.booking_reference=b.booking_reference)
    order by b.message_retention_anchor_at,b.id limit 100 for update of b skip locked
  ), targets as materialized (
    select m.id from public.customer_driver_app_notification_outbox m
    join eligible e on e.id=m.id join closed c on c.booking_reference=m.booking_reference
    order by m.created_at,m.id limit 1000 for update of m skip locked
  ), removed as (
    delete from public.customer_driver_app_notification_outbox m using targets t where m.id=t.id returning m.id
  ) select (select count(*) from removed), (select count(*) from closed) into deleted_count, candidate_count;
  return jsonb_build_object('deleted',deleted_count,'batch_full',deleted_count=1000 or candidate_count=100);
end;
$$;
revoke all on function public.cleanup_job_message_retention() from public, anon, authenticated;
grant execute on function public.cleanup_job_message_retention() to service_role;
-- Existing tables remain private under their current grants/RLS. No new table or public grant.
