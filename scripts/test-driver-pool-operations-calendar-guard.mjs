import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(file, imports) {
  const m = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'module', 'exports', js)(name => { assert.ok(name in imports, `Unmocked import ${name}`); return imports[name]; }, m, m.exports);
  return m.exports;
}
const writes = [], reads = [], deferred = [];
let row = { booking_reference: 'POOL-CALENDAR-QA', service_type: 'DSP', pickup_at: '2026-09-30T05:00:00Z', pickup_location: 'QA START', dropoff_location: 'QA END', route_summary: 'QA START > QA END', passenger_name: 'QA PASSENGER', driver_name: null, driver_contact: null, driver_plate_number: null, vehicle_type_or_category: 'AVF', pax_count: 1, admin_internal_status: 'draft' };
let combo = false, failRead = false, throwSync = false, providerStatus = 200;
const client = { from(table) { const filters = {}; return { select() { return this; }, eq(k,v) { filters[k]=v; return this; }, async maybeSingle() { reads.push({table,filters}); if(failRead) return {data:null,error:{message:'Synthetic read failure'}}; return {data:table==='driver_job_bid_offers'?{booking_reference:'POOL-CALENDAR-QA'}:table==='driver_job_combos'?(combo?{id:'combo-qa'}:null):table==='bookings'?{...row}:null,error:null}; } }; } };
const syncer = async payload => { if (throwSync) throw Error('Synthetic provider unavailable'); writes.push(payload); return providerStatus===200?{ok:true}:{ok:false,status:providerStatus,error:'Synthetic rejection'}; };
const calendar = load('lib/driver-job-operations-calendar-sync.ts', {'server-only':{}, './admin-booking-google-calendar-sync':{syncVerifiedDriverDetailsToAdminBookingCalendar:syncer}});
const offerKey = 'a'.repeat(64);
process.env.PRESTIGE_DRIVER_COMBO_ENABLED='true';
assert.equal(await calendar.syncAcknowledgedDriverDetailsToOperationsCalendar({driverPoolOfferKey:offerKey,client}),true,'Successful Pool cancellation must reach the existing Calendar writer.');
assert.equal(writes.length,1);
assert.equal(writes[0].bookings[0].booking_reference,row.booking_reference);
assert.equal(writes[0].bookings[0].driver_name,'');
assert.equal(writes[0].bookings[0].driver_plate_number,'');
row={...row,driver_name:'QA NEW DRIVER',driver_contact:'90000001',driver_plate_number:'QA2783'};
await calendar.syncAcknowledgedDriverDetailsToOperationsCalendar({driverPoolOfferKey:offerKey,client});
assert.equal(writes.at(-1).bookings[0].driver_name,'QA NEW DRIVER');
assert.equal(writes.at(-1).bookings[0].driver_plate_number,'QA2783');
let count=writes.length;
for (const bad of ['', 'invalid', '../bad']) assert.equal(await calendar.syncAcknowledgedDriverDetailsToOperationsCalendar({driverPoolOfferKey:bad,client}),false);
assert.equal(await calendar.syncAcknowledgedDriverDetailsToOperationsCalendar({driverPoolOfferKey:offerKey,bookingReference:'OTHER',client}),false);
combo=true;assert.equal(await calendar.syncAcknowledgedDriverDetailsToOperationsCalendar({driverPoolOfferKey:offerKey,client}),false);combo=false;
failRead=true;assert.equal(await calendar.syncAcknowledgedDriverDetailsToOperationsCalendar({driverPoolOfferKey:offerKey,client}),false);failRead=false;
assert.equal(writes.length,count,'Invalid/unverifiable/combo scope must not write Calendar.');
reads.length=0;
assert.equal(await calendar.syncAcknowledgedDriverDetailsToOperationsCalendar({bookingReference:row.booking_reference,client}),true);
assert.deepEqual(reads.map(r=>r.table),['bookings'],'Existing ACK path must not gain Pool reads.');

