-- Preserve the saved booking category; driver model labels are not Pool requirement codes.
begin;
create or replace function public.assign_admin_driver_job_combo(
  p_id uuid,p_revision uuid,p_driver_id bigint,p_total_payout numeric,p_actor_role text,p_actor_label text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  g public.driver_job_combos%rowtype; d public.drivers%rowtype; b public.bookings%rowtype; refs text[];
begin
  if p_actor_role is null or p_actor_role not in ('admin','dispatcher')
    or coalesce(length(btrim(p_actor_label)),0) not between 1 and 160
    or (p_total_payout is not null and (p_total_payout<=0 or p_total_payout>99999.99 or round(p_total_payout,2)<>p_total_payout)) then
    raise exception 'Enter the reviewed combo payout and verified driver.' using errcode='22023';
  end if;
  g:=public.lock_driver_job_combo(p_id,p_revision);
  if g.state<>'draft' or g.driver_id is not null then raise exception 'Review the existing combo assignment or offer first.' using errcode='40001'; end if;
  select array_agg(booking_reference) into refs from public.driver_job_combo_members where combo_id=g.id;
  select * into d from public.drivers where id=p_driver_id for update;
  if not found or coalesce(lower(d.availability_status),'')<>'available'
    or not exists(select 1 from public.driver_access_accounts where driver_reference=p_driver_id::text and account_status='active'
      and active_device_id_hash ~ '^[a-f0-9]{64}$') then
    raise exception 'Select an active Driver with a registered phone.' using errcode='22023';
  end if;
  for b in select * from public.bookings where booking_reference=any(refs) loop
    if b.driver_id is not null or b.pickup_at<=clock_timestamp()
      or not public.driver_pool_vehicle_matches(upper(btrim(b.vehicle_type_or_category)),d.vehicle_type)
      or exists(select 1 from public.driver_job_links where booking_reference=b.booking_reference)
      or exists(select 1 from public.driver_job_bid_offers where booking_reference=b.booking_reference and offer_status in ('open','assigned')) then
      raise exception 'A combo trip is no longer eligible for direct assignment.' using errcode='40001';
    end if;
    if exists(select 1 from public.bookings other where other.booking_reference<>b.booking_reference
      and (other.driver_id=p_driver_id or other.booking_reference=any(refs))
      and coalesce(lower(btrim(other.admin_internal_status)),'') not in ('cancelled','completed','archived','deleted')
      and coalesce(lower(btrim(other.customer_facing_status)),'') not in ('cancelled','completed')
      and tstzrange(other.pickup_at,case when other.dropoff_datetime>other.pickup_at then other.dropoff_datetime else other.pickup_at+interval '90 minutes' end,'[)')
        && tstzrange(b.pickup_at,case when b.dropoff_datetime>b.pickup_at then b.dropoff_datetime else b.pickup_at+interval '90 minutes' end,'[)')) then
      raise exception 'Driver or combo trip times overlap.' using errcode='40001';
    end if;
  end loop;
  perform set_config('prestige.combo_write',g.id::text,true);
  update public.bookings set driver_id=d.id,driver_name=d.driver_name,driver_contact=d.contact_number,driver_plate_number=d.plate_number,
    driver_payout_override=case when p_total_payout is null then driver_payout_override when booking_reference=g.primary_booking_reference then p_total_payout else 0 end,
    driver_payout_reason=case when p_total_payout is null then driver_payout_reason when booking_reference=g.primary_booking_reference then 'Admin assigned combo total.' else 'Included in combo '||g.primary_booking_reference||'.' end,
    updated_at=clock_timestamp() where booking_reference=any(refs);
  update public.driver_job_combo_members m set booking_updated_at=saved.updated_at,booking_snapshot=public.driver_job_combo_booking_snapshot(saved) from public.bookings saved
    where m.combo_id=g.id and m.booking_reference=saved.booking_reference;
  update public.driver_job_combos set state='assigned',driver_id=d.id,total_payout_sgd=p_total_payout,
    vehicle_requirement=(select upper(btrim(saved.vehicle_type_or_category)) from public.bookings saved
      where saved.booking_reference=g.primary_booking_reference),updated_at=clock_timestamp() where id=g.id;
  return jsonb_build_object('ok',true,'driver_id',d.id,'trip_count',cardinality(refs));
end;
$$;
commit;
