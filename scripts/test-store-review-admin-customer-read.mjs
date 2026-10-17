// Actual QA lookup routes/readers with synthetic data and a network-denying transport.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url), ts=require('typescript');
const site='https://app.prestigelimo.sg', db='https://fixture.supabase.co';
const scope={bookingIds:[9001,9002],bookingReferences:['QA-SYNTHETIC','QA-DRIVER'],companyId:901,bookerId:902,customerId:903,driverId:904,travelerIds:[905],adminSaveBookingReference:'QA-SYNTHETIC',driverLinkBookingReference:'QA-DRIVER',bookingTargets:[{bookingId:9001,bookingReference:'QA-SYNTHETIC',travelerId:905},{bookingId:9002,bookingReference:'QA-DRIVER',travelerId:905}]};
const roles=['admin','driver','customer'];
const config={version:1,databaseOrigin:db,expiresAt:'2099-01-01T00:00:00Z',scope,credentials:Object.fromEntries(roles.map((r,i)=>[r,createHash('sha256').update(String.fromCharCode(97+i).repeat(43)).digest('hex')])),hostedAccess:{enabled:true,origin:site,ownerSetupEnabled:false}};
const env={NODE_ENV:'production',VERCEL_ENV:'production',SUPABASE_URL:db,SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-key-not-a-credential',PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:'true',PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET:'synthetic-secret'.repeat(5),PRESTIGE_STORE_REVIEW_ACCESS:JSON.stringify(config)};
const calls=[];
const expected={companies:{id:'eq.901'},bookers:{id:'eq.902',company_id:'eq.901',customer_id:'eq.903'},travelers:{id:'in.(905)',company_id:'eq.901',booker_id:'eq.902'},customers:{id:'eq.903'},bookings:{id:'in.(9001,9002)',booking_reference:'in.(QA-SYNTHETIC,QA-DRIVER)',company_id:'eq.901',booker_id:'eq.902',customer_id:'eq.903',driver_id:'eq.904'}};
const rows={companies:[{id:901,company_name:'QA Company'}],bookers:[{id:902,company_id:901,customer_id:903,booker_name:'QA Booker'}],travelers:[{id:905,company_id:901,booker_id:902,traveler_name:'QA Traveler'}],customers:[{id:903,display_name:'QA Customer',account_status:'active',status:'active',customer_type:'company'}],bookings:[]};
async function transport(input,init){const url=new URL(input), table=url.pathname.split('/').pop();assert.equal(url.origin,db);assert.equal(init.method,'GET');assert.ok(expected[table],`No unexpected table ${table}`);for(const [key,value]of Object.entries(expected[table]))assert.ok(url.searchParams.getAll(key).includes(value),`${table}.${key} must be filtered before transport`);calls.push(url);return Response.json(rows[table]);}
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
vm.runInNewContext(code,{module:mod,exports:mod.exports,process:{env},Buffer,URL,URLSearchParams,Request,Response,Headers,Date,fetch:transport,console,require:n=>{if(n==='server-only')return {};if(n==='./admin-booking-persistence')return{listAdminBookings:async(actor,options)=>{assert.ok(options.review,'Account source bookings require QA scope');await access.storeReviewReadFetch(options.review,db,transport)(db+'/rest/v1/bookings',{});return{ok:true,data:[]}}};if(n.endsWith('admin-dispatcher-auth-boundary'))return{adminBookingPersistencePurpose:'admin-booking-persistence',resolveAdminDispatcherBoundary:()=>({ok:false,error:'ordinary blocked'}),adminAccountAuthIsEnabled:()=>true};if(n.endsWith('admin-booking-supabase-adapter'))return{adminDispatcherBoundaryToPersistenceAdapterActor:c=>({actor_label:c.actorLabel,actor_role:c.role,boundary_mode:c.mode,source_surface:'admin_api'})};if(n.startsWith('.'))return load(path.resolve(path.dirname(file),n+'.ts'));return require(n);}});return mod.exports;}
const access=load('lib/store-review-access.ts');
function request(route,role='admin',patch={}){return new Request(site+route,{headers:{cookie:access.issueStoreReviewSession(role,String.fromCharCode(97+roles.indexOf(role)).repeat(43)),referer:site+'/',origin:site,'x-prestige-admin-purpose':'admin-booking-persistence',...patch}})}
if(!process.argv.includes('--adapter-only')) for(const route of ['/api/admin-rate-setup','/api/admin-customer-accounts']){
 const req=request(route);const session=access.resolveStoreReviewSession(req.headers.get('cookie'));
 assert.equal(session.state,'valid');assert.equal(access.storeReviewRequestAllowed(session,route,'GET',req),true,'QA Customer Account lookup must be reachable');
 const handler=load('app'+route+'/route.ts');const response=await handler.GET(req);assert.equal(response.status,200,await response.clone().text());const body=await response.json();assert.equal(body.ok,true);
 if(route.endsWith('rate-setup')){assert.equal(body.companies.length,1);assert.equal(body.bookers.length,1);assert.equal(body.travelers.length,1);assert.equal(body.settings,null,'Do not read owner global pricing for QA');}
 else {assert.equal(body.accounts.length,1);assert.equal(body.accounts[0].customer_id,'903');assert.equal(body.accounts[0].verified_company_id,'901');}
 for(const role of ['driver','customer'])assert.equal((await handler.GET(request(route,role))).status,403);
 for(const headers of [{origin:'https://foreign.example'},{referer:site+'/other'},{'x-prestige-admin-purpose':'wrong'}])assert.equal((await handler.GET(request(route,'admin',headers))).status,403);
 for(const method of ['POST','PATCH','DELETE'])assert.equal(access.storeReviewRequestAllowed(session,route,method,req),false);
 const before=calls.length;assert.equal((await handler.GET(new Request(site+route,{headers:{cookie:'prestige_store_review_session=invalid',referer:site+'/'}}))).status,403);assert.equal(calls.length,before);
}
if(!process.argv.includes('--adapter-only')) assert.ok(calls.length>0);
const s=access.resolveStoreReviewSession(request('/').headers.get('cookie'));
for(const table of ['rate_settings','invoice_records','driver_google_calendar_connections','admin_accounts'])await assert.rejects(()=>access.storeReviewReadFetch(s,db,transport)(db+'/rest/v1/'+table,{}));
if(!process.argv.includes('--adapter-only')) console.log('PASS actual QA lookup routes and readers: scoped identity filters, no global pricing/Calendar/provider writes, cross-role/origin/purpose/method denial.');

