// Synthetic capability tests. No credentials, network, provider, or live records.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return specifier==='server-only'?{url:'data:text/javascript,export {}',shortCircuit:true}:next(specifier,context)}});
const {loadDriverComboAccess}=await import('../lib/driver-job-combo.ts');
const {hashDriverJobLinkToken,isDriverJobLinkExpiryOutsideAllowedWindow}=await import('../lib/driver-job-link.ts');
const {sealDriverNativeJobHandoffToken}=await import('../lib/driver-native-job-handoff.ts');
process.env.PRESTIGE_DRIVER_PORTAL_SESSION_SECRET=randomBytes(40).toString('hex');
const groupId=randomUUID(),revision=randomUUID(),batch=randomUUID();
const now=Date.now(),until=new Date(now+20*86400000).toISOString();
const tokens=[1,2,3].map(()=>randomBytes(32).toString('base64url'));
const refs=['QA-A','QA-B','QA-C'];
const context={combo_id:groupId,combo_revision:revision,combo_link_batch:batch,combo_access_until:until,combo_trip_count:3};
const base={
 driver_job_combos:[{id:groupId,revision,state:'assigned',driver_id:45,vehicle_requirement:'AVF',primary_booking_reference:refs[0]}],
 driver_job_combo_members:refs.map((ref,i)=>({combo_id:groupId,booking_reference:ref,ordinal:i+1})),
 bookings:refs.map((ref,i)=>({booking_reference:ref,public_booking_reference:String(99001+i),customer_id:192,company_id:10,booker_id:20,
   driver_id:45,pickup_at:new Date(now+(i+2)*86400000).toISOString(),service_type:'TRF',pickup_location:'Synthetic pickup',dropoff_location:'Synthetic dropoff',
   route_summary:'Synthetic pickup > Synthetic dropoff',vehicle_type_or_category:'AVF',customer_price:999,internal_admin_notes:'NEVER EXPOSE',driver_payout_override:888})),
 driver_job_links:refs.map((ref,i)=>({id:randomUUID(),booking_reference:ref,driver_id:45,token_hash:hashDriverJobLinkToken(tokens[i]),link_status:'active',expires_at:until,
   revoked_at:null,created_at:new Date(now-10000+i).toISOString(),safe_link_context:{...context,driver_acknowledged_at:new Date(now-1000).toISOString(),
   native_handoff_ciphertext:sealDriverNativeJobHandoffToken({bookingReference:ref,token:tokens[i],tokenHash:hashDriverJobLinkToken(tokens[i])})}})),
 driver_job_status_events:[],
};
let data;
const client={from(table){
 const filters=[];const orders=[];let limit=Infinity,single=false;
 const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,values){filters.push(r=>values.includes(r[k]));return q},
 order(k,o){orders.push([k,o?.ascending!==false]);return q},limit(n){limit=n;return q},single(){single=true;return q},maybeSingle(){single=true;return q},
 then(resolve,reject){try{let rows=(data[table]||[]).filter(r=>filters.every(f=>f(r)));rows.sort((a,b)=>{for(const [key,asc] of orders){if(a[key]===b[key])continue;return (a[key]<b[key]?-1:1)*(asc?1:-1)}return 0});rows=rows.slice(0,limit);return Promise.resolve({data:single?rows[0]||null:rows,error:null}).then(resolve,reject)}catch(e){return Promise.reject(e).then(resolve,reject)}}};return q;
}};
const reset=()=>data=structuredClone(base);
reset();const access=await loadDriverComboAccess(client,tokens[0]);
assert.equal(access.view.vehicle,'AVF');assert.equal(access.view.trips.length,3);assert.deepEqual(access.tokens,tokens);
assert.doesNotMatch(JSON.stringify(access.view),/customer_price|internal_admin|payout|NEVER EXPOSE|customer_id|booker_id|company_id|token_hash/);
assert.equal(isDriverJobLinkExpiryOutsideAllowedWindow(until),true,'Ordinary job limit remains unchanged');
assert.equal(isDriverJobLinkExpiryOutsideAllowedWindow(until,new Date(),undefined,context),false);
assert.equal(isDriverJobLinkExpiryOutsideAllowedWindow(until,new Date(),undefined,{...context,combo_access_until:new Date(now).toISOString()}),true);
assert.equal(isDriverJobLinkExpiryOutsideAllowedWindow(new Date(now+371*86400000),new Date(),undefined,{...context,combo_access_until:new Date(now+371*86400000).toISOString()}),true);
for(const corrupt of [
 ()=>data.bookings[2].driver_id=46,
 ()=>data.bookings[2].booker_id=21,
 ()=>data.driver_job_links[2].revoked_at=new Date().toISOString(),
 ()=>data.driver_job_links[2].safe_link_context.combo_link_batch=randomUUID(),
 ()=>data.driver_job_combo_members.pop(),
 ()=>data.driver_job_combos[0].revision=randomUUID(),
 ()=>data.driver_job_links[0].link_status='revoked',
 ()=>data.driver_job_links[2].safe_link_context.native_handoff_ciphertext='corrupt',
]){reset();corrupt();await assert.rejects(loadDriverComboAccess(client,tokens[0]));}
reset();data.driver_job_links[0].link_status='expired';data.driver_job_links[0].expires_at=new Date(now-1).toISOString();
await assert.rejects(loadDriverComboAccess(client,tokens[0],true),'Expired entry without persisted completion cannot redirect');
data.driver_job_status_events.push({booking_reference:refs[0],status_value:'completed'});
await assert.rejects(loadDriverComboAccess(client,tokens[0]),'Mutation-context access never redirects to a different trip');
const continued=await loadDriverComboAccess(client,tokens[0],true);
assert.equal(continued.redirect,'/driver-job/'+tokens[1]);assert.equal(continued.view.trips[0].completed,true);
assert.equal(continued.view.trips[0].href,null);assert.deepEqual(continued.bookingReferences,refs.slice(1));
data.driver_job_links[0].revoked_at=new Date().toISOString();
await assert.rejects(loadDriverComboAccess(client,tokens[0],true),'Revocation cannot be bypassed by completion');
console.log('PASS combo private access: exact batch, driver and customer ownership, safe projection, scoped expiry, completed-entry navigation and revoked/replaced access rejection.');
