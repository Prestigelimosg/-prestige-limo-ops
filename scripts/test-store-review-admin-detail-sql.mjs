// New detail-save behavior only, against disposable PostgreSQL with TCP disabled.
// Reuses schema setup; does not run earlier test suites or load app credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {execFileSync} from 'node:child_process';
const runtime = process.env.QA_DETAIL_RUNTIME;
const fixture = process.env.QA_DETAIL_FIXTURE;
assert.ok(runtime && fixture, 'Explicit local runtime and fixture paths required');
const {default: EmbeddedPostgres} = await import(runtime);
const {baseline} = await import(fixture);
const dir = fs.mkdtempSync('/private/tmp/qa-detail-');
const pg = new EmbeddedPostgres({databaseDir:path.join(dir,'data'),user:'postgres',password:randomUUID(),persistent:false,
  port:5432,postgresFlags:['-c','listen_addresses=','-c','statement_timeout=12000','-k',dir],onLog:()=>{},onError:()=>{}});
let db;
const query = async(sql,args=[]) => (await db.query(sql,args)).rows;
const snapshot = async() => ({bookings:await query('select to_jsonb(b) value from bookings b order by id'),
  audit:await query('select to_jsonb(a) value from audit_logs a'),
  invoice:await query('select * from qa_invoice_canary'),calendar:await query('select * from qa_calendar_canary')});
const details={passenger_name:'QA edited passenger',pax_count:4,flight_no:'QA456',vehicle_type_or_category:'VVV'};
const version=async()=> (await query('select updated_at::text value from bookings where id=1001'))[0].value;
async function save({value=details,bags=3,reference='QA-DETAIL',stamp,company=101}={}) {
  return (await query('select public.save_admin_reviewer_qa_bags(1001,$1,$2,102,103,104,7,$3::timestamptz,$4,$5::jsonb) value',
    [reference,company,stamp??await version(),bags,value===null?null:JSON.stringify(value)]))[0].value;
}
try {
  await pg.initialise();await pg.start();db=pg.getPgClient('postgres',dir);await db.connect();
  assert.equal((await query('show listen_addresses'))[0].listen_addresses,'');
  await baseline(db);
  await db.query(`alter table bookings add column request_review_status text,add column source_surface text,
    add column change_review_status text,add column cancellation_review_status text,add column short_notice_review_status text,add column customer_request_trip_group jsonb;
    create table qa_invoice_canary(id int primary key,content jsonb);insert into qa_invoice_canary values(1,'{"untouched":true}');
    create table qa_calendar_canary(id int primary key,content jsonb);insert into qa_calendar_canary values(1,'{"untouched":true}');
    insert into drivers values(7,'Synthetic','000','TEST','AVF','available');
    insert into bookings(id,booking_reference,company_id,booker_id,customer_id,traveler_id,driver_id,admin_internal_status,customer_facing_status,
      source_surface,request_review_status,short_notice_review_status,luggage_count,passenger_name,pax_count,flight_no,vehicle_type_or_category)
    values(1001,'QA-DETAIL',101,102,103,104,7,'draft','received','admin_dashboard','pending_review','not_required',1,'QA passenger',2,'QA123','AVF');
    insert into bookings(id,booking_reference,luggage_count,passenger_name) values(2001,'REAL-CANARY',9,'Unrelated');`);
  if (process.argv.includes('--migration-only')) {
    assert.ok(process.env.QA_DETAIL_MIGRATION);
    await db.query(execFileSync('git',['show','HEAD:docs/store-submission/admin-reviewer-qa-save.sql'],{encoding:'utf8'}));
    const migration=fs.readFileSync(process.env.QA_DETAIL_MIGRATION,'utf8');
    await db.query(migration);
    const definitions=await query("select oid::regprocedure::text signature,pronargdefaults,prosecdef,proconfig from pg_proc where proname='save_admin_reviewer_qa_bags'");
    assert.equal(definitions.length,1);assert.equal(definitions[0].pronargdefaults,1);assert.equal(definitions[0].prosecdef,false);
    assert.equal((await save()).details.passenger_name,details.passenger_name);
    await assert.rejects(db.query(migration),/metadata drift/);
    console.log('PASS exact migration installs one compatible signature atomically; repeated application stops on drift');
  } else {
  await db.query(fs.readFileSync('docs/store-submission/admin-reviewer-qa-save.sql','utf8'));
  const oldStamp=await version(),before=await snapshot();
  const result=await save();assert.deepEqual(result.details,details);assert.equal(result.luggage_count,3);
  const after=await snapshot();assert.deepEqual(after.bookings[1],before.bookings[1]);
  for(const key of Object.keys(before.bookings[0].value)) if(!['passenger_name','pax_count','flight_no','vehicle_type_or_category','luggage_count','updated_at'].includes(key))
    assert.deepEqual(after.bookings[0].value[key],before.bookings[0].value[key],key);
  assert.deepEqual(after.invoice,before.invoice);assert.deepEqual(after.calendar,before.calendar);
  assert.equal(after.audit.length,1);assert.deepEqual(after.audit[0].value.safe_after.details,details);
  assert.equal((await save()).noop,true);assert.deepEqual(await snapshot(),after);
  console.log('PASS exact QA details persist with audit; unrelated booking, fields and sample invoice stay unchanged; identical retry is a no-op');
  for(const args of [{reference:'REAL-CANARY'},{company:1},{stamp:oldStamp},{bags:-1},{value:{...details,pax_count:101}},
    {value:{...details,driver_id:999}},{value:{...details,passenger_name:''}},{value:{...details,pax_count:1.5}}]) {
    await assert.rejects(save(args));assert.deepEqual(await snapshot(),after);
  }
  console.log('PASS detail requests cannot substitute scope, add assignment fields, overwrite stale changes or submit invalid values');
  await db.query(`create function fail_qa_detail_audit() returns trigger language plpgsql as $$begin raise exception 'synthetic audit failure';end$$;
    create trigger fail_qa_detail_audit before insert on audit_logs for each row execute function fail_qa_detail_audit();`);
  await assert.rejects(save({bags:4}));assert.deepEqual(await snapshot(),after);
  await db.query('drop trigger fail_qa_detail_audit on audit_logs');
  console.log('PASS audit failure rolls back the expanded detail update');
  for(const role of ['anon','authenticated']) assert.equal((await query("select has_function_privilege($1,'public.save_admin_reviewer_qa_bags(bigint,text,bigint,bigint,bigint,bigint,bigint,timestamptz,integer,jsonb)','execute') allowed",[role]))[0].allowed,false);
  console.log('PASS no public/authenticated direct RPC grants');
  const legacy=(await query('select public.save_admin_reviewer_qa_bags(1001,$1,101,102,103,104,7,$2::timestamptz,2) value',['QA-DETAIL',await version()]))[0].value;
  assert.equal(legacy.luggage_count,2);assert.equal(legacy.details,undefined);
  const legacyRow=(await snapshot()).bookings[0].value;
  for(const [key,value] of Object.entries(details))assert.equal(legacyRow[key],value);
  console.log('PASS old deployed nine-argument request remains compatible without a second overload');
  }
} finally {await db?.end().catch(()=>{});await pg.stop().catch(()=>{});fs.rmSync(dir,{recursive:true,force:true});}
