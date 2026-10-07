// Execute the existing writers and forward migration in disposable local PostgreSQL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const runtime = process.env.POOL_EMBEDDED_PG_PATH;
assert.ok(runtime, 'Set POOL_EMBEDDED_PG_PATH to an installed embedded-postgres package');
const { default: EmbeddedPostgres } = await import(path.join(runtime, 'dist/index.js'));
const directory = fs.mkdtempSync('/private/tmp/prestige-amended-ack-pg-');
const pg = new EmbeddedPostgres({ databaseDir:path.join(directory,'data'), user:'postgres', password:randomUUID(), persistent:false,
  port:5432, postgresFlags:['-c','listen_addresses=','-k',directory], onLog:()=>{}, onError:()=>{} });
await pg.initialise(); await pg.start();
const db=pg.getPgClient('postgres',directory); await db.connect();
const read=p=>fs.readFileSync(p,'utf8');
const val=async(s,a=[])=> (await db.query(s,a)).rows[0].result;
try {
  assert.equal((await db.query('show listen_addresses')).rows[0].listen_addresses,'');
  await db.query(read('scripts/test-driver-stable-link-postgres.mjs').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
  await db.query(`alter table bookings add column remarks text,add column pickup_at timestamptz,add column dropoff_datetime timestamptz;
    create table driver_job_combos(id uuid primary key,revision uuid,state text,driver_id bigint,primary_booking_reference text,vehicle_requirement text);
    create table driver_job_combo_members(combo_id uuid,booking_reference text,booking_snapshot jsonb);
    create function lock_driver_job_combo(uuid,uuid) returns driver_job_combos language sql as 'select * from public.driver_job_combos where id=$1 and revision=$2';
    create function driver_job_combo_booking_snapshot(bookings) returns jsonb language sql as 'select to_jsonb($1)';`);
  for(const file of ['20260930024457_driver_job_remark_payload.sql','20260913030100_driver_link_delivery_reservation.sql',
    '20260913032248_driver_link_after_duplicate_retirement.sql','20260918043000_driver_alert_lifecycle.sql',
    '20260930024457_driver_job_remark_payload.sql','20260913030200_driver_ack_merge_current_link.sql']) {
    await db.query(read('supabase/migrations/'+file));
  }
  const combo=read('supabase/migrations/20260923024634_saved_job_combo.sql');
  await db.query(combo.slice(combo.indexOf('create function public.apply_admin_driver_job_combo_links('),combo.indexOf('create function public.assign_admin_driver_job_combo(')));
  const payload={booking_type:'DEP',pickup_location:'Synthetic pickup',dropoff_location:'Synthetic airport',
    assigned_driver_name:'Synthetic Driver',assigned_driver_contact:'00000000',assigned_driver_plate:'QA7',assigned_driver_vehicle_model:'QA car'};
  const state={driver_name:null,driver_contact:null,driver_plate_number:null,vehicle_type_or_category:null};
  const apply=(revision,body=payload)=>val(`select apply_admin_driver_job_link('STABLE-QA','2026-09-13T00:00Z',7,$1,$2,$3,'synthetic-encrypted-capability',now()+interval '96 hours','admin','Synthetic Admin',$4) result`,[body,revision,'b'.repeat(64),state]);
  let link=(await apply('a'.repeat(64))).link;
  await db.query(`update driver_job_links set safe_link_context=safe_link_context||jsonb_build_object('driver_acknowledged_at','2026-09-13T01:00Z',
    'driver_job_payload',safe_link_context->'driver_job_payload'||'{"driver_name":"Synthetic Driver","driver_contact":"00000000","driver_plate_number":"QA7","driver_vehicle_model":"QA car"}'),
    google_calendar_event_id='same-event',google_calendar_revision='old-calendar'`);
  link=(await apply('c'.repeat(64),{...payload,pickup_location:'Before repair'})).link;
  assert.equal(link.safe_link_context.driver_amendment_ack_pending,undefined,'Baseline reproduces the missing amendment ACK requirement');
  await db.query(read('supabase/migrations/20261007013614_driver_amended_revision_ack.sql'));
  link=(await apply('d'.repeat(64),{...payload,pickup_location:'After repair'})).link;
  assert.equal(link.safe_link_context.driver_amendment_ack_pending,true,'A genuine amendment requires a fresh ACK');
  assert.ok(Number.isFinite(Date.parse(link.safe_link_context.driver_amendment_issued_at)));
  assert.equal(link.safe_link_context.driver_acknowledged_at,'2026-09-13T01:00Z');
  assert.equal(link.google_calendar_event_id,'same-event');
  assert.equal(link.google_calendar_revision,'old-calendar');
  assert.equal((await apply('d'.repeat(64),{...payload,pickup_location:'After repair'})).link.id,link.id);
  const snapshot=()=>val(`select jsonb_build_object('booking',to_jsonb(b),'event',l.google_calendar_event_id,'calendar_revision',l.google_calendar_revision,
    'token',l.token_hash,'expiry',l.expires_at,'original_ack',l.safe_link_context->>'driver_acknowledged_at') result
    from bookings b join driver_job_links l using(booking_reference) where b.booking_reference='STABLE-QA'`);
  const untouched=await snapshot();
  const ackSql=`select acknowledge_current_driver_job_link('STABLE-QA',$1,$2,7,'Synthetic Driver','00000000','QA7','QA car',$3) result`;
  const ack=rev=>val(ackSql,[link.id,link.token_hash,rev]);
  await assert.rejects(ack(null),e=>e.code==='P0002');
  await assert.rejects(ack('c'.repeat(64)),e=>e.code==='P0002');
  await db.query("update driver_job_links set issued_at=now()-interval '20 minutes'");
  const reserve=mode=>val(`select reserve_driver_job_link_delivery('STABLE-QA',$1,7,$2,$3,$4,'admin','Synthetic Admin') result`,[link.id,mode,'d'.repeat(64),randomUUID()]);
  assert.equal((await reserve('reminder')).claimed,true,'Original ACK does not suppress an amendment reminder');
  assert.equal((await reserve('close_ack_alert')).claimed,true);
  assert.equal((await reserve('reminder')).reason,'alert_closed');
  assert.equal((await val('select to_jsonb(l) result from driver_job_links l where id=$1',[link.id])).safe_link_context.driver_amendment_ack_pending,true,'Close is not acknowledgement');
  const acknowledged=await ack('d'.repeat(64));
  assert.equal(acknowledged.safe_link_context.driver_amendment_ack_pending,false);
  assert.equal(acknowledged.safe_link_context.driver_acknowledged_revision,'d'.repeat(64));
  assert.equal(await ack('d'.repeat(64)).then(x=>x.safe_link_context.driver_amendment_acknowledged_at),acknowledged.safe_link_context.driver_amendment_acknowledged_at,'Retry preserves revision ACK time');
  assert.deepEqual(await snapshot(),untouched,'ACK changes no booking, Calendar, token, expiry or original ACK');
  assert.equal((await apply('d'.repeat(64),{...payload,pickup_location:'After repair'})).link.safe_link_context.driver_amendment_ack_pending,false,'Unchanged resend does not require ACK');
  // A real booking-lock race: a newer amendment wins before an older screen can ACK.
  const writer=pg.getPgClient('postgres',directory),reader=pg.getPgClient('postgres',directory);
  await writer.connect();await reader.connect();
  try {
    await writer.query('begin');
    await writer.query(`select apply_admin_driver_job_link('STABLE-QA','2026-09-13T00:00Z',7,$1,$2,$3,'synthetic-encrypted-capability',now()+interval '96 hours','admin','Synthetic Admin',$4)`,
      [{...payload,pickup_location:'Latest amendment'},'e'.repeat(64),link.token_hash,state]);
    const waiting=reader.query(ackSql,[link.id,link.token_hash,'d'.repeat(64)]).then(()=>null,e=>e);
    await writer.query('commit');assert.equal((await waiting)?.code,'P0002');
    assert.equal((await ack('e'.repeat(64))).safe_link_context.driver_amendment_ack_pending,false);
  } finally {await writer.end();await reader.end();}
  for(const name of ['acknowledge_current_driver_job_link','acknowledge_current_driver_job_combo']) {
    for(const role of ['anon','authenticated']) assert.equal(await val(`select has_function_privilege($1,$2,'execute') result`,[role,`public.${name}(text,uuid,text,bigint,text,text,text,text,text)`]),false);
  }
  const groupId=randomUUID(),groupRevision=randomUUID();
  await db.query(`insert into bookings(booking_reference,driver_id,updated_at,status) values('COMBO-SECOND',7,'2026-09-13T00:00Z','assigned');
    update driver_job_links set safe_link_context=safe_link_context||jsonb_build_object('ack_alert_closed_at',now(),'ack_alert_closed_revision','e'::text);`);
  await db.query(`insert into driver_job_combos values($1,$2,'assigned',7,'STABLE-QA','QA car');
    `,[groupId,groupRevision]);
  await db.query(`insert into driver_job_combo_members(combo_id,booking_reference) values($1,'STABLE-QA'),($1,'COMBO-SECOND')`,[groupId]);
  const packageInput=async(secondRevision='f'.repeat(64))=> {
    const bookings=(await db.query('select * from bookings order by booking_reference')).rows;
    return bookings.map(b=>({booking_reference:b.booking_reference,expected_updated_at:b.updated_at,
      payload:{...payload,pickup_location:b.booking_reference==='STABLE-QA'?'Latest amendment':'Second trip '+secondRevision[0]},
      revision:b.booking_reference==='STABLE-QA'?'e'.repeat(64):secondRevision,
      token_hash:b.booking_reference==='STABLE-QA'?link.token_hash:'9'.repeat(64),ciphertext:'synthetic-encrypted-capability',
      expected_driver_state:{driver_name:b.driver_name,driver_contact:b.driver_contact,driver_plate_number:b.driver_plate_number,vehicle_type_or_category:b.vehicle_type_or_category}}));
  };
  const packageApply=async(rev)=>val(`select apply_admin_driver_job_combo_links($1,$2,$3,'admin','Synthetic Admin') result`,[groupId,groupRevision,JSON.stringify(await packageInput(rev))]);
  const firstPackage=await packageApply();
  let origin=firstPackage.links.find(x=>x.link.id===link.id).link;
  const packageRevision=origin.safe_link_context.driver_ack_required_revision;
  assert.equal(origin.safe_link_context.driver_amendment_ack_pending,true);
  assert.equal(origin.safe_link_context.ack_alert_closed_at,undefined,'A changed package reopens the primary alert');
  const comboAck=rev=>val(`select acknowledge_current_driver_job_combo('STABLE-QA',$1,$2,7,'Synthetic Driver','00000000','QA7','QA car',$3) result`,[link.id,link.token_hash,rev]);
  await assert.rejects(comboAck('e'.repeat(64)),e=>e.code==='P0002');
  assert.equal((await comboAck(packageRevision)).safe_link_context.driver_amendment_ack_pending,false);
  const repeatedPackage=await packageApply();
  assert.equal(repeatedPackage.links.find(x=>x.link.id===link.id).link.safe_link_context.driver_amendment_ack_pending,false);
  const changedPackage=await packageApply('8'.repeat(64));
  origin=changedPackage.links.find(x=>x.link.id===link.id).link;
  assert.equal(origin.safe_link_context.driver_amendment_ack_pending,true,'A secondary-trip amendment returns the existing primary queue row');
  await assert.rejects(comboAck(packageRevision),e=>e.code==='P0002');
  assert.equal((await comboAck(origin.safe_link_context.driver_ack_required_revision)).safe_link_context.driver_amendment_ack_pending,false);
  assert.equal((await snapshot()).event,'same-event','Combo confirmation preserves personal Calendar event identity');
} finally { await db.end(); await pg.stop(); fs.rmSync(directory,{recursive:true,force:true}); }
console.log('Amended revision ACK SQL contract passed.');