let authorized=true, result;
const noop=async()=>{};
const pool={getDriverPoolClientForProduction:()=>({ok:true,client}),parseDriverPoolCancelPayload:p=>({ok:true,data:p}),parseDriverPoolAdminActionPayload:p=>({ok:true,data:p}),cancelDriverPoolOffer:async()=>result,decideDriverPoolOffer:async()=>result,loadDriverPoolWinnerAlertTarget:async()=>null,loadDriverPoolWinnerPlate:async()=> 'QA2783',refreshCancelledDriverPoolRecipients:noop,parseDriverPoolDecisionPayload:p=>({ok:true,data:p})};
const common={'next/server':{after:cb=>deferred.push(cb)},'../../../lib/driver-job-operations-calendar-sync':calendar,'../../../lib/driver-pool-fast-accept':pool,'../../../lib/admin-device-push-notification':{sendAdminDevicePushAlert:noop},'../../../lib/driver-device-push-notification':{sendDriverDevicePushAlertForDriverPoolOffer:noop,sendDriverDeviceSilentRefreshForDriverPoolOffer:noop}};
const admin=load('app/api/admin-driver-job-bid-offers/route.ts',{...common,'../../../lib/driver-account-activity':{},'../../../lib/admin-booking-supabase-adapter':{adminDispatcherBoundaryToPersistenceAdapterActor:()=>({actor_role:'admin',actor_label:'QA'})},'../../../lib/admin-dispatcher-auth-boundary':{adminBookingPersistencePurpose:'admin-booking-persistence',resolveAdminDispatcherBoundary:()=>authorized?{ok:true,context:{}}:{ok:false,error:'Denied'}}});
const driver=load('app/api/driver-job-bids/route.ts',{...common,'../../../lib/driver-account-device-lock':{verifyDriverAccountSession:async()=>authorized},'../../../lib/driver-portal-session':{resolveDriverPortalSession:()=>({ok:true,claims:{accountId:1,deviceIdHash:'qa',driverId:35,issuedAt:1}}),clearDriverPortalSessionCookie:()=>''}});
const cancel={offer_key:offerKey,expected_updated_at:'2026-09-29T04:19:00Z'};
const accepted={ok:true,data:{reason:'accepted',public_booking_reference:'99069',other_recipient_driver_ids:[]}};
const cancelled={ok:true,data:{assignment_cancelled:true,cancelled_driver_id:32,public_booking_reference:'99069',offer:{offer_key:offerKey}}};
function request(path,payload,purpose,method='PATCH'){return new Request(`https://qa.invalid${path}`,{method,headers:{'content-type':'application/json',origin:'https://qa.invalid',referer:'https://qa.invalid/driver-portal','x-prestige-driver-purpose':purpose||''},body:JSON.stringify(payload)});}
async function flush(){while(deferred.length)await deferred.shift()();}
const oldWarn=console.warn;const warnings=[];console.warn=(...args)=>warnings.push(args.join(' '));
try {
 for(const mode of ['cancel','award','accept']) {
  result=mode==='cancel'?cancelled:accepted; count=writes.length;
  const response=mode==='accept'?await driver.POST(request('/api/driver-job-bids',cancel,'driver-pool-offer-accept','POST')):await admin.PATCH(request('/api/admin-driver-job-bid-offers',mode==='award'?{...cancel,action:'award',driver_id:35}:cancel));
  assert.equal(response.status,200);assert.equal(writes.length,count,'Calendar must follow, never precede, the completed decision.');
  row={...row,driver_name:'LATEST DRIVER',driver_plate_number:'QA9999'};
  await flush();assert.equal(writes.length,count+1,`${mode} must hand off once`);assert.equal(writes.at(-1).bookings[0].driver_name,'LATEST DRIVER','Late callbacks must reread the current assignment.');
 }
 for(const outcome of [{ok:false,status:409,error:'stale'}, {...cancelled,data:{...cancelled.data,assignment_cancelled:false}}]) {result=outcome;count=writes.length;await admin.PATCH(request('/api/admin-driver-job-bid-offers',cancel));await flush();assert.equal(writes.length,count);}
 for(const reason of ['already_accepted','awaiting_admin','declined']){result={...accepted,data:{...accepted.data,reason}};count=writes.length;await driver.POST(request('/api/driver-job-bids',cancel,'driver-pool-offer-accept','POST'));await flush();assert.equal(writes.length,count);}
 authorized=false;result=cancelled;count=writes.length;assert.equal((await admin.PATCH(request('/api/admin-driver-job-bid-offers',cancel))).status,403);await flush();assert.equal(writes.length,count);authorized=true;
 throwSync=true;result=cancelled;assert.equal((await admin.PATCH(request('/api/admin-driver-job-bid-offers',cancel))).status,200);await flush();assert.ok(warnings.some(w=>w.includes('Operations Calendar')),'Provider exception needs a safe warning.');throwSync=false;
 providerStatus=502;count=writes.length;result=cancelled;assert.equal((await admin.PATCH(request('/api/admin-driver-job-bid-offers',cancel))).status,200);await flush();assert.equal(writes.length,count+2,'Retain existing one bounded provider retry.');
} finally {console.warn=oldWarn;}
console.log('Pool cancellation/award/accept Calendar handoff, latest saved state, rejected/idempotent/unauthorized isolation, ACK and combo preservation, and provider failure containment passed.');

