-- LOCAL PROPOSAL ONLY. Not applied; bounded production release approval required.
-- One top-level DO statement: preflight and replacement share its implicit transaction.
-- Extend the existing server-only transaction, retaining its signature and grants.
do $migration$
declare definition text; old_block text; new_block text;
begin
 definition := pg_get_functiondef('public.apply_admin_driver_reassignment(text,timestamptz,bigint,text,text)'::regprocedure);
 if md5(definition) <> 'd0341f5ba17c2a12b8ab5aaf7c26325e' then
  raise exception 'Driver assignment function drifted; inspect before applying.';
 end if;
 old_block := $old$  if v_previous_driver_id = p_new_driver_id then
    raise exception 'The selected Driver is already assigned to this booking.'
      using errcode = '22023';
  end if;$old$;
 new_block := $new$  if v_previous_driver_id = p_new_driver_id then
    declare b public.bookings%rowtype; d public.drivers%rowtype;
    begin
      -- The existing exact-booking lock is already held. Pool/combo/ACK writers
      -- acquire that same lock; recheck membership only after acquiring it.
      select * into b from public.bookings where id=v_booking_id;
      if exists(select 1 from public.driver_job_bid_offers where booking_reference=v_booking_reference) or
         exists(select 1 from public.driver_job_combo_members where booking_reference=v_booking_reference) then
        raise exception 'Use the existing Pool/combo controls for this booking.' using errcode='22023';
      end if;
      if lower(btrim(coalesce(b.status,''))) in ('cancelled','canceled','completed','complete','archived','deleted','declined','declined_internal','history','job completed','job_completed','closed') or
         lower(btrim(coalesce(b.admin_internal_status,''))) in ('cancelled','canceled','completed','complete','archived','deleted','declined','declined_internal','history','job completed','job_completed','closed') or
         lower(btrim(coalesce(b.customer_facing_status,''))) in ('cancelled','canceled','completed','complete','archived','deleted','declined','declined_internal','history','job completed','job_completed','closed') or
         (b.source_surface='customer_booking_request' and b.request_review_status is distinct from 'approved') then
        raise exception 'Only an active reviewed booking permits driver detail correction.' using errcode='22023';
      end if;
      if exists(select 1 from public.driver_job_status_events where booking_reference=v_booking_reference) or
         exists(select 1 from public.driver_live_location_latest_positions where booking_reference=v_booking_reference) then
        raise exception 'Trip reporting or location sharing has started. Review the trip first.' using errcode='22023';
      end if;
      select * into d from public.drivers where id=p_new_driver_id for share;
      if not found or lower(btrim(coalesce(d.availability_status,'')))='inactive' or
         nullif(btrim(d.driver_name),'') is null then
        raise exception 'One active saved Driver profile is required.' using errcode='22023';
      end if;
      if (b.driver_name,b.driver_contact,b.driver_plate_number,b.vehicle_type_or_category)
         is distinct from (d.driver_name,d.contact_number,d.plate_number,d.vehicle_type) then
        update public.bookings set driver_name=d.driver_name,driver_contact=d.contact_number,
          driver_plate_number=d.plate_number,vehicle_type_or_category=d.vehicle_type,
          updated_at=clock_timestamp() where id=v_booking_id;
        insert into public.audit_logs(entity_type,entity_id,action,source_route,actor_label,
          change_summary,booking_id,customer_id,actor_role,action_type,booking_reference,
          source_surface,reason,safe_before,safe_after)
        values('booking',v_booking_id,'booking_updated','/api/admin-bookings',v_actor_label,
          'Saved driver profile details applied to this booking only.',v_booking_id,v_customer_id,
          v_actor_role,'booking_updated',v_booking_reference,'admin_api','Save Driver Assignment same-driver detail correction.',
          jsonb_build_object('driver_id',b.driver_id,'driver_name',b.driver_name,'driver_contact',b.driver_contact,
            'driver_plate_number',b.driver_plate_number,'vehicle_type_or_category',b.vehicle_type_or_category),
          jsonb_build_object('driver_id',d.id,'driver_name',d.driver_name,'driver_contact',d.contact_number,
            'driver_plate_number',d.plate_number,'vehicle_type_or_category',d.vehicle_type));
      end if;
      -- No reassignment, link edit/expiry, notification, Calendar or profile write.
      return jsonb_build_object('booking_id',v_booking_id,'booking_reference',v_booking_reference,
        'previous_driver_id',v_previous_driver_id,'new_driver_id',p_new_driver_id,'driver_details_updated',true);
    end;
  end if;$new$;
 if length(definition)-length(replace(definition,old_block,'')) <> length(old_block) then
  raise exception 'Same-driver branch differs; no function changed.';
 end if;
 execute replace(definition,old_block,new_block);
end;
$migration$;
