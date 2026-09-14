// Disposable SQL execution only. Set POOL_PGLITE_PATH to an isolated PGlite install.
// No Production credentials, network or provider calls are used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
const require = createRequire(import.meta.url);
const pglitePath = process.env.POOL_PGLITE_PATH;
const postgresPath = process.env.POOL_EMBEDDED_PG_PATH;
assert.ok(pglitePath || postgresPath, 'Set POOL_PGLITE_PATH or POOL_EMBEDDED_PG_PATH to an isolated test runtime.');
let db, connect;
if (postgresPath) {
  const {default: EmbeddedPostgres} = await import(path.join(postgresPath, 'dist/index.js'));
  const dir = fs.mkdtempSync('/private/tmp/prestige-pool-pg-');
  const pg = new EmbeddedPostgres({databaseDir: path.join(dir,'data'), user:'postgres', password:randomUUID(),
    persistent:false, port:5432, postgresFlags:['-c','listen_addresses=', '-k',dir], onLog:()=>{}, onError:()=>{}});
  await pg.initialise(); await pg.start();
  connect = async () => { const client=pg.getPgClient('postgres',dir); await client.connect(); return client; };
  const client=await connect();
  db={exec:(sql)=>client.query(sql), query:(sql,args)=>client.query(sql,args), close:async()=>{await client.end();await pg.stop();fs.rmSync(dir,{recursive:true,force:true});}};
  assert.equal((await client.query("show listen_addresses")).rows[0].listen_addresses,'');
} else {
  const {PGlite}=require(path.join(pglitePath,'dist/index.cjs'));
  const {pgcrypto}=require(path.join(pglitePath,'dist/contrib/pgcrypto.cjs'));
  db=new PGlite({extensions:{pgcrypto}});
}
try {
  const fixture = fs.readFileSync('scripts/test-driver-pool-vehicle-postgres.py','utf8').match(/sql\("""\n(create role[\s\S]*?)"""\)/)[1];
  await db.exec(fixture);
  const migrations = ['202606090002_driver_portal_bidding_foundation.sql','20260904112430_driver_pool_fast_accept.sql','20260904125321_driver_pool_completion_repair.sql','20260904190552_driver_pool_exact_concurrency_tokens.sql','20260905012642_driver_pool_admin_cancel_assigned_offer.sql','20260909171426_driver_pool_vehicle_requirement.sql'];
  for (const name of migrations) await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
  const q = async (sql, args=[]) => (await db.query(sql,args)).rows;
  const val = async (sql,args=[]) => (await q(sql,args))[0].result;
  const reset = async () => {
    await db.exec(`truncate driver_job_bids,driver_job_bid_offers,bookings,drivers,driver_access_accounts,driver_device_push_subscriptions,audit_logs restart identity cascade;
      insert into drivers select i,'Synthetic '||i,'9000000'||i,'QATEST'||i,'AVF','available' from generate_series(1,8) i;
      insert into driver_access_accounts select id::text,'active',repeat('a',64) from drivers;
      insert into bookings(booking_reference,public_booking_reference,pickup_at,vehicle_type_or_category,service_type) values('POOL-QA','99001',now()+interval '2 days','AVF','TRF');`);
  };
  await reset();
  const old = await val("select publish_driver_pool_offer('POOL-QA',(select updated_at from bookings),100,$1,'admin','Synthetic Admin','AVF') result",[randomUUID()]);
  await val('select decline_driver_pool_offer($1,1,$2,$3) result',[old.offer.offer_key,old.offer.updated_at,randomUUID()]);
  // Prove the pre-existing defect before the forward change.
  assert.equal((await val('select accept_driver_pool_offer($1,1,$2,$3) result',[old.offer.offer_key,old.offer.updated_at,randomUUID()])).reason,'accepted');
  assert.equal((await q('select offer_status from driver_job_bid_offers'))[0].offer_status,'closed');
  console.log('REPRODUCED baseline: a declined invitation assigned a driver without a winning bid.');
  await db.exec(fs.readFileSync('supabase/migrations/20260914023445_driver_pool_admin_selection.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20260914060753_driver_pool_all_groups_first_accept.sql','utf8'));
  const publish = async (ids=[1,2,3,4,5],key=randomUUID(),ref='POOL-QA') => val(`select publish_driver_pool_offer($1,(select updated_at from bookings where booking_reference=$1),100,$2,'admin','Synthetic Admin','AVF',$3::bigint[]) result`,[ref,key,ids]);
  const respond = (o,id,key=randomUUID()) => val('select accept_driver_pool_offer($1,$2,$3,$4) result',[o.offer.offer_key,id,o.offer.updated_at,key]);
  const decline = (o,id) => val('select decline_driver_pool_offer($1,$2,$3,$4) result',[o.offer.offer_key,id,o.offer.updated_at,randomUUID()]);
  const award = (o,id,key=randomUUID()) => val("select accept_driver_pool_offer($1,$2,$3,$4,'admin','Synthetic Admin') result",[o.offer.offer_key,id,o.offer.updated_at,key]);
  const widen = (o,key=randomUUID()) => val("select publish_driver_pool_offer('POOL-QA',$1,100,$2,'admin','Synthetic Admin','AVF',null,$3) result",[o.offer.updated_at,key,o.offer.offer_key]);
  const list = id => val('select list_driver_pool_available_jobs($1,1,20) result',[id]);
  const assigned = async () => { const id=(await q("select driver_id from bookings where booking_reference='POOL-QA'"))[0].driver_id; return id === null ? null : Number(id); };
  const tenIds=Array.from({length:10},(_,i)=>i+1);
  const addBoundaryDrivers=async()=>db.exec(`
    insert into drivers select i,'Synthetic '||i,'9000000'||i,'QATEST'||i,'AVF','available' from generate_series(9,11) i;
    insert into driver_access_accounts select id::text,'active',repeat('a',64) from drivers where id between 9 and 11;`);
  await reset(); await addBoundaryDrivers();
  await assert.rejects(publish([...tenIds,11]));
  assert.equal((await q('select count(*)::int n from driver_job_bid_offers'))[0].n,0);
  const tenOffer=await publish(tenIds);
  assert.deepEqual(tenOffer.recipient_driver_ids,tenIds);
  assert.equal((await list(11)).jobs.length,0);
  assert.equal((await list(1)).jobs[0].selection_mode,'first_accept');
  assert.equal((await award(tenOffer,10)).ok,false,'Admin cannot select a winner in first-accept mode');
  assert.equal((await respond(tenOffer,10)).reason,'accepted');
  assert.equal(await assigned(),10);
  assert.equal((await q("select count(*)::int n from driver_job_bids where bid_status='accepted'"))[0].n,1);
  console.log('PASS ten selected recipients, one first-accept winner, and eleven-recipient rejection.');
  await reset();
  for (const ids of [[],[1,1],Array.from({length:11},(_,i)=>i+1),[0],[-1],[null]]) await assert.rejects(publish(ids));
  let o=await publish(); assert.deepEqual(o.recipient_driver_ids,[1,2,3,4,5]);
  assert.equal((await list(6)).jobs.length,0); assert.equal((await respond(o,6)).ok,false);
  assert.equal((await award(o,1)).ok,false);
  const winKey=randomUUID(); assert.equal((await respond(o,3,winKey)).reason,'accepted');
  assert.equal((await respond(o,3,winKey)).reason,'already_accepted');
  for(const id of [1,2,4,5]) assert.equal((await respond(o,id)).ok,false);
  assert.equal(await assigned(),3);
  await assert.rejects(widen(o));
  assert.equal((await q('select driver_payout_override from bookings'))[0].driver_payout_override,'100.00');
  assert.equal((await q("select count(*)::int n from driver_job_bids where bid_status='accepted'"))[0].n,1);
  assert.equal((await list(1)).jobs.length,0);
  assert.equal((await q('select count(*)::int n from driver_job_links'))[0].n,0);
  assert.equal((await q('select count(*)::int n from driver_job_status_events'))[0].n,0);
  await reset(); o=await publish();
  await decline(o,1); assert.equal((await respond(o,1)).ok,false); assert.equal(await assigned(),null);
  const wideKey=randomUUID(); const wide=await widen(o,wideKey);
  assert.equal(wide.offer.offer_key,o.offer.offer_key); assert.deepEqual(wide.recipient_driver_ids,[6,7,8]);
  assert.equal(wide.offer.recipient_count,8); assert.equal((await widen(o,wideKey)).idempotent,true);
  assert.equal((await q('select count(*)::int n from driver_job_bid_offers'))[0].n,1);
  assert.equal((await list(1)).jobs.length,0); assert.equal((await list(6)).jobs.length,1);
  assert.equal((await respond(o,2)).ok,false,'Stale pre-widen token must fail');
  assert.equal((await list(6)).jobs[0].selection_mode,'first_accept');
  assert.equal((await respond(wide,6)).reason,'accepted'); assert.equal(await assigned(),6);
  assert.equal((await respond(wide,7)).ok,false);
  assert.equal((await award(wide,7)).ok,false);
  assert.equal((await q('select driver_payout_override from bookings'))[0].driver_payout_override,'100.00');
  // Previously widened offers become first-accept without assigning existing responses on migration.
  await reset(); o=await publish(); const historicalWide=await widen(o);
  await db.exec("update driver_job_bid_offers set safe_offer_context=safe_offer_context||'{\"selection_mode\":\"admin\"}'::jsonb; update driver_job_bids set safe_bid_context=safe_bid_context||'{\"response\":\"available\"}'::jsonb where driver_reference='6'");
  assert.equal(await assigned(),null);
  assert.equal((await list(6)).jobs[0].selection_mode,'first_accept');
  assert.equal((await list(6)).jobs[0].response_status,'pending');
  assert.equal((await award(historicalWide,6)).ok,false,'stale Admin winner controls cannot award a widened offer');
  assert.equal((await respond(historicalWide,6)).reason,'accepted');

  await reset(); o=await publish();
  await db.exec("update driver_job_bid_offers set safe_offer_context=safe_offer_context||'{\"selection_mode\":\"admin\"}'::jsonb; update driver_job_bids set safe_bid_context=safe_bid_context||'{\"response\":\"available\"}'::jsonb where driver_reference='2'");
  assert.equal(await assigned(),null);
  assert.equal((await list(2)).jobs[0].selection_mode,'first_accept');
  assert.equal((await list(2)).jobs[0].response_status,'pending');
  assert.equal((await respond(o,2)).reason,'accepted');
  for (const mutation of [
    "update drivers set vehicle_type='VVV' where id=1",
    "update drivers set availability_status='unavailable' where id=1",
    "update driver_access_accounts set account_status='suspended' where driver_reference='1'",
    "insert into bookings(booking_reference,public_booking_reference,pickup_at,driver_id) select 'OTHER','99002',pickup_at,1 from bookings",
    "update bookings set updated_at=clock_timestamp()",
    "update bookings set driver_id=8,updated_at=clock_timestamp()",
    "update bookings set admin_internal_status='cancelled',updated_at=clock_timestamp()",
    "update driver_job_bid_offers set closes_at=now()-interval '1 second'",
  ]) {
    await reset(); o=await publish(); await db.exec(mutation);
    assert.equal((await respond(o,1)).ok,false,mutation);
    assert.notEqual(await assigned(),1,mutation);
  }
  await reset(); await db.exec("update drivers set vehicle_type='VVV' where id=2");
  await assert.rejects(publish([1,2])); assert.equal((await q('select count(*)::int n from driver_job_bid_offers'))[0].n,0);
  await reset(); const key=randomUUID(); o=await publish([1,2],key);
  assert.equal((await publish([2,1],key)).idempotent,true);
  await assert.rejects(publish([1],key));
  // Responding then withdrawing before Admin chooses must block that candidate.
  await decline(o,1); assert.equal((await respond(o,1)).ok,false);
  // Existing manual cancellation still expires availability responses.
  await val("select cancel_driver_pool_offer($1,$2,'admin','Synthetic Admin') result",[o.offer.offer_key,o.offer.updated_at]);
  assert.equal((await award(o,2)).ok,false); assert.equal(await assigned(),null);
  // Legacy outstanding offers keep first-accept semantics, but declined invitations stay closed.
  await reset(); o=await publish([1,2]);
  await db.exec("update driver_job_bid_offers set safe_offer_context=safe_offer_context-'selection_mode'");
  await decline(o,1); assert.equal((await respond(o,1)).ok,false);
  assert.equal((await respond(o,2)).reason,'accepted');
  assert.equal(await assigned(),2);
  await reset(); o=await publish([1,2]); await respond(o,1);
  const saved=(await q('select to_jsonb(o) result from driver_job_bid_offers o'))[0].result;
  const cancelled=await val("select cancel_driver_pool_offer($1,$2,'admin','Synthetic Admin') result",[saved.offer_key,saved.updated_at]);
  assert.equal(cancelled.assignment_cancelled,true); assert.equal(await assigned(),null);
  await assert.rejects(val("select publish_driver_pool_offer('POOL-QA',(select updated_at from bookings),100,$1,'admin','Synthetic Admin','AVF') result",[randomUUID()]));
  // Check independent sessions, not merely Promise.all on a single connection.
  if (connect) {
    for (let round=0;round<7;round++) {
      await reset();
      const ids=round===6 ? tenIds : [1,2,3,4,5];
      if(round===6) await addBoundaryDrivers();
      o=await publish(ids);
      const clients=await Promise.all(ids.map(()=>connect()));
      try {
        const results=await Promise.all(clients.map((client,i)=>client.query("select accept_driver_pool_offer($1,$2,$3,$4) result",[o.offer.offer_key,i+1,o.offer.updated_at,randomUUID()])));
        assert.equal(results.filter(r=>r.rows[0].result.reason==='accepted').length,1);
        assert.equal((await q("select count(*)::int n from driver_job_bids where bid_status='accepted'"))[0].n,1);
      } finally { await Promise.all(clients.map(c=>c.end())); }
    }
    for (let round=0;round<3;round++) {
      await reset(); o=await publish(); const wideRace=await widen(o);
      const clients=await Promise.all([1,2,3,4,5,6,7,8].map(()=>connect()));
      try {
        const results=await Promise.all(clients.map((client,i)=>client.query('select accept_driver_pool_offer($1,$2,$3,$4) result',[wideRace.offer.offer_key,i+1,wideRace.offer.updated_at,randomUUID()])));
        assert.equal(results.filter(r=>r.rows[0].result.reason==='accepted').length,1);
        assert.equal((await q("select count(*)::int n from driver_job_bids where bid_status='accepted'"))[0].n,1);
        assert.equal((await q('select count(*)::int n from driver_job_links'))[0].n,0);
        assert.equal((await q('select count(*)::int n from driver_job_status_events'))[0].n,0);
      } finally { await Promise.all(clients.map(c=>c.end())); }
    }
    await reset(); o=await publish();
    await db.exec("insert into bookings(booking_reference,public_booking_reference,pickup_at,vehicle_type_or_category,service_type) select 'OTHER','99002',pickup_at,'AVF','TRF' from bookings");
    const other=await publish([1],randomUUID(),'OTHER');
    const clients=await Promise.all([connect(),connect()]);
    try {
      const results=await Promise.all([o,other].map((offer,i)=>clients[i].query("select accept_driver_pool_offer($1,1,$2,$3) result",[offer.offer.offer_key,offer.offer.updated_at,randomUUID()])));
      assert.equal(results.filter(r=>r.rows[0].result.reason==='accepted').length,1);
      assert.equal(results.filter(r=>r.rows[0].result.reason==='schedule_conflict').length,1);
    } finally {await Promise.all(clients.map(c=>c.end()));}
    // Widen and a selected Driver response contend on the same offer. Never lose a response.
    await reset(); o=await publish(); const competitors=await Promise.all([connect(),connect()]);
    try {
      const results=await Promise.allSettled([
        competitors[0].query("select publish_driver_pool_offer('POOL-QA',$1,100,$2,'admin','Synthetic Admin','AVF',null,$3) result",[o.offer.updated_at,randomUUID(),o.offer.offer_key]),
        competitors[1].query('select accept_driver_pool_offer($1,1,$2,$3) result',[o.offer.offer_key,o.offer.updated_at,randomUUID()]),
      ]);
      const state=(await q("select safe_offer_context->>'audience' audience from driver_job_bid_offers"))[0];
      const response=(await q("select safe_bid_context->>'response' response from driver_job_bids where driver_reference='1'"))[0];
      assert.ok(state.audience==='wider' ? await assigned()===null : await assigned()===1);
      assert.equal(response.response,null);
      assert.ok(results.some(r=>r.status==='fulfilled'));
    } finally {await Promise.all(competitors.map(c=>c.end()));}
    // An offer expiring while waiting for the Driver lock must not be awarded.
    await reset(); o=await publish([1]);
    const blocker=await connect(), contender=await connect();
    try {
      await blocker.query('begin'); await blocker.query('select id from drivers where id=1 for update');
      await db.exec("update driver_job_bid_offers set closes_at=clock_timestamp()+interval '250 milliseconds'");
      const pending=contender.query("select accept_driver_pool_offer($1,1,$2,$3) result",[o.offer.offer_key,o.offer.updated_at,randomUUID()]);
      await db.exec("select pg_sleep(0.4)");
      await blocker.query('commit');
      assert.equal((await pending).rows[0].result.ok,false);assert.equal(await assigned(),null);
    } finally {await Promise.all([blocker.end(),contender.end()]);}
    console.log('PASS independent PostgreSQL sessions: six five-way and one ten-way selected first-accept races, overlapping-job acceptance race, response-versus-widen race, and three eight-way wider first-accept races.');
  }
  const privileges=await q("select proname,prosecdef,has_function_privilege('anon',oid,'EXECUTE') a,has_function_privilege('authenticated',oid,'EXECUTE') u,has_function_privilege('service_role',oid,'EXECUTE') s from pg_proc where proname in ('accept_driver_pool_offer','publish_driver_pool_offer','list_driver_pool_available_jobs')");
  assert.equal(privileges.length,3); assert.ok(privileges.every(p=>!p.prosecdef&&!p.a&&!p.u&&p.s));
  console.log('PASS selected recipients, one first-valid winner per group, fixed amount, decline rejection, same-offer widening, replay/stale checks, account/vehicle/schedule/booking guards, privacy and no link/status writes.');
} catch (error) { console.error(error.message); process.exitCode = 1; } finally { await db.close(); }
