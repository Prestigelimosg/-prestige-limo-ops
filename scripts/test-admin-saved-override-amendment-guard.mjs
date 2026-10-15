import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
import {createClient} from "@supabase/supabase-js";
const [app,source,adapter,route]=await Promise.all(["app/page.tsx","lib/admin-booking-persistence.ts","lib/admin-booking-supabase-adapter.ts","app/api/admin-bookings/route.ts"].map(p=>readFile(p,"utf8")));
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const slice=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert.ok(i>=0&&j>i);return s.slice(i,j);};
const plain=v=>JSON.parse(JSON.stringify(v));
const text=v=>String(v??"").trim()||null;
const parserCtx={exports:{},require:()=>({normalizeDriverRemark:text})};vm.runInNewContext(compile(source),parserCtx);
const parser=parserCtx.exports;
const payload={target_booking_reference:"QA-SYNTHETIC-11160",expected_updated_at:"2026-10-15T12:31:22.677Z",payout_amendment:{amount:65,reason:""},booking:{booking_reference:"QA-SYNTHETIC-11160",source_channel:"admin-dashboard",customer_id:231,company_id:53,booker_id:76,traveler_id:null,pickup_datetime:"2026-10-20T06:00:00Z",pickup_location:"QA pickup",dropoff_location:"QA dropoff",route_type:"TRF",service_type:"TRF",customer_display_name:"QA company",contact_display_name:"QA booker",contact_phone:"not provided",passenger_name:"QA passenger",driver_id:46,driver_name:"QA Driver",driver_contact:"00009222",driver_plate_number:"QA9222",admin_internal_status:"draft",customer_facing_status:"received",request_review_status:"pending_review"},route_points:[{point_type:"pickup",sequence_number:1,location_text:"QA pickup"},{point_type:"dropoff",sequence_number:2,location_text:"QA dropoff"}],service_items:[]};
const parse=p=>parser.parseAdminBookingUpdatePayload(p);
assert.equal(parse(payload).ok,true,"saved override amendment must parse: "+JSON.stringify(parse(payload)));
for(const amount of [65,0,88.5,null]){const p=structuredClone(payload);p.payout_amendment.amount=amount;assert.equal(parse(p).ok,true);assert.equal(parse(p).data.payout_amendment.amount,amount);}
for(const mutate of [p=>p.payout_amendment=null,p=>p.payout_amendment=[],p=>delete p.payout_amendment.amount,p=>p.payout_amendment.amount="65",p=>p.payout_amendment.amount=-1,p=>p.payout_amendment.amount=100000,p=>p.payout_amendment.amount=1.001,p=>p.payout_amendment.amount=NaN,p=>p.payout_amendment.reason="x".repeat(501),p=>p.payout_amendment.extra=true,p=>p.payout_amendment.reason={email_send:true},p=>delete p.expected_updated_at,p=>p.update_mode="driver_assignment",p=>p.update_mode="driver_assignment_cancel",p=>p.assignment_payout={amount:65,reason:""},p=>p.combo_assignment={revision:"test",total_payout_sgd:65},p=>p.booking.driver_payout_override=65,p=>p.booking.customer_price_amount=100,p=>{p.payout_amendment.amount=null;p.payout_amendment.reason="old reason";}]){const p=structuredClone(payload);mutate(p);assert.equal(parse(p).ok,false,JSON.stringify(p));}
assert.equal(parser.parseAdminBookingPersistencePayload(payload).ok,false,"POST must reject amendment finance field");
const input=parse(payload).data;
const actor={boundary_mode:"server-session-role-surface",actor_role:"admin",source_surface:"admin_api",actor_label:"QA"};
const initial={...plain(input.booking),id:490,customer_id:231,driver_id:46,status:null,source_surface:"admin_dashboard",updated_at:payload.expected_updated_at,driver_payout_override:55,driver_payout_reason:null,customer_price_amount:75,remarks:"KEEP",driver_notes:"KEEP",route_points:[],service_items:[]};
let row,calls,writes,audits,contacts,race,pool,failPool;
const reset=()=>{row=structuredClone(initial);calls=[];writes=[];audits=[];contacts=0;race=null;pool=false;failPool=false;};
const terminal=["completed","cancelled","canceled","closed","declined"];
// Installed PostgREST transport, completely intercepted. No real requests/keys.
const client=createClient("https://synthetic.invalid","synthetic-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,options)=>{
 const u=new URL(url),q=u.searchParams,table=u.pathname.split("/").pop(),method=options.method||"GET";
 calls.push({table,method,query:q.toString()});
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});
 if(table==="driver_job_bid_offers"){assert.equal(method,"GET");assert.equal(q.get("booking_reference"),"eq."+payload.target_booking_reference);return failPool?reply({message:"offline"},500):reply(pool?[{id:1}]:[]);}
 if(table==="bookings"&&method==="PATCH"){
  if(race)race(row);const patch=JSON.parse(options.body);
  assert.equal(q.get("id"),"eq.490");assert.equal(q.get("updated_at"),"eq."+payload.expected_updated_at);
  if(Object.hasOwn(patch,"driver_payout_override")){
   assert.equal(q.get("booking_reference"),"eq."+payload.target_booking_reference);assert.equal(q.get("driver_id"),"eq.46");
   assert.equal(q.get("or"),"(status.is.null,status.not.in.(completed,cancelled,canceled,closed,declined))");
   if(terminal.includes(row.status)||row.driver_id!==46||row.booking_reference!==payload.target_booking_reference)return reply(null);
  }
  if(row.updated_at!==payload.expected_updated_at)return reply(null);
  writes.push(patch);Object.assign(row,patch);return reply(null);
 }
 if(["booking_route_points","booking_service_items"].includes(table)&&method==="DELETE"){assert.equal(q.get("booking_id"),"eq.490");return reply(null);}
 throw new Error("Unexpected transport "+method+" "+table);
}}});
const ctx={exports:{},require:()=>({loadDriverCombo:async()=>({id:"existing-combo"})}),process:{env:{}},console,textOrNull:text,positiveSafeInteger:v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):null,
 getServerOnlySupabaseClient:()=>({ok:true,data:client}),fetchAdminBookingByReference:async()=>({ok:true,data:structuredClone(row)}),fetchAdminBookingById:async()=>({ok:true,data:structuredClone(row)}),
 bookingUpdatedAtMatches:(a,b)=>Date.parse(a)===Date.parse(b),isVerifiedAdminDispatcherActor:a=>a.boundary_mode==="server-session-role-surface"&&["admin","dispatcher"].includes(a.actor_role)&&a.source_surface==="admin_api",
 safeUpdateConflictError:"version conflict",safeUpdateError:"safe update failure",asRecord:v=>v||{},dbIdentifierOrNull:v=>v??null,
 safeAdapterFailure:(error,status)=>({ok:false,error,status}),bookingToDbRow:(booking,customerId)=>({...plain(booking),customer_id:customerId}),
 routePointToCurrentDbRow:p=>p,routePointToCumulativeDbRow:p=>p,insertRowsWithFallback:async(_client,table,rows)=>{assert.equal(table,"booking_route_points");assert.deepEqual(plain(rows),plain(input.route_points));return {error:null};},
 ensureCustomerContact:async()=>{contacts++;return {ok:true};},createAuditLog:async(...args)=>{audits.push(args);return {ok:true};},mergeSuccessfullyUpdatedDriverFields:r=>r};
