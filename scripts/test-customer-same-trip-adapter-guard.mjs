import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
let source=await readFile('lib/admin-booking-supabase-adapter.ts','utf8');
const ast=ts.createSourceFile('adapter.ts',source,ts.ScriptTarget.Latest,true);
const replacements={
 getServerOnlySupabaseClient:'return {ok:true,data:globalThis.testClient};',
 findOrCreateCustomerId:'return {ok:true,data:booking.customer_id};',
 ensureCustomerContact:'return {ok:true,data:null};'
};
for(const node of [...ast.statements].reverse()) if(ts.isFunctionDeclaration(node)&&replacements[node.name?.text]) {
 const replacement=node.name.text==='findOrCreateCustomerId'?'return {ok:true,data:arguments[1].customer_id};':replacements[node.name.text];
 source=source.slice(0,node.body.pos)+'{'+replacement+'}'+source.slice(node.body.end);
}
const context=vm.createContext({exports:{},require:()=>({}),process:{env:{}},Date,URL,console});
vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const api=context.exports;
const input={booking:{booking_reference:'CUST-SYNTHETIC',customer_id:120,company_id:1,booker_id:5,traveler_id:901,passenger_name:'Synthetic Person',pickup_at:'2026-10-01T04:00:00Z',pickup_location:'A',dropoff_location:'B',service_type:'TRF',vehicle_type_or_category:'AVF',internal_admin_note:'DO NOT COPY'},route_points:[{point_type:'pickup',sequence_number:1,location_text:'A'},{point_type:'stop',sequence_number:2,location_text:'Stop'},{point_type:'dropoff',sequence_number:3,location_text:'B'}],service_items:[]};
let called=0, captured;
context.testClient={rpc:async(name,args)=>{called++;assert.equal(name,'check_customer_same_trip');captured=args.p_group;return {data:[{duplicate:false,in_progress:false,public_reference:null}],error:null};}};
assert.equal((await api.checkCustomerBookingRequestDuplicates([input])).ok,true);
assert.equal(called,1);assert.equal(captured[0].booker_id,5);assert.deepEqual(Array.from(captured[0].stops),['Stop']);
assert.equal(JSON.stringify(captured).includes('DO NOT COPY'),false);
for(const data of [null,[],[{}],[{duplicate:false},{duplicate:false}]]) {
 context.testClient.rpc=async()=>({data,error:null});assert.equal((await api.checkCustomerBookingRequestDuplicates([input])).ok,false);
}
context.testClient.rpc=async()=>{throw new Error('provider details');};assert.equal((await api.checkCustomerBookingRequestDuplicates([input])).error,'customer_trip_check_unavailable');
for(const ref of ['11001','CUST-PRIVATE-REFERENCE','https://example.com']) {
 context.testClient.rpc=async()=>({data:[{duplicate:true,public_reference:ref,in_progress:false}],error:null});
 const result=await api.checkCustomerBookingRequestDuplicates([input]);assert.equal(result.customer_booking_duplicate.reference,ref==='11001'?'11001':null);
}
for(const code of ['PBD01','PBD02','42703']) {
 let writes=0;
 context.testClient={from:()=>({insert:row=>{writes++;assert.equal(row.customer_request_trip_group.length,1);return {select:()=>({single:async()=>({data:null,error:{code,details:JSON.stringify({public_reference:'11001',in_progress:false})}})})};}})};
 const result=await api.createAdminBookingThroughSupabaseAdapter(input,{},api.customerBookingRequestPersistenceAdapterActor,[input]);
 assert.equal(result.ok,false);assert.equal(writes,1,'Guarded insert must never retry through legacy schema fallback');
 if(code==='PBD01') assert.equal(result.customer_booking_duplicate.reference,'11001');
}
console.log('Same-trip adapter guard passed: real projection, private-field exclusion, unavailable checks, duplicate mapping and one guarded insert.');