// Run the existing real event formatter and Google writer against a synthetic
// provider event, proving cancellation/reassignment replaces the same event.
const crypto = await import('node:crypto');
const events = load('lib/admin-booking-calendar-event.ts', {'server-only':{}, './admin-booking-calendar-policy':{adminBookingCalendarDefaultDurationMinutes:90}});
const writer = load('lib/admin-booking-google-calendar-sync.ts', {'server-only':{}, 'node:crypto':crypto, './admin-booking-calendar-event':events});
const env={NODE_ENV:'test',PRESTIGE_ADMIN_GOOGLE_CALENDAR_SYNC_ENABLED:'true',PRESTIGE_GOOGLE_CALENDAR_ID:'qa-calendar@example.invalid',PRESTIGE_GOOGLE_CALENDAR_CLIENT_EMAIL:'qa@qa-project.iam.gserviceaccount.com',PRESTIGE_GOOGLE_CALENDAR_PRIVATE_KEY:String(crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'})),PRESTIGE_GOOGLE_CALENDAR_API_BASE_URL:'https://calendar.example.invalid/calendar/v3',PRESTIGE_GOOGLE_CALENDAR_TOKEN_URI:'https://calendar.example.invalid/token'};
let current=null;const providerCalls=[];
const fetcher=async(url,options={})=>{
 const u=new URL(url);const method=options.method||'GET';providerCalls.push({url:String(url),method});
 if(u.pathname==='/token')return Response.json({access_token:'synthetic-provider-token-not-a-secret',expires_in:3600});
 assert.equal(u.searchParams.get('sendUpdates'),method==='GET'?null:'none');
 if(method==='POST'){
  const candidate=JSON.parse(options.body);
  if(!current)current={...candidate,summary:'QA0097 $45 > QA PASSENGER - DSP - Prestige',description:'Driver: QA OLD DRIVER / QA0097',etag:'"qa-1"'};
  assert.equal(candidate.id,current.id);return Response.json({error:'already exists'},{status:409});
 }
 if(method==='GET')return Response.json(current);
 assert.equal(method,'PUT');assert.equal(options.headers['If-Match'],current.etag);
 const candidate=JSON.parse(options.body);assert.equal(candidate.id,current.id);assert.ok(!candidate.attendees?.length);
 current={...candidate,etag:'"qa-next"'};return Response.json(current);
};
for(const assigned of [false,true]){
 row={...row,driver_name:assigned?'QA NEW DRIVER':null,driver_contact:assigned?'90000001':null,driver_plate_number:assigned?'QA2783':null};
 const ok=await calendar.syncAcknowledgedDriverDetailsToOperationsCalendar({driverPoolOfferKey:offerKey,client,syncer:payload=>writer.syncVerifiedDriverDetailsToAdminBookingCalendar(payload,{env,fetcher,now:new Date('2026-09-29T00:00:00Z')})});
 assert.equal(ok,true);assert.doesNotMatch(current.summary+' '+current.description,/QA0097|QA OLD DRIVER/);
 assert.equal(current.extendedProperties.private.prestigeBookingReference,'POOL-CALENDAR-QA');
 assert.equal(current.start.dateTime,'2026-09-30T13:00:00');assert.equal(current.start.timeZone,'Asia/Singapore');assert.equal(current.end.dateTime,'2026-09-30T14:30:00');assert.equal(current.reminders.useDefault,false);assert.ok(current.reminders.overrides.every(r=>r.method==='popup'));
 if(assigned){assert.match(current.summary,/QA2783/);assert.match(current.description,/QA NEW DRIVER/);}
}
assert.equal(providerCalls.filter(c=>c.method==='PUT').length,2);
console.log('Real Calendar formatter/writer updated one deterministic event: old driver removed, new driver present, schedule/reminders and no-attendee/no-send boundaries preserved.');
