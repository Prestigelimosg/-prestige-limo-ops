// Actual PostgreSQL transactions; disposable local DB, no Production or provider access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const runtime = process.env.POOL_EMBEDDED_PG_PATH;
assert.ok(runtime, 'Set POOL_EMBEDDED_PG_PATH to an installed embedded-postgres package');
const { default: EmbeddedPostgres } = await import(path.join(runtime, 'dist/index.js'));
const directory = fs.mkdtempSync('/private/tmp/prestige-pool-cancel-pg-');
const pg = new EmbeddedPostgres({ databaseDir:path.join(directory,'data'), user:'postgres', password:randomUUID(), persistent:false,
  port:5432, postgresFlags:['-c','listen_addresses=','-k',directory], onLog:()=>{}, onError:()=>{} });
await pg.initialise(); await pg.start();
const connect=async()=>{const c=pg.getPgClient('postgres',directory);await c.connect();return c;};
const db=await connect();
const q=async(s,a=[])=> (await db.query(s,a)).rows;
const val=async(s,a=[])=> (await q(s,a))[0].result;
const migration=fs.readFileSync('supabase/migrations/20260929033456_driver_pool_cancel_before_trip_after_link.sql','utf8');
const cancelSql="select cancel_driver_pool_offer($1,$2,'admin','Synthetic Admin') result";
let offer;
const cancel=()=>val(cancelSql,[offer.offer_key,offer.updated_at]);
try {
 assert.equal((await q('show listen_addresses'))[0].listen_addresses,'');
 await db.query(fs.readFileSync('scripts/test-driver-pool-vehicle-postgres.py','utf8').match(/sql\("""\n(create role[\s\S]*?)"""\)/)[1]);
 await db.query(`alter table bookings add column status text,add column customer_price numeric,add column invoice_reference text;
 alter table driver_job_links add column id uuid default gen_random_uuid() primary key,add column driver_id bigint,
  add column link_status text default 'active',add column revoked_at timestamptz,add column expires_at timestamptz default now()+interval '3 days',
  add column updated_at timestamptz default now(),add column safe_link_context jsonb default '{}',add column google_calendar_event_id text;
 alter table driver_job_status_events add column driver_job_link_id uuid,add column status_value text;
 create table driver_live_location_latest_positions(booking_reference text,driver_job_link_id uuid, sharing_state text);`);
 for(const name of ['202606090002_driver_portal_bidding_foundation.sql','20260904112430_driver_pool_fast_accept.sql','20260904125321_driver_pool_completion_repair.sql','20260904190552_driver_pool_exact_concurrency_tokens.sql','20260905012642_driver_pool_admin_cancel_assigned_offer.sql']) await db.query(fs.readFileSync('supabase/migrations/'+name,'utf8'));
 const reportMigration=fs.readFileSync('supabase/migrations/20260915083147_admin_manual_driver_assignment_cancellation.sql','utf8');
 await db.query(reportMigration.slice(reportMigration.indexOf('create or replace function public.guard_cancelled_driver_assignment_status()')));
 const reset=async(linkKind='active')=>{
  await db.query(`truncate driver_job_status_events,driver_live_location_latest_positions,driver_job_links,driver_job_bids,driver_job_bid_offers,bookings,drivers,driver_access_accounts,driver_device_push_subscriptions,audit_logs restart identity cascade;
   insert into drivers values (1,'Synthetic Driver','90000001','QA1001','AVF','available'),(2,'Other Driver','90000002','QA1002','AVF','available');
   insert into driver_access_accounts select id::text,'active',repeat('a',64) from drivers;
   insert into bookings(booking_reference,public_booking_reference,pickup_at,vehicle_type_or_category,customer_price,invoice_reference) values('POOL-QA','99001',now()+interval '2 days','AVF',999,'UNCHANGED');`);
  const published=await val("select publish_driver_pool_offer('POOL-QA',(select updated_at from bookings),45,$1,'admin','Synthetic Admin') result",[randomUUID()]);
  await val('select accept_driver_pool_offer($1,1,$2,$3) result',[published.offer.offer_key,published.offer.updated_at,randomUUID()]);
  offer=(await q('select * from driver_job_bid_offers'))[0];
  // node-postgres Date loses microseconds; keep the exact database token.
  offer.updated_at=(await q('select updated_at::text token from driver_job_bid_offers'))[0].token;
  if(linkKind!=='none') await db.query(`insert into driver_job_links(booking_reference,driver_id,link_status,revoked_at,safe_link_context,google_calendar_event_id)
    values('POOL-QA',1,$1,case when $1='revoked' then now() else null end,'{"driver_acknowledged_at":"2026-09-29T03:15:38Z","driver_job_payload":{"passenger":"Synthetic"}}','personal-event-unchanged')`,[linkKind]);
 };
 await reset('revoked');
 await assert.rejects(cancel(),/without a Driver Job Link/);
 assert.equal(Number((await q('select driver_id from bookings'))[0].driver_id),1);
 console.log('REPRODUCED: revoked/acknowledged link alone blocks unchanged Pool cancellation.');
 const definitions=await q("select proname,prosrc from pg_proc where pronamespace='public'::regnamespace");
 await db.query(migration);
 for(const row of await q("select proname,prosrc from pg_proc where pronamespace='public'::regnamespace")) if(row.proname!=='cancel_driver_pool_offer') assert.equal(row.prosrc,definitions.find(x=>x.proname===row.proname)?.prosrc,row.proname+' unchanged');
 for(const kind of ['none','active','revoked','expired']) {
  await reset(kind);
  await db.query("insert into bookings(booking_reference,public_booking_reference,driver_id,customer_price) values('OTHER','99002',1,555); insert into driver_job_links(booking_reference,driver_id) values('OTHER',1)");
  const unrelated=JSON.stringify(await q("select to_jsonb(b) b,to_jsonb(l) l from bookings b join driver_job_links l using(booking_reference) where booking_reference='OTHER'"));
  const before=(await q("select * from driver_job_links where booking_reference='POOL-QA'"))[0];
  const result=await cancel(); assert.equal(result.assignment_cancelled,true);assert.equal(Number(result.cancelled_driver_id),1);
  const booking=(await q("select * from bookings where booking_reference='POOL-QA'"))[0];
  for(const field of ['driver_id','driver_name','driver_contact','driver_plate_number','driver_payout_override','driver_payout_reason']) assert.equal(booking[field],null,field);
  assert.equal(booking.status,null);assert.equal(booking.customer_price,'999');assert.equal(booking.invoice_reference,'UNCHANGED');
  assert.equal((await q("select bid_status from driver_job_bids where driver_reference='1'"))[0].bid_status,'accepted');
  if(before) {
   const link=(await q("select * from driver_job_links where booking_reference='POOL-QA'"))[0];
   assert.equal(link.safe_link_context.driver_acknowledged_at,before.safe_link_context.driver_acknowledged_at);
   assert.deepEqual(link.safe_link_context.driver_job_payload,before.safe_link_context.driver_job_payload);
   assert.equal(link.google_calendar_event_id,before.google_calendar_event_id);assert.deepEqual(link.revoked_at,before.revoked_at);
   assert.equal(link.link_status,kind==='active'?'expired':kind);assert.ok(link.safe_link_context.assignment_cancelled_at);
   await assert.rejects(db.query("insert into driver_job_status_events values('POOL-QA',$1,'otw')",[link.id]),/assignment was cancelled/);
   await assert.rejects(db.query("insert into driver_live_location_latest_positions values('POOL-QA',$1,'active')",[link.id]),/assignment was cancelled/);
  }
  assert.equal(JSON.stringify(await q("select to_jsonb(b) b,to_jsonb(l) l from bookings b join driver_job_links l using(booking_reference) where booking_reference='OTHER'")),unrelated);
  await assert.rejects(cancel(),/changed/); // stale retry has no repeated audit or alert result
  offer.updated_at=(await q('select updated_at::text token from driver_job_bid_offers'))[0].token;
  assert.equal((await cancel()).assignment_cancelled,false);
 }
 const snapshots=()=>q("select (select jsonb_agg(to_jsonb(b)) from bookings b) bookings,(select jsonb_agg(to_jsonb(l)) from driver_job_links l) links,(select jsonb_agg(to_jsonb(o)) from driver_job_bid_offers o) offers,(select count(*) from audit_logs) audits");
 for(const change of [
  "update bookings set updated_at=clock_timestamp()", "update bookings set driver_id=2", "update bookings set driver_payout_override=99",
  "update bookings set driver_payout_reason='Manual override'", "update bookings set status='completed'", "update bookings set customer_facing_status='canceled'",
  "insert into driver_job_status_events select booking_reference,id,'otw' from driver_job_links",
  "insert into driver_live_location_latest_positions select booking_reference,id,'active' from driver_job_links",
  "insert into driver_job_links(booking_reference,driver_id) values('POOL-QA',2)",
  "update driver_job_bid_offers set safe_offer_context=safe_offer_context||'{\"combo_id\":\"synthetic\"}'"
 ]) {
  await reset();await db.query(change);const before=await snapshots();await assert.rejects(cancel());assert.deepEqual(await snapshots(),before,change);
 }
 // Existing unaffiliated link is not disabled; null-bound access for this booking is disabled.
 await reset();await db.query("update driver_job_links set driver_id=null");await cancel();
 assert.ok((await q('select safe_link_context from driver_job_links'))[0].safe_link_context.assignment_cancelled_at);
 for(const role of ['anon','authenticated']) assert.equal(await val("select has_function_privilege($1,'public.cancel_driver_pool_offer(text,timestamptz,text,text)','execute') result",[role]),false);
 assert.equal(await val("select has_function_privilege('service_role','public.cancel_driver_pool_offer(text,timestamptz,text,text)','execute') result"),true);
 // Both race orders: a started trip wins and blocks cancellation, or cancelled links reject late reports/GPS.
 for(const table of ['driver_job_status_events','driver_live_location_latest_positions']) for(const first of ['cancel','evidence']) {
  await reset();const link=(await q('select id from driver_job_links'))[0].id;
  const a=await connect(),b=await connect();
  const insert=`insert into ${table} values('POOL-QA',$1,'${table==='driver_job_status_events'?'otw':'active'}')`;
  try {
   await a.query('begin');await a.query(first==='cancel'?cancelSql:insert,first==='cancel'?[offer.offer_key,offer.updated_at]:[link]);
   const waiter=b.query(first==='cancel'?insert:cancelSql,first==='cancel'?[link]:[offer.offer_key,offer.updated_at]).then(()=>({ok:true}),error=>({error}));
   await a.query('commit');const outcome=await waiter;assert.ok(outcome.error,table+': '+first+' wins');
   assert.equal((await q(`select count(*)::int n from ${table}`))[0].n,first==='cancel'?0:1);
  } finally {await a.end();await b.end();}
 }
 await reset('none');
 await db.query("update driver_job_bid_offers set offer_status='open'");
 assert.equal((await cancel()).assignment_cancelled,false,'Open offer remains offer-only cancellation');
 console.log('PASS issued/ACK/revoked/expired/no-link cancellation; assignment-only writes; link/report/Calendar/privacy preservation; terminal/stale/payout/foreign-link/combo/GPS guards; permissions; retries; both report/GPS race orders.');
} finally {await db.end();await pg.stop();fs.rmSync(directory,{recursive:true,force:true});}
