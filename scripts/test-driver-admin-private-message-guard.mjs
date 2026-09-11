import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";

const source = readFileSync("lib/customer-driver-app-notification-persistence.ts", "utf8");
const page = readFileSync("app/driver-job/[token]/page.tsx", "utf8");
assert.ok(source.includes('direction: "driver_to_admin"'));
assert.ok(page.includes('data-driver-message-recipient="admin"'));
assert.ok(!page.includes('data-driver-job-report-issue="true"'), "Owner replaced Report Issue with typed Admin messages");
assert.equal((page.match(/data-driver-customer-message-composer="true"/g) || []).length, 1);
assert.ok(page.includes('driverAdminMessageAttemptRef.current?.key === attemptKey'));
assert.ok(page.includes('driverMessageSendingRef.current'));
assert.ok(page.includes('driverAdminMessageDraft : driverCustomerMessageDraft'), "Recipient drafts must stay separate");

// Execute the real persistence module with an in-memory database and captured push senders.
// No credentials, external sends or real records are used.
const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const messageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
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
  let filters = [], payload, limit = Infinity, single = false, range;
  const q = {
    select() { return q; }, order() { return q; },
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
        let data=rows[name].filter(r=>filters.every(f=>f(r))).slice(0,limit);
        const count=data.length;
        if(range) data=data.slice(range[0],range[1]+1);
        return {data:single ? data[0] ?? null : data,error:null,count};
      }).then(resolve,reject);
    },
  };
  return q;
} };
const env = {
  PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_ENABLED:"true",
  PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_MODE:"controlled-runtime",
  SUPABASE_URL:"https://synthetic.supabase.co", SUPABASE_SERVICE_ROLE_KEY:"synthetic-test-only",
};
const module = { exports:{} };
const mocks = {
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
new Function("require","exports","process",compiled)(name=>mocks[name] || {},module.exports,{env});
const api=module.exports;
const body={recipient:"admin",client_message_id:messageId,message_text:"Please help with pickup."};
const request = (origin="https://app.example.test",purpose="driver-admin-message")=>new Request("https://app.example.test/api/driver-job/valid/quick-replies",{method:"POST",headers:{origin,"x-prestige-driver-purpose":purpose}});
const send=(value=body,req=request(),token="valid")=>api.sendDriverQuickReplyToCustomer(token,value,req);
reset();
let result=await send();
assert.equal(result.status,200,JSON.stringify(result));
assert.equal(rows[table].length,1);
assert.equal(rows[table][0].notification_status,"read","Sent echo must not create an unread Driver alert");
assert.equal(result.body.direction,"driver_to_admin");
assert.deepEqual(push,[["driver_to_admin_reply",{safeMessage:body.message_text}]]);
assert.equal(result.body.notification.driver_job_link_id,undefined);
assert.equal(result.body.notification.actor_label,undefined);
// Exactly the same attempt retries safely, including concurrent duplicate requests.
await Promise.all([send(),send()]);
assert.equal(rows[table].length,1); assert.equal(push.length,1);
assert.equal((await send({...body,message_text:"Changed content"})).status,409);
assert.equal(rows[table].length,1);
const privateRow=rows[table][0];
for(const actor of ["driver","admin","dispatcher","customer","system"]) {
  for(const state of ["read","dismissed","archived","queued"]) {
    const row={...privateRow,actor_role:actor,notification_status:state};
    assert.equal(api.testReaders.toCustomerSharedConversationReadRecord(row),null);
    assert.equal(api.testReaders.toCustomerInAppNotificationReadEvidenceRecord(row),null);
  }
}
let history=await api.loadDriverAppNotificationsForToken("valid",new URLSearchParams());
assert.equal(history.data.notifications.length,1);
rows[table][0].driver_job_link_id=null;
history=await api.loadDriverAppNotificationsForToken("valid",new URLSearchParams());
assert.equal(history.data.notifications.length,0,"Deleted-link private echoes must not become shared");
history=await api.loadDriverAppNotificationsForToken("valid",new URLSearchParams({notification_status:"read"}));
assert.equal(history.data.notifications.length,0);
rows[table][0].driver_job_link_id=otherId;
history=await api.loadDriverAppNotificationsForToken("valid",new URLSearchParams());
assert.equal(history.data.notifications.length,0);

for(const [label,setup,expected] of [
  ["revoked",()=>rows.driver_job_links[0].revoked_at="2026-09-01",403],
  ["expired",()=>rows.driver_job_links[0].expires_at="2020-01-01",410],
  ["unacknowledged",()=>rows.driver_job_links[0].safe_link_context={},403],
  ["replacement",()=>rows.bookings[0].driver_id=8,403],
  ["missing booking",()=>rows.bookings=[],403],
  ["JC",()=>rows.driver_job_status_events.push({id:"jc",booking_reference:"QA-PRIVATE",status_value:"completed"}),409],
  ["cancelled",()=>rows.bookings[0].status="cancelled",409],
  ["status unavailable",()=>dbFailure="driver_job_status_events",503],
]) {
  reset(); setup(); result=await send();
  assert.equal(result.status,expected,label); assert.equal(rows[table].length,0,label); assert.equal(push.length,0,label);
}
for(const [value,req,token,expected] of [
  [body,request("https://other.example"),"valid",403],
  [body,request("https://app.example.test","wrong"),"valid",403],
  [body,request(),"wrong",401],
  [{...body,booking_reference:"OTHER"},request(),"valid",400],
  [{...body,driver_id:8},request(),"valid",400],
  [{...body,recipient:"unknown"},request(),"valid",400],
  [{...body,message_text:"x".repeat(501)},request(),"valid",400],
  [{...body,message_text:""},request(),"valid",400],
  [{...body,message_text:"internal_admin_notes"},request(),"valid",400],
]) {
  reset();result=await send(value,req,token);assert.equal(result.status,expected,JSON.stringify(result));
  assert.equal(rows[table].length,0);assert.equal(push.length,0);
}
reset();rows.driver_job_status_events.push({booking_reference:"QA-PRIVATE",status_value:"pob"});
assert.equal((await send()).status,200,"Private Admin replies remain available at POB");
reset();dbFailure=table;
assert.equal((await send()).status,500);assert.equal(rows[table].length,0);assert.equal(push.length,0);
reset();pushFailure=true;
assert.equal((await send()).status,200,"Provider failure cannot erase a saved message");
assert.equal((await send()).status,200);assert.equal(rows[table].length,1);assert.equal(push.length,1);
reset();env.PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_ENABLED="false";
assert.equal((await send()).status,503);assert.equal(rows[table].length,0);
console.log("Driver private Admin message contracts passed: recipient privacy, exact job/ACK, POB/JC, retries, push isolation, safe reads and failures.");

const pushSource=readFileSync("lib/admin-device-push-notification.ts","utf8");
const nativeSource=readFileSync("admin-companion/src/admin-native-notifications.ts","utf8");
function testModule(source, extra, mocks={}) {
  const out={}; const code=ts.transpileModule(source+extra,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function("require","exports",code)(name=>mocks[name]||{},out);return out;
}
const formatter=testModule(pushSource,"\nexport const formatters={safeAlertPayload,safeNativePayload};").formatters;
const native=testModule(nativeSource,"");
const webPayload=formatter.safeAlertPayload("driver_to_admin_reply",undefined,undefined,"Please help with pickup.");
const nativePayload=formatter.safeNativePayload("driver_to_admin_reply",undefined,undefined,webPayload.body);
assert.equal(webPayload.body,"Please help with pickup.");
assert.equal(nativePayload.body,"Please help with pickup.");
assert.equal(nativePayload.title,"Prestige Limo Ops");
assert.equal(webPayload.title,"Driver → Admin");
assert.deepEqual(native.nativeAdminNotificationOpenRequest(nativePayload.data),{openTarget:"/",type:"driver_issue"});
console.log("Actual-message preview and existing installed Admin notification tap compatibility passed.");

const adminCreate=source.slice(source.indexOf("export async function createCustomerDriverAppNotification("),source.indexOf("export async function loadCustomerDriverAppNotifications("));
assert.ok(!adminCreate.includes('"driver_to_admin"'),"The existing Admin-to-Driver/Customer writer stays unchanged");
