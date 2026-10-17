// Missing QA intake persistence checks only. Disposable PostgreSQL, no TCP or app credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
assert.ok(process.env.QA_CHANGE_RUNTIME,'Use the saved embedded PostgreSQL runtime');
const {default: EmbeddedPostgres}=await import(process.env.QA_CHANGE_RUNTIME);
const dir=fs.mkdtempSync('/private/tmp/qa-change-');
const pg=new EmbeddedPostgres({databaseDir:path.join(dir,'data'),user:'postgres',password:randomUUID(),persistent:false,port:5432,postgresFlags:['-c','listen_addresses=','-c','statement_timeout=10000','-k',dir],onLog:()=>{},onError:()=>{}});
let db;
const context={request_kind:'amendment',request_note:'QA change',requested_pickup_location:'QA alternative',surface:'customer_booking_change_request',workflow_area:'customer_booking_change_request'};
const stamp='2026-10-17T00:00:00.000Z';
async function save({body=context,ref='QA-ADMIN',company=901,version=stamp,id=9001}={}) {return (await db.query('select public.save_customer_reviewer_qa_change_request($1,$2,$3,902,903,905,904,$4,$5) value',[id,ref,company,version,body])).rows[0].value;}
const snapshot=async()=> (await db.query('select to_jsonb(b) value from bookings b order by id')).rows;
try{
 await pg.initialise();await pg.start();db=pg.getPgClient('postgres',dir);await db.connect();
 assert.equal((await db.query('show listen_addresses')).rows[0].listen_addresses,'');
 await db.query(`create role anon;create role authenticated;create role service_role;create schema extensions;
 create table bookings(id bigint primary key,booking_reference text,company_id bigint,booker_id bigint,customer_id bigint,traveler_id bigint,driver_id bigint,updated_at timestamptz,admin_internal_status text,customer_facing_status text);
 insert into bookings values(9001,'QA-ADMIN',901,902,903,905,904,'2026-10-17T00:00Z','draft','received'),(8001,'REAL',1,2,3,4,5,'2026-10-17T00:00Z','draft','received');
 create table driver_job_bid_offers(booking_reference text);create table driver_job_combo_members(booking_reference text);create table driver_job_links(booking_reference text);create table driver_job_status_events(booking_reference text);
 create table calendar_canary(value text);insert into calendar_canary values('owner calendar unchanged');`);
 const foundation=fs.readFileSync('supabase/migrations/202606070005_admin_app_notification_outbox_foundation.sql','utf8');
 // Exact existing table DDL + indexes only; no historic migration execution or test replay.
 await db.query(foundation.slice(foundation.indexOf('create table'),foundation.indexOf('comment on table')));
 await db.query('create unique index admin_app_notification_outbox_event_key_key on admin_app_notification_outbox(event_key) where event_key is not null');
 await db.query(fs.readFileSync('docs/store-submission/customer-reviewer-qa-change.sql','utf8'));
 const before=await snapshot(),first=await save(),repeat=await save();
 assert.equal(first.id,repeat.id);assert.equal(first.actor_label,'store-review-customer-request');assert.equal(first.safe_context.review_company_id,'901');
 const cancel=await save({body:{...context,request_kind:'cancellation'}});assert.notEqual(cancel.id,first.id);
 assert.equal((await db.query('select count(*) from admin_app_notification_outbox')).rows[0].count,'2');
 assert.deepEqual(await snapshot(),before);assert.equal((await db.query('select value from calendar_canary')).rows[0].value,'owner calendar unchanged');
 for(const input of [{ref:'REAL',id:8001},{company:1},{version:'2026-10-16T00:00Z'},{body:{...context,driver_id:'1'}},{body:{...context,request_kind:'invalid'}},{body:null},{body:[]},{body:{...context,request_note:'x'.repeat(2100)}}])await assert.rejects(save(input));
 for(const table of ['driver_job_bid_offers','driver_job_combo_members','driver_job_links','driver_job_status_events']){await db.query(`insert into ${table} values('QA-ADMIN')`);await assert.rejects(save());await db.query(`delete from ${table}`);}
 await db.query("update bookings set customer_facing_status='cancelled' where id=9001");await assert.rejects(save());await db.query("update bookings set customer_facing_status='received' where id=9001");
 assert.equal((await db.query('select count(*) from admin_app_notification_outbox')).rows[0].count,'2');assert.deepEqual(await snapshot(),before);
 const signature='public.save_customer_reviewer_qa_change_request(bigint,text,bigint,bigint,bigint,bigint,bigint,timestamptz,jsonb)';
 for(const role of ['anon','authenticated'])assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') allowed',[role,signature])).rows[0].allowed,false);
 const metadata=(await db.query("select prosecdef,proconfig from pg_proc where oid=$1::regprocedure",[signature])).rows[0];assert.equal(metadata.prosecdef,false);assert.deepEqual(metadata.proconfig,['search_path=""']);
 if(process.env.QA_CHANGE_MIGRATION){await db.query('drop function '+signature);await db.query(fs.readFileSync(process.env.QA_CHANGE_MIGRATION,'utf8'));await assert.rejects(db.query(fs.readFileSync(process.env.QA_CHANGE_MIGRATION,'utf8')),/metadata drift/);assert.equal((await save()).id,first.id);}
 console.log('PASS real PostgreSQL QA intake: exact ownership/revision, duplicate idempotency, amendment/cancel storage, invalid and operational target denial, no booking/Calendar changes, service-only invoker permissions.');
}finally{await db?.end().catch(()=>{});await pg.stop().catch(()=>{});fs.rmSync(dir,{recursive:true,force:true});}
