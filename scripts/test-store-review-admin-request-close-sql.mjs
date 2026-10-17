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

const id='00000000-0000-4000-8000-000000000001';
const signature='public.update_admin_reviewer_qa_notification(bigint,text,bigint,bigint,bigint,bigint,bigint,uuid,text)';
const context={review_booking_id:'9001',review_company_id:'901',review_booker_id:'902',review_customer_id:'903',review_traveler_id:'905',review_driver_id:'904'};
async function update({notification=id,status='archived',company=901,booking=9001,reference='QA-ADMIN'}={}){return(await db.query('select public.update_admin_reviewer_qa_notification($1,$2,$3,902,903,905,904,$4,$5) value',[booking,reference,company,notification,status])).rows[0].value;}
try{
 await pg.initialise();await pg.start();db=pg.getPgClient('postgres',dir);await db.connect();
 await db.query(`create role anon;create role authenticated;create role service_role;
 create table bookings(id bigint primary key,booking_reference text,company_id bigint,booker_id bigint,customer_id bigint,traveler_id bigint,driver_id bigint);
 insert into bookings values(9001,'QA-ADMIN',901,902,903,905,904),(8001,'REAL',1,2,3,4,5);
 create table calendar_canary(value text);insert into calendar_canary values('owner calendar unchanged');`);
 const foundation=fs.readFileSync('supabase/migrations/202606070005_admin_app_notification_outbox_foundation.sql','utf8');
 await db.query(foundation.slice(foundation.indexOf('create table'),foundation.indexOf('comment on table')));
 await db.query(`insert into admin_app_notification_outbox(id,notification_type,notification_status,priority,delivery_surface,booking_reference,workflow_area,safe_title,safe_message,safe_context,source_surface,actor_role,actor_label)
 values($1,'booking_workflow','queued','normal','admin_app','QA-ADMIN','customer_booking_change_request','QA request','QA request',$2,'system','system','store-review-customer-request'),
 ('00000000-0000-4000-8000-000000000002','booking_workflow','queued','normal','admin_app','REAL','customer_booking_change_request','Real canary','Do not change','{}','admin_api','admin','Owner')`,[id,context]);
 await db.query(fs.readFileSync('docs/store-submission/admin-reviewer-qa-notification-transaction.sql','utf8'));
 const before=(await db.query('select to_jsonb(b) value from bookings b order by id')).rows;
 const realBefore=(await db.query("select to_jsonb(n) value from admin_app_notification_outbox n where booking_reference='REAL'")).rows;
 for(const args of [{company:1},{booking:8001,reference:'REAL'},{notification:'00000000-0000-4000-8000-000000000002'},{status:'queued'},{status:null}])await assert.rejects(update(args));
 assert.equal((await update({status:'read'})).notification_status,'read');
 const closed=await update(),retry=await update();assert.equal(closed.updated_at,retry.updated_at);assert.equal(closed.actor_label,'store-review-customer-request');assert.deepEqual(closed.safe_context,context);
 await assert.rejects(update({status:'read'}));await assert.rejects(update({status:'dismissed'}));
 await db.query("update admin_app_notification_outbox set notification_status='queued' where id=$1",[id]);
 assert.equal((await update({status:'dismissed'})).notification_status,'dismissed');
 for(const field of Object.keys(context)){await db.query("update admin_app_notification_outbox set notification_status='queued',safe_context=$2 where id=$1",[id,{...context,[field]:'8001'}]);await assert.rejects(update());}
 await db.query("update admin_app_notification_outbox set notification_status='queued',safe_context=$2,actor_label='Owner' where id=$1",[id,context]);await assert.rejects(update());
 assert.deepEqual((await db.query('select to_jsonb(b) value from bookings b order by id')).rows,before);
 assert.deepEqual((await db.query("select to_jsonb(n) value from admin_app_notification_outbox n where booking_reference='REAL'")).rows,realBefore);
 assert.equal((await db.query('select value from calendar_canary')).rows[0].value,'owner calendar unchanged');
 for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,$2,'execute') allowed",[role,signature])).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('service_role',$1,'execute') allowed",[signature])).rows[0].allowed,true);
 const metadata=(await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[signature])).rows[0];assert.equal(metadata.prosecdef,false);assert.deepEqual(metadata.proconfig,['search_path=""']);
 await assert.rejects(db.query(fs.readFileSync('docs/store-submission/admin-reviewer-qa-notification-transaction.sql','utf8')),/metadata drift/);
 console.log('PASS PostgreSQL QA notification close: exact identity/marker, safe read/archive/dismiss, idempotent retry, real row and booking/Calendar unchanged, service-only invoker and transaction drift stop.');
}finally{await db?.end().catch(()=>{});await pg.stop().catch(()=>{});fs.rmSync(dir,{recursive:true,force:true});}
