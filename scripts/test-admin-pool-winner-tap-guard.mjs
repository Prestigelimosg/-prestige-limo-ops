import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const transpile = source => ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const id = '11111111-1111-4111-8111-111111111111';
const key = 'a'.repeat(64);
const route = fs.readFileSync('app/api/driver-job-bids/route.ts','utf8');
const notifier = route.slice(route.indexOf('async function notifyAdminOfDriverPoolAcceptance('), route.indexOf('export async function GET('));
const sent = [];
const reads = [];
let lookupFails = false;
const client = {from(table) {const filters={};return {
  select(columns){reads.push({table,columns,filters});return this;},
  eq(k,v){filters[k]=v;return this;},
  async maybeSingle(){return lookupFails?{data:null,error:{message:'unavailable'}}:{data:{id},error:null};},
};}};
const librarySource = fs.readFileSync('lib/driver-pool-fast-accept.ts','utf8');
const libraryScope = {exports:{},require:()=>({}),process};
vm.runInNewContext(transpile(librarySource),libraryScope);
const pool = libraryScope.exports;
const scope = {loadDriverPoolWinnerAlertTarget:pool.loadDriverPoolWinnerAlertTarget,loadDriverPoolWinnerPlate:async()=> 'QA1234',sendAdminDevicePushAlert:async(...args)=>sent.push(args)};
vm.createContext(scope);vm.runInContext(transpile(notifier)+';globalThis.notify=notifyAdminOfDriverPoolAcceptance;',scope);
await scope.notify(client,123,'11080',key);
assert.equal(sent.length,1);
assert.equal(sent[0][1].alertTarget,`alert:${id}`,'Winner push must carry the exact persisted Pool offer UUID through the existing native alert envelope.');
assert.deepEqual(reads[0],{table:'driver_job_bid_offers',columns:'id',filters:{offer_key:key,offer_status:'assigned'}});
lookupFails=true;await scope.notify(client,123,'11080',key);
assert.equal(sent.length,2,'Optional target lookup must not suppress the established generic alert.');
assert.equal(sent[1][1].alertTarget,undefined);

console.log('Pool winner target: exact UUID and optional-read failure preserve one existing send.');

// Execute the actual existing attention reader with a filtered, read-only database double.
process.env.PRESTIGE_DRIVER_POOL_ENABLED='true';
const offer={id,offer_key:key,offer_status:'assigned',booking_reference:'EXACT-POOL',public_booking_reference:'11080',offer_payout_sgd:50,recipient_count:2,push_target_count:2,pickup_at:'2026-10-03T10:00:00Z',closes_at:'2026-10-03T10:00:00Z',updated_at:'2026-10-02T10:00:00Z'};
let changedDriver=false, closed=false, linked=false, queryError=false, offerStatus='assigned';
const queryLog=[];
const readClient={from(table){const filters={};const q={
  select(){return q;},in(k,v){filters[k]=v;return q;},eq(k,v){filters[k]=v;return q;},order(){return q;},range(){return q;},limit(){return q;},
  then(resolve,reject){queryLog.push({table,filters});let data=[];
    if(table==='driver_job_bid_offers')data=filters.id&&filters.id!==id?[]:[{...offer,offer_status:offerStatus}];
    if(table==='bookings')data=[{booking_reference:'EXACT-POOL',driver_id:changedDriver?8:7,status:closed?'completed':'assigned'}];
    if(table==='driver_job_bids')data=[{driver_job_bid_offer_id:id,driver_reference:'7'}];
    if(table==='driver_job_links'&&linked)data=[{booking_reference:'EXACT-POOL'}];
    return Promise.resolve({data,error:queryError?{message:'unavailable'}:null}).then(resolve,reject);
  },
};return q;}};
let result=await pool.loadAdminDriverPoolAttentionOffers(readClient,1,1,id);
assert.equal(result.ok,true);assert.equal(result.data.items.length,1);
assert.equal(result.data.items[0].booking_reference,'EXACT-POOL');
assert.equal(queryLog[0].filters.id,id,'exact ID filter must reach the existing table reader');
for(const scenario of ['reassigned','completed','linked','open','missing','failed']){
 changedDriver=scenario==='reassigned';closed=scenario==='completed';linked=scenario==='linked';queryError=scenario==='failed';offerStatus=scenario==='open'?'open':'assigned';
 result=await pool.loadAdminDriverPoolAttentionOffers(readClient,1,1,scenario==='missing'?'22222222-2222-4222-8222-222222222222':id);
 if(queryError)assert.equal(result.ok,false);else assert.equal(result.data.items.length,0,scenario+' must not navigate');
}
changedDriver=closed=linked=queryError=false;offerStatus='assigned';
queryLog.length=0;await pool.loadAdminDriverPoolAttentionOffers(readClient,1,20);
assert.equal(queryLog[0].filters.id,undefined,'normal paginated Pool list remains unfiltered');
assert.equal((await pool.loadAdminDriverPoolAttentionOffers(readClient,1,1,'bad')).ok,false);
for(const suffix of ['bad',id+'&notification_id='+id,id+'&page=2',id+'&extra=1']) {
 assert.equal(pool.parseDriverPoolAttentionQuery(new URLSearchParams('scope=attention&notification_id='+suffix)).ok,false);
}
assert.equal(pool.parseDriverPoolAttentionQuery(new URLSearchParams('scope=attention&notification_id='+id)).data.notification_id,id);

