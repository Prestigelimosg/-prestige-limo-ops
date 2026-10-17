// New QA booking-detail request coverage only. No network or ordinary records.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),ts=require('typescript');
const site='https://app.prestigelimo.sg',calls=[];
const scope={bookingIds:[9001,9002],bookingReferences:['QA-ADMIN-SYNTHETIC','QA-DRIVER-SYNTHETIC'],companyId:901,bookerId:902,customerId:903,driverId:904,travelerIds:[905],adminSaveBookingReference:'QA-ADMIN-SYNTHETIC',driverLinkBookingReference:'QA-DRIVER-SYNTHETIC',bookingTargets:[{bookingId:9001,bookingReference:'QA-ADMIN-SYNTHETIC',travelerId:905},{bookingId:9002,bookingReference:'QA-DRIVER-SYNTHETIC',travelerId:905}]};
const config={version:1,databaseOrigin:'https://fixture.supabase.co',expiresAt:'2099-01-01T00:00:00Z',scope,credentials:Object.fromEntries(['admin','driver','customer'].map((role,i)=>[role,createHash('sha256').update(String.fromCharCode(97+i).repeat(43)).digest('hex')])),hostedAccess:{enabled:true,origin:site,ownerSetupEnabled:false}};
const env={NODE_ENV:'production',VERCEL_ENV:'production',SUPABASE_URL:config.databaseOrigin,SUPABASE_SERVICE_ROLE_KEY:'synthetic',PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:'true',PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET:'synthetic-only-'.repeat(5),PRESTIGE_STORE_REVIEW_ACCESS:JSON.stringify(config)};
function load(file,imports={}){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(process.argv.includes('--before') && file==='lib/admin-booking-supabase-adapter.ts' ? execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}) : fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports,process:{env},Buffer,URL,Request,Response,Headers,Date,require:n=>n==='server-only'?{}:imports[n]??(n.startsWith('node:')?require(n):{})});return mod.exports;}
const access=load('lib/store-review-access.ts');
const adapter=load('lib/admin-booking-supabase-adapter.ts',{'./store-review-access':access,'@supabase/supabase-js':{createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:{booking_reference:scope.adminSaveBookingReference,luggage_count:args.p_luggage_count,details:args.p_details,updated_at:'2026-10-17T01:00:01Z',noop:false},error:null};}})}});
const route=load('app/api/admin-bookings/route.ts',{'../../../lib/store-review-access':access,'../../../lib/admin-booking-supabase-adapter':adapter,'../../../lib/admin-dispatcher-auth-boundary':{resolveAdminDispatcherBoundary:()=>{throw Error('Ordinary authority must not be used');}}});
const body={target_booking_reference:scope.adminSaveBookingReference,expected_updated_at:'2026-10-17T01:00:00Z',luggage_count:3,details:{passenger_name:'QA sample passenger',pax_count:2,flight_no:'QA123',vehicle_type_or_category:'AVF'}};
function request(payload=body,role='admin'){return new Request(site+'/api/admin-bookings',{method:'PATCH',headers:{cookie:access.issueStoreReviewSession(role,String.fromCharCode(97+['admin','driver','customer'].indexOf(role)).repeat(43)),origin:site,referer:site+'/','x-prestige-admin-purpose':'admin-qa-bags-save','content-type':'application/json'},body:JSON.stringify(payload)});}
assert.equal(access.resolveStoreReviewAdminSaveRequest(request()).state,'review','Fixture must reach the existing valid QA proof before checking the gap');
const response=await route.PATCH(request());
assert.equal(response.status,200,'Existing QA save must support booking details, not a fixed bags=2 exercise');
const result=await response.json();assert.equal(result.mode,'review');assert.deepEqual(result.result.details,body.details);assert.equal(result.result.luggage_count,3);
assert.equal(calls.length,1);assert.equal(calls[0].name,'save_admin_reviewer_qa_bags');assert.equal(calls[0].args.p_booking_id,9001);assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args.p_details)),body.details);
for(const invalid of [{...body,driver_id:1},{...body,target_booking_reference:'REAL'}, {...body,luggage_count:-1},{...body,luggage_count:1.5},{...body,details:{...body.details,customer_id:1}},{...body,details:{...body.details,pax_count:0}},{...body,details:{...body.details,passenger_name:''}},{...body,details:{...body.details,flight_no:'x'.repeat(81)}},{...body,details:{...body.details,vehicle_type_or_category:null}}]){
 assert.equal((await route.PATCH(request(invalid))).status,403);assert.equal(calls.length,1);
}
for(const role of ['driver','customer']){assert.equal((await route.PATCH(request(body,role))).status,403);assert.equal(calls.length,1);}
console.log('PASS QA detail PATCH sends only the exact server-owned tuple; invalid fields and other roles have no RPC or ordinary effects.');
// Execute the real save callback; any escape into the ordinary Update + Cal path fails.
const source=fs.readFileSync('app/page.tsx','utf8');
const tree=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];
(function walk(n){nodes.push(n);ts.forEachChild(n,walk)})(tree);
const fn=name=>nodes.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(tree);
async function ui(options={}) {
 const messages=[],requests=[];let marked=0;
 const original={name:'QA passenger',pax:'2',flight:'QA123',vehicle:'AVF',luggageCount:'1',pickup:'QA pickup'};
 const form={...original,name:'QA edited passenger',pax:'4',flight:'QA456',vehicle:'VVV',luggageCount:'3',...(options.foreign?{pickup:'changed'}:{})};
 const baseline={bookingReference:scope.adminSaveBookingReference,updatedAt:body.expected_updated_at,form:original,formSignature:''};
 const current={current:baseline},ref={current:scope.adminSaveBookingReference};
 const sandbox={adminQaReviewSession:true,adminQaSaveInFlightRef:{current:false},loadedAdminBookingBaselineRef:current,
   appliedAdminBookingSnapshotReferenceRef:ref,bookingFormRef:{current:form},booking:form,clean:v=>String(v??'').trim(),cleanReferenceText:v=>String(v??'').trim(),
   process:{env:{NODE_ENV:'production'}},window:{location:{origin:site,hostname:'app.prestigelimo.sg'}},URLSearchParams,JSON,
   adminSavedBookingsApiPath:'/api/admin-saved-bookings',setAdminBookingPersistenceMessage:m=>messages.push(m),setMessage:()=>{},setBookingSaveMessage:()=>{},setAdminBookingPersistenceAction:()=>{},
   bookingRecordPersistedReference:r=>r.booking_reference,bookingRecordToAdminBookingPersistenceRecord:r=>r,markAdminBookingAsActiveForUpdates:()=>{marked++},upsertLoadedBookingFromAdminRecord:()=>{},
   fetch:async(url,init)=>{requests.push({url,...init});if(options.fail)throw Error('synthetic lost response');
     if(options.switch)ref.current='OTHER';const payload=init?.body?JSON.parse(init.body):JSON.parse(requests[0].body);
     const result={booking_reference:scope.adminSaveBookingReference,luggage_count:payload.luggage_count,details:payload.details,updated_at:'2026-10-17T01:00:01Z',noop:false};
     return {ok:true,json:async()=>url==='/api/admin-bookings'?{ok:true,mode:'review',result}:{ok:true,mode:'review',booking:{...result,...payload.details}}};}};
 const m={exports:{}};vm.runInNewContext(ts.transpileModule([fn('adminBookingFormSyncSignature'),fn('saveAdminQaBags'),fn('updateAppliedAdminBookingOperationalSnapshot'),
   'exports.signature=adminBookingFormSyncSignature;exports.run=updateAppliedAdminBookingOperationalSnapshot;'].join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{...sandbox,module:m,exports:m.exports});
 baseline.formSignature=m.exports.signature(original);
 await m.exports.run(options.assignment?{assignmentOnly:true}:{});
 if(options.foreign||options.assignment) {assert.equal(requests.length,0);assert.equal(marked,0);}
 else if(options.fail){assert.equal(requests.length,1);assert.equal(current.current,null);await m.exports.run();assert.equal(requests.length,1);}
 else {assert.equal(requests.length,2);assert.equal(marked,options.switch?0:1);assert.deepEqual(JSON.parse(requests[0].body).details,
   {passenger_name:'QA edited passenger',pax_count:4,flight_no:'QA456',vehicle_type_or_category:'VVV'});}
 assert.ok(requests.every(r=>r.url==='/api/admin-bookings'||r.url.startsWith('/api/admin-saved-bookings?')),'No Calendar/provider request');
}
for(const options of [{},{foreign:true},{assignment:true},{fail:true},{switch:true}])await ui(options);
console.log('PASS actual UI saves/reloads exact QA detail fields; denies unrelated edits/assignment; no Calendar call, no blind retry or changed-selection overwrite.');
