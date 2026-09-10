import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile('lib/driver-one-hour-pickup-reminder.ts', 'utf8');
const module = { exports: {} };
let policyOpen = true;
let allowedReferences = ['ADM-20260910050000'];
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText, { module, exports: module.exports, Date, console, process: { env: {} },
  require(name) {
    if (name === 'server-only') return {};
    if (name === '@supabase/supabase-js') return { createClient() { throw Error('No live client'); } };
    if (name.endsWith('driver-job-link')) return {
      isDriverJobLinkExpired: (at, now) => Date.parse(at) <= now.getTime(),
      isDriverJobLinkExpiryOutsideAllowedWindow: () => false,
    };
    if (name.endsWith('driver-live-location-runtime')) return {
      driverLiveLocationRuntimeGateOpen: () => policyOpen,
      readAdminControlledRuntimePolicy: async () => ({ok:true,policy:{allowedJobReferences:allowedReferences}}),
    };
    return new Proxy({}, { get: () => () => { throw Error(`Unmocked provider ${name}`); } });
  },
});
const run = module.exports.runDriverOneHourPickupRemindersWithClient;
const now = new Date('2026-09-10T05:05:00Z');
const ref = 'ADM-20260910050000';
const link = '11111111-1111-4111-8111-111111111111';
const initialKey = `driver_pickup_60m:${ref}:2026-09-10T06:00:00.000Z`;
class Query {
  constructor(db, table) { Object.assign(this, { db, table, filters: [], op: 'select', max: Infinity }); }
  select() { return this; }
  eq(k,v) { this.filters.push(r => r[k] === v); return this; }
  neq(k,v) { this.filters.push(r => r[k] !== v); return this; }
  is(k,v) { this.filters.push(r => k === 'safe_context->>location_followup_checked_at'
    ? (r.safe_context?.location_followup_checked_at ?? null) === v : (r[k] ?? null) === v); return this; }
  in(k,v) { this.filters.push(r => v.includes(r[k])); return this; }
  gte(k,v) { this.filters.push(r => r[k] >= v); return this; }
  lt(k,v) { this.filters.push(r => r[k] < v); return this; }
  order(k, o) { this.sort = [k, o?.ascending !== false]; return this; }
  limit(n) { this.max = n; return this; }
  insert(payload) { this.op='insert'; this.payload=payload; return this; }
  update(payload) { this.op='update'; this.payload=payload; return this; }
  single() { this.one=true; return this; }
  maybeSingle() { this.one=true; return this; }
  then(resolve, reject) { return Promise.resolve().then(() => this.exec()).then(resolve, reject); }
  exec() {
    this.db.calls.push({ table:this.table, op:this.op, payload:this.payload });
    if (this.db.fail === this.table || this.db.fail === `${this.table}:${this.op}`) return { data:null, error:{code:'read_failed'} };
    let rows = this.db.tables[this.table];
    assert.ok(rows, `unexpected table ${this.table}`);
    if (this.op === 'insert') {
      if (rows.some(r => r.event_key === this.payload.event_key)) return {data:null,error:{code:'23505'}};
      const row = {id:`record-${this.db.calls.length}`,created_at:now.toISOString(),...this.payload};
      rows.push(row); return {data:this.one?row:[row],error:null};
    }
    rows = rows.filter(r => this.filters.every(f=>f(r)));
    if (this.sort) { const [k,asc]=this.sort; rows.sort((a,b)=>(a[k]<b[k]?-1:a[k]>b[k]?1:0)*(asc?1:-1)); }
    rows=rows.slice(0,this.max);
    if (this.op==='update') rows.forEach(r=>Object.assign(r,this.payload));
    return { data:this.one?(rows[0]??null):rows.map(r=>({...r})), error:null };
  }
}
function fixture() {
  const db={calls:[],tables:{
    bookings:[{id:1,booking_reference:ref,driver_id:8,pickup_at:'2026-09-10T06:00:00.000Z',status:'assigned'}],
    driver_job_links:[{id:link,booking_reference:ref,driver_id:8,link_status:'active',revoked_at:null,expires_at:'2026-09-11T06:00:00Z',created_at:'2026-09-10T03:00:00Z'}],
    driver_job_status_events:[],driver_live_location_latest_positions:[],
    customer_driver_app_notification_outbox:[{id:'initial',booking_reference:ref,driver_job_link_id:link,event_key:initialKey,workflow_area:'driver_pickup_reminder',delivery_surface:'driver_app',notification_status:'queued',created_at:'2026-09-10T05:00:00.000Z',safe_context:{source:'scheduled_pickup_reminder',minutes_before_pickup:60}}],
    admin_app_notification_outbox:[],
  },from(table){return new Query(this,table);}};
  const sends=[];
  const options={now,sendPush:async(_c,input)=>{sends.push(['driver',input]);return {ok:true};},
    sendAdminPush:async(type)=>{sends.push(['admin',type]);return {ok:true};}};
  return {db,sends,options};
}
function fresh(f, reference=ref, linkId=link) {
  f.db.tables.driver_live_location_latest_positions.push({booking_reference:reference,driver_job_link_id:linkId,sharing_state:'active',captured_at:'2026-09-10T05:04:40.000Z',updated_at:'2026-09-10T05:04:40.000Z',stale_after:'2026-09-10T05:09:40.000Z'});
}
{
  const f=fixture(); const protectedBefore=JSON.stringify([f.db.tables.bookings,f.db.tables.driver_job_links]);
  const result = await run(f.db,f.options);
  assert.equal(result.notification_count,1);assert.equal(result.admin_warning_count,1);
  assert.equal(f.sends.length,2,'missing GPS five minutes after reminder must notify Driver and Admin');
  await run(f.db,f.options);
  assert.equal(f.sends.length,2,'repeat scheduler run must not resend');
  fresh(f); await run(f.db,f.options);
  assert.equal(f.db.tables.admin_app_notification_outbox[0].notification_status,'archived','fresh GPS clears saved warning');
  assert.equal(JSON.stringify([f.db.tables.bookings,f.db.tables.driver_job_links]),protectedBefore);
  assert.ok(f.db.calls.filter(c=>c.op!=='select').every(c=>['admin_app_notification_outbox','customer_driver_app_notification_outbox'].includes(c.table)));
}
for (const mode of ['fresh','too_early','cancelled','pob','completed','ots','amended','reassigned','revoked','expired','wrong_initial_key','missing_initial']) {
  const f=fixture();
  if(mode==='fresh') fresh(f);
  if(mode==='too_early') f.options.now=new Date(now.getTime()-1);
  if(mode==='cancelled') f.db.tables.bookings[0].status='cancelled';
  if(['pob','completed','ots'].includes(mode)) f.db.tables.driver_job_status_events.push({booking_reference:ref,status_value:mode,occurred_at:'2026-09-10T05:03:00Z'});
  if(mode==='amended') f.db.tables.bookings[0].pickup_at='2026-09-10T08:00:00Z';
  if(mode==='reassigned') f.db.tables.bookings[0].driver_id=9;
  if(mode==='revoked') f.db.tables.driver_job_links[0].revoked_at='2026-09-10T05:01:00Z';
  if(mode==='expired') f.db.tables.driver_job_links[0].expires_at='2026-09-10T05:01:00Z';
  if(mode==='wrong_initial_key') f.db.tables.customer_driver_app_notification_outbox[0].event_key='unrelated';
  if(mode==='missing_initial') f.db.tables.customer_driver_app_notification_outbox=[];
  await run(f.db,f.options); assert.equal(f.sends.length,0,mode);
}
for(const mode of ['stale','wrong_link','future_capture']) {
  const f=fixture();fresh(f);
  const p=f.db.tables.driver_live_location_latest_positions[0];
  if(mode==='stale')p.stale_after='2026-09-10T05:04:00Z';
  if(mode==='wrong_link')p.driver_job_link_id='unrelated';
  if(mode==='future_capture')p.captured_at='2026-09-11T05:04:00Z';
  await run(f.db,f.options); assert.equal(f.sends.length,2,mode);
}
{
  const f=fixture();const other='ADM-20260910040000';const otherLink='33333333-3333-4333-8333-333333333333';
  f.db.tables.bookings.push({id:2,booking_reference:other,driver_id:8,pickup_at:'2026-09-10T05:00:00Z',status:'assigned'});
  f.db.tables.driver_job_links.push({...f.db.tables.driver_job_links[0],id:otherLink,booking_reference:other});fresh(f,other,otherLink);
  await run(f.db,f.options);
  assert.equal(f.sends.length,1,'overlap must notify only Admin');assert.equal(f.sends[0][0],'admin');
  assert.match(f.db.tables.admin_app_notification_outbox[0].safe_message,/another job/i);
  f.db.tables.driver_live_location_latest_positions=[];await run(f.db,f.options);
  assert.match(f.db.tables.admin_app_notification_outbox[0].safe_message,/Location unavailable/);
  assert.equal(f.sends.length,1,'overlap change updates saved warning without another send');
}
for(const table of ['bookings','driver_job_links','driver_job_status_events','driver_live_location_latest_positions','admin_app_notification_outbox']) {
  const f=fixture();f.db.fail=table;await run(f.db,f.options);assert.equal(f.sends.length,0,`no sends on ${table} failure`);
}
for (const reason of ['cancelled','completed','amended','reassigned','new_link']) {
  const f=fixture();await run(f.db,f.options);
  const unrelated={id:'unrelated',workflow_area:'driver_issue_alert',notification_status:'queued'};
  f.db.tables.admin_app_notification_outbox.push(unrelated);
  if(reason==='cancelled')f.db.tables.bookings[0].status='cancelled';
  if(reason==='completed')f.db.tables.driver_job_status_events.push({booking_reference:ref,status_value:'completed',occurred_at:'2026-09-10T05:06:00Z'});
  if(reason==='amended')f.db.tables.bookings[0].pickup_at='2026-09-10T08:00:00Z';
  if(reason==='reassigned')f.db.tables.bookings[0].driver_id=9;
  if(reason==='new_link')f.db.tables.driver_job_links.push({...f.db.tables.driver_job_links[0],id:'33333333-3333-4333-8333-333333333333',created_at:'2026-09-10T05:06:00Z'});
  await run(f.db,{...f.options,now:new Date('2026-09-10T05:07:00Z')});
  assert.equal(f.db.tables.admin_app_notification_outbox[0].notification_status,'archived',reason);
  assert.equal(unrelated.notification_status,'queued');assert.equal(f.sends.length,2);
}
{
  const f=fixture();fresh(f);await run(f.db,f.options);
  f.db.tables.driver_live_location_latest_positions=[];
  await run(f.db,{...f.options,now:new Date('2026-09-10T05:10:00Z')});
  assert.equal(f.sends.length,0,'successful first check must not become a later stale-GPS reminder');
}
{
  const f=fixture();f.db.fail='admin_app_notification_outbox:insert';await run(f.db,f.options);
  assert.equal(f.sends.length,0);f.db.fail=null;await run(f.db,f.options);
  assert.equal(f.sends.length,2,'an unclaimed DB failure may recover without duplicate sends');
}
{
  const f=fixture();f.db.fail='customer_driver_app_notification_outbox:insert';
  const result=await run(f.db,f.options);assert.equal(result.ok,false);
  assert.equal(f.sends.length,1);assert.equal(f.sends[0][0],'admin','Admin still learns about missing GPS');
  f.db.fail=null;await run(f.db,f.options);assert.equal(f.sends.length,1,'claimed partial attempt must not send again');
}
{
  const f=fixture();let attempts=0;
  f.options.sendPush=async()=>{attempts++;throw Error('Uncertain delivery');};
  await run(f.db,f.options);await run(f.db,f.options);assert.equal(attempts,1);
  assert.equal(f.db.tables.customer_driver_app_notification_outbox.length,2,'in-app follow-up survives push failure');
}
for(const gate of ['off','not_allowed']) {
  const f=fixture();policyOpen=gate!=='off';allowedReferences=gate==='not_allowed'?[]:[ref];
  await run(f.db,f.options);assert.equal(f.sends.length,0,gate);
}
policyOpen=true;allowedReferences=[ref];
{
  const f=fixture();await run(f.db,{...f.options,now:new Date('2026-09-10T05:07:30Z')});
  assert.equal(f.sends.length,2,'delayed cron tick catches up once before pickup');
}
{
  const f=fixture();await run(f.db,{...f.options,now:new Date('2026-09-10T06:00:00Z')});
  assert.equal(f.sends.length,0,'no obsolete follow-up at or after pickup');
}
{
  const f=fixture();f.db.tables.driver_job_links=Array.from({length:101},(_,i)=>({...f.db.tables.driver_job_links[0],id:`bounded-${i}`}));
  const result=await run(f.db,f.options);assert.equal(result.ok,false);assert.equal(f.sends.length,0,'incomplete over-limit evidence cannot send');
}
{
  const f=fixture();await Promise.all([run(f.db,f.options),run(f.db,f.options)]);
  assert.equal(f.sends.length,2,'concurrent scheduler runs claim one follow-up');
}
console.log('Driver location follow-up runtime guard passed.');
