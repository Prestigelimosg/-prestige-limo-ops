import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import crypto from 'node:crypto';
const saved={...process.env};
const load=(file,imports)=>{const m={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','module','exports',js)(n=>{assert.ok(n in imports,`Unexpected import ${n}`);return imports[n];},m,m.exports);return m.exports;};
// The checkbox vehicle hints must stay identical to the established SQL eligibility aliases.
const ui=fs.readFileSync('app/admin-driver-pool-control.tsx','utf8');
const uiCategories=new Function('return '+ui.match(/const vehicleCategories: Record<string, string> = (\{[\s\S]*?\});/)[1])();
const sqlMatch=fs.readFileSync('supabase/migrations/20260909171426_driver_pool_vehicle_requirement.sql','utf8').split('as $match$')[1].split('$match$;')[0];
assert.deepEqual(uiCategories,Object.fromEntries([...sqlMatch.matchAll(/when '([^']+)' then '([^']+)'/g)].map(m=>[m[1],m[2]])));
// Execute the actual checkbox predicate for every existing category and combined choice.
const predicateSource=ui.slice(ui.indexOf('  const matchesVehicle ='),ui.indexOf('  const selectedReady ='));
const predicateJs=ts.transpileModule(predicateSource+'\nreturn matchesVehicle;', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const requirementCategories={'E / AVF':['E','AVF'],AVF:['AVF'],S:['S'],VVV:['VVV'],COMBI:['COMBI'],'AVF / VVV':['AVF','VVV']};
for(const [requirement,categories] of Object.entries(requirementCategories)) {
 const matches=new Function('vehicleCategories','vehicleRequirement',predicateJs)(uiCategories,requirement);
 for(const [alias,category] of Object.entries(uiCategories)) assert.equal(matches({vehicle_type:alias}),categories.includes(category),`${requirement}: ${alias}`);
 for(const unknown of [null,'','Unknown','AVF / VVV','E / AVF','Alphard Viano']) assert.equal(matches({vehicle_type:unknown}),false);
}
// Execute the actual UI refresh over multiple bounded requests; no hidden list cap.
const callbackSource=ui.slice(ui.indexOf('  const load = useCallback('),ui.indexOf('  const loadAttention = useCallback('));
const callbackJs=ts.transpileModule(callbackSource+'\nreturn load;', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
for(const size of [0,1,200,201,501]) {
 for(const failBatch of [0,2]) {
  const state={readiness:{},feedback:'',calls:[]};
  const bindings={useCallback:fn=>fn,bookingReference:'POOL-QA',driverIdsQuery:Array.from({length:size},(_,i)=>i+1).join(','),loadVersion:{current:0},headers:{},
   setEnabled:()=>{},setServerEligible:()=>{},setOffer:()=>{},setAlertReadiness:value=>state.readiness=value,
   setFeedback:value=>state.feedback=typeof value==='function'?value(state.feedback):value,
   fetch:async(url,options)=>{
    assert.equal(options.cache,'no-store');
    const ids=new URL(url,'https://synthetic.invalid').searchParams.get('driver_ids')?.split(',').map(Number)||[];
    state.calls.push(ids);assert.ok(ids.length<=200);
    return {ok:state.calls.length!==failBatch,json:async()=>({enabled:true,eligible:true,offer:null,driver_alert_readiness:ids.map(driver_id=>({driver_id,ready:true}))})};
   }};
  await new Function(...Object.keys(bindings),callbackJs)(...Object.values(bindings))();
  const failed=failBatch===2&&size>200;
  assert.equal(Object.keys(state.readiness).length,failed?0:size);
  assert.equal(state.feedback.includes('could not refresh'),failed);
  if(!failed)assert.deepEqual(state.calls.flat(),Array.from({length:size},(_,i)=>i+1));
 }
}
let failedTable='',queries=[];
let rows={};
const client={from(table){const filters=[];let max=Infinity;const q={select(columns){queries.push({table,columns});return q;},in(key,values){filters.push(r=>values.includes(r[key]));return q;},eq(key,value){filters.push(r=>r[key]===value);return q;},limit(n){max=n;return q;},then(resolve){return Promise.resolve({data:(rows[table]||[]).filter(r=>filters.every(f=>f(r))).slice(0,max),error:failedTable===table?{message:'PRIVATE ERROR'}:null}).then(resolve);}};return q;}};
try {
 Object.assign(process.env,{PRESTIGE_DRIVER_DEVICE_PUSH_ENABLED:'true',PRESTIGE_DRIVER_DEVICE_PUSH_VAPID_PUBLIC_KEY:'synthetic-public-key',PRESTIGE_DRIVER_DEVICE_PUSH_VAPID_PRIVATE_KEY:'synthetic-private-key',PRESTIGE_DRIVER_DEVICE_PUSH_CONTACT_EMAIL:'qa@example.invalid'});
 const h=load('lib/driver-device-push-notification.ts',{'node:crypto':crypto,'web-push':{},'./driver-job-link.ts':{},'./native-push-badge-count.ts':{}});
 const account=id=>({id:crypto.randomUUID(),driver_reference:String(id),active_device_id_hash:'a'.repeat(64),account_status:'active'});
 const native=id=>({driver_id:id,endpoint:'ExponentPushToken[synthetic_driver_token_'+id+']',source_surface:'driver_native_ios',subscription_status:'active'});
 rows={driver_access_accounts:[account(1),account(2),account(3),account(4),account(5)],driver_device_push_subscriptions:[native(1),{...native(2),subscription_status:'revoked'},{...native(3),endpoint:'invalid'},native(4),native(5)]};
 rows.driver_access_accounts[3].account_status='suspended';rows.driver_access_accounts[4].active_device_id_hash=null;
 assert.deepEqual(await h.loadDriverPoolAlertReadiness(client,[1,2,3,4,5,6]),[true,false,false,false,false,false].map((ready,i)=>({driver_id:i+1,ready})));
 assert.equal(queries.length,2,'Readiness uses bounded batch reads, not per-driver queries');
 assert.doesNotMatch(JSON.stringify(await h.loadDriverPoolAlertReadiness(client,[1])),/Exponent|endpoint|hash|account_status|private|token/i);
 for(const table of ['driver_access_accounts','driver_device_push_subscriptions']) {failedTable=table;assert.deepEqual(await h.loadDriverPoolAlertReadiness(client,[1]),[{driver_id:1,ready:null}]);}failedTable='';
 rows.driver_access_accounts.push(account(1));assert.equal((await h.loadDriverPoolAlertReadiness(client,[1]))[0].ready,false,'Ambiguous account fails closed');rows.driver_access_accounts.pop();
 rows.driver_device_push_subscriptions.push(...Array.from({length:10},()=>native(1)));assert.equal((await h.loadDriverPoolAlertReadiness(client,[1]))[0].ready,null,'Overflow is not guessed');
 queries=[];process.env.PRESTIGE_DRIVER_DEVICE_PUSH_ENABLED='false';assert.equal((await h.loadDriverPoolAlertReadiness(client,[1]))[0].ready,null);assert.equal(queries.length,0);
 // GET contract: purpose/role boundary runs before readiness; unknown inputs cannot broaden the read.
 let allowed=true,requested=[];
 const route=load('app/api/admin-driver-job-bid-offers/route.ts',{
  'next/server':{},'../../../lib/admin-device-push-notification':{},'../../../lib/admin-booking-supabase-adapter':{},
  '../../../lib/admin-dispatcher-auth-boundary':{resolveAdminDispatcherBoundary:()=>({ok:allowed,error:'Denied'}),adminBookingPersistencePurpose:'admin-booking-persistence'},
  '../../../lib/driver-device-push-notification':{loadDriverPoolAlertReadiness:async(_c,ids)=>{requested.push(ids);return ids.map(driver_id=>({driver_id,ready:true}));}},
  '../../../lib/driver-pool-fast-accept':{getDriverPoolClientForProduction:()=>({ok:true,client}),loadAdminDriverPoolOffer:async()=>({ok:true,data:{enabled:true,eligible:true,offer:null}})},
 });
 const request=query=>new Request('https://synthetic.invalid/api/admin-driver-job-bid-offers?booking_reference=POOL-QA'+query);
 let response=await route.GET(request('&driver_ids=1,2'));assert.equal(response.status,200);assert.deepEqual((await response.json()).driver_alert_readiness,[{driver_id:1,ready:true},{driver_id:2,ready:true}]);
 for(const query of ['&driver_ids=','&driver_ids=1,1','&driver_ids=0','&driver_ids=1&driver_ids=2','&driver_ids=9007199254740992','&customer_price=1']) assert.equal((await route.GET(request(query))).status,400);
 assert.equal(requested.length,1);allowed=false;assert.equal((await route.GET(request('&driver_ids=1'))).status,403);assert.equal(requested.length,1);
 console.log('PASS alert readiness: active/inactive/invalid/revoked/ambiguous registrations, unknown on failures, bounded reads, no token leakage or sends, exact Admin GET boundary.');
} finally {for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);}
