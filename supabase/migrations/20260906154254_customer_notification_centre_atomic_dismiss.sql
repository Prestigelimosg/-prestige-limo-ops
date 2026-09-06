-- Atomically dismiss one already server-resolved Customer notification-centre snapshot.
-- Review-only migration: do not apply to any Supabase project without the owner's
-- separate action-time approval.

create or replace function public.dismiss_customer_notification_centre(
  p_notification_ids uuid[]
)
returns table (updated_ids uuid[], updated_count bigint)
language sql
security invoker
set search_path = ''
as $$
  with updated as (
    update public.customer_driver_app_notification_outbox as notification
    set
      notification_status = 'dismissed',
      updated_at = statement_timestamp()
    where notification.delivery_surface = 'customer_app'
      and notification.notification_status = 'queued'
      and notification.id = any(coalesce(p_notification_ids, array[]::uuid[]))
    returning notification.id
  )
  select
    coalesce(array_agg(updated.id order by updated.id), array[]::uuid[]) as updated_ids,
    count(*)::bigint as updated_count
  from updated;
$$;

revoke execute on function public.dismiss_customer_notification_centre(uuid[]) from public;
revoke execute on function public.dismiss_customer_notification_centre(uuid[]) from anon;
revoke execute on function public.dismiss_customer_notification_centre(uuid[]) from authenticated;
grant execute on function public.dismiss_customer_notification_centre(uuid[]) to service_role;
