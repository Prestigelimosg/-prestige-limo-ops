// Execute the production link adapter with actual token sealing and synthetic persistence/provider boundaries.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as crypto from 'node:crypto';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return specifier==='server-only'?{url:'data:text/javascript,export {}',shortCircuit:true}:next(specifier,context)}});
const links=await import('../lib/driver-job-link.ts');
const handoff=await import('../lib/driver-native-job-handoff.ts');
const combos=await import('../lib/driver-job-combo.ts');
Object.assign(process.env,{PRESTIGE_DRIVER_COMBO_ENABLED:'true',PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:'true',
 PRESTIGE_DRIVER_PORTAL_SESSION_SECRET:crypto.randomBytes(40).toString('hex'),SUPABASE_URL:'https://db.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only'});
const id=crypto.randomUUID(),revision=crypto.randomUUID(),batch=crypto.randomUUID(),now=new Date().toISOString();
const refs=['QA-COMBO-A','QA-COMBO-B','QA-COMBO-C'];
const data={
 driver_job_combos:[{id,revision,primary_booking_reference:refs[0],state:'assigned',driver_id:45,vehicle_requirement:'AVF',total_payout_sgd:135}],
 driver_job_combo_members:refs.map((ref,i)=>({combo_id:id,booking_reference:ref,ordinal:i+1})),
 bookings:refs.map((ref,i)=>({booking_reference:ref,public_booking_reference:String(99101+i),customer_id:192,company_id:10,booker_id:20,driver_id:45,updated_at:now,
   pickup_at:`2026-10-0${i+1}T05:00:00.000Z`,service_type:'TRF',pickup_location:'QA Hotel '+i,dropoff_location:'QA Terminal '+i,route_summary:'QA Hotel '+i+' > QA Terminal '+i,
   passenger_name:'QA Passenger',flight_no:'',driver_name:'QA Driver',driver_contact:'00000001',driver_plate_number:'QA1234A',vehicle_type_or_category:'AVF',
   booking_route_points:[],customer_price:999,internal_admin_notes:'NEVER EXPOSE'})),driver_job_links:[],
};
const calls=[],sends=[];let reserveClaimed=false,rpcFailure=false;
const client={from(table){const filters=[];let single=false,limit=Infinity,updates=null;
 const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},gt(k,v){filters.push(r=>r[k]>v);return q},order(){return q},limit(v){limit=v;return q},maybeSingle(){single=true;return q},single(){single=true;return q},update(v){updates=v;return q},
 then(resolve,reject){let rows=(data[table]||[]).filter(r=>filters.every(f=>f(r))).slice(0,limit);if(updates)rows.forEach(r=>Object.assign(r,updates));return Promise.resolve({data:single?rows[0]||null:rows,error:null}).then(resolve,reject)}};return q;},
 async rpc(name,args){calls.push({name,args});
   if(name==='apply_admin_driver_job_combo_links'){
     if(rpcFailure)return {data:null,error:{code:rpcFailure}};
     assert.deepEqual(args.p_links.map(p=>p.booking_reference),refs);
     assert.doesNotMatch(JSON.stringify(args.p_links),/customer_price|NEVER EXPOSE|internal_admin/);
     const reused=data.driver_job_links.length>0;
     if(!reused)data.driver_job_links=args.p_links.map(p=>({id:crypto.randomUUID(),booking_reference:p.booking_reference,driver_id:45,token_hash:p.token_hash,
       actor_role:'admin',actor_label:'Synthetic QA',source_surface:'admin_api',created_at:now,issued_at:now,updated_at:now,expires_at:'2026-10-08T00:00:00.000Z',link_status:'active',revoked_at:null,
       safe_link_context:{driver_job_payload:p.payload,job_card_revision:p.revision,native_handoff_ciphertext:p.ciphertext,combo_id:id,combo_revision:revision,combo_link_batch:batch,combo_primary_reference:refs[0],combo_trip_count:3,combo_vehicle:'AVF'}}));
     return {data:{links:data.driver_job_links.map(link=>({link,disposition:reused?'reused':'created'}))},error:null};
   }
   assert.equal(name,'reserve_driver_job_link_delivery');assert.equal(args.p_booking_reference,refs[0]);
   if(reserveClaimed)return {data:{claimed:false,reason:'already_requested'},error:null};
   reserveClaimed=true;return {data:{claimed:true,audit_id:crypto.randomUUID(),safe_context:{delivery_kind:'created'}},error:null};
 }};
const harnessModule={exports:{}};
const code=ts.transpileModule(fs.readFileSync('lib/admin-driver-job-link-persistence.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','module','exports',code)(name=>{
 if(name==='server-only')return {};
 if(name==='node:crypto')return crypto;
 if(name==='@supabase/supabase-js')return {createClient:()=>client};
 if(name==='./admin-booking-supabase-adapter')return {checkAdminBookingPersistenceStagingConfigReadiness:()=>({ok:true})};
 if(name==='./driver-job-link')return links;
 if(name==='./driver-native-job-handoff')return handoff;
 if(name==='./driver-job-combo.ts')return combos;
 if(name==='./admin-driver-ack-reminder')return {};
 if(name==='./driver-device-push-notification')return {sendDriverDevicePushAlertForNewJobLink:async(_client,input)=>{sends.push(input);return {native_provider_accepted:true}}};
 throw new Error('Unexpected import '+name);
},harnessModule,harnessModule.exports);
const input={booking_reference:refs[0],ttl_hours:96,request_id:crypto.randomUUID(),driver_job_payload:{booking_type:'TRF',pickup_date:'2026-10-01',pickup_time:'1300',pickup_datetime:data.bookings[0].pickup_at,
 pickup_location:'QA Hotel 0',dropoff_location:'QA Terminal 0',route:'QA Hotel 0 > QA Terminal 0',passenger_name:'QA Passenger',flight_no:'',assigned_driver_name:'QA Driver',assigned_driver_contact:'00000001',assigned_driver_plate:'QA1234A',assigned_driver_vehicle_model:'AVF',status:'assigned',waypoints:[]}};
const actor={actor_role:'admin',actor_label:'Synthetic QA',source_surface:'admin_api',boundary_mode:'server-session-role-surface'};
for(const code of ['40001','PT409']){
 rpcFailure=code;const rejected=await harnessModule.exports.createAdminDriverJobLink(input,actor);
 assert.equal(rejected.ok,false);assert.equal(rejected.status,409);assert.equal(sends.length,0);
}
rpcFailure=false;
const created=await harnessModule.exports.createAdminDriverJobLink(input,actor);assert.equal(created.ok,true,JSON.stringify(created));
assert.deepEqual(created.data.combo_booking_references,refs);assert.equal(sends.length,1);assert.equal(data.driver_job_links.length,3);
assert.equal(links.hashDriverJobLinkToken(created.data.driver_job_token),data.driver_job_links[0].token_hash);
assert.equal(sends[0].driver_job_token,created.data.driver_job_token);
const retry=await harnessModule.exports.createAdminDriverJobLink(input,actor);assert.equal(retry.ok,true);assert.equal(retry.data.driver_job_token,created.data.driver_job_token);
assert.equal(sends.length,1,'Response-loss retry must not send a duplicate');
assert.equal(calls.some(c=>c.name==='apply_admin_driver_job_link'),false,'One atomic package RPC, no separate member HTTP writes');
console.log('PASS production combo link adapter: saved-trip payloads, actual sealed token recovery, one primary delivery, no sends after failed persistence, stable retry and no duplicate delivery.');
