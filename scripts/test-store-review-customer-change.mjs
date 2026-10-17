import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),ts=require('typescript');
const site='https://app.prestigelimo.sg',calls=[],effects=[];
const scope={bookingIds:[9001,9002],bookingReferences:['QA-ADMIN','QA-DRIVER'],companyId:901,bookerId:902,customerId:903,driverId:904,travelerIds:[905],adminSaveBookingReference:'QA-ADMIN',driverLinkBookingReference:'QA-DRIVER',bookingTargets:[{bookingId:9001,bookingReference:'QA-ADMIN',travelerId:905},{bookingId:9002,bookingReference:'QA-DRIVER',travelerId:905}]};
const roles=['admin','driver','customer'];
const config={version:1,databaseOrigin:'https://fixture.supabase.co',expiresAt:'2099-01-01T00:00:00Z',scope,credentials:Object.fromEntries(roles.map((r,i)=>[r,createHash('sha256').update(String.fromCharCode(97+i).repeat(43)).digest('hex')])),hostedAccess:{enabled:true,origin:site,ownerSetupEnabled:false}};
const env={NODE_ENV:'production',VERCEL_ENV:'production',SUPABASE_URL:config.databaseOrigin,SUPABASE_SERVICE_ROLE_KEY:'synthetic-only-not-a-real-credential',PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET:'synthetic-secret'.repeat(5),PRESTIGE_STORE_REVIEW_ACCESS:JSON.stringify(config)};
function load(file,imports={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports,process:{env},Buffer,URL,URLSearchParams,Request,Response,Headers,Date,fetch:()=>{throw Error("Unexpected network")},require:n=>n==='server-only'?{}:imports[n]??(n.startsWith('node:')?require(n):{})});return m.exports;}
const access=load('lib/store-review-access.ts');
const payload={booking_reference:'QA-ADMIN',request_kind:'amendment',request_note:'QA change',requested_pickup_location:'QA alternative pickup'};
function request(body=payload,role='customer',headers={}){return new Request(site+'/api/customer-booking-change-requests',{method:'POST',headers:{cookie:access.issueStoreReviewSession(role,String.fromCharCode(97+roles.indexOf(role)).repeat(43)),origin:site,referer:site+'/my-bookings','x-prestige-customer-purpose':'customer-booking-change-request','content-type':'application/json',...headers},body:JSON.stringify(body)});}
const request0=request();const session=access.resolveStoreReviewSession(request0.headers.get('cookie'));assert.equal(session.state,'valid');
assert.equal(access.storeReviewRequestAllowed(session,'/api/customer-booking-change-requests','POST',request0),true,'Existing QA Customer request action must be reachable');
const notification=load('lib/admin-app-notification-persistence.ts',{'./store-review-access':access,'@supabase/supabase-js':{createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:{id:'00000000-0000-0000-0000-000000000001',safe_title:'QA request',safe_message:'QA change',booking_reference:'QA-ADMIN'},error:null}}})}});
const route=load('app/api/customer-booking-change-requests/route.ts',{
 '../../../lib/store-review-access':access,
 '../../../lib/admin-app-notification-persistence':notification,
 '../../../lib/customer-saved-bookings-read':{resolveCustomerSavedBookingsBoundaryForPurpose:()=>{throw Error('Ordinary boundary is forbidden for QA')},loadCustomerSavedBookings:async(params,context)=>{assert.equal(context.review.role,'customer');assert.equal(params.get('booking_reference'),'QA-ADMIN');return{ok:true,data:{saved_bookings:[{booking_reference:'QA-ADMIN',passenger_name:'QA passenger',customer_facing_status:'received',updated_at:'2026-10-17T00:00:00Z',pickup_at:'2026-12-16T04:00:00Z',pickup_location:'QA pickup',dropoff_location:'QA dropoff',service_type:'City Transfer'}]}}}},
 '../../../lib/admin-booking-change-request-email-alert':{sendAdminBookingChangeRequestEmailAlert:()=>{effects.push('email');throw Error('QA must not email')}},
 '../../../lib/codex-job-card-auto-preparation':{prepareCodexJobCardForAdminReview:()=>{effects.push('preparation');throw Error('QA must not enter operational preparation')}},
});
for(const body of [payload,{booking_reference:'QA-ADMIN',request_kind:'cancellation',request_note:'QA cancellation'}]){const response=await route.POST(request(body));assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).request.calendar_update,false);}
assert.equal(calls.length,2);assert.ok(calls.every(c=>c.name==='save_customer_reviewer_qa_change_request'&&c.args.p_booking_id===9001&&c.args.p_company_id===901));
for(const body of [{...payload,booking_reference:'REAL'}, {...payload,booking_reference:'QA-DRIVER'}, {...payload,driver_id:1}]) assert.notEqual((await route.POST(request(body))).status,200);
for(const role of ['admin','driver'])assert.equal((await route.POST(request(payload,role))).status,403);
for(const headers of [{origin:'https://foreign.example'},{referer:site+'/'},{'x-prestige-customer-purpose':'wrong'}])assert.equal((await route.POST(request(payload,'customer',headers))).status,403);
assert.equal(calls.length,2);assert.deepEqual(effects,[]);
for(const role of roles){const r=request(payload,role);const s=access.resolveStoreReviewSession(r.headers.get('cookie'));for(const p of ['/api/admin-booking-calendar-google-sync','/api/driver-job/review-9002/calendar','/api/driver-google-calendar-oauth/callback','/api/driver-google-calendar-oauth/native-start','/api/admin-booking-calendar-events'])for(const method of ['GET','POST','PATCH','DELETE'])assert.equal(access.storeReviewRequestAllowed(s,p,method,r),false);}
console.log('PASS QA amendment/cancel intake uses the exact server-owned target and RPC; forbidden targets/roles/origins/extra fields and Calendar routes denied.');