// Execute the adapter's real client construction and booking-list SQL builder too.
const adapterSource=fs.readFileSync('lib/admin-booking-supabase-adapter.ts','utf8');
const ast=ts.createSourceFile('adapter.ts',adapterSource,ts.ScriptTarget.Latest,true);
const funcs=ast.statements.filter(n=>ts.isFunctionDeclaration(n));
const names=['getServerOnlySupabaseClient','listAdminBookingsThroughSupabaseAdapter'];
const code=names.map(name=>funcs.find(n=>n.name?.text===name).getText(ast)).join('\n');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{
 module:mod,exports:mod.exports,process:{env},createClient:require('@supabase/supabase-js').createClient,
 storeReviewReadFetch:(session,origin)=>access.storeReviewReadFetch(session,origin,transport),
 validateActor:()=>({ok:true}),isVerifiedCustomerBookingRequestActor:()=>false,checkAdminBookingPersistenceStagingConfigReadiness:()=>({ok:true}),
 configValueOrNull:v=>v,adminBookingListLimit:n=>n,loadAdminBookingsWithFoundationFallback:fn=>fn('id,booking_reference,company_id,booker_id,customer_id,driver_id,traveler_id'),
 asArray:v=>v,asRecord:v=>v,toAdminBookingDto:v=>v,safeAdapterFailure:()=>{throw Error('unexpected adapter failure')},safeLoadError:'failed',
});
const n=calls.length;
assert.equal((await mod.exports.listAdminBookingsThroughSupabaseAdapter({}, {limit:200,review:s})).ok,true);
assert.equal(calls.length,n+1);assert.equal(calls.at(-1).pathname,'/rest/v1/bookings');
console.log('PASS actual adapter client/list construction carries QA scope to the installed SDK before transport.');
