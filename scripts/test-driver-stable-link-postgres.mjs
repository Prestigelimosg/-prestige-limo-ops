// Execute the actual migration in a disposable Postgres-compatible engine.
// PRESTIGE_TEST_PGLITE points to an externally installed @electric-sql/pglite ESM entry.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.PRESTIGE_TEST_PGLITE || "@electric-sql/pglite");
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table bookings (booking_reference text primary key, driver_id bigint,
    updated_at timestamptz default now(), status text, admin_internal_status text,
    customer_facing_status text, driver_name text, driver_contact text,
    driver_plate_number text, vehicle_type_or_category text);
  create table driver_job_bid_offers (booking_reference text, offer_status text, closes_at timestamptz);
  create table driver_job_links (id uuid primary key default gen_random_uuid(),
    booking_reference text, driver_id bigint, token_hash text unique, link_status text,
    expires_at timestamptz, revoked_at timestamptz, safe_link_context jsonb default '{}',
    issued_at timestamptz default now(), created_at timestamptz default now(),
    updated_at timestamptz default now(), actor_role text, actor_label text, source_surface text,
    google_calendar_event_id text, google_calendar_revision text, google_calendar_saved_at timestamptz);
  create table customer_driver_app_notification_outbox (id uuid primary key default gen_random_uuid(),
    booking_reference text, driver_job_link_id uuid, event_key text unique, workflow_area text,
    notification_status text, notification_type text, delivery_surface text, priority text,
    safe_title text, safe_message text, safe_context jsonb default '{}',
    actor_role text, actor_label text, source_surface text, created_at timestamptz default now(), updated_at timestamptz default now());
  insert into bookings values ('STABLE-QA',7,'2026-09-13T00:00Z','assigned','assigned','confirmed');
