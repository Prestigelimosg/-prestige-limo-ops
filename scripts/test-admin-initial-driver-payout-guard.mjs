import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';

const [app,parserSource,adapterSource,route] = await Promise.all(['app/page.tsx','lib/admin-booking-persistence.ts','lib/admin-booking-supabase-adapter.ts','app/api/admin-bookings/route.ts'].map(p=>readFile(p,'utf8')));
const compile = source => ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const slice = (s,a,b) => { const start=s.indexOf(a); const end=s.indexOf(b,start+a.length); assert.ok(start>=0&&end>start); return s.slice(start,end); };
const plain = v=>JSON.parse(JSON.stringify(v));
const text = v=>String(v??'').trim()||null;
const parserContext={exports:{},require:()=>({normalizeDriverRemark:text}),console};
vm.runInNewContext(compile(parserSource),parserContext);
const parser=parserContext.exports;
const payload={
  target_booking_reference:'ASSIGN-TEST-001', expected_updated_at:'2026-10-15T01:00:00.000Z',update_mode:'driver_assignment',
  assignment_payout:{amount:88.5,reason:'Reviewed one-trip payout'},
  booking:{booking_reference:'ASSIGN-TEST-001',source_channel:'admin-dashboard',customer_id:'101',company_id:102,booker_id:103,traveler_id:104,
    pickup_datetime:'2030-10-18T02:00:00.000Z',pickup_location:'Pickup',dropoff_location:'Dropoff',route_type:'TRF',service_type:'TRF',
    customer_display_name:'Synthetic Company',contact_display_name:'Synthetic Booker',contact_phone:'+6500000000',
    driver_id:7301,driver_name:'Synthetic Driver',driver_contact:'+6500007301',driver_plate_number:'TEST7301',request_review_status:'approved',
    admin_internal_status:'Draft',customer_facing_status:'Received',short_notice_review_status:'Not Required'},
  route_points:[{point_type:'pickup',sequence_number:1,location_text:'Pickup'},{point_type:'dropoff',sequence_number:2,location_text:'Dropoff'}], service_items:[]
};
const parsed=parser.parseAdminBookingUpdatePayload(payload);
assert.equal(parsed.ok,true,JSON.stringify(parsed));
assert.deepEqual(plain(parsed.data.assignment_payout),payload.assignment_payout);
for(const mutate of [
 p=>p.assignment_payout=null,p=>p.assignment_payout=[],p=>p.assignment_payout.amount=-1,p=>p.assignment_payout.amount=NaN,
 p=>p.assignment_payout.amount=100000,p=>p.assignment_payout.amount=1.001,p=>p.assignment_payout.amount='88',
 p=>p.assignment_payout.reason='a'.repeat(501),p=>p.assignment_payout.reason={email_send:true},p=>p.assignment_payout.extra=1,
 p=>delete p.expected_updated_at,p=>delete p.update_mode,p=>p.update_mode='driver_assignment_cancel',
 p=>p.combo_assignment={revision:'ac3893cb-0459-49d5-8be9-bb81c2ee6e74',total_payout_sgd:88},
 p=>p.booking.driver_payout_override=88,p=>p.booking.customer_price_amount=100
]){const p=structuredClone(payload);mutate(p);assert.equal(parser.parseAdminBookingUpdatePayload(p).ok,false,JSON.stringify(p));}
assert.equal(parser.parseAdminBookingPersistencePayload(payload).ok,false,'ordinary create must not accept payout exception');
const zero=structuredClone(payload);zero.assignment_payout.amount=0;assert.equal(parser.parseAdminBookingUpdatePayload(zero).ok,true);

// Execute the actual full adapter update function; every persistence dependency is
// an in-memory double. Any unintended writer/RPC/helper is absent and fails closed.
const existingTemplate={...payload.booking,id:1,driver_id:null,driver_name:null,driver_contact:null,driver_plate_number:null,
 updated_at:payload.expected_updated_at,status:'confirmed',source_surface:'admin_api',customer_price_amount:120,
 driver_payout_override:null,driver_payout_reason:null,route_points:payload.route_points,service_items:[],
 company_id:102,booker_id:103,traveler_id:104,remarks:'KEEP',driver_notes:'KEEP',booking_route_points:[],booking_service_items:[]};
