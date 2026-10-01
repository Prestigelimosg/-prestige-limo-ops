import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const source = await readFile('lib/driver-one-hour-pickup-reminder.ts', 'utf8');
const notificationSource=await readFile('lib/customer-driver-app-notification-persistence.ts','utf8');
const notificationAst=ts.createSourceFile('notifications.ts',notificationSource,ts.ScriptTarget.Latest,true);
const safeProjection=notificationAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='toSafeRecord');
assert.ok(safeProjection);
const projectSafe=new Function('record',ts.transpileModule(safeProjection.getText(notificationAst),{
  compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'; return toSafeRecord(record);');
const contextFixture={source:'scheduled_pickup_reminder',minutes_before_pickup:60,
  location_followup_next_at:'2026-09-10T05:10:00Z',location_followup_repeat:'v1'};
const projected=projectSafe({delivery_surface:'driver_app',workflow_area:'driver_pickup_reminder',safe_context:contextFixture});
assert.equal(projected.safe_context.location_followup_next_at,undefined,'private reminder schedule must not reach Driver API');
assert.equal(projected.safe_context.location_followup_repeat,undefined);
assert.equal(projected.safe_context.minutes_before_pickup,60);
assert.equal(contextFixture.location_followup_repeat,'v1','projection must not mutate persistence');
assert.deepEqual(projectSafe({delivery_surface:'customer_app',workflow_area:'unrelated',safe_context:{direction:'admin_to_customer'}}).safe_context,{direction:'admin_to_customer'});
const pushSource = await readFile('lib/admin-device-push-notification.ts','utf8');
const copyScope = {};
vm.runInNewContext(ts.transpileModule(pushSource.slice(pushSource.indexOf('function safeVehiclePlate('),
  pushSource.indexOf('function safePublicBookingReference(')).replace('export function','function'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText+'; globalThis.copy = adminPickupEmergencyCopy;',copyScope);
const emergencyCopy = copyScope.copy;
const module = { exports: {} };
let policyOpen = true;
let allowedReferences = ['ADM-20260910050000'];
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText, { module, exports: module.exports, Date, console, process: { env: {} },
  require(name) {
    if (name === 'node:crypto') return { createHash };
    if (name.endsWith('admin-device-push-notification')) return { adminPickupEmergencyCopy: emergencyCopy };
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
  eq(k,v) { this.filters.push(r => k.startsWith('safe_context->>')
    ? String(r.safe_context?.[k.slice('safe_context->>'.length)] ?? '') === String(v) : r[k] === v); return this; }
  neq(k,v) { this.filters.push(r => r[k] !== v); return this; }
  is(k,v) { this.filters.push(r => k.startsWith('safe_context->>')
    ? (r.safe_context?.[k.slice('safe_context->>'.length)] ?? null) === v : (r[k] ?? null) === v); return this; }
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
    this.db.beforeQuery?.(this);
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
    return { data:structuredClone(this.one?(rows[0]??null):rows), error:null };
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
    sendAdminPush:async(type,input)=>{sends.push(['admin',type,input]);return {ok:true};}};
  return {db,sends,options};
}
function fresh(f, reference=ref, linkId=link) {
  f.db.tables.driver_live_location_latest_positions.push({booking_reference:reference,driver_job_link_id:linkId,sharing_state:'active',captured_at:'2026-09-10T05:04:40.000Z',updated_at:'2026-09-10T05:04:40.000Z',stale_after:'2026-09-10T05:09:40.000Z'});
}
{
  const f=fixture();await run(f.db,f.options);
  await run(f.db,{...f.options,now:new Date('2026-09-10T05:09:59Z')});
  assert.equal(f.sends.length,2,'no early repeat');
  await Promise.all([run(f.db,{...f.options,now:new Date('2026-09-10T05:10:00Z')}),
    run(f.db,{...f.options,now:new Date('2026-09-10T05:10:00Z')})]);
  assert.equal(f.sends.filter(s=>s[0]==='driver').length,2,'one new Driver reminder at five minutes');
  assert.equal(f.sends.filter(s=>s[0]==='admin').length,1,'Admin must not receive repeat pushes');
  assert.equal(f.db.tables.admin_app_notification_outbox.length,1);
  assert.equal(f.db.tables.customer_driver_app_notification_outbox.length,2,'reuse one saved Driver reminder');
  fresh(f);Object.assign(f.db.tables.driver_live_location_latest_positions[0],{
    captured_at:'2026-09-10T05:11:00Z',stale_after:'2026-09-10T05:16:00Z'});
  await run(f.db,{...f.options,now:new Date('2026-09-10T05:11:00Z')});
  f.db.tables.driver_live_location_latest_positions=[];
  await run(f.db,{...f.options,now:new Date('2026-09-10T05:20:00Z')});
  assert.equal(f.sends.filter(s=>s[0]==='driver').length,2,'confirmed sharing permanently stops this cycle');
}
{
  const f=fixture(); const protectedBefore=JSON.stringify([f.db.tables.bookings,f.db.tables.driver_job_links]);
  const result = await run(f.db,f.options);
  assert.equal(result.notification_count,1);assert.equal(result.admin_warning_count,1);
  assert.equal(f.sends.length,2,'missing GPS five minutes after reminder must notify Driver and Admin');
  assert.equal(f.db.tables.customer_driver_app_notification_outbox.find(row=>row.event_key.startsWith('driver_gps_followup:')).safe_message,'Please share location');
  await run(f.db,f.options);
  assert.equal(f.sends.length,2,'repeat scheduler run must not resend');
  fresh(f); await run(f.db,f.options);
  assert.equal(f.db.tables.admin_app_notification_outbox[0].notification_status,'archived','fresh GPS clears saved warning');
  assert.equal(JSON.stringify([f.db.tables.bookings,f.db.tables.driver_job_links]),protectedBefore);
  assert.ok(f.db.calls.filter(c=>c.op!=='select').every(c=>['admin_app_notification_outbox','customer_driver_app_notification_outbox'].includes(c.table)));
}
for (const mode of ['fresh','too_early','cancelled','pob','completed','amended','reassigned','revoked','expired','wrong_initial_key','missing_initial']) {
  const f=fixture();
  if(mode==='fresh') fresh(f);
  if(mode==='too_early') f.options.now=new Date(now.getTime()-1);
  if(mode==='cancelled') f.db.tables.bookings[0].status='cancelled';
  if(['pob','completed'].includes(mode)) f.db.tables.driver_job_status_events.push({booking_reference:ref,status_value:mode,occurred_at:'2026-09-10T05:03:00Z'});
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
  assert.equal(f.sends.length,0,'a reserved attempt must not retry immediately after downstream DB failure');
  await run(f.db,{...f.options,now:new Date('2026-09-10T05:10:00Z')});
  assert.equal(f.sends.length,2,'next scheduled attempt recovers without duplicate sends');
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
  assert.equal(f.sends.length,2,'pickup time alone must not stop missing-location reminders');
}
{
  const f=fixture();await run(f.db,f.options);
  f.db.tables.driver_job_status_events.push({booking_reference:ref,status_value:'ots',occurred_at:'2026-09-10T06:15:00Z'});
  await run(f.db,{...f.options,now:new Date('2026-09-10T06:30:00Z')});
  assert.equal(f.sends.filter(s=>s[0]==='driver').length,2,'continue after original 65-minute lookup and OTS');
  assert.equal(f.sends.filter(s=>s[0]==='admin').length,1);
  await run(f.db,{...f.options,now:new Date('2026-09-10T06:30:30Z')});
  assert.equal(f.sends.filter(s=>s[0]==='driver').length,2,'delayed ticks do not replay missed intervals');
  await run(f.db,{...f.options,now:new Date('2026-09-10T06:35:00Z')});
  assert.equal(f.sends.filter(s=>s[0]==='driver').length,3);
}
{
  const f=fixture();f.db.tables.driver_job_links=Array.from({length:101},(_,i)=>({...f.db.tables.driver_job_links[0],id:`bounded-${i}`}));
  const result=await run(f.db,f.options);assert.equal(result.ok,false);assert.equal(f.sends.length,0,'incomplete over-limit evidence cannot send');
}
{
  const f=fixture();await Promise.all([run(f.db,f.options),run(f.db,f.options)]);
  assert.equal(f.sends.length,2,'concurrent scheduler runs claim one follow-up');
}
for (const change of ['fresh','cancelled','reassigned','amended','pob','revoked','expired']) {
  const f=fixture();let injected=false;
  f.db.beforeQuery=q=>{
    if(injected || q.op!=='update' || q.table!=='customer_driver_app_notification_outbox' ||
      !q.payload.safe_context?.location_followup_next_at) return;
    injected=true;
    if(change==='fresh')fresh(f);
    if(change==='cancelled')f.db.tables.bookings[0].status='cancelled';
    if(change==='reassigned')f.db.tables.bookings[0].driver_id=9;
    if(change==='amended')f.db.tables.bookings[0].pickup_at='2026-09-10T09:00:00Z';
    if(change==='pob')f.db.tables.driver_job_status_events.push({booking_reference:ref,status_value:'pob',occurred_at:now.toISOString()});
    if(change==='revoked')f.db.tables.driver_job_links[0].revoked_at=now.toISOString();
    if(change==='expired')f.db.tables.driver_job_links[0].expires_at=now.toISOString();
  };
  await run(f.db,f.options);
  assert.equal(f.sends.length,0,`${change} during claim must stop dispatch`);
  assert.ok(f.db.tables.customer_driver_app_notification_outbox[0].safe_context.location_followup_checked_at);
}
{
  const f=fixture();fresh(f);
  f.db.tables.driver_live_location_latest_positions[0].captured_at='2026-09-10T05:01:00Z';
  await run(f.db,{...f.options,now:new Date('2026-09-10T05:01:00Z')});
  f.db.tables.driver_live_location_latest_positions=[];
  await run(f.db,f.options);
  assert.equal(f.sends.length,0,'sharing before first reminder also latches completion');
}
{
  const f=fixture();f.db.tables.customer_driver_app_notification_outbox[0].safe_context.location_followup_checked_at=now.toISOString();
  await run(f.db,{...f.options,now:new Date('2026-09-10T05:10:00Z')});
  assert.equal(f.sends.length,0,'previously completed legacy cycles stay closed');
}
{
  const f=fixture();f.db.fail='customer_driver_app_notification_outbox:update';
  const result=await run(f.db,f.options);
  assert.equal(result.ok,false);assert.equal(f.sends.length,0,'failed reservation cannot dispatch');
  f.db.fail=null;await run(f.db,f.options);assert.equal(f.sends.length,2);
}
{
  const f=fixture();f.options.sendPush=async()=>{f.sends.push(['driver']);throw Error('uncertain');};
  await run(f.db,f.options);await run(f.db,f.options);
  assert.equal(f.sends.filter(s=>s[0]==='driver').length,1,'never retry an uncertain attempt in the same interval');
  await run(f.db,{...f.options,now:new Date('2026-09-10T05:10:00Z')});
  assert.equal(f.sends.filter(s=>s[0]==='driver').length,2,'next scheduled reminder remains eligible');
  assert.equal(f.sends.filter(s=>s[0]==='admin').length,1);
}
// Exercise the unchanged sender as the worker's downstream consumer, intercepting
// both provider boundaries. No network, credential, badge or live DB call is allowed.
{
  const pushModule={exports:{}};
  const pushSource=await readFile('lib/driver-device-push-notification.ts','utf8');
  vm.runInNewContext(ts.transpileModule(pushSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,
    target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{
    module:pushModule,exports:pushModule.exports,Date,URL,console,process:{env:{}},
    require(name){
      if(name==='node:crypto')return {createHash};
      if(name.endsWith('driver-job-link.ts'))return {isDriverJobLinkExpired:()=>false,isDriverJobLinkExpiryOutsideAllowedWindow:()=>false};
      return new Proxy({}, {get:()=>()=>{throw Error(`Unexpected provider/dependency ${name}`);}});
    },
  });
  const env={PRESTIGE_DRIVER_DEVICE_PUSH_ENABLED:'true',PRESTIGE_DRIVER_DEVICE_PUSH_VAPID_PUBLIC_KEY:'fixture-public-key',
    PRESTIGE_DRIVER_DEVICE_PUSH_VAPID_PRIVATE_KEY:'fixture-private-key',PRESTIGE_DRIVER_DEVICE_PUSH_CONTACT_EMAIL:'ops@example.test'};
  for(const native of [false,true]){
    const f=fixture();const payloads=[];
    f.db.tables.driver_device_push_subscriptions=[{driver_id:8,subscription_status:'active',
      endpoint:native?'ExpoPushToken[fixtureLocationReminder0001]':'https://push.example.test/fixture',
      source_surface:native?'driver_native_ios':'driver_job_acknowledgement',p256dh:'fixture',auth:'fixture'}];
    f.options.sendPush=(client,input)=>pushModule.exports.sendDriverDevicePushAlertForPickupReminder(client,input,{
      env,pushSender:async(_sub,payload)=>payloads.push(payload),
      nativePushSender:async(_token,jobKey,openTarget,body)=>payloads.push({job_key:jobKey,openTarget,body}),
    });
    await run(f.db,f.options);await run(f.db,{...f.options,now:new Date('2026-09-10T05:10:00Z')});
    assert.equal(payloads.length,2,`${native?'native':'web'} sender receives both scheduled reminders`);
    for(const payload of payloads){
      assert.equal(payload.body,'Please share location');assert.match(payload.job_key,/^[a-f0-9]{64}$/);
      assert.doesNotMatch(JSON.stringify(payload),/ADM-2026|11111111|latitude|longitude|location_followup_next_at/);
    }
    fresh(f);Object.assign(f.db.tables.driver_live_location_latest_positions[0],{captured_at:'2026-09-10T05:11:00Z',stale_after:'2026-09-10T05:16:00Z'});
    await run(f.db,{...f.options,now:new Date('2026-09-10T05:11:00Z')});
    await run(f.db,{...f.options,now:new Date('2026-09-10T05:20:00Z')});
    assert.equal(payloads.length,2,'GPS recovery stops actual sender dispatch');
  }
}
console.log('Driver location follow-up runtime guard passed.');

// A new/late job must escalate independently of the one-hour reminder cycle.
{
  const f=fixture();
  f.db.tables.customer_driver_app_notification_outbox=[];
  f.db.tables.bookings[0].driver_plate_number='SNP9124S';
  await run(f.db,{...f.options,now:new Date('2026-09-10T05:25:00Z')});
  assert.equal(f.db.tables.admin_app_notification_outbox.length,1,'missing GPS at T-35 must save an Admin emergency');
  assert.equal(f.db.tables.admin_app_notification_outbox[0].safe_context.escalation,'pickup_35m');
  assert.match(f.db.tables.admin_app_notification_outbox[0].safe_message,/SNP9124S/);
  assert.equal(f.sends.filter(s=>s[0]==='driver').length,0,'emergency is Admin-only');
}
function emergencyFixture() {
  const f=fixture();f.db.tables.customer_driver_app_notification_outbox=[];
  f.db.tables.bookings[0].driver_plate_number='SNP9124S';
  f.options.now=new Date('2026-09-10T05:25:00Z');return f;
}
const emergencies=f=>f.db.tables.admin_app_notification_outbox.filter(r=>r.safe_context?.escalation==='pickup_35m');
const emergencySends=f=>f.sends.filter(s=>s[0]==='admin'&&s[2]?.pickupEmergencyMinutes);
for (const [clock,count,minutes] of [
  ['05:24:59.999',0,null],['05:25:00',1,35],['05:26:20',1,34],['05:59:59',1,1],['06:00:00',0,null],['06:00:01',0,null],
]) {
  const f=emergencyFixture();await run(f.db,{...f.options,now:new Date(`2026-09-10T${clock}Z`)});
  assert.equal(emergencies(f).length,count,`T-35 boundary ${clock}`);
  if(count) assert.equal(emergencySends(f)[0][2].pickupEmergencyMinutes,minutes);
}
{
  const f=emergencyFixture();await Promise.all([run(f.db,f.options),run(f.db,f.options)]);
  await run(f.db,{...f.options,now:new Date('2026-09-10T05:26:00Z')});
  assert.equal(emergencies(f).length,1,'concurrent ticks claim one escalation');
  assert.equal(emergencySends(f).length,1);
  assert.equal(emergencySends(f)[0][2].vehiclePlate,'SNP9124S');
  assert.equal(emergencySends(f)[0][2].alertTarget,`alert:${emergencies(f)[0].id}`);
  assert.equal(f.db.tables.customer_driver_app_notification_outbox.length,0,'no Driver/customer notices');
}
{
  const f=emergencyFixture();f.db.tables.bookings[0].pickup_at='2026-09-10T06:00:00+00:00';
  await run(f.db,f.options);
  assert.equal(emergencies(f)[0].safe_context.pickup_at,f.db.tables.bookings[0].pickup_at);
  await run(f.db,{...f.options,now:new Date('2026-09-10T05:26:00Z')});
  assert.equal(emergencies(f)[0].notification_status,'queued','database timezone spelling must not falsely archive the alert');
  assert.equal(emergencySends(f).length,1);
}
for (const [name,change] of [
  ['cancelled',f=>f.db.tables.bookings[0].status='cancelled'],
  ['reassigned',f=>f.db.tables.bookings[0].driver_id=9],
  ['revoked',f=>f.db.tables.driver_job_links[0].revoked_at='2026-09-10T05:00:00Z'],
  ['expired',f=>f.db.tables.driver_job_links[0].expires_at='2026-09-10T05:00:00Z'],
  ['POB',f=>f.db.tables.driver_job_status_events.push({booking_reference:ref,status_value:'pob',occurred_at:'2026-09-10T05:24:00Z'})],
  ['JC',f=>f.db.tables.driver_job_status_events.push({booking_reference:ref,status_value:'completed',occurred_at:'2026-09-10T05:24:00Z'})],
  ['newer other-driver link',f=>f.db.tables.driver_job_links.push({...f.db.tables.driver_job_links[0],id:'22222222-2222-4222-8222-222222222222',driver_id:9,created_at:'2026-09-10T05:20:00Z'})],
  ['fresh GPS',f=>{fresh(f);Object.assign(f.db.tables.driver_live_location_latest_positions[0],{captured_at:'2026-09-10T05:24:00Z',stale_after:'2026-09-10T05:29:00Z'});}],
]) {
  const f=emergencyFixture();change(f);await run(f.db,f.options);
  assert.equal(emergencySends(f).length,0,name);
}
for (const status of ['otw','ots']) {
  const f=emergencyFixture();f.db.tables.driver_job_status_events.push({booking_reference:ref,status_value:status,occurred_at:'2026-09-10T05:24:00Z'});
  await run(f.db,f.options);assert.equal(emergencySends(f).length,1,`${status} without fresh GPS is not location evidence`);
}
{
  const f=emergencyFixture();fresh(f); // old GPS must not suppress the new checkpoint
  await run(f.db,f.options);assert.equal(emergencySends(f).length,1);
}
{
  const f=emergencyFixture();const first={...fixture().db.tables.customer_driver_app_notification_outbox[0]};
  first.safe_context={...first.safe_context,location_followup_checked_at:'2026-09-10T05:02:00Z'};
  f.db.tables.customer_driver_app_notification_outbox.push(first);
  await run(f.db,f.options);assert.equal(emergencySends(f).length,1,'previous GPS recovery does not disable T-35 check');
  assert.equal(f.sends.filter(s=>s[0]==='driver').length,0,'closed Driver reminder stays closed');
}
for (const failure of ['bookings','driver_job_links','driver_job_status_events','driver_live_location_latest_positions','admin_app_notification_outbox:insert']) {
  const f=emergencyFixture();f.db.fail=failure;const result=await run(f.db,f.options);
  assert.equal(result.ok,false,failure);assert.equal(emergencySends(f).length,0);
}
{
  const f=emergencyFixture();f.db.beforeQuery=q=>{
    if(q.table==='admin_app_notification_outbox'&&q.op==='insert'&&q.payload.safe_context?.escalation==='pickup_35m') {
      fresh(f);Object.assign(f.db.tables.driver_live_location_latest_positions[0],{captured_at:'2026-09-10T05:24:00Z',stale_after:'2026-09-10T05:29:00Z'});
    }
  };
  await run(f.db,f.options);assert.equal(emergencySends(f).length,0,'GPS during reservation suppresses send');
  assert.equal(emergencies(f)[0].notification_status,'archived');
}
{
  const f=emergencyFixture();f.db.beforeQuery=q=>{
    if(q.table==='admin_app_notification_outbox'&&q.op==='insert'&&q.payload.safe_context?.escalation==='pickup_35m') f.db.tables.bookings[0].driver_id=9;
  };
  await run(f.db,f.options);assert.equal(emergencySends(f).length,0,'reassignment during reservation suppresses send');
}
{
  const f=emergencyFixture();const other='OTHER';
  f.db.tables.bookings.push({...f.db.tables.bookings[0],booking_reference:other,pickup_at:'2026-09-10T08:00:00Z'});
  const otherLink='22222222-2222-4222-8222-222222222222';
  f.db.tables.driver_job_links.push({...f.db.tables.driver_job_links[0],id:otherLink,booking_reference:other});
  f.db.tables.driver_live_location_latest_positions.push({booking_reference:other,driver_job_link_id:otherLink,sharing_state:'active',captured_at:'2026-09-10T05:24:00Z',stale_after:'2026-09-10T05:29:00Z'});
  await run(f.db,f.options);assert.match(emergencies(f)[0].safe_message,/sharing another job/);
  assert.doesNotMatch(emergencies(f)[0].safe_message,/no location/);
  assert.equal(emergencySends(f)[0][2].pickupLocationState,'overlap');
}
{
  const f=emergencyFixture();await run(f.db,f.options);
  fresh(f);Object.assign(f.db.tables.driver_live_location_latest_positions[0],{captured_at:'2026-09-10T05:25:40Z',stale_after:'2026-09-10T05:30:40Z'});
  await run(f.db,{...f.options,now:new Date('2026-09-10T05:26:00Z')});
  assert.equal(emergencies(f)[0].notification_status,'archived','recovery archives warning only');
  assert.equal(f.db.tables.driver_job_status_events.length,0);
}
console.log('Admin T-35 escalation passed: boundary/catch-up, late assignment, concurrency, GPS stop/recovery, exact assignment, overlap, failed evidence and Admin-only targeting.');
