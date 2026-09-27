import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
assert.ok(process.env.MESSAGE_PGLITE_PATH, 'Set MESSAGE_PGLITE_PATH to the disposable PGlite runtime, outside app dependencies.');
const {PGlite}=await import(process.env.MESSAGE_PGLITE_PATH);
const db=new PGlite();
try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table bookings(id bigint primary key,booking_reference text unique,status text,admin_internal_status text,updated_at timestamptz);
 create table customer_driver_app_notification_outbox(id uuid primary key,booking_reference text,workflow_area text,notification_type text,delivery_surface text,actor_role text,safe_context jsonb,created_at timestamptz,notification_status text);
 create table customer_invoices(id int primary key,amount int);insert into customer_invoices values(1,390);
 create table driver_job_status_events(id int primary key,status text);insert into driver_job_status_events values(1,'Job Completed');
 insert into bookings values(1,'OLD','completed','completed',now()-interval '1 year');`);
 const migrations=readdirSync('supabase/migrations').filter(n=>n.endsWith('_admin_message_attention_retention.sql'));
 assert.equal(migrations.length,1,'Exactly one retention migration must match the applied history; never duplicate it');
 const migration=migrations[0];
 await db.exec(readFileSync('supabase/migrations/'+migration,'utf8'));
 const q=async sql=>(await db.query(sql)).rows;
 assert.ok((await q('select message_retention_anchor_at from bookings'))[0].message_retention_anchor_at,'Historic job gets fresh retention window, never guessed closure');
 await db.exec(`insert into bookings(id,booking_reference,status,admin_internal_status) values(2,'ACTIVE','assigned','driver_assigned'),(3,'CLOSED','assigned','driver_assigned'),(4,'CANCEL','cancelled','cancelled');`);
 assert.equal((await q("select message_retention_anchor_at from bookings where id=2"))[0].message_retention_anchor_at,null);
 await db.exec("update bookings set admin_internal_status='completed' where id=3");
 const anchor=(await q('select message_retention_anchor_at from bookings where id=3'))[0].message_retention_anchor_at;
 assert.ok(anchor);
 await db.exec("update bookings set status='completed' where id=3");
 assert.equal(String((await q('select message_retention_anchor_at from bookings where id=3'))[0].message_retention_anchor_at),String(anchor),'Legacy mirror must not restart period');
 await db.exec("update bookings set admin_internal_status='confirmed' where id=3");
 assert.equal((await q('select message_retention_anchor_at from bookings where id=3'))[0].message_retention_anchor_at,null,'Reopening clears retention eligibility even before legacy mirror');
 await db.exec("update bookings set admin_internal_status='completed',status='completed' where id=3");
 await db.exec(`update bookings set message_retention_anchor_at=now()-interval '4 months' where id in(2,3,4);
 insert into customer_driver_app_notification_outbox select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,case when i=2 then 'ACTIVE' when i=3 then 'OLD' when i=4 then 'MISSING' else 'CLOSED' end,
 case when i=5 then 'driver_pickup_reminder' else 'admin_driver_job_messages' end,'trip_update','driver_app','driver','{"direction":"driver_to_admin"}',case when i=6 then now() else now()-interval '4 months' end,'read' from generate_series(1,6)i;
 insert into customer_driver_app_notification_outbox values('00000000-0000-4000-8000-000000000007','CANCEL','customer_driver_quick_replies','trip_update','customer_app','driver','{"direction":"driver_to_customer"}',now()-interval '4 months','queued');`);
 const before=await q('select * from bookings order by id');
 assert.equal((await q('select cleanup_job_message_retention() result'))[0].result.deleted,2);
 assert.deepEqual((await q('select id from customer_driver_app_notification_outbox order by id')).map(r=>r.id.slice(-1)),['2','3','4','5','6']);
 assert.deepEqual(await q('select * from bookings order by id'),before,'Cleanup never writes bookings');
 assert.equal((await q('select amount from customer_invoices'))[0].amount,390);
 assert.equal((await q('select status from driver_job_status_events'))[0].status,'Job Completed');
 assert.equal((await q("select has_function_privilege('anon','cleanup_job_message_retention()','execute') allowed"))[0].allowed,false);
 assert.equal((await q("select has_function_privilege('authenticated','cleanup_job_message_retention()','execute') allowed"))[0].allowed,false);
 assert.equal((await q("select has_function_privilege('service_role','cleanup_job_message_retention()','execute') allowed"))[0].allowed,true);
 await db.exec(`insert into customer_driver_app_notification_outbox values
 ('00000000-0000-4000-8000-000000000008','CLOSED','admin_customer_job_messages','trip_update','customer_app','admin','{"audience":"admin_customer"}',now()-interval '4 months','queued'),
 ('00000000-0000-4000-8000-000000000009','CLOSED','admin_driver_job_messages','trip_update','driver_app','admin','{}',now()-interval '4 months','queued'),
 ('00000000-0000-4000-8000-000000000010','CLOSED','customer_driver_quick_replies','trip_update','driver_app','customer','{"direction":"customer_to_driver"}',now()-interval '4 months','queued'),
 ('00000000-0000-4000-8000-000000000011','CLOSED','customer_driver_details_acknowledgements','trip_update','customer_app','customer','{"direction":"customer_to_admin"}',now()-interval '4 months','queued');`);
 assert.equal((await q('select cleanup_job_message_retention() result'))[0].result.deleted,3,'All established conversation directions are covered');
 assert.equal((await q("select count(*) n from customer_driver_app_notification_outbox where workflow_area='customer_driver_details_acknowledgements'"))[0].n,1,'Fixed customer ACK is not a chat message');
 assert.equal((await q("select timestamp '2026-01-31 23:00' + interval '3 months' = timestamp '2026-04-30 23:00' ok"))[0].ok,true);
 assert.equal((await q("select timestamp '2023-11-30 12:00' + interval '3 months' = timestamp '2024-02-29 12:00' ok"))[0].ok,true);
 await db.exec(`insert into customer_driver_app_notification_outbox select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'CLOSED','admin_driver_job_messages','trip_update','driver_app','driver','{"direction":"driver_to_admin"}',now()-interval '4 months','read' from generate_series(100,1100)i;`);
 assert.deepEqual((await q('select cleanup_job_message_retention() result'))[0].result,{deleted:1000,batch_full:true});
 assert.equal((await q('select cleanup_job_message_retention() result'))[0].result.deleted,1);
 await db.exec('set role anon');
 await assert.rejects(()=>q('select cleanup_job_message_retention()'),/permission denied/);await db.exec('reset role');
 console.log('SQL passed: closure/reopen/legacy mirror, historic grace, eligible-only deletion, active/missing/recent/other notifications preserved, invoice/report unchanged, private permissions.');
}finally{await db.close();}
