// Isolated PostgreSQL, synthetic data, Unix socket only. Never uses app credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const runtime=process.env.POOL_EMBEDDED_PG_PATH;
assert.ok(runtime,'Set POOL_EMBEDDED_PG_PATH to the isolated test runtime.');
const {default: EmbeddedPostgres}=await import(path.join(runtime,'dist/index.js'));
const dir=fs.mkdtempSync('/private/tmp/prestige-combo-pg-');
const pg=new EmbeddedPostgres({databaseDir:path.join(dir,'data'),user:'postgres',password:randomUUID(),
  persistent:false,port:5432,postgresFlags:['-c','listen_addresses=','-k',dir],onLog:()=>{},onError:()=>{}});
let db;
try {
  await pg.initialise(); await pg.start(); db=pg.getPgClient('postgres',dir); await db.connect();
  assert.equal((await db.query('show listen_addresses')).rows[0].listen_addresses,'');
  const sql=s=>db.query(s);
  const rows=async(s,args=[]) => (await db.query(s,args)).rows;
  const value=async(s,args=[]) => (await rows(s,args))[0].result;
  const fixture=fs.readFileSync('scripts/test-driver-pool-vehicle-postgres.py','utf8').match(/sql\("""\n(create role[\s\S]*?)"""\)/)[1];
  await sql(fixture);
  // Match Production: references are unique through a partial index, not a FK target.
  await sql(`alter table bookings drop constraint bookings_booking_reference_key;
    create unique index bookings_booking_reference_key on bookings(booking_reference)
    where booking_reference is not null;`);
  await sql(`alter table bookings add column company_id bigint,add column booker_id bigint,
    add column traveler_id bigint,add column status text,
    add column pickup_location text,add column pickup_address text,add column dropoff_location text,
    add column dropoff_address text,add column route_summary text,add column route text,add column flight_no text,
    add column pax_count integer,add column pax integer,add column luggage_count integer,
    add column child_seat_required boolean,add column child_seat_count integer,add column child_seat_type text,
    add column customer_special_request text,add column customer_price numeric,add column driver_notes text,add column remarks text,add column passenger_name text;
    alter table driver_job_links add column link_status text,add column revoked_at timestamptz,add column expires_at timestamptz,
      add column id uuid primary key default gen_random_uuid(),add column driver_id bigint,
      add column token_hash text,add column safe_link_context jsonb default '{}',add column issued_at timestamptz,
      add column created_at timestamptz default clock_timestamp(),add column updated_at timestamptz,
      add column actor_role text,add column actor_label text,add column source_surface text;`);
  for(const name of [
    '202606090002_driver_portal_bidding_foundation.sql','20260904112430_driver_pool_fast_accept.sql',
    '20260904125321_driver_pool_completion_repair.sql','20260904190552_driver_pool_exact_concurrency_tokens.sql',
    '20260905012642_driver_pool_admin_cancel_assigned_offer.sql','20260909171426_driver_pool_vehicle_requirement.sql',
    '20260914023445_driver_pool_admin_selection.sql','20260914060753_driver_pool_all_groups_first_accept.sql',
    '20260914124007_driver_pool_direct_audience.sql','20260914135103_driver_pool_selected_without_fixed_cap.sql',
    '20260913040035_driver_link_equivalent_pickup_display.sql','20260913030200_driver_ack_merge_current_link.sql',
  ]) await sql(fs.readFileSync('supabase/migrations/'+name,'utf8'));
  await sql(`create table driver_live_location_latest_positions(booking_reference text);
    create table booking_route_points(booking_id bigint,location text);
    create table booking_service_items(booking_id bigint,item_type text);
    create table customer_driver_app_notification_outbox(id uuid primary key default gen_random_uuid(),notification_type text,notification_status text,
    priority text,delivery_surface text,event_key text,booking_reference text,driver_job_link_id uuid,workflow_area text,safe_title text,safe_message text,
    safe_context jsonb,source_surface text,actor_role text,actor_label text,updated_at timestamptz);`);
  const reassignmentMigration=fs.readFileSync('supabase/migrations/20260915083147_admin_manual_driver_assignment_cancellation.sql','utf8');
  // Existing function body, without its deployment-history fingerprint preflight.
  await sql(reassignmentMigration.slice(reassignmentMigration.indexOf('create or replace function public.apply_admin_driver_reassignment'),
    reassignmentMigration.indexOf('revoke execute on function public.apply_admin_driver_reassignment')));
  const migration=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_saved_job_combo.sql'));
  assert.ok(migration); await sql(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
  await sql(fs.readFileSync('supabase/migrations/20260923050900_combo_direct_assignment_vehicle.sql','utf8'));
  const reset=async()=>{
    await sql(`truncate driver_job_combo_members,driver_job_combos,driver_job_bids,driver_job_bid_offers,
      bookings,drivers,driver_access_accounts,driver_device_push_subscriptions,driver_job_links,driver_job_status_events,driver_live_location_latest_positions,customer_driver_app_notification_outbox,audit_logs restart identity cascade;
      insert into drivers select i,'Synthetic QA '||i,'0000000'||i,'QATEST'||i,'AVF','available' from generate_series(1,3) i;
      insert into driver_access_accounts select id::text,'active',repeat('a',64) from drivers;
      insert into bookings(booking_reference,public_booking_reference,customer_id,company_id,booker_id,pickup_at,
        vehicle_type_or_category,service_type,customer_price)
      select 'COMBO-'||i,(99000+i)::text,192,10,20,now()+interval '2 days'+(i*interval '3 hours'),'AVF','TRF',55
      from generate_series(1,5) i;`);
  };
  const members=async(refs=['COMBO-1','COMBO-2','COMBO-3']) => rows(
    'select booking_reference,updated_at::text from bookings where booking_reference=any($1::text[]) order by pickup_at',[refs]);
  const define=(items,revision=null,primary='COMBO-1')=>value(
    "select define_driver_job_combo($1,$2::jsonb,$3,'admin','Synthetic Combo QA') result",[primary,JSON.stringify(items),revision]);
  const publish=async(g,audience=[1,2])=>value(`select publish_driver_job_combo($1,$2,
    (select updated_at from bookings where booking_reference='COMBO-1'),123.45,$3,'admin','Synthetic Combo QA','AVF',$4::bigint[]) result`,
    [g.id,g.revision,randomUUID(),audience]);
  const accept=(o,id,client=db)=>client.query('select accept_driver_job_combo($1,$2,$3,$4) result',
    [o.offer.offer_key,id,o.offer.updated_at,randomUUID()]).then(r=>r.rows[0].result);

  await reset();
  const before=await rows('select * from bookings order by id');
  const g=await define(await members());
  assert.equal(g.trip_count,3);
  assert.equal((await rows(`select count(*)::int n from driver_job_combo_members m
    join bookings b on b.id=m.booking_id and b.booking_reference=m.booking_reference`))[0].n,3);
  assert.equal((await rows(`select count(*)::int n from driver_job_combos g
    join bookings b on b.id=g.primary_booking_id and b.booking_reference=g.primary_booking_reference`))[0].n,1); assert.deepEqual(await rows('select * from bookings order by id'),before,'Selection must not rewrite bookings');
  assert.equal((await rows('select count(*)::int n from driver_job_bid_offers'))[0].n,0,'Selection must not publish');
  await assert.rejects(define(await members()),/changed|posted/,'A lost-response retry must not duplicate a group');
  await assert.rejects(define(await members(['COMBO-2','COMBO-4']),null,'COMBO-2'),/another combo/);
  assert.equal((await rows('select count(*)::int n from driver_job_combos'))[0].n,1);
  for(const mutation of ["customer_id=999","booker_id=21","company_id=11","driver_id=1","status='completed'","pickup_at=now()-interval '1 day'"]){
    await reset(); await sql('update bookings set '+mutation+" where booking_reference='COMBO-2'");
    await assert.rejects(define(await members()));
    assert.equal((await rows('select count(*)::int n from driver_job_combos'))[0].n,0);
  }
  await reset(); const duplicated=await members(); await assert.rejects(define([...duplicated,duplicated[0]]),/Duplicate/);
  const stale=await members(); await sql("update bookings set updated_at=clock_timestamp() where booking_reference='COMBO-2'");
  await assert.rejects(define(stale),/changed/);
  console.log('PASS combo selection: exact saved records and account identity, stale/duplicate/assigned/terminal rejection, no booking creation or sends.');

  for(const audience of [[1,2],[]]){
    await reset(); const group=await define(await members()); const offer=await publish(group,audience);
    const result=await accept(offer,2); assert.equal(result.reason,'accepted');
    const assigned=await rows("select driver_id,driver_payout_override,customer_price from bookings where booking_reference in ('COMBO-1','COMBO-2','COMBO-3') order by id");
    assert.deepEqual(assigned.map(b=>Number(b.driver_id)),[2,2,2]);
    assert.equal(assigned.reduce((n,b)=>n+Number(b.driver_payout_override),0),123.45,'Package amount counted once');
    assert.deepEqual(assigned.map(b=>Number(b.customer_price)),[55,55,55],'Customer prices unchanged');
    assert.equal((await accept(offer,2)).reason,'already_accepted');
    assert.notEqual((await accept(offer,1)).ok,true,'Losing driver must not receive any member');
  }
  await reset(); const changedGroup=await define(await members()); const changedOffer=await publish(changedGroup);
  await sql("alter table bookings disable trigger combo_booking_write_guard; update bookings set pickup_at=pickup_at+interval '1 day',updated_at=clock_timestamp() where booking_reference='COMBO-3'; alter table bookings enable trigger combo_booking_write_guard;");
  await assert.rejects(accept(changedOffer,1),/changed/);
  assert.equal((await rows('select count(*)::int n from bookings where driver_id is not null'))[0].n,0,'Stale later member must prevent all assignment');
  await reset(); const conflictGroup=await define(await members()); const conflictOffer=await publish(conflictGroup);
  await sql("update bookings set pickup_at=(select pickup_at from bookings where booking_reference='COMBO-3'),driver_id=1 where booking_reference='COMBO-4'");
  assert.equal((await accept(conflictOffer,1)).reason,'schedule_conflict');
  assert.equal((await rows("select count(*)::int n from bookings where booking_reference in ('COMBO-1','COMBO-2','COMBO-3') and driver_id is not null"))[0].n,0);
  console.log('PASS selected/all package acceptance: one manual total, all member assignments together, unchanged customer prices, stale later-trip rollback and later-trip schedule conflicts.');

  await reset();
  await sql("update bookings set pickup_at=now()+interval '1 day' where booking_reference='COMBO-3'");
  const earlierGroup=await define(await members());const earlierOffer=await publish(earlierGroup);
  assert.equal(Date.parse(earlierOffer.offer.closes_at),(await rows("select pickup_at from bookings where booking_reference='COMBO-3'"))[0].pickup_at.getTime());
  console.log('PASS offer expiry follows the earliest trip even when another saved trip was selected first.');

  await reset(); const racingGroup=await define(await members()); const racingOffer=await publish(racingGroup);
  const clients=[pg.getPgClient('postgres',dir),pg.getPgClient('postgres',dir)];
  await Promise.all(clients.map(c=>c.connect()));
  try {
    const results=await Promise.all(clients.map((c,i)=>accept(racingOffer,i+1,c)));
    assert.equal(results.filter(r=>r.reason==='accepted').length,1);
    const winners=await rows("select distinct driver_id from bookings where booking_reference in ('COMBO-1','COMBO-2','COMBO-3')");
    assert.equal(winners.length,1); assert.ok(winners[0].driver_id);
  }finally{await Promise.all(clients.map(c=>c.end()));}

  const direct=(g,driver=1,total=145)=>value("select assign_admin_driver_job_combo($1,$2,$3,$4,'admin','Synthetic Combo QA') result",[g.id,g.revision,driver,total]);
  for (const [bookingVehicle, driverVehicle, expectedCategory] of [
    ['Combi', 'Combi', 'COMBI'], ['AVF', 'Toyota Alphard', 'AVF'], ['VVV', 'VClass', 'VVV'],
  ]) {
    await reset();
    await db.query('update bookings set vehicle_type_or_category=$1', [bookingVehicle]);
    await db.query('update drivers set vehicle_type=$1 where id=1', [driverVehicle]);
    const vehicleGroup = await define(await members());
    await direct(vehicleGroup,1,null);
    assert.equal((await rows('select vehicle_requirement from driver_job_combos'))[0].vehicle_requirement, expectedCategory);
    assert.equal((await rows('select count(*)::int n from bookings where driver_id=1'))[0].n,3);
  }
  await reset();
  await sql("update bookings set vehicle_type_or_category='Combi'");
  const mismatchGroup = await define(await members());
  await assert.rejects(direct(mismatchGroup,1,null), /eligible/);
  assert.equal((await rows('select count(*)::int n from bookings where driver_id is not null'))[0].n,0);
  console.log('PASS direct combo vehicle matching: saved Combi casing, driver aliases and atomic mismatch rejection.');
  const prepareLinks=async()=> (await rows("select *,updated_at::text as updated_at from bookings where booking_reference in ('COMBO-1','COMBO-2','COMBO-3') order by booking_reference")).map((b,i)=>({
    booking_reference:b.booking_reference,expected_updated_at:b.updated_at,revision:String(i+1).repeat(64),
    payload:{booking_type:'TRF',pickup_datetime:b.pickup_at.toISOString()},token_hash:String(i+4).repeat(64),ciphertext:'sealed-fixture-'.repeat(4),
    expected_driver_state:{driver_name:b.driver_name,driver_contact:b.driver_contact,driver_plate_number:b.driver_plate_number,vehicle_type_or_category:b.vehicle_type_or_category},
  }));
  const createLinks=(g,items)=>value("select apply_admin_driver_job_combo_links($1,$2,$3,'admin','Synthetic Combo QA') result",[g.id,g.revision,JSON.stringify(items)]);
  const ack=(link,driver=1)=>value("select acknowledge_current_driver_job_combo($1,$2,$3,$4,'Synthetic QA 1','00000001','QATEST1','AVF') result",[link.booking_reference,link.id,link.token_hash,driver]);
  await reset();
  await sql("update bookings set driver_payout_override=60,driver_payout_reason='Existing override' where booking_reference='COMBO-2'");
  const defaultGroup=await define(await members()); await direct(defaultGroup,1,null);
  assert.deepEqual((await rows("select driver_payout_override from bookings where booking_reference in ('COMBO-1','COMBO-2','COMBO-3') order by booking_reference")).map(b=>b.driver_payout_override==null?null:Number(b.driver_payout_override)),[null,60,null]);
  assert.equal((await rows('select total_payout_sgd from driver_job_combos'))[0].total_payout_sgd,null);
  console.log('PASS empty payout override: direct assignment preserves each saved override or default rate.');
  await reset(); const directGroup=await define(await members()); await direct(directGroup);
  assert.deepEqual((await rows("select driver_id from bookings where booking_reference in ('COMBO-1','COMBO-2','COMBO-3')")).map(b=>Number(b.driver_id)),[1,1,1]);
  const prepared=await prepareLinks(); const broken=structuredClone(prepared); broken[2].revision='invalid';
  await assert.rejects(createLinks(directGroup,broken));
  assert.equal((await rows('select count(*)::int n from driver_job_links'))[0].n,0,'One bad member must roll back every link');
  const linked=await createLinks(directGroup,prepared); assert.equal(linked.links.length,3);
  const root=linked.links[0].link;
  assert.equal(new Set(linked.links.map(x=>x.link.safe_link_context.combo_link_batch)).size,1);
  assert.ok(Date.parse(root.expires_at)>Date.now()+96*3600000,'Cross-day combo access must cover the final trip');
  const retry=await createLinks(directGroup,prepared);
  assert.deepEqual(retry.links.map(x=>x.link.id),linked.links.map(x=>x.link.id),'Create Link retry reuses all exact links');
  await assert.rejects(ack(root,2));
  await sql("alter table driver_job_links disable trigger combo_link_write_guard; update driver_job_links set revoked_at=now() where booking_reference='COMBO-3'; alter table driver_job_links enable trigger combo_link_write_guard;");
  await assert.rejects(ack(root));
  assert.equal((await rows("select count(*)::int n from driver_job_links where safe_link_context ? 'driver_acknowledged_at'"))[0].n,0,'Later revoked member must roll back every ACK');
  await sql("alter table driver_job_links disable trigger combo_link_write_guard; update driver_job_links set revoked_at=null where booking_reference='COMBO-3'; alter table driver_job_links enable trigger combo_link_write_guard;");
  assert.equal((await ack(root)).id,root.id);
  assert.equal((await rows("select count(*)::int n from driver_job_links where safe_link_context ? 'driver_acknowledged_at'"))[0].n,3);
  assert.equal((await ack(root)).id,root.id,'ACK retry stays idempotent');
  console.log('PASS direct assignment and atomic Create Link/ACK: complete membership, rollback, sealed-token reuse, all-trip acknowledgement and cross-day expiry.');

  await reset(); const cancelGroup=await define(await members()); const cancelOffer=await publish(cancelGroup); await accept(cancelOffer,1);
  const acceptedOffer=(await rows('select *,updated_at::text as updated_at from driver_job_bid_offers where offer_key=$1',[cancelOffer.offer.offer_key]))[0];
  const cancelled=await value("select cancel_driver_job_combo_offer($1,$2,'admin','Synthetic Combo QA') result",[acceptedOffer.offer_key,acceptedOffer.updated_at]);
  assert.equal(cancelled.assignment_cancelled,true);
  assert.equal((await rows('select count(*)::int n from bookings where driver_id is not null'))[0].n,0);
  assert.equal((await rows('select state from driver_job_combos'))[0].state,'draft');
  console.log('PASS cancellation: untouched accepted package is unassigned as a whole and returns to draft.');


  await reset(); const guarded=await define(await members());
  await assert.rejects(sql("update bookings set driver_id=1 where booking_reference='COMBO-2'"),/combo/i);
  await assert.rejects(sql("delete from bookings where booking_reference='COMBO-2'"),/combo/i);
  await assert.rejects(sql("update bookings set customer_special_request='Changed luggage needs' where booking_reference='COMBO-2'"),/combo/i);
  await assert.rejects(sql("insert into booking_route_points select id,'Changed stop' from bookings where booking_reference='COMBO-2'"),/combo/i);
  await assert.rejects(sql("insert into booking_service_items select id,'Changed service' from bookings where booking_reference='COMBO-2'"),/combo/i);
  await assert.rejects(value("select publish_driver_pool_offer('COMBO-2',(select updated_at from bookings where booking_reference='COMBO-2'),10,$1,'admin','Synthetic QA','AVF',array[1]::bigint[]) result",[randomUUID()]),/combo/i);
  await sql("update bookings set customer_price=199,updated_at=clock_timestamp() where booking_reference='COMBO-2'");
  await direct(guarded);
  const issued=await createLinks(guarded,await prepareLinks());
  await assert.rejects(value("select acknowledge_current_driver_job_link($1,$2,$3,1,'Synthetic QA 1','00000001','QATEST1','AVF') result",
    [issued.links[1].link.booking_reference,issued.links[1].link.id,issued.links[1].link.token_hash]),/combo/i);
  const updated=await value("select reassign_admin_driver_job_combo($1,$2,'COMBO-1',(select updated_at from bookings where booking_reference='COMBO-1'),2,160,'admin','Synthetic QA') result",[guarded.id,guarded.revision]);
  assert.equal(Number(updated.new_driver_id),2);
  assert.equal((await rows("select count(*)::int n from bookings where driver_id=2"))[0].n,3);
  assert.equal((await rows("select count(*)::int n from driver_job_links where link_status='active'"))[0].n,0);
  assert.equal((await rows("select count(*)::int n from customer_driver_app_notification_outbox where notification_status='queued'"))[0].n,1,'One whole-package replacement alert');
  const replacementGroup=(await rows('select id,revision from driver_job_combos'))[0];
  const replacementLinks=await createLinks(replacementGroup,await prepareLinks());
  await value("select revoke_admin_driver_job_combo_link($1,'admin','Synthetic QA') result",[replacementLinks.links[0].link.id]);
  assert.equal((await rows("select count(*)::int n from driver_job_links where link_status='revoked'"))[0].n,3);
  await value("select reassign_admin_driver_job_combo($1,$2,'COMBO-1',(select updated_at from bookings where booking_reference='COMBO-1'),null,null,'admin','Synthetic QA') result",[replacementGroup.id,replacementGroup.revision]);
  assert.equal((await rows('select count(*)::int n from bookings where driver_id is not null'))[0].n,0);
  const cancelledGroup=(await rows('select id,revision from driver_job_combos'))[0];
  await define(await members(['COMBO-1']),cancelledGroup.revision);
  assert.equal((await rows('select count(*)::int n from driver_job_combos'))[0].n,0);
  assert.equal((await rows('select count(*)::int n from bookings'))[0].n,5,'Removing draft combo keeps saved jobs');
  assert.equal(Number((await rows("select customer_price from bookings where booking_reference='COMBO-2'"))[0].customer_price),199);
  console.log('PASS in-place write protection, independent customer prices, whole-package replacement/cancellation/revocation and draft removal without deleting bookings.');
  for(const role of ['anon','authenticated']){
    assert.equal(await value("select has_table_privilege($1,'driver_job_combos','select') result",[role]),false);
    assert.equal(await value("select has_function_privilege($1,'public.define_driver_job_combo(text,jsonb,uuid,text,text)','execute') result",[role]),false);
  }
  console.log('PASS independent-session package race: exactly one driver wins every trip; public/customer roles cannot read or invoke combo persistence.');
}finally{
  if(db) await db.end();
  await pg.stop().catch(()=>{});
  fs.rmSync(dir,{recursive:true,force:true});
}
