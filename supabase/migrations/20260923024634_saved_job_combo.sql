-- Local, unreleased combo foundation. No historical booking is grouped or rewritten.
-- The existing single-booking Pool, link, ACK and Calendar writers remain authoritative.
-- Production references use a partial unique index; foreign keys use the existing booking ID.
begin;

create table public.driver_job_combos (
  id uuid primary key default gen_random_uuid(),
  primary_booking_reference text not null unique,
  primary_booking_id bigint not null unique references public.bookings(id),
  revision uuid not null default gen_random_uuid(),
  state text not null default 'draft' check (state in ('draft','offered','assigned','cancelled')),
  vehicle_requirement text,
  total_payout_sgd numeric(12,2) check (total_payout_sgd > 0 and total_payout_sgd <= 99999.99),
  driver_id bigint references public.drivers(id),
  offer_key text,
  actor_role text not null check (actor_role in ('admin','dispatcher')),
  actor_label text not null check (length(btrim(actor_label)) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.driver_job_combo_members (
  booking_reference text primary key,
  booking_id bigint not null unique references public.bookings(id),
  combo_id uuid not null references public.driver_job_combos(id) on delete cascade,
  booking_updated_at timestamptz not null,
  booking_snapshot jsonb not null,
  ordinal integer not null check (ordinal > 0),
  unique (combo_id, ordinal)
);
create index driver_job_combo_members_group on public.driver_job_combo_members(combo_id);
alter table public.driver_job_combos enable row level security;
alter table public.driver_job_combo_members enable row level security;
revoke all on public.driver_job_combos, public.driver_job_combo_members from public, anon, authenticated;
grant select, insert, update, delete on public.driver_job_combos, public.driver_job_combo_members to service_role;

-- Only dispatch terms participate in package revision checks. Customer invoice
-- prices, billing review and report evidence remain independent existing lanes.
create function public.driver_job_combo_booking_snapshot(b public.bookings)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('customer_id',b.customer_id,'company_id',b.company_id,'booker_id',b.booker_id,
    'driver_id',b.driver_id,'driver_name',b.driver_name,'driver_contact',b.driver_contact,
    'driver_plate_number',b.driver_plate_number,'pickup_at',b.pickup_at,'dropoff_datetime',b.dropoff_datetime,
    'service_type',b.service_type,'pickup_location',b.pickup_location,'dropoff_location',b.dropoff_location,
    'route_summary',b.route_summary,'passenger_name',b.passenger_name,'flight_no',b.flight_no,
    'vehicle_type_or_category',b.vehicle_type_or_category,'pax_count',b.pax_count,'luggage_count',b.luggage_count,
    'customer_special_request',b.customer_special_request,'child_seat_required',to_jsonb(b)->'child_seat_required',
    'child_seat_count',to_jsonb(b)->'child_seat_count','extra_stop_count',to_jsonb(b)->'extra_stop_count',
    'driver_payout_override',b.driver_payout_override,'driver_payout_reason',b.driver_payout_reason);
$$;
revoke all on function public.driver_job_combo_booking_snapshot(public.bookings) from public,anon,authenticated;
grant execute on function public.driver_job_combo_booking_snapshot(public.bookings) to service_role;

-- Selection only: exact saved records, never booking creation, assignment or sending.
create function public.define_driver_job_combo(
  p_primary text, p_members jsonb, p_expected_revision uuid,
  p_actor_role text, p_actor_label text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  g public.driver_job_combos%rowtype;
  first_booking public.bookings%rowtype;
  b public.bookings%rowtype;
  refs text[];
  member jsonb;
  n integer;
begin
  if p_actor_role is null or p_actor_role not in ('admin','dispatcher')
    or coalesce(length(btrim(p_actor_label)),0) not between 1 and 160
    or jsonb_typeof(p_members) is distinct from 'array' then
    raise exception 'Invalid combo selection.' using errcode='22023';
  end if;
  n:=jsonb_array_length(p_members);
  if n<1 or n>100 then raise exception 'Select up to 100 saved trips.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_members) x where
    jsonb_typeof(x) is distinct from 'object'
    or coalesce(x->>'booking_reference','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
    or nullif(x->>'updated_at','') is null
    or x - array['booking_reference','updated_at'] <> '{}'::jsonb) then
    raise exception 'Invalid saved trip identity.' using errcode='22023';
  end if;
  select array_agg(x->>'booking_reference' order by x->>'booking_reference') into refs
    from jsonb_array_elements(p_members) x;
  if cardinality(refs)<>(select count(distinct r) from unnest(refs) r)
    or not coalesce(p_primary=any(refs),false) then
    raise exception 'Duplicate or missing primary trip.' using errcode='22023';
  end if;
  -- Include removed members in the lock set before changing an existing selection.
  perform 1 from public.bookings where booking_reference=any(refs) or booking_reference in (
    select m.booking_reference from public.driver_job_combo_members m join public.driver_job_combos old_group on old_group.id=m.combo_id
    where old_group.primary_booking_reference=p_primary) order by booking_reference for update;
  if (select count(*) from public.bookings where booking_reference=any(refs))<>n then
    raise exception 'A selected saved trip is unavailable.' using errcode='40001';
  end if;
  select * into first_booking from public.bookings where booking_reference=p_primary;
  if nullif(btrim(first_booking.customer_id::text),'') is null then
    raise exception 'Verify the customer account before making a combo.' using errcode='22023';
  end if;
  select * into g from public.driver_job_combos where primary_booking_reference=p_primary for update;
  if found and (g.state<>'draft' or g.revision is distinct from p_expected_revision) then
    raise exception 'The combo changed or has already been posted. Reload it.' using errcode='40001';
  end if;
  if n=1 then
    if g.id is null or g.state<>'draft' or exists(select 1 from public.driver_job_combo_members m join public.bookings saved on saved.booking_reference=m.booking_reference
      where m.combo_id=g.id and (saved.driver_id is not null or exists(select 1 from public.driver_job_links l where l.booking_reference=m.booking_reference and l.link_status='active' and l.revoked_at is null and l.expires_at>clock_timestamp())
        or exists(select 1 from public.driver_job_bid_offers o where o.booking_reference=m.booking_reference and o.offer_status in ('open','assigned')))) then
      raise exception 'Only an unposted, unassigned combo can be removed.' using errcode='40001';
    end if;
    delete from public.driver_job_combo_members where combo_id=g.id;
    delete from public.driver_job_combos where id=g.id;
    return jsonb_build_object('removed',true);
  end if;
  for member in select x from jsonb_array_elements(p_members) x loop
    select * into b from public.bookings where booking_reference=member->>'booking_reference';
    if b.updated_at is distinct from (member->>'updated_at')::timestamptz then
      raise exception 'A selected trip changed. Reload the selection.' using errcode='40001';
    end if;
    if b.customer_id is distinct from first_booking.customer_id
      or b.company_id is distinct from first_booking.company_id
      or b.booker_id is distinct from first_booking.booker_id then
      raise exception 'Combo trips must belong to the same verified customer account.' using errcode='22023';
    end if;
    if b.driver_id is not null or b.pickup_at is null or b.pickup_at<=clock_timestamp()
      or exists(select 1 from unnest(array[b.status,b.admin_internal_status,b.customer_facing_status]) s
        where lower(btrim(s)) in ('cancelled','canceled','completed','complete','archived','deleted','declined','declined_internal','history','job completed','job_completed'))
      or exists(select 1 from public.driver_job_links l where l.booking_reference=b.booking_reference
        and l.link_status='active' and l.revoked_at is null and l.expires_at>clock_timestamp())
      or exists(select 1 from public.driver_job_bid_offers o where o.booking_reference=b.booking_reference
        and (o.offer_status='assigned' or (o.offer_status='open' and o.closes_at>clock_timestamp()))) then
      raise exception 'Select future unassigned trips without an active offer or job link.' using errcode='40001';
    end if;
    if exists(select 1 from public.driver_job_combo_members m where m.booking_reference=b.booking_reference
      and m.combo_id is distinct from g.id) then
      raise exception 'A selected trip already belongs to another combo.' using errcode='40001';
    end if;
  end loop;
  -- The published single-vehicle requirement is reviewed separately in the existing Pool control.
  if g.id is null then
    insert into public.driver_job_combos(primary_booking_reference,primary_booking_id,actor_role,actor_label)
      values(p_primary,first_booking.id,p_actor_role,btrim(p_actor_label)) returning * into g;
  else
    update public.driver_job_combos set revision=gen_random_uuid(),updated_at=clock_timestamp()
      where id=g.id returning * into g;
    delete from public.driver_job_combo_members where combo_id=g.id;
  end if;
  insert into public.driver_job_combo_members(booking_reference,booking_id,combo_id,booking_updated_at,booking_snapshot,ordinal)
    select selected_booking.booking_reference,selected_booking.id,g.id,selected_booking.updated_at,public.driver_job_combo_booking_snapshot(selected_booking),
      row_number() over(order by selected_booking.pickup_at,selected_booking.booking_reference)::integer
    from public.bookings selected_booking where selected_booking.booking_reference=any(refs);
  return jsonb_build_object('id',g.id,'revision',g.revision,'primary_booking_reference',p_primary,'trip_count',n);
end;
$$;
revoke all on function public.define_driver_job_combo(text,jsonb,uuid,text,text) from public,anon,authenticated;
grant execute on function public.define_driver_job_combo(text,jsonb,uuid,text,text) to service_role;

-- A single transaction revalidates the same saved records before every dispatch action.
create function public.lock_driver_job_combo(p_id uuid, p_revision uuid)
returns public.driver_job_combos language plpgsql security invoker set search_path='' as $$
declare
  g public.driver_job_combos%rowtype;
  first_booking public.bookings%rowtype;
  b public.bookings%rowtype;
  m public.driver_job_combo_members%rowtype;
  refs text[];
begin
  select array_agg(booking_reference order by booking_reference) into refs
    from public.driver_job_combo_members where combo_id=p_id;
  if coalesce(cardinality(refs),0)<2 then raise exception 'Combo is unavailable.' using errcode='40001'; end if;
  perform 1 from public.bookings where booking_reference=any(refs) order by booking_reference for update;
  select * into g from public.driver_job_combos where id=p_id for update;
  if not found or g.revision is distinct from p_revision or g.state='cancelled' then
    raise exception 'Combo changed. Reload before continuing.' using errcode='40001';
  end if;
  if refs is distinct from (select array_agg(booking_reference order by booking_reference)
    from public.driver_job_combo_members where combo_id=p_id) then
    raise exception 'Combo membership changed.' using errcode='40001';
  end if;
  select * into first_booking from public.bookings where booking_reference=g.primary_booking_reference;
  for m in select * from public.driver_job_combo_members where combo_id=p_id order by booking_reference loop
    select * into b from public.bookings where booking_reference=m.booking_reference;
    if not found or public.driver_job_combo_booking_snapshot(b) is distinct from m.booking_snapshot
      or nullif(first_booking.customer_id::text,'') is null
      or b.customer_id is distinct from first_booking.customer_id
      or b.company_id is distinct from first_booking.company_id
      or b.booker_id is distinct from first_booking.booker_id then
      raise exception 'A combo trip or its customer changed. Review the package.' using errcode='40001';
    end if;
    if b.pickup_at is null or exists(select 1 from unnest(array[b.status,b.admin_internal_status,b.customer_facing_status]) s
      where lower(btrim(s)) in ('cancelled','canceled','completed','complete','archived','deleted','declined','declined_internal','history','job completed','job_completed')) then
      raise exception 'A combo trip is no longer available.' using errcode='40001';
    end if;
  end loop;
  return g;
end;
$$;
revoke all on function public.lock_driver_job_combo(uuid,uuid) from public,anon,authenticated;
grant execute on function public.lock_driver_job_combo(uuid,uuid) to service_role;

create function public.publish_driver_job_combo(
  p_id uuid,p_revision uuid,p_expected_updated_at timestamptz,p_offer_payout_sgd numeric,
  p_idempotency_key text,p_actor_role text,p_actor_label text,p_vehicle_requirement text,
  p_selected_driver_ids bigint[],p_offer_key text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.driver_job_combos%rowtype; result jsonb; refs text[];
begin
  g:=public.lock_driver_job_combo(p_id,p_revision);
  if g.state not in ('draft','offered') or g.driver_id is not null then
    raise exception 'The combo is already assigned.' using errcode='40001';
  end if;
  select array_agg(booking_reference) into refs from public.driver_job_combo_members where combo_id=g.id;
  if exists(select 1 from public.bookings b where b.booking_reference=any(refs) and (b.driver_id is not null or b.pickup_at<=clock_timestamp()))
    or exists(select 1 from public.driver_job_links l where l.booking_reference=any(refs)
      and l.link_status='active' and l.revoked_at is null and l.expires_at>clock_timestamp())
    or exists(select 1 from public.driver_job_bid_offers o where o.booking_reference=any(refs)
      and o.booking_reference<>g.primary_booking_reference
      and (o.offer_status='assigned' or (o.offer_status='open' and o.closes_at>clock_timestamp()))) then
    raise exception 'A combo trip is already offered, assigned or linked.' using errcode='40001';
  end if;
  if exists(select 1 from public.bookings b where b.booking_reference=any(refs)
    and not public.driver_pool_vehicle_matches(p_vehicle_requirement,b.vehicle_type_or_category)) then
    raise exception 'Review the vehicle requirement for every combo trip.' using errcode='22023';
  end if;
  if exists(select 1 from public.bookings a join public.bookings b on a.booking_reference<b.booking_reference
    where a.booking_reference=any(refs) and b.booking_reference=any(refs)
    and tstzrange(a.pickup_at,case when a.dropoff_datetime>a.pickup_at then a.dropoff_datetime else a.pickup_at+interval '90 minutes' end,'[)')
      && tstzrange(b.pickup_at,case when b.dropoff_datetime>b.pickup_at then b.dropoff_datetime else b.pickup_at+interval '90 minutes' end,'[)')) then
    raise exception 'Combo trip times overlap. Review the saved schedules.' using errcode='22023';
  end if;
  perform set_config('prestige.combo_write',g.id::text,true);
  result:=public.publish_driver_pool_offer(g.primary_booking_reference,p_expected_updated_at,p_offer_payout_sgd,
    p_idempotency_key,p_actor_role,p_actor_label,p_vehicle_requirement,p_selected_driver_ids,p_offer_key);
  update public.driver_job_combos set state='offered',total_payout_sgd=p_offer_payout_sgd,
    vehicle_requirement=p_vehicle_requirement,offer_key=result->'offer'->>'offer_key',updated_at=clock_timestamp()
    where id=g.id;
  update public.driver_job_bid_offers set closes_at=least(closes_at,(select min(pickup_at) from public.bookings where booking_reference=any(refs))),
    safe_offer_context=safe_offer_context ||
    jsonb_build_object('combo_id',g.id,'combo_revision',g.revision)
    where offer_key=result->'offer'->>'offer_key';
  select jsonb_set(result,'{offer}',to_jsonb(o)) into result from public.driver_job_bid_offers o
    where o.offer_key=result->'offer'->>'offer_key';
  -- Only the existing publisher returns recipients. Its idempotent retry remains no-send.
  return result;
end;
$$;
revoke all on function public.publish_driver_job_combo(uuid,uuid,timestamptz,numeric,text,text,text,text,bigint[],text) from public,anon,authenticated;
grant execute on function public.publish_driver_job_combo(uuid,uuid,timestamptz,numeric,text,text,text,text,bigint[],text) to service_role;

create function public.accept_driver_job_combo(
  p_offer_key text,p_driver_id bigint,p_expected_updated_at timestamptz,p_idempotency_key text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  g public.driver_job_combos%rowtype;
  o public.driver_job_bid_offers%rowtype;
  b public.bookings%rowtype;
  d public.drivers%rowtype;
  refs text[];
  result jsonb;
begin
  select * into o from public.driver_job_bid_offers where offer_key=p_offer_key;
  if not found or o.safe_offer_context->>'combo_id' is null then
    return jsonb_build_object('ok',false,'reason','no_longer_available');
  end if;
  g:=public.lock_driver_job_combo((o.safe_offer_context->>'combo_id')::uuid,
    (o.safe_offer_context->>'combo_revision')::uuid);
  if g.state='assigned' and g.driver_id=p_driver_id then
    -- Keep the existing exact winning-bid replay verification.
    return public.accept_driver_pool_offer(p_offer_key,p_driver_id,p_expected_updated_at,p_idempotency_key);
  end if;
  if g.state<>'offered' or g.offer_key is distinct from p_offer_key then
    return jsonb_build_object('ok',false,'reason','no_longer_available');
  end if;
  select array_agg(booking_reference) into refs from public.driver_job_combo_members where combo_id=g.id;
  select * into d from public.drivers where id=p_driver_id for update;
  if not found or not public.driver_pool_vehicle_matches(g.vehicle_requirement,d.vehicle_type) then
    return jsonb_build_object('ok',false,'reason','vehicle_mismatch');
  end if;
  for b in select * from public.bookings where booking_reference=any(refs) loop
    if b.driver_id is not null or b.pickup_at<=clock_timestamp() then return jsonb_build_object('ok',false,'reason','no_longer_available'); end if;
    if exists(select 1 from public.bookings other where other.driver_id=p_driver_id
      and not(other.booking_reference=any(refs))
      and coalesce(lower(btrim(other.admin_internal_status)),'') not in ('cancelled','completed','archived','deleted')
      and coalesce(lower(btrim(other.customer_facing_status)),'') not in ('cancelled','completed')
      and tstzrange(other.pickup_at,case when other.dropoff_datetime>other.pickup_at then other.dropoff_datetime else other.pickup_at+interval '90 minutes' end,'[)')
        && tstzrange(b.pickup_at,case when b.dropoff_datetime>b.pickup_at then b.dropoff_datetime else b.pickup_at+interval '90 minutes' end,'[)')) then
      return jsonb_build_object('ok',false,'reason','schedule_conflict');
    end if;
  end loop;
  perform set_config('prestige.combo_write',g.id::text,true);
  result:=public.accept_driver_pool_offer(p_offer_key,p_driver_id,p_expected_updated_at,p_idempotency_key);
  if result->>'reason'<>'accepted' then return result; end if;
  -- The package amount is retained once on its primary record. Other members are
  -- included in that package, not separate rates. Never multiply the package total.
  update public.bookings set driver_id=d.id,driver_name=d.driver_name,driver_contact=d.contact_number,
    driver_plate_number=d.plate_number,driver_payout_override=0,
    driver_payout_reason='Included in combo '||g.primary_booking_reference||'.',updated_at=clock_timestamp()
    where booking_reference=any(refs) and booking_reference<>g.primary_booking_reference and driver_id is null;
  update public.driver_job_combo_members member_row set booking_updated_at=saved_booking.updated_at,booking_snapshot=public.driver_job_combo_booking_snapshot(saved_booking)
    from public.bookings saved_booking where member_row.combo_id=g.id and member_row.booking_reference=saved_booking.booking_reference;
  update public.driver_job_combos set state='assigned',driver_id=d.id,updated_at=clock_timestamp() where id=g.id;
  return result;
end;
$$;
revoke all on function public.accept_driver_job_combo(text,bigint,timestamptz,text) from public,anon,authenticated;
grant execute on function public.accept_driver_job_combo(text,bigint,timestamptz,text) to service_role;

-- These adapters invoke the established single-trip writers inside one transaction.
-- No member link or ACK can be committed independently of the rest of the package.
create function public.apply_admin_driver_job_combo_links(
  p_id uuid,p_revision uuid,p_links jsonb,p_actor_role text,p_actor_label text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  g public.driver_job_combos%rowtype; b public.bookings%rowtype; item jsonb; applied jsonb;
  results jsonb:='[]'::jsonb; refs text[]; expires timestamptz; batch uuid;
  previous_batch uuid; member_count integer;
begin
  g:=public.lock_driver_job_combo(p_id,p_revision);
  if g.state<>'assigned' or g.driver_id is null then
    raise exception 'Assign the complete combo before creating its link.' using errcode='40001';
  end if;
  select array_agg(booking_reference order by booking_reference),count(*) into refs,member_count
    from public.driver_job_combo_members where combo_id=g.id;
  if jsonb_typeof(p_links) is distinct from 'array' or jsonb_array_length(p_links)<>member_count
    or (select array_agg(x->>'booking_reference' order by x->>'booking_reference') from jsonb_array_elements(p_links) x)
      is distinct from refs then
    raise exception 'The complete exact combo is required.' using errcode='22023';
  end if;
  -- Access lasts until four days after the final scheduled trip, scoped only to this combo.
  select greatest(clock_timestamp()+interval '96 hours',max(greatest(pickup_at,coalesce(dropoff_datetime,pickup_at)))+interval '96 hours')
    into expires from public.bookings where booking_reference=any(refs);
  if expires>clock_timestamp()+interval '370 days' then
    raise exception 'The final combo trip is too far ahead for a job link.' using errcode='22023';
  end if;
  select (l.safe_link_context->>'combo_link_batch')::uuid into previous_batch
    from public.driver_job_links l where l.booking_reference=g.primary_booking_reference
      and l.link_status='active' and l.revoked_at is null and l.expires_at>clock_timestamp()
      and l.safe_link_context->>'combo_revision'=g.revision::text
    order by l.created_at desc,l.id desc limit 1;
  batch:=coalesce(previous_batch,gen_random_uuid());
  perform set_config('prestige.combo_write',g.id::text,true);
  for item in select x from jsonb_array_elements(p_links) x order by x->>'booking_reference' loop
    select * into b from public.bookings where booking_reference=item->>'booking_reference';
    if b.driver_id is distinct from g.driver_id then
      raise exception 'A combo driver assignment changed.' using errcode='40001';
    end if;
    applied:=public.apply_admin_driver_job_link(b.booking_reference,(item->>'expected_updated_at')::timestamptz,g.driver_id,
      item->'payload',item->>'revision',item->>'token_hash',item->>'ciphertext',clock_timestamp()+interval '96 hours',
      p_actor_role,p_actor_label,item->'expected_driver_state');
    -- An amended member must be reviewed and acknowledged with the entire package.
    -- Membership and saved-version locking above prevent silent partial amendments.
    update public.driver_job_links set expires_at=expires,
      safe_link_context=safe_link_context || jsonb_build_object('combo_id',g.id,'combo_revision',g.revision,
        'combo_link_batch',batch,'combo_primary_reference',g.primary_booking_reference,'combo_access_until',expires,
        'combo_trip_count',member_count,'combo_vehicle',g.vehicle_requirement)
      where id=(applied->'link'->>'id')::uuid;
    select jsonb_set(applied,'{link}',to_jsonb(l)) into applied from public.driver_job_links l
      where l.id=(applied->'link'->>'id')::uuid;
    results:=results||jsonb_build_array(applied);
  end loop;
  return jsonb_build_object('links',results,'combo_id',g.id,'combo_revision',g.revision,'batch',batch);
end;
$$;
revoke all on function public.apply_admin_driver_job_combo_links(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.apply_admin_driver_job_combo_links(uuid,uuid,jsonb,text,text) to service_role;

create function public.acknowledge_current_driver_job_combo(
  p_booking_reference text,p_link_id uuid,p_token_hash text,p_driver_id bigint,
  p_name text,p_contact text,p_plate text,p_vehicle text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  origin public.driver_job_links%rowtype; l public.driver_job_links%rowtype;
  g public.driver_job_combos%rowtype; refs text[]; ref text; result jsonb;
begin
  select * into origin from public.driver_job_links where id=p_link_id and booking_reference=p_booking_reference and token_hash=p_token_hash;
  if not found or origin.safe_link_context->>'combo_id' is null then raise exception 'Combo link unavailable'; end if;
  g:=public.lock_driver_job_combo((origin.safe_link_context->>'combo_id')::uuid,(origin.safe_link_context->>'combo_revision')::uuid);
  if g.state<>'assigned' or g.driver_id is distinct from p_driver_id then raise exception 'Combo assignment changed'; end if;
  select array_agg(booking_reference order by booking_reference) into refs from public.driver_job_combo_members where combo_id=g.id;
  perform set_config('prestige.combo_write',g.id::text,true);
  foreach ref in array refs loop
    select * into l from public.driver_job_links where booking_reference=ref and link_status='active'
      order by created_at desc,id desc limit 1 for update;
    if not found or l.driver_id is distinct from p_driver_id or l.revoked_at is not null or l.expires_at<=clock_timestamp()
      or l.safe_link_context->>'combo_link_batch' is distinct from origin.safe_link_context->>'combo_link_batch'
      or l.safe_link_context->>'combo_revision' is distinct from g.revision::text
      or (ref=p_booking_reference and l.id<>origin.id) then
      raise exception 'A newer or unavailable combo link requires review';
    end if;
    result:=public.acknowledge_current_driver_job_link(ref,l.id,l.token_hash,p_driver_id,p_name,p_contact,p_plate,p_vehicle);
  end loop;
  update public.driver_job_combo_members m set booking_snapshot=public.driver_job_combo_booking_snapshot(saved)
    from public.bookings saved where m.combo_id=g.id and m.booking_reference=saved.booking_reference;
  select to_jsonb(link_row) into result from public.driver_job_links link_row where id=p_link_id;
  return result;
end;
$$;
revoke all on function public.acknowledge_current_driver_job_combo(text,uuid,text,bigint,text,text,text,text) from public,anon,authenticated;
grant execute on function public.acknowledge_current_driver_job_combo(text,uuid,text,bigint,text,text,text,text) to service_role;

create function public.assign_admin_driver_job_combo(
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
      or not public.driver_pool_vehicle_matches(b.vehicle_type_or_category,d.vehicle_type)
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
    vehicle_requirement=d.vehicle_type,updated_at=clock_timestamp() where id=g.id;
  return jsonb_build_object('ok',true,'driver_id',d.id,'trip_count',cardinality(refs));
end;
$$;
revoke all on function public.assign_admin_driver_job_combo(uuid,uuid,bigint,numeric,text,text) from public,anon,authenticated;
grant execute on function public.assign_admin_driver_job_combo(uuid,uuid,bigint,numeric,text,text) to service_role;

create function public.cancel_driver_job_combo_offer(
  p_offer_key text,p_expected_updated_at timestamptz,p_actor_role text,p_actor_label text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.driver_job_combos%rowtype; o public.driver_job_bid_offers%rowtype; refs text[]; result jsonb;
begin
  select * into o from public.driver_job_bid_offers where offer_key=p_offer_key;
  if not found or o.safe_offer_context->>'combo_id' is null then raise exception 'Combo offer unavailable'; end if;
  g:=public.lock_driver_job_combo((o.safe_offer_context->>'combo_id')::uuid,(o.safe_offer_context->>'combo_revision')::uuid);
  if g.offer_key is distinct from p_offer_key then raise exception 'Combo offer changed'; end if;
  select array_agg(booking_reference) into refs from public.driver_job_combo_members where combo_id=g.id;
  if exists(select 1 from public.driver_job_links where booking_reference=any(refs))
    or exists(select 1 from public.driver_job_status_events where booking_reference=any(refs)) then
    raise exception 'Review issued combo links or trip reports before cancelling the assignment.' using errcode='22023';
  end if;
  perform set_config('prestige.combo_write',g.id::text,true);
  result:=public.cancel_driver_pool_offer(p_offer_key,p_expected_updated_at,p_actor_role,p_actor_label);
  if result->>'assignment_cancelled'='true' then
    update public.bookings set driver_id=null,driver_name=null,driver_contact=null,driver_plate_number=null,
      driver_payout_override=null,driver_payout_reason=null,updated_at=clock_timestamp()
      where booking_reference=any(refs) and booking_reference<>g.primary_booking_reference;
  end if;
  update public.driver_job_combo_members m set booking_updated_at=saved.updated_at,booking_snapshot=public.driver_job_combo_booking_snapshot(saved) from public.bookings saved
    where m.combo_id=g.id and m.booking_reference=saved.booking_reference;
  update public.driver_job_combos set state='draft',driver_id=null,total_payout_sgd=null,offer_key=null,
    revision=gen_random_uuid(),updated_at=clock_timestamp() where id=g.id;
  return result;
end;
$$;
revoke all on function public.cancel_driver_job_combo_offer(text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.cancel_driver_job_combo_offer(text,timestamptz,text,text) to service_role;

-- Grouped records cannot fall through an old single-trip writer, even if an
-- application instance has the feature flag off during deployment/rollback.
create function public.guard_driver_job_combo_member_write()
returns trigger language plpgsql security invoker set search_path='' as $$
declare ref text; group_id uuid; allowed boolean;
begin
  ref:=case when tg_op='DELETE' then old.booking_reference else new.booking_reference end;
  select combo_id into group_id from public.driver_job_combo_members where booking_reference=ref;
  if group_id is null then return case when tg_op='DELETE' then old else new end; end if;
  allowed:=current_setting('prestige.combo_write',true)=group_id::text;
  if coalesce(allowed,false) then return case when tg_op='DELETE' then old else new end; end if;
  if tg_table_name='bookings' then
    if tg_op='DELETE' then
      raise exception 'Remove the complete draft combo before deleting its bookings.' using errcode='40001';
    end if;
    if public.driver_job_combo_booking_snapshot(new) is distinct from public.driver_job_combo_booking_snapshot(old)
      or (new.driver_id is distinct from old.driver_id)
      or (lower(coalesce(new.admin_internal_status,'')) in ('cancelled','deleted','archived') and new.admin_internal_status is distinct from old.admin_internal_status)
      or (lower(coalesce(new.customer_facing_status,''))='cancelled' and new.customer_facing_status is distinct from old.customer_facing_status)
      or (lower(coalesce(new.status,'')) in ('cancelled','deleted','archived') and new.status is distinct from old.status) then
      raise exception 'This trip belongs to a combo. Review the whole package before changing it.' using errcode='40001';
    end if;
  elsif tg_table_name='driver_job_bid_offers' then
    if tg_op='INSERT' or (new.offer_status in ('open','assigned') and
      (new.offer_status is distinct from old.offer_status or new.offer_payout_sgd is distinct from old.offer_payout_sgd)) then
      raise exception 'Post or assign the whole combo together.' using errcode='40001';
    end if;
  elsif tg_table_name='driver_job_links' then
    if tg_op in ('INSERT','DELETE') or new.token_hash is distinct from old.token_hash
      or new.driver_id is distinct from old.driver_id
      or new.revoked_at is distinct from old.revoked_at
      or new.safe_link_context->'driver_job_payload' is distinct from old.safe_link_context->'driver_job_payload'
      or new.safe_link_context->'driver_acknowledged_at' is distinct from old.safe_link_context->'driver_acknowledged_at' then
      raise exception 'Create, acknowledge or revoke the whole combo link together.' using errcode='40001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_driver_job_combo_member_write() from public,anon,authenticated;
grant execute on function public.guard_driver_job_combo_member_write() to service_role;
create trigger combo_booking_write_guard before update or delete on public.bookings
  for each row execute function public.guard_driver_job_combo_member_write();
create trigger combo_offer_write_guard before insert or update on public.driver_job_bid_offers
  for each row execute function public.guard_driver_job_combo_member_write();
create trigger combo_link_write_guard before insert or update or delete on public.driver_job_links
  for each row execute function public.guard_driver_job_combo_member_write();

-- Route/service child rows are dispatch terms too. Ordinary single-job writers
-- remain unchanged; grouped trips must first return to an editable draft.
create function public.guard_driver_job_combo_child_write()
returns trigger language plpgsql security invoker set search_path='' as $$
declare group_id uuid; booking_ids bigint[];
begin
  booking_ids:=case when tg_op='INSERT' then array[new.booking_id]
    when tg_op='DELETE' then array[old.booking_id] else array[old.booking_id,new.booking_id] end;
  -- Use the same booking lock as selection/acceptance to prevent a race.
  perform 1 from public.bookings where id=any(booking_ids) order by booking_reference for update;
  for group_id in select m.combo_id from public.driver_job_combo_members m
    join public.bookings b on b.booking_reference=m.booking_reference where b.id=any(booking_ids) loop
    if current_setting('prestige.combo_write',true) is distinct from group_id::text then
      raise exception 'Review the whole combo before changing a trip route or service.' using errcode='40001';
    end if;
  end loop;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function public.guard_driver_job_combo_child_write() from public,anon,authenticated;
grant execute on function public.guard_driver_job_combo_child_write() to service_role;
create trigger combo_route_write_guard before insert or update or delete on public.booking_route_points
  for each row execute function public.guard_driver_job_combo_child_write();
create trigger combo_service_write_guard before insert or update or delete on public.booking_service_items
  for each row execute function public.guard_driver_job_combo_child_write();

create function public.revoke_admin_driver_job_combo_link(p_link_id uuid,p_actor_role text,p_actor_label text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare origin public.driver_job_links%rowtype; g public.driver_job_combos%rowtype; refs text[]; result jsonb;
begin
  if p_actor_role is null or p_actor_role not in ('admin','dispatcher') or coalesce(length(btrim(p_actor_label)),0) not between 1 and 160 then
    raise exception 'Verified Admin or Dispatcher required.' using errcode='42501';
  end if;
  select * into origin from public.driver_job_links where id=p_link_id;
  if not found or origin.safe_link_context->>'combo_id' is null then raise exception 'Combo link unavailable'; end if;
  select array_agg(booking_reference order by booking_reference) into refs from public.driver_job_combo_members
    where combo_id=(origin.safe_link_context->>'combo_id')::uuid;
  perform 1 from public.bookings where booking_reference=any(refs) order by booking_reference for update;
  select * into g from public.driver_job_combos where id=(origin.safe_link_context->>'combo_id')::uuid for update;
  if not found or not(origin.booking_reference=any(refs)) then raise exception 'Combo changed'; end if;
  perform set_config('prestige.combo_write',g.id::text,true);
  -- Revoke only this issued package batch. A newer reissue is not revoked by an old row.
  update public.driver_job_links set link_status='revoked',revoked_at=clock_timestamp(),updated_at=clock_timestamp()
    where booking_reference=any(refs) and safe_link_context->>'combo_link_batch'=origin.safe_link_context->>'combo_link_batch'
      and revoked_at is null;
  select to_jsonb(l) into result from public.driver_job_links l where id=p_link_id;
  return result;
end;
$$;
revoke all on function public.revoke_admin_driver_job_combo_link(uuid,text,text) from public,anon,authenticated;
grant execute on function public.revoke_admin_driver_job_combo_link(uuid,text,text) to service_role;

create function public.reassign_admin_driver_job_combo(
  p_id uuid,p_revision uuid,p_booking_reference text,p_expected_updated_at timestamptz,
  p_new_driver_id bigint,p_total_payout numeric,p_actor_role text,p_actor_label text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.driver_job_combos%rowtype; b public.bookings%rowtype; d public.drivers%rowtype;
  refs text[]; result jsonb; current_result jsonb; notice_ids uuid[]:=array[]::uuid[];
begin
  g:=public.lock_driver_job_combo(p_id,p_revision);
  if g.state<>'assigned' or g.driver_id is null or p_booking_reference<>g.primary_booking_reference then
    raise exception 'Open the first combo trip and review its current assignment.' using errcode='40001';
  end if;
  if not exists(select 1 from public.bookings where booking_reference=p_booking_reference and updated_at=p_expected_updated_at) then
    raise exception 'The saved booking changed.' using errcode='40001';
  end if;
  select array_agg(booking_reference order by booking_reference) into refs from public.driver_job_combo_members where combo_id=g.id;
  if exists(select 1 from public.driver_job_status_events where booking_reference=any(refs))
    or exists(select 1 from public.driver_live_location_latest_positions where booking_reference=any(refs)) then
    raise exception 'Trip reporting or location sharing has started. Review the entire combo before changing its Driver.' using errcode='22023';
  end if;
  if p_new_driver_id is not null then
    if p_total_payout is not null and (p_total_payout<=0 or p_total_payout>99999.99 or round(p_total_payout,2)<>p_total_payout) then
      raise exception 'Review the whole combo payout.' using errcode='22023';
    end if;
    select * into d from public.drivers where id=p_new_driver_id for update;
    if not found or d.id=g.driver_id or coalesce(lower(d.availability_status),'')<>'available'
      or not exists(select 1 from public.driver_access_accounts where driver_reference=d.id::text and account_status='active'
        and active_device_id_hash ~ '^[a-f0-9]{64}$') then raise exception 'Select an active verified replacement Driver.' using errcode='22023'; end if;
    for b in select * from public.bookings where booking_reference=any(refs) loop
      if not public.driver_pool_vehicle_matches(g.vehicle_requirement,d.vehicle_type) or b.driver_id is distinct from g.driver_id
        or exists(select 1 from public.bookings other where other.driver_id=d.id and not(other.booking_reference=any(refs))
          and coalesce(lower(btrim(other.admin_internal_status)),'') not in ('cancelled','completed','archived','deleted')
          and coalesce(lower(btrim(other.customer_facing_status)),'') not in ('cancelled','completed')
          and tstzrange(other.pickup_at,case when other.dropoff_datetime>other.pickup_at then other.dropoff_datetime else other.pickup_at+interval '90 minutes' end,'[)')
            && tstzrange(b.pickup_at,case when b.dropoff_datetime>b.pickup_at then b.dropoff_datetime else b.pickup_at+interval '90 minutes' end,'[)')) then
        raise exception 'Replacement Driver cannot take every combo trip.' using errcode='40001';
      end if;
    end loop;
  end if;
  perform set_config('prestige.combo_write',g.id::text,true);
  for b in select * from public.bookings where booking_reference=any(refs) order by booking_reference loop
    if b.driver_id is distinct from g.driver_id then raise exception 'Combo assignment changed.' using errcode='40001'; end if;
    current_result:=public.apply_admin_driver_reassignment(b.booking_reference,b.updated_at,p_new_driver_id,p_actor_role,p_actor_label);
    if b.booking_reference=p_booking_reference then result:=current_result;
    else notice_ids:=array_append(notice_ids,(current_result->'notification'->>'id')::uuid); end if;
  end loop;
  -- Keep the existing per-trip audit/history, but one package cancellation/replacement alert.
  update public.customer_driver_app_notification_outbox set notification_status='dismissed',updated_at=clock_timestamp()
    where id=any(notice_ids) and notification_status='queued';
  update public.bookings set driver_payout_override=case when p_new_driver_id is null or p_total_payout is null then null
      when booking_reference=g.primary_booking_reference then p_total_payout else 0 end,
    driver_payout_reason=case when p_new_driver_id is null or p_total_payout is null then null when booking_reference=g.primary_booking_reference then 'Admin assigned combo total.'
      else 'Included in combo '||g.primary_booking_reference||'.' end where booking_reference=any(refs);
  update public.driver_job_combo_members m set booking_updated_at=saved.updated_at,booking_snapshot=public.driver_job_combo_booking_snapshot(saved)
    from public.bookings saved where m.combo_id=g.id and m.booking_reference=saved.booking_reference;
  update public.driver_job_combos set state=case when p_new_driver_id is null then 'draft' else 'assigned' end,
    driver_id=p_new_driver_id,total_payout_sgd=case when p_new_driver_id is null then null else p_total_payout end,
    offer_key=null,revision=gen_random_uuid(),updated_at=clock_timestamp() where id=g.id;
  return result;
end;
$$;
revoke all on function public.reassign_admin_driver_job_combo(uuid,uuid,text,timestamptz,bigint,numeric,text,text) from public,anon,authenticated;
grant execute on function public.reassign_admin_driver_job_combo(uuid,uuid,text,timestamptz,bigint,numeric,text,text) to service_role;

commit;
