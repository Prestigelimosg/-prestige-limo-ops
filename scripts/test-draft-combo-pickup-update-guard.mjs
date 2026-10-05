// Execute the real update adapter and the existing Update + Cal handoff.
// External boundaries are synthetic; any unexpected write fails this test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {makeHarness} from './test-update-cal-bookings-return-guard.mjs';
const read=file=>ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const adapterAst=read('lib/admin-booking-supabase-adapter.ts');
const pageAst=read('app/page.tsx');
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const find=(ast,name)=>{let result; const visit=n=>{if(ts.isFunctionDeclaration(n)&&n.name?.text===name)result=n;ts.forEachChild(n,visit);};visit(ast);assert.ok(result,name);return result;};
const stubbed=new Set(['getServerOnlySupabaseClient','fetchAdminBookingByReference','fetchAdminBookingById','createAuditLog','ensureCustomerContact','insertRowsWithFallback']);
const code=adapterAst.statements.filter(n=>ts.isVariableStatement(n)||(ts.isFunctionDeclaration(n)&&!stubbed.has(n.name?.text))).map(n=>n.getText(adapterAst)).join('\n').replace('await import("./driver-job-combo.ts")','await __loadCombo()');
const remarkModule={exports:{}};
new Function('exports',compile(fs.readFileSync('lib/driver-job-remark.ts','utf8')))(remarkModule.exports);
let saved,combo,calls,rpcFailure,auditFailure,client;
const initial={id:'2',booking_reference:'QA-RET',customer_id:'192',company_id:10,booker_id:20,traveler_id:30,
  pickup_at:'2026-10-07T10:35:00.000Z',pickup_datetime:'2026-10-07T10:35:00.000Z',updated_at:'2026-10-05T03:00:00.000Z',
  service_type:'TRF',route_type:'TRF',pickup_location:'QA Quay',dropoff_location:'QA Hotel',route_summary:'QA Quay > QA Hotel',
  passenger_name:'SYNTHETIC PASSENGER',customer_display_name:'Synthetic account',contact_display_name:'QA Booker',contact_phone:'00000000',
  driver_id:null,driver_name:null,driver_contact:null,driver_plate_number:null,vehicle_type_or_category:'AVF',pax_count:1,
  source_surface:'admin_dashboard',admin_internal_status:'Draft',customer_facing_status:'Received',request_review_status:'pending_review',
  route_points:[{point_type:'pickup',sequence_number:1,location_text:'QA Quay'},{point_type:'dropoff',sequence_number:2,location_text:'QA Hotel'}],service_items:[]};
const nextPickup='2026-10-07T12:35:00.000Z';
function reset(){
  saved=structuredClone(initial); calls=[];rpcFailure=false;auditFailure=false;
  combo={id:'11111111-1111-4111-8111-111111111111',revision:'22222222-2222-4222-8222-222222222222',state:'draft',driver_id:null,offer_key:null,primary_booking_reference:'QA-OUT',trips:[
    {booking_reference:'QA-OUT',updated_at:initial.updated_at},{booking_reference:'QA-RET',updated_at:initial.updated_at}]};
  client={rpc:async(name,args)=>{
    assert.equal(name,'define_driver_job_combo');calls.push({kind:'rpc',args});
    assert.equal(args.p_primary,'QA-OUT');assert.equal(args.p_expected_revision,combo.revision);
    const changed=args.p_members.filter(m=>Object.hasOwn(m,'pickup_at'));assert.equal(changed.length,1);
    assert.equal(changed[0].booking_reference,'QA-RET');
    if(rpcFailure)return {error:{code:'PT409',message:'private SQL diagnostic'}};
    saved={...saved,pickup_at:changed[0].pickup_at,pickup_datetime:changed[0].pickup_at,updated_at:'2026-10-05T04:00:00.000Z'};
    return {data:{id:combo.id,revision:'33333333-3333-4333-8333-333333333333'}};
  },from:table=>{
    let change;
    const q={update:value=>{assert.equal(table,'bookings');change=value;return q;},delete:()=>{calls.push({kind:'delete',table});return q;},eq:()=>q,
      then:resolve=>{if(change){calls.push({kind:'ordinary-update'});saved={...saved,...change,pickup_datetime:change.pickup_at};}return Promise.resolve({error:null}).then(resolve);}};
    return q;
  }};
}
const adapterModule={exports:{}};
const dependencies={
  getServerOnlySupabaseClient:()=>({ok:true,data:client}),
  fetchAdminBookingByReference:async()=>({ok:true,data:structuredClone(saved)}),
  fetchAdminBookingById:async()=>{calls.push({kind:'reload'});return {ok:true,data:structuredClone(saved)};},
  createAuditLog:async()=>{calls.push({kind:'audit'});return auditFailure?{ok:false,status:500,error:'Audit unavailable'}:{ok:true,data:null};},
  ensureCustomerContact:async()=>({ok:true,data:null}),
  insertRowsWithFallback:async()=>({error:null}),
  __loadCombo:async()=>({loadDriverCombo:async()=>structuredClone(combo)}),
  ...remarkModule.exports,
};
new Function('exports',...Object.keys(dependencies),compile(code))(adapterModule.exports,...Object.values(dependencies));
const actor={actor_role:'admin',actor_label:'Synthetic QA',source_surface:'admin_api',boundary_mode:'verified-admin-session'};
const input=()=>{const {updated_at,route_points,service_items,...booking}=structuredClone(initial);delete booking.id;return {target_booking_reference:booking.booking_reference,expected_updated_at:updated_at,
  booking:{...booking,customer_id:192,pickup_at:undefined,pickup_datetime:nextPickup},route_points,service_items};};
