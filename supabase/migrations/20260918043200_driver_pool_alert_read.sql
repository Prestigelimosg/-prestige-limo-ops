-- Read state only, on existing invitations. Never change offer or bid decisions.
create function public.mark_driver_pool_alerts_read(p_driver_id bigint,p_reads jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item jsonb; o public.driver_job_bid_offers%rowtype;
begin
  if p_driver_id is null or p_driver_id<=0 or p_reads is null or jsonb_typeof(p_reads)<>'array'
    or jsonb_array_length(p_reads) not between 1 and 20 then
    return jsonb_build_object('ok',false);
  end if;
  -- Lock offers in a stable order and validate the complete caller snapshot first.
  for item in select value from jsonb_array_elements(p_reads) order by value->>'offer_key' loop
    if item->>'offer_key' is null or item->>'offer_key' !~ '^[a-f0-9]{64}$'
      or item->>'updated_at' is null then return jsonb_build_object('ok',false); end if;
    select * into o from public.driver_job_bid_offers where offer_key=item->>'offer_key' for update;
    if not found or o.offer_status<>'open' or o.updated_at is distinct from (item->>'updated_at')::timestamptz
      or not exists(select 1 from public.driver_job_bids where driver_job_bid_offer_id=o.id
        and driver_reference=p_driver_id::text and bid_status='pending') then
      return jsonb_build_object('ok',false);
    end if;
  end loop;
  for item in select value from jsonb_array_elements(p_reads) loop
    update public.driver_job_bids b set safe_bid_context=b.safe_bid_context||
      jsonb_build_object('alert_read_offer_updated_at',offer_row.updated_at)
      from public.driver_job_bid_offers offer_row where offer_row.offer_key=item->>'offer_key'
        and b.driver_job_bid_offer_id=offer_row.id and b.driver_reference=p_driver_id::text and b.bid_status='pending';
  end loop;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.mark_driver_pool_alerts_read(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.mark_driver_pool_alerts_read(bigint,jsonb) to service_role;
