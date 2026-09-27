import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
assert.ok(process.env.ACTIVITY_PGLITE_PATH,'Set ACTIVITY_PGLITE_PATH to a disposable PGlite runtime.');
const {PGlite}=await import(process.env.ACTIVITY_PGLITE_PATH);
const db=new PGlite();
try {
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create table driver_access_accounts(id uuid primary key,driver_reference text,account_status text,active_device_id_hash text,pin_reset_state text,pin_session_not_before timestamptz);
 grant select,update on driver_access_accounts to service_role;
 insert into driver_access_accounts values('00000000-0000-4000-8000-000000000001','1','active',repeat('a',64),null,null);
 create table bookings(id int primary key,status text);insert into bookings values(1,'assigned');`);
 const migrations=readdirSync('supabase/migrations').filter(n=>n.endsWith('_driver_pool_account_activity.sql'));
 assert.equal(migrations.length,1);
 await db.exec(readFileSync('supabase/migrations/'+migrations[0],'utf8'));
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const account='00000000-0000-4000-8000-000000000001';
 const now=Date.now(), issued=new Date(now-60000).toISOString(), expires=new Date(now+86400000).toISOString();
 const touch=async(event='active',issue=issued,hash='a'.repeat(64),driver=1)=>q('select record_driver_account_activity($1,$2,$3,$4,$5,$6) result',[account,driver,hash,issue,expires,event]);
 const status=async()=> (await q('select * from read_driver_pool_activity(array[1,2]::bigint[])'));
 await db.exec('set role service_role');
 assert.equal((await status())[0].state,'unknown');
 assert.equal((await touch())[0].result,true);
 assert.equal((await status())[0].state,'online');
 assert.equal((await status())[1].state,'unknown');
 const row=(await q('select * from driver_account_activity'))[0];
 await touch(); assert.deepEqual((await q('select * from driver_account_activity'))[0],row,'Repeated poll within 60 seconds does not write');
 assert.equal((await touch('active',issued,'b'.repeat(64)))[0].result,false);
 assert.equal((await touch('active',issued,'a'.repeat(64),2))[0].result,false);
 assert.equal((await touch('active',new Date(now+60000).toISOString()))[0].result,false,'Future cookie evidence denied');
 await db.exec('reset role');
 await db.exec("update driver_account_activity set last_active_at=now()-interval '3 minutes'");
 assert.equal((await status())[0].state,'last_active');
 await db.exec('set role service_role');
 await touch('signed_out'); assert.equal((await status())[0].state,'signed_out');
 await touch(); assert.equal((await status())[0].state,'signed_out','Late poll cannot undo sign-out');
 await touch('active',new Date(now-120000).toISOString()); assert.equal((await status())[0].state,'signed_out','Older generation cannot undo sign-out');
 await touch('active',new Date(now-1000).toISOString()); assert.equal((await status())[0].state,'online','New sign-in may resume activity');
 await touch('signed_out',issued); assert.equal((await status())[0].state,'online','Late old logout cannot hide newer sign-in');
 await db.exec('reset role');
 for(const update of ["account_status='suspended'","active_device_id_hash=repeat('b',64)","pin_reset_state='claimed'","pin_session_not_before=now()"]){
  await db.exec('update driver_access_accounts set '+update);
  assert.equal((await status())[0].state,'signed_out',update);
  assert.equal((await touch())[0].result,false,update);
  await db.exec("update driver_access_accounts set account_status='active',active_device_id_hash=repeat('a',64),pin_reset_state=null,pin_session_not_before=null");
 }
 await db.exec("update driver_account_activity set session_expires_at=now()-interval '1 second'");
 assert.equal((await status())[0].state,'signed_out');
 await assert.rejects(()=>q('select * from read_driver_pool_activity(array[1,1]::bigint[])'));
 await assert.rejects(()=>q('select * from read_driver_pool_activity(array(select generate_series(1,201))::bigint[])'));
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  await assert.rejects(()=>q('select * from driver_account_activity'));
  await assert.rejects(()=>status()); await assert.rejects(()=>touch());
  await db.exec('reset role');
 }
 assert.equal((await q('select status from bookings'))[0].status,'assigned');
 assert.equal((await q('select count(*)::int n from driver_account_activity'))[0].n,1,'Bounded one row per account, no event accumulation');
 console.log('PASS activity SQL: exact identity, throttle, states, expiry/reset/device change, session races, bounded batches, private grants/RLS and booking isolation.');
} finally {await db.close();}