const update=value=>adapterModule.exports.updateAdminBookingThroughSupabaseAdapter(value,{},actor);
process.env.PRESTIGE_DRIVER_COMBO_ENABLED='true';
reset();assert.equal((await update(input())).ok,true);assert.equal(saved.pickup_at,nextPickup);
assert.deepEqual(calls.map(c=>c.kind),['rpc','reload','audit']);
assert.equal(calls[0].args.p_members[0].pickup_at,undefined);
reset();const decorated=input();
decorated.booking.customer_display_name=`${initial.customer_display_name} [${initial.passenger_name}]`;
assert.equal((await update(decorated)).ok,true);
assert.equal(saved.customer_display_name,initial.customer_display_name,'Form display decoration must never rewrite the saved account');
reset();combo.trips[1].updated_at='2026-10-05T03:30:00.000Z';await update(input());
assert.equal(calls[0].args.p_members[1].updated_at,initial.updated_at,'Do not replace the original target version with a later membership read');
for(const mutate of [
  x=>{x.expected_updated_at=null;},x=>{x.expected_updated_at='2026-10-04T00:00:00Z';},
  x=>{x.booking.customer_id=999;},x=>{x.booking.company_id=11;},x=>{x.booking.booker_id=21;},x=>{x.booking.traveler_id=31;},
  x=>{x.booking.customer_display_name='Changed account';},
  x=>{x.booking.customer_display_name=`${initial.customer_display_name} [Someone else]`;},
  x=>{x.booking.customer_display_name=`${initial.customer_display_name} [${initial.passenger_name}]`;x.booking.customer_id=999;},
  x=>{x.booking.customer_display_name=`${initial.customer_display_name} [${initial.passenger_name}]`;x.booking.passenger_name='Someone else';},
  x=>{x.booking.service_type='DSP';},x=>{x.booking.pickup_location='Changed';},x=>{x.booking.passenger_name='Changed';},
  x=>{x.booking.driver_id=1;},x=>{x.booking.driver_name='Changed';},x=>{x.booking.dropoff_datetime='2026-10-07T14:00:00Z';},
  x=>{x.route_points[0].location_text='Changed';},x=>{x.service_items=[{service_item_type:'extra_stop',quantity:1}];},
  ()=>{combo.state='offered';},()=>{combo.state='assigned';},()=>{combo.driver_id=1;},()=>{combo.offer_key='posted';},
]){reset();const value=input();mutate(value);assert.equal((await update(value)).ok,false);assert.equal(calls.length,0);assert.deepEqual(saved,initial);}
reset();rpcFailure=true;assert.equal((await update(input())).ok,false);assert.deepEqual(calls.map(c=>c.kind),['rpc']);assert.deepEqual(saved,initial);
reset();combo=null;assert.equal((await update(input())).ok,true);assert.ok(calls.some(c=>c.kind==='ordinary-update'));assert.ok(!calls.some(c=>c.kind==='rpc'));
console.log('PASS real adapter: one atomic combo call and existing audit, unchanged ordinary writer, stale target protection and unrelated-field/state rejection.');

