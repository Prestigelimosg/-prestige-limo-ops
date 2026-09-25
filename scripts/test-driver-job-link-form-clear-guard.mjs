import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findNode(predicate) {
  let result;
  function visit(node) { if (predicate(node)) result = node; else ts.forEachChild(node, visit); }
  visit(tree); assert.ok(result, 'Missing production callback'); return result;
}
function fn(name) { return findNode(n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(tree); }
const memo = findNode(n => ts.isVariableDeclaration(n) && n.name.getText(tree) === 'driverJobLinkMessage');
const resetEffect = findNode(n => ts.isCallExpression(n) && n.expression.getText(tree) === 'useEffect' &&
  n.arguments[0]?.getText(tree).includes('const bookingReference = clean(dispatchReleaseWorkflowBookingReference);') &&
  n.arguments[0]?.getText(tree).includes('setAdminDriverJobLinkState'));
export const runtime = ts.transpileModule([
  fn('adminBookingFormSyncSignature'), fn('createDriverJobLink'), fn('copyDriverJobLink'),
  `const copyMessage = ${memo.initializer.arguments[0].getText(tree)};`,
  `const syncSelection = ${resetEffect.arguments[0].getText(tree)};`,
  'return {createDriverJobLink, copyDriverJobLink, copyMessage, syncSelection};',
].join('\n'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;

// Real production callbacks; only UI setters, clipboard and network are replaced.
export function makeHarness(runtime, assigned = true, resultOverrides = {}) {
  const env = {
    clean:v=>String(v??'').trim(), cleanReferenceText:v=>String(v??'').trim(),
    booking:{name:'QA FIRST PASSENGER',date:'2030-10-01',time:'1300',pickup:'QA START',dropoff:'QA END',extraStopLocation:'',driverId:assigned?'8':''},
    dispatchPublicBookingReference:'99001', dispatchReleaseWorkflowBookingReference:'QA-ONE',
    appliedAdminBookingSnapshot:{driver_id:assigned?8:null}, activeTab:'dispatch',
    isDspItinerary:false, itineraryDisplayStops:[],
    driverJobLinkCreateAttemptRef:{current:null}, driverJobLinkFormContextRevisionRef:{current:0},
    driverJobLinkRequestRevisionRef:{current:0}, bookingMessageRef:{current:{value:'QA ORIGINAL MESSAGE'}},
    appliedAdminBookingSnapshotReferenceRef:{current:'QA-ONE'},loadedBookingIdRef:{current:'QA-ONE'},
    adminDriverJobLinkState:{action:null,link:null,loadedReference:'',oneTimeUrl:'',message:null},
    dashboard:{linksByReference:{},status:'idle'},copies:[],resets:0,requestCount:0,
    crypto:{randomUUID:()=> 'qa-request-id'}, adminDriverJobLinksApiPath:'/api/admin-driver-job-links', adminLegacyDataPurpose:'admin-booking-persistence',
    adminVisibleBookingReference:()=> '99001',adminDriverJobLinkFailureMessage:e=>e.message,
    formatBookingTimestampSgt:v=>v,formatPickupDateTime:(d,t)=>`${d} ${t}`,
    dispatchCopyLocationFlightParts:b=>({pickup:b.pickup,dropoff:b.dropoff,standaloneFlightLine:''}),
  };
  env.bookingFormRef={current:env.booking};
  env.buildAdminDriverJobLinkCreatePayload=()=>({ok:true,data:{booking_reference:'QA-ONE',driver_job_payload:{passenger_name:env.booking.name},ttl_hours:96}});
  const set=(key)=>(value)=>{env[key]=typeof value==='function'?value(env[key]):value;};
  env.setAdminDriverJobLinkState=set('adminDriverJobLinkState');
  env.setDriverJobLinkCopyMessage=set('copyFeedback');
  env.setDashboardDriverJobLinksReadState=set('dashboard');
  env.setAdminActiveJobsMapReadState=()=>{};
  env.resetAdminBookingDraft=()=>{env.resets++;env.driverJobLinkFormContextRevisionRef.current++;env.booking={name:'',date:'',time:'',pickup:'',dropoff:'',extraStopLocation:'',driverId:''};env.bookingFormRef.current=env.booking;env.dispatchReleaseWorkflowBookingReference='';env.appliedAdminBookingSnapshotReferenceRef.current='';env.loadedBookingIdRef.current='';env.bookingMessageRef.current.value='';};
  env.refreshAdminDriverJobLinkForReference=async()=>{};
  env.navigator={clipboard:{writeText:async text=>{if(env.beforeCopy)await env.beforeCopy();if(env.copyFails)throw Error('denied');env.copies.push(text);}}};
  const link={id:'qa-link-1',booking_reference:'QA-ONE',link_status:'active',expires_at:'2030-10-05',safe_summary:{acknowledged:false}};
  env.result={ok:true,disposition:'created',link,driver_job_url:'https://example.invalid/driver-job/QA-ONE',native_app_alert:{reason:'provider_failed'},...resultOverrides};
  env.fetch=async()=>{env.requestCount++;if(env.beforeResponse)await env.beforeResponse();if(env.networkFails)throw Error('network failure');return{ok:env.result.ok,json:async()=>env.result};};
  const callbacks=new Function('env',`with(env){${runtime}}`)(env);
  Object.defineProperty(env,'activeAdminDriverJobLink',{get:()=>env.adminDriverJobLinkState.link?.booking_reference===env.dispatchReleaseWorkflowBookingReference?env.adminDriverJobLinkState.link:null});
  Object.defineProperty(env,'driverJobLinkMessage',{get:callbacks.copyMessage});
  env.edit=patch=>{env.booking={...env.booking,...patch};env.bookingFormRef.current=env.booking;};
  env.nextBooking=()=>{env.driverJobLinkFormContextRevisionRef.current++;env.dispatchReleaseWorkflowBookingReference='QA-TWO';env.appliedAdminBookingSnapshotReferenceRef.current='QA-TWO';env.loadedBookingIdRef.current='QA-TWO';env.edit({name:'QA SECOND PASSENGER'});};
  return {env,...callbacks};
}

export async function runChecks() {
  assert.match(source,/showDriverJobLinkCopy \|\| \(adminDriverJobLinkState.copySnapshot && adminDriverJobLinkState.oneTimeUrl\)/);
  assert.match(source,/data-driver-job-link-retained-copy=/);
  assert.match(fs.readFileSync(new URL('../app/globals.css',import.meta.url),'utf8'),/\[data-mobile-dispatch-step="message"\]\s*> \.contents\s*> \[data-driver-job-link-retained-copy="true"\]/);
  for(const disposition of ['created','reused','amended']) {
    const h=makeHarness(runtime,true,{disposition});
    h.env.edit({customerPriceOverride:'SECRET_CUSTOMER_PRICE',internalAdminNotes:'SECRET_INTERNAL_NOTE',driverPayoutOverride:'SECRET_PAYOUT'});
    await h.createDriverJobLink();
    assert.equal(h.env.resets,1,'Assigned Create Link success must empty the editable form');
    h.syncSelection();
    assert.ok(h.env.adminDriverJobLinkState.oneTimeUrl,'Empty form must retain exact issued URL');
    assert.match(h.env.adminDriverJobLinkState.message.text,/Phone alert could not be confirmed/);
    assert.match(h.copyMessage(),/QA FIRST PASSENGER/);
    h.env.edit({name:'QA NEW DRAFT',pickup:'ANOTHER PICKUP'});
    await h.copyDriverJobLink();
    assert.match(h.env.copies[0],/QA FIRST PASSENGER/);
    assert.doesNotMatch(h.env.copies[0],/QA NEW DRAFT|ANOTHER PICKUP/);
    assert.doesNotMatch(h.env.copies[0],/SECRET_CUSTOMER_PRICE|SECRET_INTERNAL_NOTE|SECRET_PAYOUT/);
    assert.equal(h.env.booking.name,'QA NEW DRAFT');assert.equal(h.env.resets,1);
    assert.equal(h.env.requestCount,1);assert.equal(h.env.dashboard.linksByReference['QA-ONE'].id,'qa-link-1');
    h.env.nextBooking();h.syncSelection();
    assert.equal(h.env.adminDriverJobLinkState.oneTimeUrl,'','Loading another booking retires prior copy');
  }
  const unassigned=makeHarness(runtime,false);await unassigned.createDriverJobLink();
  assert.equal(unassigned.env.resets,0);unassigned.env.copyFails=true;await unassigned.copyDriverJobLink();assert.equal(unassigned.env.resets,0);
  unassigned.env.copyFails=false;await unassigned.copyDriverJobLink();assert.equal(unassigned.env.resets,1);unassigned.syncSelection();
  assert.match(unassigned.copyMessage(),/QA FIRST PASSENGER/);
  for(const change of ['form','message','context']) {
    const h=makeHarness(runtime,true);h.env.beforeResponse=async()=>{if(change==='form')h.env.edit({name:'NEW EDIT'});else if(change==='message')h.env.bookingMessageRef.current.value='NEW MESSAGE';else h.env.nextBooking();};
    await h.createDriverJobLink();assert.equal(h.env.resets,0,`Do not clear newer ${change}`);
    if(change==='context')assert.equal(h.env.adminDriverJobLinkState.oneTimeUrl,'');
  }
  const copyRace=makeHarness(runtime,false);await copyRace.createDriverJobLink();copyRace.env.beforeCopy=async()=>copyRace.env.edit({name:'EDIT DURING COPY'});
  await copyRace.copyDriverJobLink();assert.equal(copyRace.env.resets,0);assert.equal(copyRace.env.booking.name,'EDIT DURING COPY');
  for(const overrides of [{ok:false,error:'Rejected'}, {ok:true,driver_job_url:''}, {link:{booking_reference:'WRONG-BOOKING'}}]) {
    const h=makeHarness(runtime,true,overrides);await h.createDriverJobLink();assert.equal(h.env.resets,0);assert.equal(h.env.adminDriverJobLinkState.oneTimeUrl,'');
  }
  const network=makeHarness(runtime);network.env.networkFails=true;await network.createDriverJobLink();assert.equal(network.env.resets,0);
  const switched=makeHarness(runtime);switched.env.beforeResponse=async()=>{switched.env.nextBooking();switched.env.networkFails=true;};await switched.createDriverJobLink();assert.equal(switched.env.resets,0);assert.equal(switched.env.adminDriverJobLinkState.oneTimeUrl,'');
  const newerRequest=makeHarness(runtime);newerRequest.env.beforeResponse=async()=>{newerRequest.env.driverJobLinkRequestRevisionRef.current++;newerRequest.env.dashboard={linksByReference:{'QA-ONE':{id:'NEWER'}},status:'loaded'};};await newerRequest.createDriverJobLink();assert.equal(newerRequest.env.resets,0);assert.equal(newerRequest.env.dashboard.linksByReference['QA-ONE'].id,'NEWER');
  const invalid=makeHarness(runtime);invalid.env.buildAdminDriverJobLinkCreatePayload=()=>({ok:false,error:'Unsaved amendment'});await invalid.createDriverJobLink();assert.equal(invalid.env.requestCount,0);assert.equal(invalid.env.resets,0);
  const dsp=makeHarness(runtime,true);dsp.env.isDspItinerary=true;dsp.env.itineraryDisplayStops=[{time:'1300',location:'FIRST STOP'},{time:'1500',location:'SECOND STOP'}];await dsp.createDriverJobLink();dsp.syncSelection();assert.match(dsp.copyMessage(),/1300 - FIRST STOP/);assert.match(dsp.copyMessage(),/1500 - SECOND STOP/);
  console.log('PASS Driver link form clear: assigned/unassigned, exact retained copy, next booking, failed create/copy, late responses, newer draft, DSP and queue handoff. Synthetic callbacks; no live sends.');
}
if(process.argv[1]===new URL(import.meta.url).pathname) await runChecks();