// QA notifications are queried with exact server-owned scope before pagination.
const readRequest=new Request(site+'/api/admin-app-notifications',{headers:{cookie:access.issueStoreReviewSession('admin','a'.repeat(43)),origin:site,referer:site+'/', 'x-prestige-admin-purpose':'admin-booking-persistence'}});
const admin=access.resolveStoreReviewSession(readRequest.headers.get('cookie'));
assert.equal(access.storeReviewRequestAllowed(admin,'/api/admin-app-notifications','GET',readRequest),true);
for(const method of ['POST','PATCH','DELETE'])assert.equal(access.storeReviewRequestAllowed(admin,'/api/admin-app-notifications',method,readRequest),false);
const transport=[];
await access.storeReviewReadFetch(admin,config.databaseOrigin,async(input)=>{transport.push(new URL(input));return Response.json([])})(config.databaseOrigin+'/rest/v1/admin_app_notification_outbox?booking_reference=eq.FOREIGN');
const params=transport[0].searchParams;
for(const [key,value] of Object.entries({booking_reference:'eq.QA-ADMIN',actor_label:'eq.store-review-customer-request','safe_context->>review_company_id':'eq.901','safe_context->>review_booker_id':'eq.902','safe_context->>review_customer_id':'eq.903','safe_context->>review_driver_id':'eq.904','safe_context->>review_traveler_id':'in.(905)'}))assert.ok(params.getAll(key).includes(value),key);
for(const role of ['customer','driver']) {const r=request(payload,role),ss=access.resolveStoreReviewSession(r.headers.get('cookie'));await assert.rejects(()=>access.storeReviewReadFetch(ss,config.databaseOrigin)(config.databaseOrigin+'/rest/v1/admin_app_notification_outbox'));}
assert.equal((await notification.createCustomerBookingChangeRequestAdminAppNotification({booking_reference:'QA-ADMIN',request_kind:'amendment'}, {proof:{booking:scope.bookingTargets[0]},expectedUpdatedAt:'2026-10-17T00:00:00Z'})).status,403);
console.log('PASS QA notification scope and separate unforgeable write capability; no email/preparation effect.');
// Execute existing Admin GET -> reader -> actual installed SDK with scoped transport.
const readCalls=[];
async function readTransport(input,init){const u=new URL(input);assert.equal(init.method,'GET');assert.equal(u.origin,config.databaseOrigin);assert.equal(u.pathname,'/rest/v1/admin_app_notification_outbox');readCalls.push(u);return new Response('[]',{status:200,headers:{'content-type':'application/json','content-range':'0-0/0'}});}
const scopedAccess={...access,storeReviewReadFetch:(s,o)=>access.storeReviewReadFetch(s,o,readTransport)};
const actor={actor_label:'Store reviewer',actor_role:'admin',source_surface:'admin_api',boundary_mode:'server-session-role-surface'};
env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED='true';
const reader=load('lib/admin-app-notification-persistence.ts',{'./store-review-access':scopedAccess,'./admin-booking-supabase-adapter':{checkAdminBookingPersistenceStagingConfigReadiness:()=>({ok:true})},'@supabase/supabase-js':{createClient:(url,key,opts)=>require('@supabase/supabase-js').createClient(url,key,{...opts,global:{fetch:opts.global?.fetch??readTransport}})}});
const getRoute=load('app/api/admin-app-notifications/route.ts',{'../../../lib/store-review-access':access,'../../../lib/admin-app-notification-persistence':reader,'../../../lib/admin-dispatcher-auth-boundary':{adminBookingPersistencePurpose:'admin-booking-persistence',resolveAdminDispatcherBoundary:()=>({ok:false,error:'ordinary blocked'})},'../../../lib/admin-booking-supabase-adapter':{adminDispatcherBoundaryToPersistenceAdapterActor:()=>actor}});
assert.equal((await getRoute.GET(readRequest)).status,200);assert.equal(readCalls.length,1);assert.ok(readCalls[0].searchParams.getAll('booking_reference').includes('eq.QA-ADMIN'));assert.equal(readCalls[0].searchParams.get('actor_label'),'eq.store-review-customer-request');
assert.equal((await reader.loadAdminAppNotifications(new URLSearchParams(),actor)).ok,true);assert.equal(readCalls.at(-1).searchParams.get('or'),'(actor_label.is.null,actor_label.neq.store-review-customer-request)');
const beforeReads=readCalls.length;
for(const role of ['customer','driver']){const bad=new Request(readRequest,{headers:{cookie:access.issueStoreReviewSession(role,String.fromCharCode(97+roles.indexOf(role)).repeat(43)),referer:site+'/',origin:site,'x-prestige-admin-purpose':'admin-booking-persistence'}});assert.equal((await getRoute.GET(bad)).status,403);}
assert.equal(readCalls.length,beforeReads);
console.log('PASS actual Admin GET/reader/SDK scopes QA notifications; normal owner queue excludes only new QA marker.');