// Exercise the actual existing browser handoff, including its catch/finally.
const ui=find(pageAst,'updateAppliedAdminBookingOperationalSnapshot');
const uiTry=ui.body.statements.find(n=>ts.isTryStatement(n)&&n.getText(pageAst).includes('autoSyncSavedBookingGoogleCalendar(updatedBooking)'));
assert.ok(uiTry);
const formatter=compile(find(pageAst,'adminBookingPersistenceFailureMessage').getText(pageAst));
const format=new Function('clean',formatter+';return adminBookingPersistenceFailureMessage;')(v=>String(v||'').trim());
async function handoff(calendarOk){
  const order=[],messages=[];
  const noop=()=>{};
  const context={cancelDriverAssignment:false,assignmentOnly:false,dispatchCombo:combo,booking:{},payload:input(),expectedUpdatedAt:initial.updated_at,targetBookingReference:'QA-RET',
    fetch:async()=>{order.push('save');const r=await update(input());return {ok:r.ok,status:r.status||200,json:async()=>r.ok?{ok:true,booking:r.data}:{ok:false,error:r.error}};},
    adminBookingPersistenceFailureDetail:r=>r.error,adminBookingPersistenceFailureMessage:format,clean:v=>String(v||'').trim(),
    markAdminBookingAsActiveForUpdates:noop,upsertLoadedBookingFromAdminRecord:noop,
    setAdminBookingPersistenceMessage:m=>messages.push(m),setMessage:noop,setBookingSaveMessage:noop,setAdminBookingPersistenceAction:noop,
    autoSyncSavedBookingGoogleCalendar:async b=>{order.push('calendar');assert.equal(b.pickup_at,nextPickup);assert.equal(b.booking_reference,'QA-RET');return {ok:calendarOk,message:'Calendar temporarily unavailable'};},
    acceptingCustomerRequest:false,updateContextRevision:1,driverJobLinkFormContextRevisionRef:{current:1},updateFormSignature:'same',adminBookingFormSyncSignature:()=> 'same',bookingFormRef:{current:{}},
    updateBookingMessage:'',bookingMessageRef:{current:{value:''}},updateOriginTab:'Dispatch',activeTabRef:{current:'Dispatch'},
    lastSuccessfulBookingSaveRef:{current:null},getBookingSaveGuardKey:()=> 'key',customerReturnUrl:null,returnToBookings:false,
    retainSavedBookingForDriverJobLinkHandoff:()=>order.push('retain'),returnToCustomerFolderAfterUpdate:noop,
  };
  const run=new Function('context','with(context){return (async()=>{'+compile(uiTry.getText(pageAst))+'})();}');
  await run(context);return {order,messages};
}
reset();assert.deepEqual((await handoff(true)).order,['save','calendar','retain']);
reset();rpcFailure=true;const failed=await handoff(true);assert.deepEqual(failed.order,['save']);assert.match(failed.messages.at(-1).text,/combo pickup update was not confirmed/);
reset();auditFailure=true;assert.deepEqual((await handoff(true)).order,['save']);
reset();const calendarFailed=await handoff(false);assert.deepEqual(calendarFailed.order,['save','calendar']);assert.equal(saved.pickup_at,nextPickup);assert.match(calendarFailed.messages.at(-1).text,/Calendar temporarily unavailable/);
console.log('PASS existing Update + Cal handoff: exact saved time reaches Calendar only after success; rejected update/audit never sync; Calendar failure retains saved booking with visible feedback.');

// Also execute the complete callback, including its version/identity preflight.
reset();
const full=makeHarness({otherOrigin:true});
Object.assign(full.env,{
  dispatchCombo:combo,record:saved,appliedAdminBookingSnapshot:saved,
  appliedAdminBookingSnapshotReference:'QA-RET',loadedBookingId:'QA-RET',
  appliedAdminBookingSnapshotReferenceRef:{current:'QA-RET'},loadedBookingIdRef:{current:'QA-RET'},
  verifyLoadedAdminBookingVersionBeforeUpdate:async()=>initial.updated_at,
  buildAdminBookingPersistencePayload:()=>input(),
  adminBookingPersistenceFailureDetail:r=>r.error,
  adminBookingPersistenceFailureMessage:format,
  fetch:async(url,init)=>{
    assert.equal(url,'/api/admin-bookings');assert.equal(init.method,'PATCH');
    const r=await update(JSON.parse(init.body));
    assert.equal(r.ok,true);
    full.env.requests.push({url,method:init.method});
    return {ok:true,json:async()=>({ok:true,booking:r.data})};
  },
});
await full.update();
assert.equal(full.env.requests.length,1);
assert.equal(full.env.calendarCalls.length,1);
assert.equal(full.env.calendarCalls[0].pickup_at,nextPickup);
assert.equal(full.env.calendarCalls[0].booking_reference,'QA-RET');
assert.equal(full.env.notifications.length,0);
assert.equal(full.env.retained,1);
console.log('PASS full existing Update + Cal callback through preflight, PATCH, real adapter, exact persisted Calendar handoff and retained booking.');