// Execute the real Dashboard effect, then the established exact-booking loader.
const page=fs.readFileSync('app/page.tsx','utf8');
const start=page.lastIndexOf('  useEffect(() => {',page.indexOf('    if (adminNotificationTargetHandledRef.current'));
const effect=page.slice(start+'  useEffect(() => {'.length,page.indexOf('  }, [activeTab, adminAppNotificationReadState.status, adminAppNotificationReadState.notifications]);',start));
const loader=page.slice(page.indexOf('  async function loadAdminDriverPoolPendingBooking('),page.indexOf('  async function assignDraftDriver('));
async function browser({mode='success',status='loaded',saved=[]}={}){
 const calls=[],opened=[],replaced=[];
 const scope={URL,encodeURIComponent,adminLegacyDataPurpose:'admin-booking-persistence',activeTab:'dashboard',activeTabRef:{current:'dashboard'},
  adminNotificationTargetHandledRef:{current:false},adminAppNotificationReadState:{status,notifications:saved},otherAdminAppNotifications:saved,
  cleanReferenceText:x=>x,adminVisibleBookingReference:x=>x,adminBookingPersistenceRecordToCalendarBookingRecord:x=>x,bookingRecordToForm:x=>x,
  setMobileDispatchBookingStep:()=>assert.fail('No responses lane'),setDispatchLoadFocusTarget:()=>assert.fail('No responses lane'),
  openSavedAdminNotificationsFromNotificationCentre:x=>opened.push({saved:x}),
 };
 scope.window={location:{href:'https://app.prestigelimo.sg/?admin_alert=alert%3A'+id},history:{state:null,replaceState:(_s,_t,url)=>replaced.push(url)}};
 scope.setAdminAppNotificationReadState=fn=>scope.adminAppNotificationReadState=fn(scope.adminAppNotificationReadState);
 scope.fetch=async(url,init)=>{calls.push({url,init});if(mode==='leave')scope.activeTabRef.current='bookings';if(mode==='failed')throw Error('read failed');return {ok:true,json:async()=>({ok:true,items:mode==='missing'?[]:[{...offer,attention_status:'accepted_link_pending'}]})};};
 scope.loadExactAdminBookingPersistenceRecord=async ref=>{calls.push({exact:ref});if(mode==='leave-during-booking')scope.activeTabRef.current='bookings';if(mode==='booking-failed')throw Error('read failed');return {booking_reference:ref};};
 scope.loadSelectedBooking=async(row,options)=>opened.push({row,options});
 vm.createContext(scope);vm.runInContext(transpile(loader),scope);
 const run=()=>vm.runInContext(transpile(`(function(){${effect}})()`),scope);
 run();run();await new Promise(resolve=>setImmediate(resolve));
 return {calls,opened,replaced,scope,run};
}
let b=await browser();
assert.equal(b.calls.filter(x=>x.url).length,1,'consume one tap once');
assert.equal(b.calls[0].url,`/api/admin-driver-job-bid-offers?scope=attention&page=1&limit=1&notification_id=${id}`);
assert.equal(b.calls[0].init.cache,'no-store');assert.equal(b.calls[0].init.method,undefined,'lookup is GET only');
assert.equal(b.opened.length,1);assert.equal(b.opened[0].row.booking_reference,'EXACT-POOL');
assert.equal(b.opened[0].options.focusDriverJobLink,true);assert.equal(b.opened[0].options.suppressCustomerRequestHandledMemory,true);
assert.deepEqual(b.replaced,['/']);
for(const mode of ['missing','failed','booking-failed','leave','leave-during-booking']){
 b=await browser({mode});assert.equal(b.opened.length,0,mode);
 if(mode.endsWith('failed')){assert.equal(b.scope.adminNotificationTargetHandledRef.current,false);assert.equal(b.replaced.length,0);assert.match(b.scope.adminAppNotificationReadState.message.text,/could not be verified/);}
 if(mode==='missing')assert.match(b.scope.adminAppNotificationReadState.message.text,/no other job/);
}
b=await browser({status:'loading'});assert.equal(b.calls.length,0,'wait for authenticated reader');
b=await browser({saved:[{id}]});assert.equal(b.calls.length,0,'existing saved alert must retain priority with no Pool read');assert.equal(b.opened[0].saved,id);

