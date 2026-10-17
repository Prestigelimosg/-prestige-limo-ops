// Missing hosted-runtime gate checks only. All requests/data are synthetic; network forbidden.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=process.cwd(),require=createRequire(root+'/package.json'),ts=require('typescript');
const origin='https://app.prestigelimo.sg',local='http://localhost:3131';
const roles=['admin','driver','customer'],codes=Object.fromEntries(roles.map((r,i)=>[r,String(i).repeat(43)]));
const scope={bookingIds:[9001,9002],bookingReferences:['QA-DRIVER-SYNTHETIC','QA-ADMIN-SYNTHETIC'],companyId:901,bookerId:902,customerId:903,driverId:904,travelerIds:[905],
  adminSaveBookingReference:'QA-ADMIN-SYNTHETIC',driverLinkBookingReference:'QA-DRIVER-SYNTHETIC',bookingTargets:[{bookingId:9001,bookingReference:'QA-DRIVER-SYNTHETIC',travelerId:905},{bookingId:9002,bookingReference:'QA-ADMIN-SYNTHETIC',travelerId:905}]};
const config={version:1,databaseOrigin:'https://fixture.supabase.co',expiresAt:new Date(Date.now()+86400000).toISOString(),scope,
  credentials:Object.fromEntries(roles.map(r=>[r,createHash('sha256').update(codes[r]).digest('hex')])),
  hostedAccess:{enabled:true,origin,ownerSetupEnabled:false}};