const actor={boundary_mode:'server-session-role-surface',actor_role:'admin',source_surface:'admin_api',actor_label:'Synthetic Admin'};
let row,driver,writes,audits,queries,race,dbError,auditError;
const reset=()=>{row=structuredClone(existingTemplate);driver={id:7301,driver_name:'Synthetic Driver',contact_number:'+6500007301',plate_number:'TEST7301',availability_status:'available'};writes=[];audits=[];queries=[];race=null;dbError=false;auditError=false;};
const terminalStatuses=['completed','cancelled','canceled','closed','declined'];
// SQL NOT IN yields UNKNOWN for NULL; WHERE must accept only TRUE.
const sqlNotTerminal = value => value == null ? null : !terminalStatuses.includes(value);
const client={from(table){
 assert.ok(['bookings','drivers'].includes(table),`Unexpected table ${table}`);
 const q={filters:[],patch:null,select(columns){this.columns=columns;return this;},update(value){assert.equal(table,'bookings');this.patch=plain(value);return this;},eq(k,v){this.filters.push([k,v]);return this;},is(k,v){this.filters.push([k,v]);return this;},not(k,op,v){assert.deepEqual([k,op,v],['status','in','(completed,cancelled,canceled,closed,declined)']);this.statusFilter=true;return this;},or(expression){assert.equal(expression,'status.is.null,status.not.in.(completed,cancelled,canceled,closed,declined)');this.nullableStatusFilter=true;return this;},async maybeSingle(){
 queries.push({table,patch:this.patch,filters:this.filters});
 if(table==='drivers')return {data:driver,error:null};
 assert.ok(this.patch); if(race)race(row);
 if(dbError)return {data:null,error:{message:'synthetic failure'}};
 if(!this.filters.every(([k,v])=>row[k]===v)||this.statusFilter&&sqlNotTerminal(row.status)!==true||this.nullableStatusFilter&&!(row.status===null||sqlNotTerminal(row.status)===true))return {data:null,error:null};
 writes.push(this.patch);Object.assign(row,this.patch);return {data:structuredClone(row),error:null};
 }};return q;
}};
const adapterContext={exports:{},process:{env:{}},console,
 getServerOnlySupabaseClient:()=>({ok:true,data:client}),fetchAdminBookingByReference:async()=>({ok:true,data:structuredClone(row)}),
 textOrNull:text,positiveSafeInteger:v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):null,
 bookingUpdatedAtMatches:(a,b)=>Date.parse(a)===Date.parse(b),isVerifiedAdminDispatcherActor:a=>a.boundary_mode==='server-session-role-surface'&&['admin','dispatcher'].includes(a.actor_role)&&a.source_surface==='admin_api',
 safeUpdateConflictError:'version conflict',safeUpdateError:'safe update failure',asRecord:v=>v||{},
 safeAdapterFailure:(error,status)=>({ok:false,error,status}),toAdminBookingDto:r=>structuredClone(r),dbIdentifierOrNull:v=>v??null,
 adminBookingCurrentLoadSelect:'id,booking_reference',
 createAuditLog:async(...args)=>{audits.push(args);return auditError?{ok:false,status:500,error:"synthetic audit failure"}:{ok:true,data:null};}
};
vm.runInNewContext(compile(slice(adapterSource,'export async function updateAdminBookingThroughSupabaseAdapter(','export async function listAdminBookingsThroughSupabaseAdapter(')),adapterContext);
const update=(input=parsed.data)=>adapterContext.exports.updateAdminBookingThroughSupabaseAdapter(input,{},actor);
reset();const before=structuredClone(row);const success=await update();assert.equal(success.ok,true,JSON.stringify(success));
assert.equal(writes.length,1);assert.equal(audits.length,1);
assert.deepEqual(Object.keys(writes[0]).sort(),['driver_id','driver_name','driver_contact','driver_plate_number','driver_payout_override','driver_payout_reason','updated_at'].sort());
assert.equal(row.driver_id,7301);assert.equal(row.driver_payout_override,88.5);assert.equal(row.driver_payout_reason,'Reviewed one-trip payout');
for(const key of Object.keys(before).filter(k=>!Object.hasOwn(writes[0],k)))assert.deepEqual(row[key],before[key],`Preserve ${key}`);
assert.deepEqual(plain(success.data.assignment_payout),payload.assignment_payout);
assert.equal((await update()).ok,false,'retry must not double assign');assert.equal(writes.length,1);
for(const setup of [
 ()=>row.updated_at='2026-10-15T01:01:00.000Z',()=>row.driver_id=999,()=>row.status='completed',()=>row.status='cancelled',
 ()=>{row.source_surface='customer_booking_request';row.request_review_status='pending_review';},
 ()=>driver.availability_status='inactive',()=>driver=null,()=>driver.plate_number='MISMATCH',
 ()=>race=r=>r.updated_at='2026-10-15T01:02:00.000Z',()=>race=r=>r.driver_id=999,()=>dbError=true
]){reset();setup();const result=await update();assert.equal(result.ok,false,JSON.stringify(result));assert.equal(writes.length,0);assert.equal(audits.length,0);}
reset();assert.equal((await adapterContext.exports.updateAdminBookingThroughSupabaseAdapter(parsed.data,{}, {...actor,actor_role:'system'})).ok,false);assert.equal(writes.length,0);