vm.runInNewContext(compile(slice(adapter,"export async function updateAdminBookingThroughSupabaseAdapter(","export async function listAdminBookingsThroughSupabaseAdapter(")),ctx);
const update=(p=input,a=actor)=>ctx.exports.updateAdminBookingThroughSupabaseAdapter(p,{},a);
for(const amount of [65,0,88.5,null]){
 reset();const p=structuredClone(input);p.payout_amendment.amount=amount;const r=await update(p);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(writes.length,1);assert.equal(row.driver_payout_override,amount);assert.equal(row.driver_payout_reason,null);assert.equal(r.data.payout_amendment.amount,amount);assert.equal(audits.length,1);assert.equal(contacts,1);
 for(const key of ["customer_id","company_id","booker_id","traveler_id","driver_id","driver_name","driver_contact","driver_plate_number","customer_price_amount","remarks","driver_notes","pickup_datetime","pickup_location","dropoff_location"])assert.deepEqual(row[key],initial[key],"Preserve "+key);
 assert.equal((await update(p)).ok,false,"stale retry rejected");assert.equal(writes.length,1);
}
for(const setup of [()=>row.updated_at="later",()=>row.driver_id=null,()=>row.driver_id=99,()=>row.company_id=99,()=>row.driver_payout_reason="Driver Pool accepted fixed offer.",()=>row.driver_payout_reason="Admin assigned combo total.",()=>pool=true,()=>failPool=true,()=>{row.source_surface="customer_booking_request";row.request_review_status="pending_review";},()=>race=r=>r.updated_at="later",()=>race=r=>r.driver_id=99,...terminal.map(s=>()=>row.status=s),...terminal.map(s=>()=>race=r=>r.status=s),()=>row.admin_internal_status="completed",()=>row.customer_facing_status="cancelled"]){reset();setup();const r=await update();assert.equal(r.ok,false,JSON.stringify(r));assert.equal(writes.length,0);assert.equal(contacts,0);assert.equal(audits.length,0);}
// The real React full-amendment payload may omit customer_id. Existing saved ownership remains authoritative.
reset();const nullCustomer=structuredClone(input);nullCustomer.booking.customer_id=null;assert.equal((await update(nullCustomer)).ok,true);assert.equal(row.customer_id,231);
reset();const changedCustomer=structuredClone(input);changedCustomer.booking.customer_id=999;assert.equal((await update(changedCustomer)).ok,false);assert.equal(writes.length,0);
reset();row.customer_id=null;assert.equal((await update(nullCustomer)).ok,false);assert.equal(writes.length,0);
reset();assert.equal((await update(input,{...actor,actor_role:"driver"})).ok,false);assert.equal(writes.length,0);
reset();ctx.process.env.PRESTIGE_DRIVER_COMBO_ENABLED="true";assert.equal((await update()).ok,false);assert.equal(writes.length,0);ctx.process.env.PRESTIGE_DRIVER_COMBO_ENABLED="false";
reset();const omitted=structuredClone(input);delete omitted.payout_amendment;assert.equal((await update(omitted)).ok,true);assert.equal(row.driver_payout_override,55);assert.equal(calls.some(c=>c.table==="driver_job_bid_offers"),false,"ordinary updates unchanged");
// Actual route/auth/parser/adapter chain, with synthetic session only.
const env={PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:"true",PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE:"server-session-token",PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE:"admin",PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN:"synthetic-token"};
const auth={exports:{},require:()=>crypto,Buffer,URL,process:{env}};vm.runInNewContext(compile(await readFile("lib/admin-dispatcher-auth-boundary.ts","utf8")),auth);
vm.runInNewContext(compile(slice(adapter,"export function adminDispatcherBoundaryToPersistenceAdapterActor(","export const customerBookingRequestPersistenceAdapterActor")),ctx);
let sends=0;const routeCtx={exports:{},Response,Request,URL,console,require(name){if(name.endsWith("/admin-booking-persistence"))return {...parser,loadAdminBookingByReference:async()=>({ok:true,data:structuredClone(row)}),updateAdminBooking:async(p,a,au)=>ctx.exports.updateAdminBookingThroughSupabaseAdapter(p,au,a)};if(name.endsWith("/admin-booking-supabase-adapter"))return ctx.exports;if(name.endsWith("/admin-dispatcher-auth-boundary"))return auth.exports;return new Proxy({},{get:()=>()=>{sends++;throw Error("Unexpected send");}});}};
vm.runInNewContext(compile(route),routeCtx);
const request=(headers={},body=payload)=>new Request("http://localhost/api/admin-bookings",{method:"PATCH",headers:{"content-type":"application/json",origin:"http://localhost",referer:"http://localhost/","x-prestige-admin-purpose":"admin-booking-persistence","x-prestige-admin-session-token":"synthetic-token",...headers},body:JSON.stringify(body)});
for(const amount of [65,null]){reset();const p=structuredClone(payload);p.payout_amendment.amount=amount;const r=await routeCtx.exports.PATCH(request({},p));assert.equal(r.status,200,JSON.stringify(await r.clone().json()));assert.equal((await r.json()).booking.payout_amendment.amount,amount);assert.equal(writes.length,1);assert.equal(sends,0);}
for(const headers of [{origin:"https://evil.invalid"},{referer:"http://localhost/book"},{referer:"http://localhost/driver-job/qa"},{"x-prestige-admin-session-token":"wrong"},{"x-prestige-admin-purpose":"driver-job"}]){reset();assert.equal((await routeCtx.exports.PATCH(request(headers))).status,403);assert.equal(writes.length,0);}
for(const role of ["driver","customer","system"]){reset();env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE=role;assert.equal((await routeCtx.exports.PATCH(request())).status,403);assert.equal(writes.length,0);}
env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE="dispatcher";reset();assert.equal((await routeCtx.exports.PATCH(request())).status,200);assert.equal(writes.length,1);assert.equal(sends,0);
assert.match(slice(app,"  async function updateAppliedAdminBookingOperationalSnapshot(","  function getDispatchCopyText("),/payout_amendment:.*[\s\S]*?amount: clean\(booking.driverPayoutOverride\) \? Number\(booking.driverPayoutOverride\) : null/);
assert.match(app,/record.payout_amendment.amount/);
console.log("Saved override amendment: actual parser, route/auth, adapter and PostgREST transport pass change/zero/clear/omitted, validation, version/driver/terminal races, Pool and CRM guards; no providers or real records.");
