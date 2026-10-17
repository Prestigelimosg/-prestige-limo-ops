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
const env={NODE_ENV:'production',VERCEL_ENV:'production',SUPABASE_URL:config.databaseOrigin,SUPABASE_SERVICE_ROLE_KEY:'synthetic-only-not-a-real-credential',PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:'true',PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET:'synthetic-secret'.repeat(5),PRESTIGE_STORE_REVIEW_ACCESS:JSON.stringify(config)};
function load(file,imports={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports,process:{env},Buffer,URL,URLSearchParams,Request,Response,Headers,Date,fetch:()=>{throw Error("Unexpected network")},require:n=>n==='server-only'?{}:imports[n]??(n.startsWith('node:')?require(n):{})});return m.exports;}
const access=load('lib/store-review-access.ts');

const id='00000000-0000-4000-8000-000000000001';
function request(body={notification_id:id,notification_status:'archived'},role='admin',headers={}){return new Request(site+'/api/admin-app-notifications',{method:'PATCH',headers:{cookie:access.issueStoreReviewSession(role,String.fromCharCode(97+roles.indexOf(role)).repeat(43)),origin:site,referer:site+'/', 'x-prestige-admin-purpose':'admin-booking-persistence','content-type':'application/json',...headers},body:JSON.stringify(body)});}
const persisted={id,booking_reference:'QA-ADMIN',notification_status:'archived',actor_label:'store-review-customer-request',safe_context:{review_booking_id:'9001',review_company_id:'901',review_booker_id:'902',review_customer_id:'903',review_driver_id:'904',review_traveler_id:'905'}};
const persistence=load('lib/admin-app-notification-persistence.ts',{'./store-review-access':access,'@supabase/supabase-js':{createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:{...persisted,notification_status:args.p_status},error:null}}})}});
const route=load('app/api/admin-app-notifications/route.ts',{'../../../lib/store-review-access':access,'../../../lib/admin-app-notification-persistence':persistence,'../../../lib/admin-dispatcher-auth-boundary':{adminBookingPersistencePurpose:'admin-booking-persistence',resolveAdminDispatcherBoundary:()=>({ok:false,error:'ordinary boundary denied'})}});
const response=await route.PATCH(request());
assert.equal(response.status,200,'Existing QA Reject/Dismiss must close only its own notification');
assert.equal((await response.json()).notification.actor_label,persisted.actor_label);
for(const status of ['read','dismissed'])assert.equal((await route.PATCH(request({notification_id:id,notification_status:status}))).status,200);
assert.equal(calls.length,3);
for(const call of calls){assert.equal(call.name,'update_admin_reviewer_qa_notification');assert.equal(call.args.p_booking_id,9001);assert.equal(call.args.p_customer_id,903);assert.equal(call.args.p_notification_id,id);}
for(const body of [{notification_id:id,notification_status:'queued'},{notification_id:id,notification_status:'archived',booking_id:8001},{notification_id:'not-id',notification_status:'archived'}])assert.notEqual((await route.PATCH(request(body))).status,200);
for(const role of ['customer','driver'])assert.equal((await route.PATCH(request(undefined,role))).status,403);
for(const headers of [{origin:'https://foreign.example'},{referer:site+'/my-bookings'},{'x-prestige-admin-purpose':'wrong'}])assert.equal((await route.PATCH(request(undefined,'admin',headers))).status,403);
assert.equal(calls.length,3);
const req=request(),session=access.resolveStoreReviewSession(req.headers.get('cookie'));
assert.equal(access.storeReviewRequestAllowed(session,'/api/admin-app-notifications','PATCH',req),true);
for(const path of ['/api/admin-booking-calendar-google-sync','/api/driver-job/review-9002/calendar','/api/admin-bookings'])assert.equal(access.storeReviewRequestAllowed(session,path,'PATCH',new Request(site+path,req)),false);
assert.equal((await persistence.updateStoreReviewAdminNotification({}, {notification_id:id,notification_status:'archived'})).status,403);
console.log('PASS actual Admin PATCH: exact server-owned scope; existing close/read status; forged proof, extra body, role, origin, purpose and Calendar denial.');