`);
const migration = await readFile("supabase/migrations/20260913030000_driver_stable_booking_link.sql", "utf8");
await db.exec(migration);
const payload = { booking_type:"DEP", pickup_datetime:"2026-09-14T10:00:00+08:00", pickup_location:"QA Pickup", dropoff_location:"QA Airport" };
const rev = "a".repeat(64);
let expectedBookingVersion="2026-09-13T00:00Z";
let expectedDriverState={driver_name:null,driver_contact:null,driver_plate_number:null,vehicle_type_or_category:null};
const call = async (data=payload, revision=rev, driver=7, expected=expectedBookingVersion, hash="b".repeat(64)) => {
  const result = await db.query(`select public.apply_admin_driver_job_link($1,$2,$3,$4,$5,$6,$7,now()+interval '96 hours',$8,$9,$10) result`,
    ['STABLE-QA',expected,driver,JSON.stringify(data),revision,hash,"v1.synthetic-sealed-secret",'admin','Synthetic Admin',JSON.stringify(expectedDriverState)]);
  return result.rows[0].result;
};
const first = await call();
assert.equal(first.disposition,"created");
const again = await Promise.all([call(),call()]);
assert.ok(again.every(x=>x.link.id===first.link.id && x.disposition==='reused'));
assert.equal((await db.query("select count(*)::int n from driver_job_links")).rows[0].n,1);
await db.query(`update driver_job_links set safe_link_context=safe_link_context || '{"driver_acknowledged_at":"2026-09-13T01:00Z"}', google_calendar_event_id='same-event', google_calendar_revision='old-revision' where id=$1`,[first.link.id]);
const changed = await call({...payload,pickup_location:"QA Changed"},"c".repeat(64));
assert.equal(changed.disposition,"amended");
assert.equal(changed.link.id,first.link.id);
assert.equal(changed.link.token_hash,first.link.token_hash);
assert.equal(changed.link.safe_link_context.driver_acknowledged_at,"2026-09-13T01:00Z");
assert.equal(changed.link.google_calendar_event_id,"same-event");
assert.equal(changed.link.google_calendar_revision,"old-revision");
assert.equal(changed.link.expires_at,first.link.expires_at);
await assert.rejects(call(payload,rev,8),/driver|assignment/i);
await assert.rejects(call(payload,rev,7,"2020-01-01"),/changed|reload/i);
await db.exec("insert into driver_job_bid_offers values ('STABLE-QA','open',now()+interval '1 hour')");
await assert.rejects(call(),/Pool/i);
await db.exec("delete from driver_job_bid_offers");
if (process.argv.includes("--link-only")) {
  await db.close();
  console.log("Stable link SQL: repeated calls, retained ACK/token/Calendar metadata, stale booking, driver mismatch and Pool guard passed.");
  process.exit(0);
}

await db.exec(await readFile('supabase/migrations/20260913030100_driver_link_delivery_reservation.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20260913032248_driver_link_after_duplicate_retirement.sql','utf8'));
// Browser month spellings are presentation, not a second job amendment.
await db.exec(await readFile('supabase/migrations/20260913040035_driver_link_equivalent_pickup_display.sql','utf8'));
await db.exec('begin');
await db.exec('delete from driver_job_links');
const displayPayload = {...payload, pickup_date:'2026-09-14', pickup_time:'1000hrs', pickup_datetime:'14 Sept 2026, 1000hrs'};
const displayHash = value => createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))))).digest('hex');
const displayFirst = await call(displayPayload,displayHash(displayPayload));
const displayReserve = async (result) => (await db.query(
  `select public.reserve_driver_job_link_delivery($1,$2,7,$3,$4,$5,'admin','Synthetic Admin') result`,
  ['STABLE-QA',result.link.id,result.disposition==='created'?'created':result.disposition==='amended'?'amendment':'recovery',result.link.safe_link_context.job_card_revision,crypto.randomUUID()])).rows[0].result;
assert.equal((await displayReserve(displayFirst)).claimed,true);
const displayOther = {...displayPayload,pickup_datetime:'14 Sep 2026, 1000hrs'};
const displayAgain = await call(displayOther,displayHash(displayOther));
assert.equal(displayAgain.disposition,'reused','Sep versus Sept alone must not create an amendment');
assert.deepEqual(displayAgain.link,displayFirst.link,'Display-only repeat preserves the entire link and original delivery revision');
assert.equal((await displayReserve(displayAgain)).reason,'cooldown','Second Admin device must not reserve another alert');
await db.query(`update driver_job_links set safe_link_context=safe_link_context || '{"driver_acknowledged_at":"2026-09-13T01:00Z"}',google_calendar_event_id='unchanged-calendar' where id=$1`,[displayFirst.link.id]);
const beforeDisplayAck = (await db.query('select to_jsonb(l) row from driver_job_links l where id=$1',[displayFirst.link.id])).rows[0].row;
assert.deepEqual((await call(displayOther,displayHash(displayOther))).link,beforeDisplayAck);
for (const changedField of [
  {pickup_location:'Actually amended pickup'},
  {pickup_datetime:'14 Sep 2026, 1030hrs',pickup_time:'1030hrs'},
  {pickup_datetime:'15 Sep 2026, 1000hrs',pickup_date:'2026-09-15'},
  {dropoff_location:'Actually amended drop-off'},
]) {
  const realChange={...displayOther,...changedField};
  const amendedDisplay = await call(realChange,displayHash(realChange));
  assert.equal(amendedDisplay.disposition,'amended','A real detail change remains an amendment');
  assert.equal(amendedDisplay.link.id,displayFirst.link.id);
  assert.equal(amendedDisplay.link.token_hash,displayFirst.link.token_hash);
  assert.equal(amendedDisplay.link.safe_link_context.driver_acknowledged_at,'2026-09-13T01:00Z');
  assert.equal(amendedDisplay.link.google_calendar_event_id,'unchanged-calendar');
  assert.equal((await displayReserve(amendedDisplay)).claimed,true,'A genuine amendment bypasses recovery cooldown');
  const alternateSpelling={...realChange,pickup_datetime:realChange.pickup_datetime.replace(' Sep ',' Sept ')};
  const repeat=await call(alternateSpelling,displayHash(alternateSpelling));
  assert.equal(repeat.disposition,'reused');
  assert.deepEqual(repeat.link,amendedDisplay.link);
  assert.equal((await displayReserve(repeat)).reason,'cooldown','Existing amendment kind must not bypass cooldown on a formatting-only repeat');
}
assert.equal((await db.query('select count(*)::int n from driver_job_links')).rows[0].n,1);
await db.exec('rollback');
const reserve = async(mode='recovery', request=crypto.randomUUID()) => (await db.query(
  `select public.reserve_driver_job_link_delivery($1,$2,$3,$4,$5,$6,$7,$8) result`,
  ['STABLE-QA',first.link.id,7,mode,"c".repeat(64),request,'admin','Synthetic Admin'])).rows[0].result;
const request=crypto.randomUUID();
const sends=await Promise.all([reserve('recovery',request),reserve('recovery'),reserve('recovery',request)]);
assert.equal(sends.filter(x=>x.claimed).length,1);
assert.equal(sends.find(x=>x.claimed).safe_context.delivery_kind,'amendment','A lost-response recovery preserves the amendment notice');
assert.equal((await db.query('select notification_status from customer_driver_app_notification_outbox')).rows[0].notification_status,'queued');
assert.equal((await db.query("select count(*)::int n from customer_driver_app_notification_outbox")).rows[0].n,1);
await db.exec("update customer_driver_app_notification_outbox set created_at=now()-interval '2 minutes'");
assert.equal((await reserve('recovery',request)).claimed,false,"Lost-response retry must never reserve another attempt");
assert.equal((await reserve()).claimed,true,"Later intentional resend is allowed");
assert.equal((await reserve('reminder')).reason,'acknowledged');
await db.query("update driver_job_links set safe_link_context=safe_link_context-'driver_acknowledged_at', issued_at=now()-interval '1 hour' where id=$1",[first.link.id]);
assert.equal((await reserve('reminder')).claimed,false,"Recent manual resend postpones automatic reminder");
for(let i=0;i<5;i++){
  await db.exec("update customer_driver_app_notification_outbox set created_at=now()-interval '16 minutes'");
  assert.equal((await reserve('reminder')).claimed,true,`Reminder ${i+1} remains eligible`);
}
const summary=(await db.query("select * from public.read_driver_ack_reminder_summaries($1)",[[first.link.id]])).rows[0];
assert.equal(Number(summary.count),5);
await db.exec(await readFile('supabase/migrations/20260913030200_driver_ack_merge_current_link.sql','utf8'));
const acknowledge=async(driver=7,token="b".repeat(64))=>(await db.query(
  'select public.acknowledge_current_driver_job_link($1,$2,$3,$4,$5,$6,$7,$8) result',
  ['STABLE-QA',first.link.id,token,driver,'QA Person','00000000','QA1234','AVF'])).rows[0].result;
const ack=await acknowledge();
await assert.rejects(call(),/changed/i,'ACK must invalidate an Admin snapshot captured before its driver details changed');
expectedBookingVersion=(await db.query("select updated_at from bookings where booking_reference='STABLE-QA'")).rows[0].updated_at;
assert.equal(new Date(expectedBookingVersion).toISOString(),'2026-09-13T00:00:00.000Z','ACK does not change the timestamp that triggers Driver Pool amendment closure');
expectedDriverState=(await db.query("select driver_name,driver_contact,driver_plate_number,vehicle_type_or_category from bookings where booking_reference='STABLE-QA'")).rows[0];
assert.equal(ack.safe_link_context.driver_job_payload.pickup_location,'QA Changed','ACK merges the current amended payload');
assert.equal(ack.safe_link_context.job_card_revision,'c'.repeat(64));
assert.equal(ack.google_calendar_event_id,'same-event');
assert.equal((await acknowledge()).safe_link_context.driver_acknowledged_at,ack.safe_link_context.driver_acknowledged_at,'Retry retains the original ACK timestamp');
await assert.rejects(acknowledge(8),/assignment/i);
await assert.rejects(acknowledge(7,'d'.repeat(64)),/unavailable/i);
assert.equal((await reserve('reminder')).reason,'acknowledged');
// Retiring redundant history must preserve the original acknowledged token.
const survivingBefore = (await db.query('select to_jsonb(l) row from driver_job_links l where id=$1',[first.link.id])).rows[0].row;
const retiredDuplicate = (await db.query(`insert into driver_job_links
  (booking_reference,driver_id,token_hash,link_status,expires_at,safe_link_context,created_at)
  select booking_reference,driver_id,'retired-duplicate','revoked',expires_at,
    safe_link_context-'driver_acknowledged_at',created_at+interval '1 minute'
  from driver_job_links where id=$1 returning id`,[first.link.id])).rows[0].id;
await db.query('update driver_job_links set revoked_at=now() where id=$1',[retiredDuplicate]);
const survivingPayload = {...survivingBefore.safe_link_context.driver_job_payload};
for (const key of ['driver_contact','driver_name','driver_plate_number','driver_vehicle_model']) delete survivingPayload[key];
const surviving = await call(survivingPayload,'c'.repeat(64));
assert.equal(surviving.disposition,'reused');
assert.deepEqual(surviving.link,survivingBefore,'Retired newer history cannot alter original token, ACK, revision, timestamps or Calendar metadata');
await db.exec("update customer_driver_app_notification_outbox set created_at=now()-interval '16 minutes'");
assert.equal((await reserve()).claimed,true,'Intentional recovery may reserve the sole surviving active link');
assert.equal((await reserve('reminder')).reason,'acknowledged','An acknowledged survivor never receives an ACK reminder');
const retiredReservation=(await db.query(`select public.reserve_driver_job_link_delivery($1,$2,$3,$4,$5,$6,$7,$8) result`,
  ['STABLE-QA',retiredDuplicate,7,'recovery','c'.repeat(64),crypto.randomUUID(),'admin','Synthetic Admin'])).rows[0].result;
assert.equal(retiredReservation.reason,'invalid_link','A revoked duplicate cannot be sent');
// A newer active-but-expired or malformed row must still prevent fallback.
await db.query("update driver_job_links set link_status='active',revoked_at=null,expires_at=now()-interval '1 minute' where id=$1",[retiredDuplicate]);
await assert.rejects(call(),/access requires Admin review/i);
assert.equal((await reserve()).reason,'stale_link');
await db.query("update driver_job_links set expires_at=now()+interval '1 hour' where id=$1",[retiredDuplicate]);
await assert.rejects(call(),/duplicate/i);
assert.equal((await reserve()).reason,'stale_link','Multiple active links remain unavailable to recovery');
await db.query("update driver_job_links set link_status='revoked',revoked_at=now() where id=$1",[retiredDuplicate]);
await db.query("update driver_job_links set safe_link_context=safe_link_context-'native_handoff_ciphertext' where id=$1",[first.link.id]);
await assert.rejects(call(),/cannot be recovered securely/i);
await db.query('update driver_job_links set safe_link_context=$2 where id=$1',[first.link.id,JSON.stringify(survivingBefore.safe_link_context)]);
await db.exec("update bookings set driver_id=8 where booking_reference='STABLE-QA'");
assert.equal((await reserve()).reason,'driver_mismatch');
await db.exec("update bookings set driver_id=7, admin_internal_status='cancelled' where booking_reference='STABLE-QA'");
await assert.rejects(call(),/terminal|cancelled/i);
assert.equal((await reserve()).reason,'terminal_booking');
await db.exec("update bookings set admin_internal_status='assigned'; update driver_job_links set revoked_at=now(),link_status='revoked'");
assert.equal((await reserve()).claimed,false);
await assert.rejects(acknowledge(),/unavailable/i,'A revoked token cannot ACK again');
const replacement=await call(payload,rev,7,expectedBookingVersion,'e'.repeat(64));
assert.equal(replacement.disposition,'created');
assert.notEqual(replacement.link.id,first.link.id);
assert.equal(replacement.link.safe_link_context.driver_acknowledged_at,undefined,'Explicit replacement requires its own ACK');
const replacementBefore=JSON.stringify(replacement.link);
await db.query(`insert into driver_job_links (booking_reference,driver_id,token_hash,link_status,expires_at) values ('STABLE-QA',7,$1,'active',now()+interval '1 hour')`,['f'.repeat(64)]);
await assert.rejects(call(),/duplicate/i);
assert.equal(JSON.stringify((await db.query('select to_jsonb(l) row from driver_job_links l where id=$1',[replacement.link.id])).rows[0].row),replacementBefore,'Duplicate conflict makes no change to existing access');
await assert.rejects(call({...payload,customer_price:100}),/safe job fields/i);
for (const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(call(),/permission denied/i);
  await assert.rejects(reserve(),/permission denied/i);
  await assert.rejects(acknowledge(),/permission denied/i);
  await db.exec('reset role');
}
await db.close();
console.log("Stable link and repeat reminder SQL contracts passed (serialized disposable Postgres execution).");