// Exact reported shape, with synthetic identity: NULL legacy status, Draft /
// Received admin booking, no saved driver, S$55 and an empty override reason.
const blankInput={...structuredClone(parsed.data),expected_updated_at:'2026-10-14T11:48:51.596912+00:00',assignment_payout:{amount:55,reason:''}};
const resetBlank=()=>{reset();Object.assign(row,{status:null,admin_internal_status:'draft',customer_facing_status:'received',request_review_status:'pending_review',source_surface:'admin_dashboard',updated_at:blankInput.expected_updated_at});};
resetBlank();const blankBefore=structuredClone(row);const blankResult=await update(blankInput);
assert.equal(blankResult.ok,true,'NULL-status Draft / Received booking must save driver + S$55 together: '+JSON.stringify(blankResult));
assert.equal(writes.length,1);assert.equal(audits.length,1);assert.equal(row.driver_id,7301);assert.equal(row.driver_payout_override,55);assert.equal(row.driver_payout_reason,null);
assert.equal(row.status,null,'never backfill or change status to bypass the blocker');
assert.deepEqual(plain(blankResult.data.assignment_payout),{amount:55,reason:''});
for(const key of Object.keys(blankBefore).filter(k=>!Object.hasOwn(writes[0],k)))assert.deepEqual(row[key],blankBefore[key],`Blank-case preserves ${key}`);
assert.equal((await update(blankInput)).ok,false);assert.equal(writes.length,1,'duplicate blank-status retry must not save again');
for(const status of terminalStatuses){
 for(const concurrent of [false,true]){
  resetBlank();if(concurrent)race=r=>r.status=status;else row.status=status;
  const result=await update(blankInput);assert.equal(result.ok,false,`${status}, concurrent=${concurrent}`);assert.equal(writes.length,0);assert.equal(audits.length,0);
 }
}
for(const setup of [()=>row.updated_at='2026-10-15T01:01:00.000Z',()=>race=r=>r.updated_at='2026-10-15T01:02:00.000Z',()=>race=r=>r.driver_id=999,()=>{row.source_surface='customer_booking_request';}]){
 resetBlank();setup();assert.equal((await update(blankInput)).ok,false);assert.equal(writes.length,0);assert.equal(audits.length,0);
}
resetBlank();row.status='';assert.equal((await update(blankInput)).ok,true,'empty text status retains prior behavior');

