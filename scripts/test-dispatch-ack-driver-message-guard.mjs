import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";

const source = readFileSync("lib/customer-driver-app-notification-persistence.ts", "utf8");
const page = readFileSync("app/page.tsx", "utf8");
// Execute the real persistence module with an in-memory database and captured push senders.
// No credentials, external sends or real records are used.
const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
let rows, push, dbFailure, pushFailure;
function reset() {
  rows = {
    driver_job_links: [{ id, token_hash: "valid", booking_reference: "QA-PRIVATE", driver_id: 7,
      link_status: "active", expires_at: "2099-01-01T00:00:00Z", revoked_at: null,
      safe_link_context: { driver_acknowledged_at: "2026-09-01T01:00:00Z" } }],
    bookings: [{ booking_reference: "QA-PRIVATE", driver_id: 7, status: "assigned" }],
    driver_job_status_events: [], customer_driver_app_notification_outbox: [],
  };
  push = []; dbFailure = null; pushFailure = false;
}
const table = "customer_driver_app_notification_outbox";
const client = { from(name) {
  assert.ok(rows[name], `Unexpected table ${name}`);
  let sorting = [], filters = [], payload, limit = Infinity, single = false, range;
  const q = {
    select() { return q; }, order(k, opts) { sorting.push([k,opts]); return q; },
    eq(k,v) { filters.push(r => r[k] === v); return q; },
    or(value) {
      if (value.startsWith("driver_job_link_id.is.null")) {
        const wanted = value.match(/driver_job_link_id.eq.([^,]+)/)?.[1];
        filters.push(r => r.driver_job_link_id === null || r.driver_job_link_id === wanted);
      }
      return q;
    },
    limit(v) { limit=v; return q; }, range(a,b) { range=[a,b]; return q; },
    insert(value) { payload=value; return q; },
    single() { single=true; return q; }, maybeSingle() { single=true; return q; },
    then(resolve,reject) {
      return Promise.resolve().then(() => {
        if (dbFailure === name) return { data:null,error:{code:"XX000"} };
        if (payload) {
          if (rows[name].some(r=>r.event_key===payload.event_key)) return { data:null,error:{code:"23505"} };
          const saved={...payload,id:`message-${rows[name].length+1}`,created_at:"2026-09-11T01:00:00Z"};
          rows[name].push(saved); return {data:saved,error:null};
        }
        let data=rows[name].filter(r=>filters.every(f=>f(r)));
        for(const [k,opts] of sorting.toReversed())data.sort((a,b)=>String(a[k]||"").localeCompare(String(b[k]||""))*(opts.ascending?1:-1));
        data=data.slice(0,limit);
        const count=data.length;
        if(range) data=data.slice(range[0],range[1]+1);
        return {data:single ? data[0] ?? null : data,error:null,count};
      }).then(resolve,reject);
    },
  };
  return q;
} };
const env = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:"true",
  PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_ENABLED:"true",
  PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_MODE:"controlled-runtime",
  SUPABASE_URL:"https://synthetic.supabase.co", SUPABASE_SERVICE_ROLE_KEY:"synthetic-test-only",
};
const compiledModule = { exports:{} };
const mocks = {
  "./admin-booking-supabase-adapter": { checkAdminBookingPersistenceStagingConfigReadiness:()=>({ok:true}) },
  "server-only": {}, "node:crypto": {createHash},
  "@supabase/supabase-js": { createClient:()=>client },
  "./driver-job-link-mode": { isProductionDriverJobLinkMode:()=>true, productionDriverJobLinksConfigured:()=>true },
  "./driver-job-link": { hashDriverJobLinkToken:t=>t, isDriverJobLinkExpired:s=>Date.parse(s)<Date.now(), isDriverJobLinkExpiryOutsideAllowedWindow:()=>false },
  "./driver-device-push-notification": { sendDriverDevicePushAlertForAppUpdate:async()=>push.push("driver") },
  "./customer-device-push-notification": { customerNativeAudienceReadyForBooking:async()=>{throw Error("Private reply must not resolve Customer audience");}, sendCustomerDevicePushAlertForAppUpdate:async()=>push.push("customer") },
  "./admin-device-push-notification": { sendAdminDevicePushAlert:async(type,options)=>{push.push([type,options]);if(pushFailure)throw Error("synthetic provider failure");} },
};
const compiled = ts.transpileModule(source + `\nexport const testReaders={toCustomerSharedConversationReadRecord,toCustomerInAppNotificationReadEvidenceRecord};`, {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
new Function("require","exports","process",compiled)(name=>mocks[name] || {},compiledModule.exports,{env});
const api=compiledModule.exports;

const actor={actor_label:"synthetic_admin",actor_role:"admin",source_surface:"admin_api",boundary_mode:"server-session-role-surface"};
const input={booking_reference:"QA-PRIVATE",driver_job_link_id:id,delivery_surface:"driver_app",workflow_area:"admin_driver_job_messages",
  notification_status:"queued",notification_type:"trip_update",priority:"normal",event_key:"admin-driver:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  safe_title:"Message from dispatch",safe_message:"Please meet at the lobby.",safe_context:{audience:"admin_driver",external_send:false,provider_send:false,recipient_role:"driver",sender_role:"admin",source:"today_jobs"}};
const send=(overrides={})=>api.createCustomerDriverAppNotification({...input,...overrides},actor);
reset();
rows.driver_job_links[0].safe_link_context={};
assert.equal((await send()).ok,false,"Unacknowledged link must reject before persistence");
assert.equal(rows[table].length,0);assert.equal(push.length,0);
reset();assert.equal((await send()).ok,true);
assert.equal(rows[table].length,1);assert.deepEqual(push,["driver"]);
const driverRead=await api.loadDriverAppNotificationsForToken("valid",new URLSearchParams("limit=5&page=1"));
assert.equal(driverRead.ok,true);assert.equal(driverRead.data.notifications[0].safe_message,input.safe_message);
assert.equal(driverRead.data.notifications[0].driver_job_link_id,undefined);
assert.equal(driverRead.data.notifications[0].event_key,undefined);

await Promise.all([send(),send()]);
assert.equal(rows[table].length,1);assert.equal(push.length,1,"Retry must not repeat push or badge increment");
assert.equal((await send({safe_message:"A different message."})).ok,false,"Changed payload cannot reuse attempt identity");
for(const change of [
 ()=>rows.bookings[0].driver_id=8,
 ()=>rows.bookings.splice(0),
 ()=>rows.driver_job_links[0].revoked_at=new Date().toISOString(),
 ()=>rows.driver_job_links[0].expires_at="invalid",
 ()=>rows.driver_job_links[0].expires_at="2020-01-01T00:00:00Z",
 ()=>rows.driver_job_links[0].safe_link_context.driver_acknowledged_at="invalid",
 ()=>rows.driver_job_links.push({...rows.driver_job_links[0],id:otherId,created_at:"2099-01-01"}),
 ()=>rows.driver_job_status_events.push({id:"status",booking_reference:"QA-PRIVATE",status_value:"completed"}),
 ...["status","admin_internal_status","customer_facing_status"].flatMap(field=>["completed","cancelled","archived","history","declined","rejected"].map(value=>()=>rows.bookings[0][field]=value)),
 ...["bookings","driver_job_links","driver_job_status_events"].map(name=>()=>dbFailure=name),
]) {
 reset();change();const result=await send();assert.equal(result.ok,false,JSON.stringify(result));
 assert.equal(rows[table].length,0);assert.equal(push.length,0);
}
reset();await Promise.all([send(),send()]);
assert.equal(rows[table].length,1);assert.equal(push.length,1,"Concurrent identical requests must not repeat push");
reset();rows.driver_job_status_events.push({booking_reference:"ANOTHER-JOB",status_value:"completed"});
assert.equal((await send()).ok,true,"Another job must not block the exact job");
reset();rows.driver_job_links[0].safe_link_context={};
assert.equal((await send({workflow_area:"driver_job_link_delivery"})).ok,true,"Existing link delivery must retain its own gate");
console.log("Admin Driver send scope and retry guard passed: exact ACK/assignment/link, terminal/JC/failure rejection, one row and push per attempt, other lanes preserved.");

// Execute the actual shared Admin sender: lost responses, double clicks and
// selection changes must not create another message or silently retarget it.
const start=page.indexOf('  async function sendAdminTodayJobMessage(');
const end=page.indexOf('  function renderAdminJobMessages(',start);
const sendCode=ts.transpileModule(page.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function senderFixture() {
 const state={JOB:{audience:'driver',draft:'Meet at the lobby.',status:'idle'}};
 const fixture={posts:[],failResponse:false,completed:false,failRead:false,hold:null};
 const context={
  cleanReferenceText:v=>String(v||'').trim(),clean:v=>String(v||'').trim(),adminTodayJobDriverMessageStates:state,
  setAdminTodayJobDriverMessageStates:fn=>Object.assign(state,fn(state)),
  adminDriverMessageAttemptsRef:{current:{}},adminDriverMessageSendingRef:{current:new Set()},
  appliedAdminBookingSnapshotReferenceRef:{current:'JOB'},dispatchDriverMessageBooking:{booking_reference:'JOB'},dispatchDriverMessageClosedReason:'',
  adminIncomingReplyBooking:null,adminIncomingReplyReference:'',adminDriverJobLinksApiPath:'/links',adminLegacyDataPurpose:'admin',adminCustomerDriverAppNotificationsApiPath:'/messages',
  adminDriverJobStatusTimeLabel:()=> 'now',refreshAdminTodayJobMessageHistory:()=>{},refreshAdminDriverJobStatusRead:async()=>{},
  loadAdminDriverJobStatusRead:async()=>{if(fixture.failRead)throw Error('Read unavailable');return {statuses:fixture.completed?[{status_value:'completed'}]:[]};},
 };
 fixture.link={id,booking_reference:'JOB',link_status:'active',revoked_at:null,expires_at:'2099-01-01',safe_summary:{acknowledged:true}};
 context.fetch=async(url,init)=>{
  if(init.method==='GET'){if(fixture.hold)await fixture.hold;return Response.json({ok:true,links:[fixture.link]});}
  const payload=JSON.parse(init.body);fixture.posts.push(payload);
  if(fixture.failResponse)throw Error('Lost response');
  return Response.json({ok:true,notification:payload});
 };
 fixture.send=new Function(...Object.keys(context),sendCode+';return sendAdminTodayJobMessage;')(...Object.values(context));
 fixture.context=context;fixture.state=state;return fixture;
}
let f=senderFixture();f.failResponse=true;await f.send('JOB',undefined,id);await f.send('JOB',undefined,id);
assert.equal(f.posts.length,2);assert.equal(f.posts[0].event_key,f.posts[1].event_key);
assert.equal(f.state.JOB.draft,'Meet at the lobby.');
f.failResponse=false;await f.send('JOB',undefined,id);assert.equal(f.state.JOB.draft,'');
f.state.JOB.draft='Meet at the lobby.';await f.send('JOB',undefined,id);
assert.notEqual(f.posts[2].event_key,f.posts[3].event_key,'A new explicit message after success is a separate attempt');
f=senderFixture();let release;f.hold=new Promise(resolve=>release=resolve);
const first=f.send('JOB',undefined,id);await f.send('JOB',undefined,id);release();await first;
assert.equal(f.posts.length,1,'Immediate double click issues one POST');
for(const change of [
 f=>f.link.id=otherId,f=>f.link.safe_summary.acknowledged=false,f=>f.completed=true,f=>f.failRead=true,
 f=>f.context.appliedAdminBookingSnapshotReferenceRef.current='OTHER',
]) {f=senderFixture();change(f);await f.send('JOB',undefined,id);assert.equal(f.posts.length,0);}
f=senderFixture();f.hold=new Promise(resolve=>release=resolve);const pending=f.send('JOB',undefined,id);
f.context.appliedAdminBookingSnapshotReferenceRef.current='OTHER';release();await pending;assert.equal(f.posts.length,0,'Late link read cannot send after selection changed');
assert.equal((page.match(/data-admin-active-job-driver-message-input="true"/g)||[]).length,1,'Reuse one composer implementation');
console.log('Admin sender passed: stable retries, new explicit sends, synchronous duplicate suppression, exact selection/recipient, ACK/JC/read failure, and retained drafts.');