// Both actual acceptance entry points retain existing auth and deferred sends.
const adminSource=fs.readFileSync('app/api/admin-driver-job-bid-offers/route.ts','utf8');
let authorized=true;const deferred=[],pushes=[];
const imports={
 'next/server':{after:fn=>deferred.push(fn)},
 '../../../lib/driver-job-operations-calendar-sync':{syncAcknowledgedDriverDetailsToOperationsCalendar:async()=>{}},
 '../../../lib/driver-account-activity':{},
 '../../../lib/admin-booking-supabase-adapter':{adminDispatcherBoundaryToPersistenceAdapterActor:()=>({actor_role:'admin'})},
 '../../../lib/admin-dispatcher-auth-boundary':{adminBookingPersistencePurpose:'admin-booking-persistence',resolveAdminDispatcherBoundary:()=>({ok:authorized,context:{}})},
 '../../../lib/admin-device-push-notification':{sendAdminDevicePushAlert:async(type,options)=>pushes.push({type,options})},
 '../../../lib/driver-device-push-notification':{sendDriverDevicePushAlertForDriverPoolOffer:async()=>{},sendDriverDeviceSilentRefreshForDriverPoolOffer:async()=>{}},
 '../../../lib/driver-pool-fast-accept':{...pool,getDriverPoolClientForProduction:()=>({ok:true,client:readClient}),parseDriverPoolAdminActionPayload:x=>({ok:true,data:x}),decideDriverPoolOffer:async()=>({ok:true,data:{reason:'accepted',public_booking_reference:'11080',other_recipient_driver_ids:[]}}),loadDriverPoolWinnerPlate:async()=> 'QA1234',loadDriverPoolWinnerAlertTarget:async()=>`alert:${id}`},
};
const routeScope={exports:{},Response,process,URL,console,require:name=>{assert.ok(name in imports,name);return imports[name];}};
vm.runInNewContext(transpile(adminSource),routeScope);
const req={url:'https://app.prestigelimo.sg/api/admin-driver-job-bid-offers?scope=attention&notification_id='+id,json:async()=>({action:'award',driver_id:7,offer_key:key})};
assert.equal((await routeScope.exports.PATCH(req)).status,200);assert.equal(pushes.length,0);await deferred.pop()();
assert.equal(pushes.length,1);assert.equal(pushes[0].options.alertTarget,`alert:${id}`);
assert.equal((await routeScope.exports.GET(req)).status,200);
authorized=false;queryLog.length=0;
assert.equal((await routeScope.exports.GET(req)).status,403);assert.equal(queryLog.length,0);
assert.equal((await routeScope.exports.PATCH(req)).status,403);assert.equal(pushes.length,1);
console.log('Pool tap passed: exact authenticated UUID read, stale/reassigned/closed/linked rejection, existing Create Link handoff, no writes, navigation races, failed-read retry, original alert precedence and deferred Admin-award send.');