const env={NODE_ENV:'production',VERCEL_ENV:'production',SUPABASE_URL:config.databaseOrigin,SUPABASE_SERVICE_ROLE_KEY:'synthetic-only',
  PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET:'synthetic-only-'.repeat(5),PRESTIGE_ADMIN_ACCOUNT_AUTH_ENABLED:'true',
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:'true',PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED:'true',PRESTIGE_STORE_REVIEW_ACCESS:JSON.stringify(config)};
const cache=new Map(),stubs={},effects=[],rpcCalls=[];
const blockedFetch=()=>{throw Error('Network access forbidden in hosted-gate proof');};
function load(relative){
  if(stubs[relative])return stubs[relative];if(cache.has(relative))return cache.get(relative).exports;
  const file=path.join(root,relative),mod={exports:{}};cache.set(relative,mod);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module:mod,exports:mod.exports,Buffer,URL,URLSearchParams,Request,Response,Headers,Date,structuredClone,console,process:{env},fetch:blockedFetch,
    require(n){if(n==='server-only')return{};if(n.startsWith('node:'))return require(n);if(n==='@supabase/supabase-js')return{createClient:()=>client};
      if(n.startsWith('.')){const p=path.relative(root,path.resolve(path.dirname(file),n));return load(p.endsWith('.ts')?p:p+'.ts');}throw Error('Unexpected import '+n);}}, {filename:file});return mod.exports;
}
const review=load('lib/store-review-access.ts');
function configure(value=config){env.PRESTIGE_STORE_REVIEW_ACCESS=JSON.stringify(value);}
const cookie=role=>review.issueStoreReviewSession(role,codes[role]);
function request({role='driver',method='GET',pathname='/api/driver-job/review-9001',site=origin,referer='/driver-portal',body,headers={}}={}){
  return new Request(site+pathname,{method,headers:{cookie:cookie(role)||'',referer:site+referer,...(method==='GET'?{}:{origin:site}),'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
// Recorded before application edits: current intentional production hold rejects this exact opt-in.
assert.equal(review.resolveStoreReviewJobRequest(request(),'review-9001').state,'review','Explicit hosted opt-in must reach the exact existing QA Driver branch');
if(process.argv.includes('--before'))process.exit(0);
const checks=[],pass=n=>{checks.push(n);console.log('PASS '+n)};
// Additional gate, request-path and production-compiled callback cases follow below.
const authPaths={admin:'/api/admin-auth/session',driver:'/api/driver-auth/session',customer:'/api/customer-principal-access'};
const referers={admin:'/',driver:'/driver-portal',customer:'/my-bookings'};
for(const role of roles){
 const r=request({role,method:'POST',pathname:authPaths[role],referer:referers[role],headers:{'x-prestige-admin-auth-purpose':'admin-account-sign-in','x-prestige-driver-purpose':'driver-account-sign-in'}});
 const response=review.storeReviewAuthResponse(r,role,{action:'reviewer_sign_in',access_code:codes[role]});
 assert.equal(response.status,200);assert.equal(review.resolveStoreReviewSession(cookie(role)).role,role);
 assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
 assert.match(response.headers.get('set-cookie'),/prestige_admin_account_session=;.*Max-Age=0/);
 assert.equal(review.issueStoreReviewSession(role,codes[roles[(roles.indexOf(role)+1)%3]]),null);
}
pass('Three separate roles sign in only through existing purpose checks; ordinary cookies cleared');
const savedCookie=cookie('driver');
const closedConfigs=[{...config,hostedAccess:undefined},{...config,hostedAccess:{...config.hostedAccess,enabled:false}},
 {...config,hostedAccess:{...config.hostedAccess,enabled:'true'}},{...config,hostedAccess:{...config.hostedAccess,origin:origin+'/'}},
 {...config,hostedAccess:{...config.hostedAccess,origin:'https://foreign.invalid'}},{...config,hostedAccess:{...config.hostedAccess,extra:true}},
 {...config,scope:{...scope,driverLinkBookingReference:undefined}},{...config,scope:{...scope,adminSaveBookingReference:undefined}},
 {...config,expiresAt:'2000-01-01T00:00:00Z'}];
for(const c of closedConfigs){configure(c);assert.equal(cookie('driver'),null);assert.equal(review.resolveStoreReviewSession(savedCookie).state,'invalid');
 assert.equal(review.resolveStoreReviewJobRequest(request({headers:{cookie:savedCookie,'x-forwarded-host':'app.prestigelimo.sg'}}),'review-9001').state,'blocked');}
configure();
for(const [node,vercel] of [['production',undefined],['production','preview'],['development','production'],['test','preview'],[undefined,undefined]]){
 env.NODE_ENV=node;env.VERCEL_ENV=vercel;assert.equal(review.storeReviewRequestOriginAllowed(request({headers:{cookie:savedCookie}})),false);
}
env.NODE_ENV='production';env.VERCEL_ENV='production';
for(const site of [local,'http://app.prestigelimo.sg','https://app.prestigelimo.sg:444','https://evil.app.prestigelimo.sg','https://foreign.invalid']){
 assert.equal(review.storeReviewRequestOriginAllowed(request({site,headers:{host:'app.prestigelimo.sg','x-forwarded-host':'app.prestigelimo.sg'}})),false);
}
pass('Default-off, malformed, expired, preview and foreign-origin configurations fail closed');
const adminRequest=(extra={})=>request({role:'admin',method:'PATCH',pathname:'/api/admin-bookings',referer:'/',headers:{'x-prestige-admin-purpose':'admin-qa-bags-save'},...extra});
const driverProof=review.resolveStoreReviewJobRequest(request(),'review-9001').proof;
const adminProof=review.resolveStoreReviewAdminSaveRequest(adminRequest()).proof;
assert.equal(driverProof.booking.bookingId,9001);assert.equal(adminProof.booking.bookingId,9002);
assert.equal(review.isStoreReviewBookingProof(driverProof),true);assert.equal(review.isStoreReviewAdminSaveProof(adminProof),true);
assert.equal(review.isStoreReviewBookingProof({...driverProof}),false);assert.equal(review.isStoreReviewAdminSaveProof(driverProof),false);
assert.equal(review.isStoreReviewBookingProof(adminProof),false);assert.equal(review.isStoreReviewAdminSaveProof({...adminProof}),false);
for(const role of ['admin','customer'])assert.equal(review.resolveStoreReviewJobRequest(request({role}),'review-9001').state,'blocked');
for(const role of ['driver','customer'])assert.equal(review.resolveStoreReviewAdminSaveRequest(adminRequest({role})).state,'blocked');
for(const extra of [{pathname:'/api/driver-job/review-9002'},{pathname:'/api/driver-job/review-9001?x=1'},
 {pathname:'/api/driver-job/ordinary-token'},{method:'DELETE'},{referer:'/'},{headers:{referer:''}},
 {headers:{origin:'https://foreign.invalid'}},{headers:{referer:'https://foreign.invalid/driver-portal'}},
 {method:'PATCH',headers:{origin:''}}])assert.equal(review.resolveStoreReviewJobRequest(request(extra),'review-9001').state,'blocked');
assert.equal(review.resolveStoreReviewJobRequest(request({method:'PATCH',referer:'/driver-job/review-9001'}),'review-9001').state,'review');
for(const extra of [{method:'GET'},{referer:'/customers'},{pathname:'/api/admin-bookings?x=1'},
 {headers:{'x-prestige-admin-purpose':'admin-qa-bags-save',origin:''}},
 {headers:{'x-prestige-admin-purpose':'admin-qa-bags-save',referer:'https://foreign.invalid/'}}]){
 assert.equal(review.resolveStoreReviewAdminSaveRequest(adminRequest(extra)).state,'blocked');
}
for(const role of roles){
 const session=review.resolveStoreReviewSession(cookie(role));
 for(const pathname of ['/api/admin-bookings','/api/admin-driver-job-links','/api/driver-job/review-9001/calendar','/api/driver-job/review-9001/location','/api/driver-live-location','/api/customer-invoices','/api/payments','/api/driver-portal/messages','/customers']){
  for(const method of ['GET','POST','PATCH','DELETE'])assert.equal(review.storeReviewRequestAllowed(session,pathname,method,request({role,pathname,method})),false,role+' '+method+' '+pathname);
 }
 for(const pathname of ({admin:['/','/api/admin-saved-bookings'],driver:['/driver-portal','/api/driver-portal/jobs','/driver-job/review-9001'],customer:['/my-bookings','/api/customer-saved-bookings','/api/customer-principal-access']})[role]){
  assert.equal(review.storeReviewRequestAllowed(session,pathname,'GET',request({role,pathname})),true);
 }
}
assert.equal(review.resolveStoreReviewAdminSaveRequest(new Request(origin+'/api/admin-bookings',{method:'PATCH'})).state,'ordinary');
assert.equal(review.resolveStoreReviewJobRequest(new Request(origin+'/api/driver-job/ordinary-token'),'ordinary-token').state,'ordinary');
pass('Role, exact target, origin/referer, method and QA-only API boundaries; ordinary no-review requests unchanged');
configure({...config,hostedAccess:{...config.hostedAccess,ownerSetupEnabled:true}});
assert.equal(review.resolveStoreReviewSession(savedCookie).state,'invalid');
assert.equal(review.isStoreReviewBookingProof(driverProof),false);assert.equal(review.isStoreReviewAdminSaveProof(adminProof),false);
configure();env.SUPABASE_URL='https://different.supabase.co';assert.equal(review.isStoreReviewBookingProof(driverProof),false);env.SUPABASE_URL=config.databaseOrigin;
configure({...config,hostedAccess:{...config.hostedAccess,enabled:false}});
const out=review.storeReviewAuthResponse(request({method:'DELETE',pathname:authPaths.driver,headers:{cookie:savedCookie,'x-prestige-review-purpose':'sign-out'}}),'driver');
assert.equal(out.status,200);assert.match(out.headers.get('set-cookie'),/Max-Age=0/);configure();
pass('Config revision, database mismatch and switch-off revoke existing authority; logout still clears cookie');
const boundary=load('lib/admin-dispatcher-auth-boundary.ts');
const ownerCookie=role=>boundary.issueAdminAccountSession({accountId:'11111111-1111-4111-8111-111111111111',authUserId:'22222222-2222-4222-8222-222222222222',actorLabel:'Synthetic owner',role});
const actor={actor_role:'admin',boundary_mode:'server-session-role-surface'};
const ownerRequest=(headers={})=>request({method:'POST',pathname:'/api/admin-driver-job-links',referer:'/',headers:{cookie:ownerCookie('admin'),'x-prestige-review-setup':'driver-qa-link',...headers}});
assert.equal(review.resolveStoreReviewLinkSetupRequest(ownerRequest(),actor).state,'blocked');
configure({...config,hostedAccess:{...config.hostedAccess,ownerSetupEnabled:true}});
const ownerProof=review.resolveStoreReviewLinkSetupRequest(ownerRequest(),actor).proof;
assert.equal(ownerProof.booking.bookingId,9001);assert.equal(review.isStoreReviewLinkSetupProof(ownerProof),true);
for(const headers of [{cookie:ownerCookie('dispatcher')},{cookie:cookie('admin')},{cookie:ownerCookie('admin')+'; '+cookie('driver')},{origin:''},{'x-prestige-review-setup':'wrong'}]){
 assert.equal(review.resolveStoreReviewLinkSetupRequest(ownerRequest(headers),actor).state,'blocked');
}
assert.equal(review.resolveStoreReviewLinkSetupRequest(ownerRequest(),{...actor,actor_role:'dispatcher'}).state,'blocked');
assert.equal(review.isStoreReviewAdminSaveProof(ownerProof),false);assert.equal(review.isStoreReviewLinkSetupProof({...ownerProof}),false);
configure();assert.equal(review.isStoreReviewLinkSetupProof(ownerProof),false);
env.NODE_ENV='development';delete env.VERCEL_ENV;configure({...config,hostedAccess:undefined});
assert.equal(review.resolveStoreReviewJobRequest(request({site:local}),'review-9001').state,'review');
env.NODE_ENV='production';env.VERCEL_ENV='production';configure();
pass('Owner-only setup has independent default-off switch; no reviewer/dispatcher escalation; local request gate preserved');
// Existing SQL/ownership/race suites are deliberately not repeated. These spies
// cover only new production-mode gate handoffs and throw on any ordinary escape.
const forbidden=name=>(...args)=>{effects.push({name,args});throw Error('Forbidden ordinary effect '+name);};
const allForbidden=name=>new Proxy({}, {get:(_,key)=>forbidden(name+'.'+String(key))});
stubs['lib/driver-device-push-notification.ts']=allForbidden('push');
const client={rpc:async(name,args)=>{rpcCalls.push({name,args});assert.equal(name,'save_admin_reviewer_qa_bags');return{data:{booking_reference:scope.adminSaveBookingReference,luggage_count:2,updated_at:'2026-10-16T01:00:01Z',noop:false},error:null};},from:forbidden('table access')};
const adapter=load('lib/admin-booking-supabase-adapter.ts');
const body={target_booking_reference:scope.adminSaveBookingReference,expected_updated_at:'2026-10-16T01:00:00Z',luggage_count:2};
const freshAdmin=()=>review.resolveStoreReviewAdminSaveRequest(adminRequest()).proof;
assert.equal((await adapter.saveStoreReviewAdminBags(freshAdmin(),body)).ok,true);
assert.deepEqual(JSON.parse(JSON.stringify(rpcCalls[0].args)),{p_booking_id:9002,p_booking_reference:scope.adminSaveBookingReference,p_company_id:901,p_booker_id:902,p_customer_id:903,p_traveler_id:905,p_driver_id:904,p_expected_updated_at:body.expected_updated_at,p_luggage_count:2});
for(const bad of [{...body,target_booking_reference:scope.driverLinkBookingReference},{...body,luggage_count:3},{...body,extra:true}])assert.equal((await adapter.saveStoreReviewAdminBags(freshAdmin(),bad)).ok,false);
const revoked=freshAdmin();configure({...config,hostedAccess:{...config.hostedAccess,enabled:false}});assert.equal((await adapter.saveStoreReviewAdminBags(revoked,body)).ok,false);configure();assert.equal(rpcCalls.length,1);
pass('Actual Admin adapter consumes hosted proof and sends only exact QA tuple to existing bags RPC; revoked proof has zero calls');
let acknowledged=false;const revision='a'.repeat(64),payload=()=>({acknowledged,assignedDriver:{name:'QA Driver',contact:'000',plate:'QA',vehicleModel:'Test'},acknowledgementRevision:revision});
const persistenceCalls=[];
stubs['lib/driver-job-status-persistence.ts']={getDriverJobStatusPersistenceClientForProduction:()=>({ok:true,client}),
 loadDriverJobPayloadThroughStatusPersistence:async({reviewBooking,token})=>{assert.equal(review.isStoreReviewBookingProof(reviewBooking),true);assert.equal(reviewBooking.booking.bookingId,9001);persistenceCalls.push({action:'read',token});return{ok:true,payload:payload()};},
 saveDriverJobDetailsThroughStatusPersistence:async({reviewBooking,token,expectedRevision})=>{assert.equal(review.isStoreReviewBookingProof(reviewBooking),true);assert.equal(reviewBooking.booking.bookingId,9001);assert.equal(expectedRevision,revision);persistenceCalls.push({action:'ack',token});acknowledged=true;return{ok:true,payload:payload()};}};
for(const dependency of ['driver-account-device-lock','driver-portal-jobs','driver-portal-session','driver-job-link-contract','driver-job-link-production','driver-job-link-mode','driver-job-link-mock-store'])stubs['lib/'+dependency+'.ts']=allForbidden(dependency);
const listRoute=load('app/api/driver-portal/jobs/route.ts'),jobRoute=load('app/api/driver-job/[token]/route.ts');
const listRequest=(extra={})=>request({pathname:'/api/driver-portal/jobs',headers:{'x-prestige-driver-purpose':'driver-portal-jobs-read'},...extra});
const listing=await(await listRoute.GET(listRequest())).json();
assert.equal(listing.jobs.length,1);assert.equal(listing.jobs[0].review_job_path,'/driver-job/review-9001');assert.equal(listing.alert_count,0);assert.equal(listing.device_alerts.enabled,false);
assert.equal(listing.native_badge_count,null);assert.equal(listing.alerts_available,false);
for(const extra of [{role:'customer'},{site:'https://foreign.invalid'}])assert.equal((await listRoute.GET(listRequest(extra))).status,403);
const jobContext={params:Promise.resolve({token:'review-9001'})};
assert.equal((await jobRoute.GET(request(),jobContext)).status,200);
const beforeDenied=persistenceCalls.length;
assert.equal((await jobRoute.PATCH(request({method:'PATCH',body:{action:'location',expected_revision:revision}}),jobContext)).status,403);
assert.equal(persistenceCalls.length,beforeDenied);
pass('Actual hosted Driver list and job routes use QA alias/proof; no alert, native, ordinary token or unrelated persistence calls');
function callback(file,name){const source=fs.readFileSync(path.join(root,file),'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found;
 function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n;ts.forEachChild(n,visit);}visit(tree);assert.ok(found,name);return found.getText(tree).replaceAll('process.env.NODE_ENV','"production"');}
function runCallback(code,context){const mod={exports:{}};vm.runInNewContext(ts.transpileModule('exports.run='+code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports,URLSearchParams,encodeURIComponent,...context});return mod.exports.run;}
const loadCode=callback('app/driver-job/[token]/page.tsx','loadJob'),ackCode=callback('app/driver-job/[token]/page.tsx','saveAndAcknowledgeJob');
async function screen(action,site=origin){const state={},calls=[];const ctx={reviewJob:true,token:'review-9001',active:true,savingDriverDetails:false,pageState:{kind:'ready',job:payload()},window:{location:new URL(site)},fetch:async(url,init={})=>{calls.push({url,...init});const req=request({pathname:url,method:init.method||'GET',referer:'/driver-job/review-9001',body:init.body?JSON.parse(init.body):undefined});return jobRoute[init.method||'GET'](req,jobContext);}};
 for(const key of ['PageState','Acknowledged','SavedDriverDetails','DetailsFeedback','DriverDetails','SavingDriverDetails'])ctx['set'+key]=v=>state[key]=v;
 await runCallback(action==='load'?loadCode:ackCode,ctx)();return{state,calls};}
assert.equal((await screen('load')).state.PageState.kind,'ready');assert.equal((await screen('ack')).state.Acknowledged,true);
assert.equal((await screen('load')).state.Acknowledged,true);
for(const action of ['load','ack'])assert.equal((await screen(action,'https://foreign.invalid')).calls.length,0);
const prior=persistenceCalls.length;configure({...config,hostedAccess:{...config.hostedAccess,enabled:false}});
for(const action of ['load','ack'])assert.equal((await screen(action)).state.PageState.kind,'blocked');assert.equal(persistenceCalls.length,prior);configure();
const openCode=callback('app/driver-portal/page.tsx','openJob');let navigation=[];
const open=runCallback(openCode,{readState:{kind:'ready',reviewSession:true},window:{location:{...new URL(origin),origin,assign:v=>navigation.push(v)}},setOpenFeedback:()=>{}});
await open(listing.jobs[0]);assert.deepEqual(navigation,['/driver-job/review-9001']);await open(listing.jobs[0],true);await open({job_key:'wrong',review_job_path:'/driver-job/ordinary-token'});assert.equal(navigation.length,1);
pass('Production-constant-folded Driver callbacks reach actual QA routes; server switch-off blocks; no native/message fallback');
const adminCode=callback('app/page.tsx','saveAdminQaBags');
async function adminScreen(site=origin){const state={},calls=[],booking={luggageCount:'2',other:'unchanged'},baseline={bookingReference:scope.adminSaveBookingReference,updatedAt:body.expected_updated_at,form:{...booking,luggageCount:'1'},formSignature:JSON.stringify({...booking,luggageCount:'1'})};
 const ctx={window:{location:new URL(site)},adminQaSaveInFlightRef:{current:false},loadedAdminBookingBaselineRef:{current:baseline},appliedAdminBookingSnapshotReferenceRef:{current:scope.adminSaveBookingReference},booking,bookingFormRef:{current:booking},cleanReferenceText:v=>v,adminBookingFormSyncSignature:JSON.stringify,adminSavedBookingsApiPath:'/api/admin-saved-bookings',
 fetch:async(url,init={})=>{calls.push({url,...init});if(init.method==='PATCH'){const req=adminRequest({body:JSON.parse(init.body)}),access=review.resolveStoreReviewAdminSaveRequest(req);if(access.state!=='review')return review.storeReviewBlockedResponse();const result=await adapter.saveStoreReviewAdminBags(access.proof,JSON.parse(init.body));return Response.json({...result,mode:'review'},{status:result.status});}return Response.json({ok:true,mode:'review',booking:{booking_reference:scope.adminSaveBookingReference,luggage_count:2,updated_at:'2026-10-16T01:00:01Z'}});},
 bookingRecordPersistedReference:v=>v.booking_reference,bookingRecordToAdminBookingPersistenceRecord:v=>v,markAdminBookingAsActiveForUpdates:()=>state.refreshed=true,upsertLoadedBookingFromAdminRecord:()=>{}};
 for(const key of ['AdminBookingPersistenceMessage','Message','BookingSaveMessage','AdminBookingPersistenceAction'])ctx['set'+key]=v=>state[key]=v;
 await runCallback(adminCode,ctx)();return{state,calls};}
const adminOk=await adminScreen();assert.equal(adminOk.state.refreshed,true);assert.equal(adminOk.calls.length,2);assert.equal(JSON.parse(adminOk.calls[0].body).target_booking_reference,scope.adminSaveBookingReference);
assert.equal((await adminScreen('https://foreign.invalid')).calls.length,0);
const beforeOff=rpcCalls.length;configure({...config,hostedAccess:{...config.hostedAccess,enabled:false}});const adminOff=await adminScreen();assert.equal(adminOff.calls.length,1);assert.equal(adminOff.state.Message.tone,'error');assert.equal(rpcCalls.length,beforeOff);configure();
assert.equal(effects.length,0);
pass('Production-constant-folded Admin callback retains bags-only payload and reload; switch-off never reaches RPC');
console.log(`PASS ${checks.length} missing hosted-gate groups; production-mode VM with synthetic requests only. Driver persistence is a proof-checking spy; Admin RPC is a spy. No SQL, network, full Next build, installed-device or live acceptance claimed.`);
