import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import crypto from 'node:crypto';
const env = {...process.env};
const adminSelector = fs.readFileSync('app/admin-driver-pool-control.tsx', 'utf8');
assert.match(adminSelector, /alertReadiness\[driver\.id\] === true \? "Alerts registered"/);
assert.ok(adminSelector.includes('Registration does not confirm the phone is online or the job was delivered.'));
assert.doesNotMatch(adminSelector, /Online · alerts ready|Online means job alerts/);
const calls=[], sends=[], after=[];
let rpcResult, authorized=true, verified=true;
const actor={actor_role:'admin',actor_label:'Synthetic Admin',source_surface:'admin_api',boundary_mode:'server-session-role-surface'};
const offer={id:'qa-offer',offer_key:'a'.repeat(64),offer_status:'open',offer_payout_sgd:100,recipient_count:5,push_target_count:0,closes_at:'2099-09-15T12:00:00Z',updated_at:'2026-09-14T00:00:00.123456Z',safe_vehicle_label:'AVF',safe_offer_context:{selection_mode:'admin',audience:'selected',secret:'DO_NOT_EXPOSE'}};
let rows = {};
const client={
  rpc:(name,input)=>{calls.push({name,input}); const result=Promise.resolve({data:rpcResult,error:null});result.abortSignal=()=>result;return result;},
  from:(table)=>{
    const result={select:()=>result,eq:()=>result,in:()=>result,order:()=>result,limit:()=>result,range:()=>result,
      maybeSingle:async()=>({data:rows[table],error:null}),then:(resolve)=>Promise.resolve({data:rows[table],error:null}).then(resolve)};
    return result;
  },
};
const modules={
 'server-only':{}, 'node:crypto':crypto, '@supabase/supabase-js':{createClient:()=>client},
 './driver-device-push-notification':{sendDriverDevicePushAlertForDriverPoolOffer:async(_c,input)=>{sends.push(input);return {ok:true,provider_request_count:1};}},
};
function load(file, imports){const testModule={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;new Function('require','module','exports',js)((name)=>{assert.ok(name in imports,`Unmocked import: ${name}`);return imports[name];},testModule,testModule.exports);return testModule.exports;}
try {
 Object.assign(process.env,{PRESTIGE_DRIVER_POOL_ENABLED:'true',PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:'true',SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic'});
 assert.match(fs.readFileSync('app/page.tsx','utf8'), /reviewResponses = false[\s\S]*?focusDriverJobLink: !reviewResponses[\s\S]*?setDispatchLoadFocusTarget\("driverPoolResponses"\)/);
 const helper=load('lib/driver-pool-fast-accept.ts',modules);
 const publish={booking_reference:'POOL-QA',expected_updated_at:offer.updated_at,offer_payout_sgd:100,idempotency_key:crypto.randomUUID(),vehicle_requirement:'AVF',selected_driver_ids:[5,2,1]};
 assert.deepEqual(helper.parseDriverPoolPublishPayload(publish).data.selected_driver_ids,[1,2,5]);
 for(const ids of [undefined,[],[1,1],[0],[-1],['1'],[null],[1.5]]) assert.equal(helper.parseDriverPoolPublishPayload({...publish,selected_driver_ids:ids}).ok,false);
 for(const count of [1,5,6,10,11,20,50,201,500]) assert.equal(helper.parseDriverPoolPublishPayload({...publish,selected_driver_ids:Array.from({length:count},(_,i)=>i+1)}).ok,true);
 assert.equal(helper.parseDriverPoolPublishPayload({...publish,customer_price:999}).ok,false);
 const direct={...publish,audience:'wider',selected_driver_ids:[]};
 assert.equal(helper.parseDriverPoolPublishPayload(direct).ok,true,'Direct wider pool must not require a selected offer');
 for(const invalid of [{...direct,selected_driver_ids:[1]},{...direct,selected_driver_ids:undefined},{...direct,audience:'everyone'},{...direct,audience:'selected'}]) assert.equal(helper.parseDriverPoolPublishPayload(invalid).ok,false);
 const award={action:'award',offer_key:offer.offer_key,expected_updated_at:offer.updated_at,idempotency_key:crypto.randomUUID(),driver_id:2};
 const widen={action:'widen',offer_key:offer.offer_key,expected_updated_at:offer.updated_at,idempotency_key:crypto.randomUUID(),booking_reference:'POOL-QA',offer_payout_sgd:100,vehicle_requirement:'AVF'};
 for (const vehicle of ['E / AVF','AVF','S','VVV','COMBI','AVF / VVV']) {
   for (const request of [publish,direct]) {
     const parsed=helper.parseDriverPoolPublishPayload({...request,vehicle_requirement:vehicle});
     assert.equal(parsed.ok,true,`Publish must accept explicit ${vehicle}`);
     assert.equal(parsed.data.vehicle_requirement,vehicle);
   }
   assert.equal(helper.parseDriverPoolAdminActionPayload({...widen,vehicle_requirement:vehicle}).ok,true,`Widen must retain ${vehicle}`);
 }
 for (const vehicle of ['AVF/VVV','VVV / AVF','avf / vvv','AVF / VVV ',['AVF','VVV'],null]) {
   assert.equal(helper.parseDriverPoolPublishPayload({...publish,vehicle_requirement:vehicle}).ok,false);
   assert.equal(helper.parseDriverPoolAdminActionPayload({...widen,vehicle_requirement:vehicle}).ok,false);
 }
 for(const request of [award,widen]) {assert.equal(helper.parseDriverPoolAdminActionPayload(request).ok,true);assert.equal(helper.parseDriverPoolAdminActionPayload({...request,actor_role:'admin'}).ok,false);}
 assert.equal(helper.parseDriverPoolDecisionPayload(award).ok,false,'Driver cannot submit Admin action/identity');
 rows={driver_job_bid_offers:offer,bookings:{driver_id:null,public_booking_reference:'99001',pickup_at:'2099-09-15T12:00:00Z'},driver_job_bids:[{driver_reference:'2',bid_status:'pending',safe_bid_context:{response:'available',customer_price:'SECRET'}}],drivers:[{id:2,driver_name:'Synthetic 2',plate_number:'QA1002',vehicle_type:'AVF',internal_notes:'SECRET'}]};
 const admin=await helper.loadAdminDriverPoolOffer(client,'POOL-QA');assert.equal(admin.ok,true);
 assert.equal(admin.data.offer.selection_mode,'first_accept');assert.equal(admin.data.offer.responses,undefined);assert.doesNotMatch(JSON.stringify(admin),/SECRET|DO_NOT_EXPOSE|safe_bid_context|safe_offer_context/);
 rows.driver_job_bid_offers={...offer,safe_offer_context:{selection_mode:'admin',audience:'wider'}};
 const widenedAdmin=await helper.loadAdminDriverPoolOffer(client,'POOL-QA');
 assert.equal(widenedAdmin.data.offer.selection_mode,'first_accept','historical widened offers must not show Admin winner selection');

 const originalRows=rows;
 const assignedOffer={...offer,offer_status:'assigned'};
 const savedWinner={driver_id:2,driver_name:'Synthetic 2',driver_plate_number:'QA1002',driver_payout_override:100,driver_payout_reason:'Driver Pool accepted fixed offer.',updated_at:offer.updated_at};
 for(const scenario of ['ready','changed','link','report','closed','wrong-winner','bad-payout']) {
   rows={driver_job_bid_offers:assignedOffer,bookings:{...savedWinner},driver_job_links:[],driver_job_status_events:[],driver_job_bids:[{driver_reference:'2'}]};
   if(scenario==='changed')rows.bookings.updated_at='2026-09-14T01:00:00Z';
   if(scenario==='link')rows.driver_job_links=[{booking_reference:'POOL-QA'}];
   if(scenario==='report')rows.driver_job_status_events=[{booking_reference:'POOL-QA'}];
   if(scenario==='closed')rows.bookings.admin_internal_status='cancelled';
   if(scenario==='wrong-winner')rows.driver_job_bids=[{driver_reference:'3'}];
   if(scenario==='bad-payout')rows.bookings.driver_payout_override=101;
   const checked=await helper.loadAdminDriverPoolOffer(client,'POOL-QA');
   assert.equal(checked.ok,true);assert.equal(checked.data.offer.assignment.can_cancel,scenario==='ready',scenario);
   assert.equal(checked.data.offer.assignment.driver_name,'Synthetic 2');
   assert.equal(checked.data.offer.assignment.blocked_reason===null,scenario==='ready',scenario);
   assert.doesNotMatch(JSON.stringify(checked.data.offer.assignment),/driver_payout|driver_id|contact|safe_offer_context/);
 }

 rows={driver_job_bid_offers:[{...assignedOffer,booking_reference:'POOL-QA',public_booking_reference:'99001',pickup_at:'2099-09-15T12:00:00Z'}],bookings:[{...savedWinner,booking_reference:'POOL-QA',internal_notes:'PRIVATE'}],driver_job_links:[],driver_job_status_events:[],driver_job_bids:[{driver_job_bid_offer_id:offer.id,driver_reference:'2'}]};
 const attention=await helper.loadAdminDriverPoolAttentionOffers(client,1,20);
 assert.equal(attention.ok,true);assert.equal(attention.data.items[0].assignment.can_cancel,true);
 assert.equal(attention.data.items[0].assignment.driver_name,'Synthetic 2');
 assert.doesNotMatch(JSON.stringify(attention),/PRIVATE|internal_notes|driver_payout_override/);
 rows.bookings[0].admin_internal_status='cancelled';
 const closedAttention=await helper.loadAdminDriverPoolAttentionOffers(client,1,20);
 assert.equal(closedAttention.data.items[0].assignment.can_cancel,false);
 assert.match(closedAttention.data.items[0].assignment.blocked_reason,/already closed/);
 rows=originalRows;
 rows.driver_job_bid_offers=offer;

 rpcResult={jobs:[{...offer,public_booking_reference:'99001',pickup_at:'2099-09-15T12:00:00Z',selection_mode:'admin',response_status:'awaiting_admin',customer_price:'SECRET',driver_names:['SECRET']}],has_more:false};
 const driver=await helper.loadAvailableDriverPoolJobs(client,2,1,20);assert.equal(driver.data.jobs[0].response_status,'awaiting_admin');assert.doesNotMatch(JSON.stringify(driver),/SECRET|driver_names|customer_price|recipient_count|responses/);
 rpcResult={ok:true,reason:'awaiting_admin'};
 const decision=await helper.decideDriverPoolOffer(client,2,award,'accept');assert.equal(decision.data.accepted,false);assert.equal(sends.length,0);
 assert.equal('p_actor_role' in calls.at(-1).input,false);
 for(const reason of ['not_eligible','schedule_conflict','vehicle_mismatch','response_required','no_longer_available']) {rpcResult={ok:false,reason};assert.equal((await helper.decideDriverPoolOffer(client,2,award,'accept')).ok,false);}
 const route=load('app/api/admin-driver-job-bid-offers/route.ts',{
  'next/server':{after:(cb)=>after.push(cb)},
  '../../../lib/admin-device-push-notification':{sendAdminDevicePushAlert:async(kind,input)=>sends.push({kind,...input})},
  '../../../lib/admin-booking-supabase-adapter':{adminDispatcherBoundaryToPersistenceAdapterActor:()=>actor},
  '../../../lib/admin-dispatcher-auth-boundary':{adminBookingPersistencePurpose:'admin-booking-persistence',resolveAdminDispatcherBoundary:()=>authorized?{ok:true,context:{}}:{ok:false,error:'Unauthorized'}},
  '../../../lib/driver-device-push-notification':{...modules['./driver-device-push-notification'],sendDriverDeviceSilentRefreshForDriverPoolOffer:async(_c,input)=>sends.push({silent:true,...input})},
  '../../../lib/driver-pool-fast-accept':helper,
 });
 const request=(body,method='PATCH')=>new Request('https://synthetic.invalid/api/admin-driver-job-bid-offers',{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 authorized=false;let count=calls.length;assert.equal((await route.PATCH(request(award))).status,403);assert.equal(calls.length,count);authorized=true;
 for(const bad of [{...award,driver_id:'2'},{...award,driver_id:-1},{...widen,selected_driver_ids:[6]},{...award,expected_updated_at:'bad'}]) assert.equal((await route.PATCH(request(bad))).status,400);
 rpcResult={ok:true,reason:'accepted',public_booking_reference:'99001',other_recipient_driver_ids:[1,3,4,5]};rows.drivers={plate_number:'QA1002'};
 assert.equal((await route.PATCH(request(award))).status,200);assert.equal(calls.at(-1).input.p_actor_role,'admin');assert.equal(calls.at(-1).input.p_driver_id,2);
 assert.equal(after.length,1);await after.pop()();assert.equal(sends.filter(s=>s.notification_kind==='winner').length,1);assert.equal(sends.filter(s=>s.silent).length,4);assert.equal(sends.filter(s=>s.kind==='driver_pool_accepted').length,1);
 sends.length=0;rpcResult={ok:true,reason:'already_accepted',public_booking_reference:'99001'};await route.PATCH(request(award));assert.equal(after.length,0);assert.equal(sends.length,0);
 rpcResult={ok:false,reason:'schedule_conflict'};assert.equal((await route.PATCH(request(award))).status,409);assert.equal(after.length,0);
 rpcResult={offer:{...offer,safe_offer_context:{selection_mode:'admin',audience:'wider'},recipient_count:8},recipient_driver_ids:[6,7,8],idempotent:false};
 assert.equal((await route.PATCH(request(widen))).status,200);assert.deepEqual(sends.map(s=>s.driver_id),[6,7,8]);assert.equal(calls.at(-1).input.p_offer_key,offer.offer_key);assert.equal(calls.at(-1).input.p_selected_driver_ids,null);
 sends.length=0;rpcResult.idempotent=true;await route.PATCH(request(widen));assert.equal(sends.length,0);
 // Direct all-driver POST shares the one RPC and notifies only its exact result, once.
 rpcResult={offer:{...offer,safe_offer_context:{selection_mode:'first_accept',audience:'wider'},recipient_count:3},recipient_driver_ids:[6,7,8],idempotent:false};
 count=calls.length;assert.equal((await route.POST(request(direct,'POST'))).status,200);
 assert.equal(calls.length,count+1);assert.equal(calls.at(-1).name,'publish_driver_pool_offer');
 assert.deepEqual(calls.at(-1).input.p_selected_driver_ids,[]);assert.equal(calls.at(-1).input.p_offer_key,null);
 assert.deepEqual(sends.map(s=>s.driver_id),[6,7,8]);
 sends.length=0;rpcResult.idempotent=true;assert.equal((await route.POST(request(direct,'POST'))).status,200);assert.equal(sends.length,0);
 count=calls.length;assert.equal((await route.POST(request({...direct,selected_driver_ids:undefined},'POST'))).status,400);assert.equal(calls.length,count);
 // Combined requirement traverses the same real Admin routes and exact notification recipient result.
 for(const [method,payload] of [['POST',publish],['POST',direct],['PATCH',widen]]) {
  sends.length=0;
  rpcResult={offer:{...offer,safe_vehicle_label:'AVF / VVV'},recipient_driver_ids:[1,2],idempotent:false};
  const result=await route[method](request({...payload,vehicle_requirement:'AVF / VVV'},method));
  assert.equal(result.status,200);assert.equal((await result.json()).offer.safe_vehicle_label,'AVF / VVV');
  assert.equal(calls.at(-1).name,'publish_driver_pool_offer');assert.equal(calls.at(-1).input.p_vehicle_requirement,'AVF / VVV');
  assert.deepEqual(sends.map(s=>s.driver_id),[1,2]);
  sends.length=0;rpcResult.idempotent=true;
  await route[method](request({...payload,vehicle_requirement:'AVF / VVV'},method));assert.equal(sends.length,0);
 }
 // Larger selected audiences use the same publisher and exact existing notification sender.
 for(const n of [11,20,50,201,500]) {
  const ids=Array.from({length:n},(_,i)=>2*i+1);sends.length=0;
  rpcResult={offer:{...offer,recipient_count:n,safe_offer_context:{selection_mode:'first_accept',audience:'selected'}},recipient_driver_ids:ids,idempotent:false};
  assert.equal((await route.POST(request({...publish,selected_driver_ids:ids},'POST'))).status,200);
  assert.deepEqual(calls.at(-1).input.p_selected_driver_ids,ids);assert.deepEqual(sends.map(s=>s.driver_id),ids);
  sends.length=0;rpcResult.idempotent=true;
  assert.equal((await route.POST(request({...publish,selected_driver_ids:ids},'POST'))).status,200);assert.equal(sends.length,0);
 }
 // Actual Driver route: availability, decline and denied business outcomes never schedule winner sends.
 const driverRoute=load('app/api/driver-job-bids/route.ts',{
  'next/server':{after:cb=>after.push(cb)},
  '../../../lib/admin-device-push-notification':{sendAdminDevicePushAlert:async(kind,input)=>sends.push({kind,...input})},
  '../../../lib/driver-account-device-lock':{verifyDriverAccountSession:async()=>verified},
  '../../../lib/driver-device-push-notification':{...modules['./driver-device-push-notification'],sendDriverDeviceSilentRefreshForDriverPoolOffer:async(_c,input)=>sends.push({silent:true,...input})},
  '../../../lib/driver-pool-fast-accept':helper,
  '../../../lib/driver-portal-session':{resolveDriverPortalSession:()=>({ok:true,claims:{accountId:'qa',deviceIdHash:'a'.repeat(64),driverId:2,issuedAt:1}}),clearDriverPortalSessionCookie:()=>''},
 });
 const driverRequest=(body)=>new Request('https://synthetic.invalid/api/driver-job-bids',{method:'POST',headers:{'content-type':'application/json',referer:'https://synthetic.invalid/driver-portal','x-prestige-driver-purpose':'driver-pool-offer-accept'},body:JSON.stringify(body)});
 const safeDecision={offer_key:offer.offer_key,expected_updated_at:offer.updated_at,idempotency_key:crypto.randomUUID()};
 rpcResult={ok:true,reason:'awaiting_admin'};let response=await driverRoute.POST(driverRequest(safeDecision));assert.equal(response.status,200);assert.equal((await response.json()).accepted,false);assert.equal(after.length,0);

 sends.length=0;rows.drivers={plate_number:'QA1002'};
 rpcResult={ok:true,reason:'accepted',public_booking_reference:'99001',other_recipient_driver_ids:[1,3]};
 response=await driverRoute.POST(driverRequest(safeDecision));assert.equal(response.status,200);assert.equal((await response.json()).accepted,true);
 assert.equal(after.length,1);await after.pop()();
 assert.deepEqual(sends.filter(s=>s.notification_kind==='winner').map(s=>s.driver_id),[2]);
 assert.deepEqual(sends.filter(s=>s.silent).map(s=>s.driver_id),[1,3]);
 assert.equal(sends.filter(s=>s.kind==='driver_pool_accepted').length,1);
 for(const reason of ['already_accepted','no_longer_available','schedule_conflict']) {
   sends.length=0;rpcResult={ok:reason==='already_accepted',reason,public_booking_reference:'99001',other_recipient_driver_ids:[]};
   await driverRoute.POST(driverRequest(safeDecision));assert.equal(after.length,0);assert.equal(sends.length,0);
 }
 assert.equal((await driverRoute.POST(driverRequest(award))).status,400);
 verified=false;count=calls.length;assert.equal((await driverRoute.POST(driverRequest(safeDecision))).status,401);assert.equal(calls.length,count);
 console.log('Driver Pool Admin selection guard passed: strict inputs, recipient privacy, first-accept mode, verified historical award/widen routes, rejected/stale business results and exact mocked notification recipients.');
} finally { for(const key of Object.keys(process.env)) if(!(key in env)) delete process.env[key];Object.assign(process.env,env); }
