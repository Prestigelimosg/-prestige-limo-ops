// Actual transaction + trigger, synthetic records only; no remote database.
import assert from 'node:assert/strict';
import {readFile,mkdtemp} from 'node:fs/promises';
let db, server, sqlClient;
if(process.env.PRESTIGE_TEST_EMBEDDED_POSTGRES){
 const {default:EmbeddedPostgres}=await import(process.env.PRESTIGE_TEST_EMBEDDED_POSTGRES);
 server=new EmbeddedPostgres({databaseDir:await mkdtemp('/private/tmp/prestige-cancel-pg-'),user:'postgres',password:'synthetic-local-only',port:5457,persistent:false,onLog:()=>{},onError:()=>{}});
 await server.initialise();await server.start();sqlClient=server.getPgClient();await sqlClient.connect();
 db={exec:sql=>sqlClient.query(sql),query:(sql,args)=>sqlClient.query(sql,args),close:async()=>{await sqlClient.end();await server.stop();}};
}else{
 const {PGlite}=await import(process.env.PRESTIGE_TEST_PGLITE || '@electric-sql/pglite');
 const {pgcrypto}=await import(process.env.PRESTIGE_TEST_PGCRYPTO || '@electric-sql/pglite/contrib/pgcrypto');
 db=new PGlite({extensions:{pgcrypto}});
}
try {
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema extensions; create extension pgcrypto with schema extensions;
create table bookings (id bigint primary key, booking_reference text unique, customer_id bigint,
 driver_id bigint, driver_name text, driver_contact text, driver_plate_number text, updated_at timestamptz,
 status text, admin_internal_status text, customer_facing_status text, vehicle_type_or_category text,
 driver_payout_override numeric, google_calendar_event_id text, customer_price numeric);
create table drivers (id bigint primary key, driver_name text, contact_number text, plate_number text, availability_status text);
create table driver_job_links (id uuid primary key default gen_random_uuid(), booking_reference text,
 driver_id bigint, link_status text, revoked_at timestamptz, expires_at timestamptz, created_at timestamptz default now(),
 updated_at timestamptz default now(), safe_link_context jsonb default '{}', google_calendar_event_id text);
create table driver_job_status_events(id uuid primary key default gen_random_uuid(), booking_reference text,
 driver_job_link_id uuid references driver_job_links(id), status_value text);
create table driver_job_bid_offers (booking_reference text, offer_status text);
create table driver_live_location_latest_positions (booking_reference text);
create table customer_driver_app_notification_outbox (id uuid primary key default gen_random_uuid(),
 notification_type text, notification_status text, priority text, delivery_surface text, event_key text unique,
 booking_reference text, driver_job_link_id uuid, workflow_area text, safe_title text, safe_message text, safe_context jsonb,
 source_surface text, actor_role text, actor_label text, updated_at timestamptz);
create table audit_logs (entity_type text, entity_id bigint, action text, source_route text, actor_label text,
 change_summary text, booking_id bigint, customer_id bigint, actor_role text, action_type text, booking_reference text,
 source_surface text, reason text, safe_before jsonb, safe_after jsonb);
`);
await db.exec(await readFile('supabase/migrations/20260831124441_admin_driver_reassignment_transaction.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20260915083147_admin_manual_driver_assignment_cancellation.sql','utf8'));
const version='2030-01-01T00:00:00Z';
const link='11111111-1111-4111-8111-111111111111';
async function seed(){await db.exec(`truncate driver_job_status_events,driver_job_links,bookings,drivers,driver_job_bid_offers,driver_live_location_latest_positions,customer_driver_app_notification_outbox,audit_logs;
insert into bookings values(1,'CANCEL-QA',100,7,'Old Driver','test-contact','OLD7','${version}','assigned','assigned','confirmed','AVF',45,'ops-calendar',90);
insert into bookings values(2,'OTHER-QA',100,7,'Old Driver','test-contact','OLD7','${version}','assigned','assigned','confirmed','AVF',55,'other-calendar',100);
insert into drivers values(7,'Old Driver','test-contact','OLD7','available'),(8,'Replacement','new-contact','NEW8','available');
`);}
const call=async(driver=null,expected=version,role='admin')=>(await db.query('select public.apply_admin_driver_reassignment($1,$2,$3,$4,$5) result',['CANCEL-QA',expected,driver,role,'Synthetic Admin'])).rows[0].result;
const row=async(table)=>(await db.query(`select to_jsonb(t) row from ${table} t${table === "bookings" ? " order by id" : ""}`)).rows.map(x=>x.row);
async function addLink(state='active',driver=7){await db.query(`insert into driver_job_links(id,booking_reference,driver_id,link_status,revoked_at,expires_at,safe_link_context,google_calendar_event_id)
values($1,'CANCEL-QA',$2,$3,case when $3='revoked' then now() else null end,now()+interval '1 day','{"driver_acknowledged_at":"2030-01-01T01:00Z"}','personal-calendar')`,[link,driver,state]);}
for(const state of ['none','revoked','active','expired']){
 await seed(); if(state!=='none') await addLink(state);
 const before=(await row('bookings'));
 const result=await call(); const after=await row('bookings');
 assert.equal(result.new_driver_id,null); assert.equal(result.previous_driver_id,7);
 for(const field of ['driver_id','driver_name','driver_contact','driver_plate_number']) assert.equal(after[0][field],null);
 for(const [key,value] of Object.entries(before[0])) if(!['driver_id','driver_name','driver_contact','driver_plate_number','updated_at'].includes(key)) assert.deepEqual(after[0][key],value,key);
 assert.deepEqual(after[1],before[1]);
 const notice=(await row('customer_driver_app_notification_outbox'))[0];
 assert.equal(notice.safe_message,'Job cancel, do not proceed.');
 assert.equal(notice.safe_context.recipient_driver_id,7);assert.equal(notice.driver_job_link_id,null);
 assert.equal((await row('audit_logs')).length,1);
 if(state!=='none'){
  const l=(await row('driver_job_links'))[0];
  assert.equal(l.link_status,state==='active'?'expired':state);assert.equal(l.google_calendar_event_id,'personal-calendar');
  assert.equal(l.safe_link_context.driver_acknowledged_at,'2030-01-01T01:00Z');
  await assert.rejects(db.query(`insert into driver_job_status_events(booking_reference,driver_job_link_id,status_value) values('CANCEL-QA',$1,'otw')`,[link]),/assignment was cancelled/);
 }
 await assert.rejects(call(),/changed|reload/i);assert.equal((await row('customer_driver_app_notification_outbox')).length,1);
}
await seed();await addLink('active',null);await call();assert.equal((await row('driver_job_links'))[0].link_status,'expired','Unbound link must not reclaim cancelled job');
for(const blocker of ['completed','cancelled','job_completed','declined_internal','pool','report','gps','other-driver','stale','role']){
 await seed();await addLink();
 if(['completed','cancelled','job_completed','declined_internal'].includes(blocker)) await db.query('update bookings set status=$1 where id=1',[blocker]);
 if(blocker==='pool') await db.exec("insert into driver_job_bid_offers values('CANCEL-QA','assigned')");
 if(blocker==='report') await db.query("insert into driver_job_status_events(booking_reference,driver_job_link_id,status_value) values('CANCEL-QA',$1,'otw')",[link]);
 if(blocker==='gps') await db.exec("insert into driver_live_location_latest_positions values('CANCEL-QA')");
 if(blocker==='other-driver') await db.exec('update driver_job_links set driver_id=8');
 const before=await row('bookings');const links=await row('driver_job_links');
 await assert.rejects(call(null,blocker==='stale'?'2029-01-01':version,blocker==='role'?'driver':'admin'),undefined,blocker);
 assert.deepEqual(await row('bookings'),before);assert.deepEqual(await row('driver_job_links'),links);
 assert.equal((await row('customer_driver_app_notification_outbox')).length,0);
}
// Reassignment remains the existing positive replacement branch, including its exact old notice.
await seed();await addLink();const replacement=await call(8);assert.equal(replacement.new_driver_id,8);
assert.equal((await row('bookings'))[0].driver_name,'Replacement');
assert.equal((await row('customer_driver_app_notification_outbox'))[0].safe_message,'Job reassigned, do not proceed.');
// A failure to save the notice or audit rolls back the assignment and link changes too.
for(const table of ['customer_driver_app_notification_outbox','audit_logs']){
 await seed();await addLink();const before=await row('bookings');const links=await row('driver_job_links');
 await db.exec(`alter table ${table} add constraint synthetic_failure check(false) not valid`);
 await assert.rejects(call());assert.deepEqual(await row('bookings'),before);assert.deepEqual(await row('driver_job_links'),links);
 await db.exec(`alter table ${table} drop constraint synthetic_failure`);
}
const rights=(await db.query(`select has_function_privilege('anon','public.apply_admin_driver_reassignment(text,timestamptz,bigint,text,text)','execute') anon,
 has_function_privilege('authenticated','public.apply_admin_driver_reassignment(text,timestamptz,bigint,text,text)','execute') authenticated`)).rows[0];
assert.deepEqual(rights,{anon:false,authenticated:false});
if(server){
 const second=server.getPgClient();await second.connect();
 const pid=(await sqlClient.query('select pg_backend_pid() pid')).rows[0].pid;
 async function waiting(){
  const deadline=Date.now()+3000;
  while(Date.now()<deadline){
   const state=(await second.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0];
   if(state?.wait_event_type==='Lock')return;
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.fail('Expected competing transaction to wait for the exact booking lock');
 }
 try {
  // Report wins first: cancellation waits, then refuses without touching evidence.
  await seed();await addLink();await second.query('begin');
  await second.query("insert into driver_job_status_events(booking_reference,driver_job_link_id,status_value) values('CANCEL-QA',$1,'otw')",[link]);
  const cancel=call().then(value=>({value}),error=>({error}));await waiting();await second.query('commit');
  assert.match((await cancel).error.message,/reporting/);assert.equal((await row('bookings'))[0].driver_id,7);
  // Cancellation wins first: late report waits, then refuses after the link is disabled.
  await seed();await addLink();await second.query('begin');
  await second.query("select public.apply_admin_driver_reassignment('CANCEL-QA',$1,null,'admin','Synthetic Admin')",[version]);
  const report=db.query("insert into driver_job_status_events(booking_reference,driver_job_link_id,status_value) values('CANCEL-QA',$1,'otw')",[link]).then(value=>({value}),error=>({error}));
  await waiting();await second.query('commit');assert.match((await report).error.message,/assignment was cancelled/);
  assert.equal((await row('driver_job_status_events')).length,0);assert.equal((await row('customer_driver_app_notification_outbox')).length,1);
  console.log('Real PostgreSQL concurrent report/cancel ordering passed in both directions.');
 } finally {await second.query('rollback');await second.end();}
}
console.log('Cancellation SQL passed: no/revoked/active/expired links, ACK retention, old access blocked, unbound links, terminal/pool/report/GPS/stale guards, replacement, atomic rollback, grants.');
} finally {await db.close();}
