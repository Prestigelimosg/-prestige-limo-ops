// Synthetic PostgreSQL only. Reuses schema setup, never runs old test bodies.
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const {default:EmbeddedPostgres}=await import(process.env.PRESTIGE_TEST_EMBEDDED_POSTGRES || 'embedded-postgres');
const dir=await mkdtemp('/private/tmp/prestige-driver-details95-');
const pg=new EmbeddedPostgres({databaseDir:path.join(dir,'data'),user:'postgres',password:randomUUID(),persistent:false,port:5432,postgresFlags:['-c','listen_addresses=','-c','statement_timeout=5000','-c','lock_timeout=2000','-k',dir],onLog:()=>{},onError:()=>{}});
let db,other;let cases=0;const remaining=process.argv.includes('--remaining');
try{
 await pg.initialise();await pg.start();db=pg.getPgClient('postgres',dir);await db.connect();other=pg.getPgClient('postgres',dir);await other.connect();
 assert.equal((await db.query('show listen_addresses')).rows[0].listen_addresses,'');
 const fixture=await readFile('scripts/test-admin-driver-assignment-cancel-postgres.mjs','utf8');
 const setup=fixture.slice(fixture.indexOf('await db.exec(`')+15,fixture.indexOf('`);',fixture.indexOf('await db.exec(`')));
 await db.query(setup);
 await db.query(`alter table drivers add column vehicle_type text;
 alter table bookings add column source_surface text,add column request_review_status text;
 create table driver_job_combo_members(booking_reference text);
 `);
 await db.query(await readFile('supabase/migrations/20260831124441_admin_driver_reassignment_transaction.sql','utf8'));
 await db.query(await readFile('supabase/migrations/20260915083147_admin_manual_driver_assignment_cancellation.sql','utf8'));
 const version='2030-01-01T00:00:00Z';
 const beforeDefinition=(await db.query("select pg_get_functiondef('public.apply_admin_driver_reassignment(text,timestamptz,bigint,text,text)'::regprocedure) definition")).rows[0].definition;
 if(process.argv.includes('--migration-only')){
  const proposal=await readFile('docs/sql-proposals/admin-same-driver-details.sql','utf8');
  assert.match(proposal.replace(/^--.*$/gm,'').trim(),/^do \$migration\$[\s\S]*\$migration\$;$/);
  assert.doesNotMatch(proposal,/^begin;|^commit;/m);
  const failing=proposal.replace(' execute replace(definition,old_block,new_block);'," execute replace(definition,old_block,new_block);\n raise exception 'Synthetic post-DDL failure';");
  await assert.rejects(db.query(failing),/Synthetic post-DDL failure/);
  assert.equal((await db.query("select pg_get_functiondef('public.apply_admin_driver_reassignment(text,timestamptz,bigint,text,text)'::regprocedure) definition")).rows[0].definition,beforeDefinition);
  await db.query(proposal);
  assert.notEqual((await db.query("select pg_get_functiondef('public.apply_admin_driver_reassignment(text,timestamptz,bigint,text,text)'::regprocedure) definition")).rows[0].definition,beforeDefinition);
  console.log('PASS single-statement autocommit DDL, post-DDL exception rolls back whole function, success applies exact replacement');
 } else {
 const seed=async()=>{await db.query(`truncate driver_job_status_events,driver_job_links,bookings,drivers,driver_job_bid_offers,driver_job_combo_members,driver_live_location_latest_positions,customer_driver_app_notification_outbox,audit_logs;
 insert into bookings(id,booking_reference,customer_id,driver_id,driver_name,driver_contact,driver_plate_number,vehicle_type_or_category,updated_at,status,admin_internal_status,customer_facing_status,driver_payout_override,customer_price,google_calendar_event_id,source_surface,request_review_status)
 values(1,'DETAILS-95',100,8,'Old Name','81230001','OLD8','Old Model','${version}','assigned','assigned','confirmed',45,90,'unchanged-event','admin_api','approved'),(2,'OTHER-95',100,8,'Old Name','81230001','OLD8','Old Model','${version}','assigned','assigned','confirmed',55,100,'other-event','admin_api','approved');
 insert into drivers(id,driver_name,contact_number,plate_number,availability_status,vehicle_type)values(8,'Corrected Name','+65 81230001','NEW8','available','Corrected Model');
 insert into driver_job_links(booking_reference,driver_id,link_status,safe_link_context) values('DETAILS-95',8,'active','{"driver_acknowledged_at":"2030-01-01T00:01:00Z","driver_job_payload":{"assigned_driver_plate":"OLD8"}}');
 `);};
 const call=(client=db,expected=version,role='admin')=>client.query('select public.apply_admin_driver_reassignment($1,$2,$3,$4,$5) result',['DETAILS-95',expected,8,role,'Synthetic Admin']);
 const tables=['bookings','drivers','driver_job_links','driver_job_status_events','driver_job_bid_offers','driver_job_combo_members','driver_live_location_latest_positions','customer_driver_app_notification_outbox','audit_logs'];
 const snapshot=async()=>{const out={};for(const table of tables)out[table]=(await db.query(`select to_jsonb(t) row from ${table} t order by to_jsonb(t)::text`)).rows.map(r=>r.row);return out;};
 if(!remaining){await seed();await assert.rejects(call(),/already assigned/);console.log('BASELINE reproduced existing same-driver rejection');cases++;}
 await db.query(await readFile('docs/sql-proposals/admin-same-driver-details.sql','utf8'));
 await seed();const before=await snapshot();const receipt=(await call()).rows[0].result;
 const after=await snapshot();if(!remaining){assert.equal(receipt.driver_details_updated,true);assert.equal(after.bookings[0].driver_plate_number,'NEW8');
 for(const key of Object.keys(before.bookings[0]))if(!['driver_name','driver_contact','driver_plate_number','vehicle_type_or_category','updated_at'].includes(key))assert.deepEqual(after.bookings[0][key],before.bookings[0][key],key);
 assert.equal(after.bookings[0].driver_name,'Corrected Name');assert.equal(after.bookings[0].driver_contact,'+65 81230001');assert.equal(after.bookings[0].vehicle_type_or_category,'Corrected Model');
 assert.deepEqual(after.bookings[1],before.bookings[1]);assert.equal(after.audit_logs.length,1);
 for(const table of tables.filter(t=>!['bookings','audit_logs'].includes(t)))assert.deepEqual(after[table],before[table],table);
 console.log('PASS four corrected fields, exact job only, profile/link/ACK/notifications/finance/calendar untouched');cases++;}
 const current=(await db.query('select updated_at::text as updated_at from bookings where id=1')).rows[0].updated_at;
 await call(db,current);assert.deepEqual(await snapshot(),after);console.log('PASS unchanged retry performs no write or audit');cases++;
 for(const blocker of ['pool','combo','report','gps','terminal','pending','inactive','stale','role']){
  await seed();
  if(blocker==='pool')await db.query("insert into driver_job_bid_offers values('DETAILS-95','open')");
  if(blocker==='combo')await db.query("insert into driver_job_combo_members values('DETAILS-95')");
  if(blocker==='report')await db.query("insert into driver_job_status_events(booking_reference,status_value) values('DETAILS-95','otw')");
  if(blocker==='gps')await db.query("insert into driver_live_location_latest_positions values('DETAILS-95')");
  if(blocker==='terminal')await db.query("update bookings set status='completed' where id=1");
  if(blocker==='pending')await db.query("update bookings set source_surface='customer_booking_request',request_review_status='pending' where id=1");
  if(blocker==='inactive')await db.query("update drivers set availability_status='inactive'");
  const snapshotBefore=await snapshot();await assert.rejects(call(db,blocker==='stale'?'2029-01-01':version,blocker==='role'?'driver':'admin'));
  assert.deepEqual(await snapshot(),snapshotBefore,blocker);cases++;
 }
 console.log('PASS Pool/combo/report/GPS/terminal/pending/inactive/stale/role reject without writes');
 await seed();const rollbackBefore=await snapshot();await db.query('alter table audit_logs add constraint synthetic_failure check(false) not valid');await assert.rejects(call());assert.deepEqual(await snapshot(),rollbackBefore);await db.query('alter table audit_logs drop constraint synthetic_failure');console.log('PASS failed audit rolls back details');cases++;
 for(const kind of ['pool','combo']){
  await seed();await other.query('begin');await other.query('select id from bookings where id=1 for update');
  const waiting=call().then(()=>({ok:true}),e=>({ok:false,code:e.code}));
  // The conflicting writer follows the existing booking-lock order.
  await other.query(kind==='pool'?"insert into driver_job_bid_offers values('DETAILS-95','open')":"insert into driver_job_combo_members values('DETAILS-95')");
  await other.query('commit');assert.equal((await waiting).ok,false);assert.equal((await db.query('select driver_plate_number from bookings where id=1')).rows[0].driver_plate_number,'OLD8');cases++;
 }
 console.log('PASS concurrent Pool/combo writer wins booking lock, correction rechecks and rejects');
 const afterDefinition=(await db.query("select pg_get_functiondef('public.apply_admin_driver_reassignment(text,timestamptz,bigint,text,text)'::regprocedure) definition")).rows[0].definition;
 const oldStart=beforeDefinition.indexOf('  if v_previous_driver_id = p_new_driver_id then'),oldEnd=beforeDefinition.indexOf('\n\n  if v_cancellation then',oldStart);
 const newStart=afterDefinition.indexOf('  if v_previous_driver_id = p_new_driver_id then'),newEnd=afterDefinition.indexOf('\n\n  if v_cancellation then',newStart);
 assert.equal(beforeDefinition.slice(0,oldStart),afterDefinition.slice(0,newStart));assert.equal(beforeDefinition.slice(oldEnd),afterDefinition.slice(newEnd));
 const rights=(await db.query("select has_function_privilege('anon','public.apply_admin_driver_reassignment(text,timestamptz,bigint,text,text)','execute') anon,has_function_privilege('authenticated','public.apply_admin_driver_reassignment(text,timestamptz,bigint,text,text)','execute') authenticated")).rows[0];assert.deepEqual(rights,{anon:false,authenticated:false});
 console.log(JSON.stringify({newCasesPassed:cases,otherFunctionBranchesByteIdentical:true,anonymousAccess:false,previousTestBodiesRun:0,liveConnections:0,scope:'synthetic reduced PostgreSQL schema; no hosted API/browser acceptance'}));
}
}finally{if(other)await other.end();if(db)await db.end();await pg.stop();await rm(dir,{recursive:true,force:true});}