reset();auditError=true;const auditFailure=await update();
assert.equal(auditFailure.ok,false);assert.match(auditFailure.error,/Driver and payout were saved/);
assert.equal(writes.length,1);assert.equal(row.driver_id,7301);assert.equal(row.driver_payout_override,88.5);

// Real baseline comparison: only the two payout fields join the existing safe
// driver fields for the explicitly eligible first-assignment case.
const compareContext={clean:v=>String(v??'').trim()};
vm.runInNewContext(compile(slice(app,'function adminBookingFormSyncSignature(','function adminBookingVersionsMatch(')),compareContext);
const base={driverId:'',driverName:'',driverContact:'',driverPlate:'',driverVehicleModel:'',driverPayoutOverride:'',driverPayoutReason:'',companyId:'102',bookerId:'103',travelerId:'104',customerId:'101',pickup:'Pickup',date:'2030-10-18',time:'1000',customerPriceOverride:'120',driverNotes:'KEEP'};
const draft={...base,driverId:'7301',driverName:'Synthetic Driver',driverPayoutOverride:'88.50',driverPayoutReason:'Reviewed one-trip payout'};
const matches=compareContext.adminBookingFormMatchesLoadedBaselineOutsideDriverAssignment;
assert.equal(matches(draft,base),false);assert.equal(matches(draft,base,true),true);
for(const key of ['companyId','bookerId','travelerId','customerId','pickup','date','time','customerPriceOverride','driverNotes'])assert.equal(matches({...draft,[key]:'CHANGED'},base,true),false,`Reject ${key}`);
const branch=slice(adapterSource,'  if (input.assignment_payout) {','  if (input.update_mode === "driver_assignment_cancel") {\n    // Explicit action only');
assert.doesNotMatch(branch,/\.rpc\(|ensureCustomerContact|findOrCreateCustomer|from\("(?:customers|customer_contacts|booking_route_points|booking_service_items)"\)/);
assert.match(route,/driver_assignment_cancel" \|\| parsed\.data\.assignment_payout \|\| parsed\.data\.payout_amendment\) \? null : await maybeQueueCustomerRequestDecisionNotification/);
assert.match(app,/assignmentOnly && !cancelDriverAssignment && initialDriverAssignmentPayoutChanged/);
// Execute the real route and real auth boundary with a synthetic session and the
// same in-memory adapter. No credentials, providers, or real database are used.
const authEnv={PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:'true',PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE:'server-session-token',PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE:'admin',PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN:'synthetic-session-token'};
const authContext={exports:{},require:()=>crypto,Buffer,URL,process:{env:authEnv}};
vm.runInNewContext(compile(await readFile('lib/admin-dispatcher-auth-boundary.ts','utf8')),authContext);
vm.runInNewContext(compile(slice(adapterSource,'export function adminDispatcherBoundaryToPersistenceAdapterActor(','export const customerBookingRequestPersistenceAdapterActor')),adapterContext);
let sends=0;
const routeContext={exports:{},Response,Request,URL,console,require(name){
 if(name.endsWith('/admin-booking-persistence'))return {...parser,
   loadAdminBookingByReference:async()=>({ok:true,data:structuredClone(row)}),
   updateAdminBooking:async(input,actor,audit)=>{
     const parsed=parser.parseAdminBookingUpdatePayload(input);
     return parsed.ok ? adapterContext.exports.updateAdminBookingThroughSupabaseAdapter(parsed.data,audit,actor) : parsed;
   }};
 if(name.endsWith('/admin-booking-supabase-adapter'))return adapterContext.exports;
 if(name.endsWith('/admin-dispatcher-auth-boundary'))return authContext.exports;
 return new Proxy({}, {get(){return ()=>{sends++;throw new Error('Unexpected send blocked');};}});
}};
vm.runInNewContext(compile(route),routeContext);
const request=(headers={},body=payload)=>new Request('http://localhost/api/admin-bookings',{method:'PATCH',headers:{'content-type':'application/json','origin':'http://localhost','referer':'http://localhost/','x-prestige-admin-purpose':'admin-booking-persistence','x-prestige-admin-session-token':'synthetic-session-token',...headers},body:JSON.stringify(body)});
reset();let response=await routeContext.exports.PATCH(request());assert.equal(response.status,200,JSON.stringify(await response.clone().json()));assert.equal(writes.length,1);assert.equal(sends,0);
assert.deepEqual((await response.json()).booking.assignment_payout,payload.assignment_payout);
for(const headers of [{origin:'https://evil.invalid'},{referer:'http://localhost/book'},{referer:'http://localhost/driver-job/test'},{'x-prestige-admin-purpose':'driver-job'},{'x-prestige-admin-session-token':'wrong'}]) {
 reset();response=await routeContext.exports.PATCH(request(headers));assert.equal(response.status,403);assert.equal(writes.length,0);assert.equal(sends,0);
}
for(const role of ['customer','driver','system']){reset();authEnv.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE=role;response=await routeContext.exports.PATCH(request());assert.equal(response.status,403);assert.equal(writes.length,0);}
authEnv.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE='dispatcher';reset();response=await routeContext.exports.PATCH(request());assert.equal(response.status,200);assert.equal(writes.length,1);assert.equal(sends,0);
authEnv.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE='admin';resetBlank();response=await routeContext.exports.PATCH(request({},blankInput));assert.equal(response.status,200,JSON.stringify(await response.clone().json()));assert.equal(writes.length,1);assert.equal(sends,0);assert.deepEqual((await response.json()).booking.assignment_payout,{amount:55,reason:''});
// Exercise the installed Supabase/PostgREST request builder too. Its fetch is
// replaced entirely: no credentials, sockets, provider or database requests.
const transportRequests=[];
const transportClient=createClient('https://synthetic.invalid','synthetic-key',{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 global:{fetch:async(url,options)=>{
  const requestUrl=new URL(url);const params=requestUrl.searchParams;
  transportRequests.push({method:options.method,path:requestUrl.pathname});
  if(requestUrl.pathname==='/rest/v1/drivers'){
   assert.equal(options.method,'GET');assert.equal(params.get('id'),'eq.7301');
   return new Response(JSON.stringify(driver),{status:200,headers:{'content-type':'application/json'}});
  }
  assert.equal(requestUrl.pathname,'/rest/v1/bookings');assert.equal(options.method,'PATCH');
  assert.equal(params.get('id'),'eq.1');assert.equal(params.get('booking_reference'),'eq.ASSIGN-TEST-001');
  assert.equal(params.get('updated_at'),'eq.'+blankInput.expected_updated_at);assert.equal(params.get('driver_id'),'is.null');
  assert.equal(params.get('or'),'(status.is.null,status.not.in.(completed,cancelled,canceled,closed,declined))');
  assert.equal(params.has('status'),false,'no residual AND status NOT IN to reject NULL');
  const patch=JSON.parse(options.body);
  assert.deepEqual(Object.keys(patch).sort(),['driver_id','driver_name','driver_contact','driver_plate_number','driver_payout_override','driver_payout_reason','updated_at'].sort());
  assert.equal(patch.driver_payout_override,55);assert.equal(patch.driver_payout_reason,null);
  Object.assign(row,patch);
  return new Response(JSON.stringify(row),{status:200,headers:{'content-type':'application/json'}});
 }}
});
resetBlank();adapterContext.getServerOnlySupabaseClient=()=>({ok:true,data:transportClient});
response=await routeContext.exports.PATCH(request({},blankInput));
assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
assert.deepEqual((await response.json()).booking.assignment_payout,{amount:55,reason:''});
assert.deepEqual(transportRequests,[{method:'GET',path:'/rest/v1/drivers'},{method:'PATCH',path:'/rest/v1/bookings'}]);
assert.equal(audits.length,1);assert.equal(sends,0);
console.log('Initial driver + payout guard passed (including NULL status, S$55/empty reason, all terminal statuses and terminal races): real route/auth, parser, one atomic row update, concurrency/retry, CRM preservation, failure/no-write cases and bounded UI comparison.');
