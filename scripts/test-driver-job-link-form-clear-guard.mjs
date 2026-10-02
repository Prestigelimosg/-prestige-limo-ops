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
function callback(name) { return findNode(n => ts.isVariableDeclaration(n) && n.name.getText(tree) === name).initializer.arguments[0].getText(tree); }
const memo = findNode(n => ts.isVariableDeclaration(n) && n.name.getText(tree) === 'driverJobLinkMessage');
const resetEffect = findNode(n => ts.isCallExpression(n) && n.expression.getText(tree) === 'useEffect' &&
  n.arguments[0]?.getText(tree).includes('const bookingReference = clean(dispatchReleaseWorkflowBookingReference);') &&
  n.arguments[0]?.getText(tree).includes('setAdminDriverJobLinkState'));
let acknowledgementEffect;
function findAcknowledgementEffect(node) {
  if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect' &&
      node.arguments[0]?.getText(tree).includes('const acknowledgedCopySnapshot =')) acknowledgementEffect = node.arguments[0].getText(tree);
  ts.forEachChild(node, findAcknowledgementEffect);
}
findAcknowledgementEffect(tree);
export const runtime = ts.transpileModule([
  fn('adminBookingFormSyncSignature'), fn('safeDriverVehicleModelDisplay'),
  `const mergeCurrentBookingDriverDetailsFromActiveLink = ${callback('mergeCurrentBookingDriverDetailsFromActiveLink')};`,
  `const refreshAdminDriverJobLinkForReference = ${callback('refreshAdminDriverJobLinkForReference')};`,
  fn('createDriverJobLink'), fn('copyDriverJobLink'),
  `const copyMessage = ${memo.initializer.arguments[0].getText(tree)};`,
  `const syncSelection = ${resetEffect.arguments[0].getText(tree)};`,
  `const reconcileAcknowledgedCopy = ${acknowledgementEffect || '() => {}'};`,
  'return {createDriverJobLink, copyDriverJobLink, copyMessage, syncSelection, refreshAdminDriverJobLinkForReference, reconcileAcknowledgedCopy};',
].join('\n'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;

// Real production callbacks; only UI setters, clipboard and network are replaced.
export function makeHarness(runtime, assigned = true, resultOverrides = {}) {
  const env = {
    clean:v=>String(v??'').trim(), cleanReferenceText:v=>String(v??'').trim(),
    booking:{name:'QA FIRST PASSENGER',date:'2030-10-01',time:'1300',pickup:'QA START',dropoff:'QA END',extraStopLocation:'',vehicle:'Combi',driverId:assigned?'8':'',driverName:'',driverContact:'',driverPlate:'',driverVehicleModel:''},
    dispatchPublicBookingReference:'99001', dispatchReleaseWorkflowBookingReference:'QA-ONE',
    appliedAdminBookingSnapshot:{driver_id:assigned?8:null}, activeTab:'dispatch',
    isDspItinerary:false, itineraryDisplayStops:[],
    driverJobLinkCreateAttemptRef:{current:null}, driverJobLinkFormContextRevisionRef:{current:0},
    driverJobLinkRequestRevisionRef:{current:0}, bookingMessageRef:{current:{value:'QA ORIGINAL MESSAGE'}},
    appliedAdminBookingSnapshotReferenceRef:{current:'QA-ONE'},loadedBookingIdRef:{current:'QA-ONE'},
    adminDriverJobLinkState:{action:null,link:null,loadedReference:'',oneTimeUrl:'',message:null},
    saving:false, adminBookingPersistenceAction:null, adminBookingCrossDeviceConflict:null, aiAssistLoading:false, aiAssistMode:'parser', copyEditStates:{}, document:{visibilityState:'visible'}, dashboard:{linksByReference:{},status:'idle'},copies:[],resets:0,requestCount:0,
    crypto:{randomUUID:()=> 'qa-request-id'}, adminDriverJobLinksApiPath:'/api/admin-driver-job-links', adminLegacyDataPurpose:'admin-booking-persistence',
    adminVisibleBookingReference:()=> '99001',adminDriverJobLinkFailureMessage:e=>e.message,
    formatBookingTimestampSgt:v=>v,formatPickupDateTime:(d,t)=>`${d} ${t}`,
    dispatchCopyLocationFlightParts:b=>({pickup:b.pickup,dropoff:b.dropoff,standaloneFlightLine:''}),
  };
  env.bookingFormRef={current:env.booking};
  env.buildAdminDriverJobLinkCreatePayload=()=>({ok:true,data:{booking_reference:'QA-ONE',driver_job_payload:{passenger_name:env.booking.name,assigned_driver_vehicle_model:env.booking.driverVehicleModel||env.booking.vehicle},ttl_hours:96}});
  const set=(key)=>(value)=>{env[key]=typeof value==='function'?value(env[key]):value;};
  env.setAdminDriverJobLinkState=set('adminDriverJobLinkState');
  env.setDriverJobLinkCopyMessage=set('copyFeedback');
  env.setDashboardDriverJobLinksReadState=set('dashboard');
  env.setAdminActiveJobsMapReadState=()=>{};
  env.resetAdminBookingDraft=()=>{env.resets++;env.driverJobLinkFormContextRevisionRef.current++;env.booking={name:'',date:'',time:'',pickup:'',dropoff:'',extraStopLocation:'',driverId:''};env.bookingFormRef.current=env.booking;env.dispatchReleaseWorkflowBookingReference='';env.appliedAdminBookingSnapshotReferenceRef.current='';env.loadedBookingIdRef.current='';env.bookingMessageRef.current.value='';};
  env.loadedAdminBookingBaselineRef={current:{form:{...env.booking}}};
  env.driverAssignmentDisplayDriversRef={current:[]};
  env.adminDispatchHasUnsavedVerifiedDriverProfileSelection=()=>Boolean(env.booking.driverId);
  env.setBooking=value=>{env.booking=typeof value==='function'?value(env.booking):value;env.bookingFormRef.current=env.booking;};
  env.navigator={clipboard:{writeText:async text=>{if(env.beforeCopy)await env.beforeCopy();if(env.copyFails)throw Error('denied');env.copies.push(text);}}};
  const link={id:'qa-link-1',booking_reference:'QA-ONE',link_status:'active',expires_at:'2030-10-05',safe_summary:{acknowledged:false,assigned_driver:null,assigned_driver_contact:null,assigned_driver_plate:null,vehicle:'Combi'}};
  env.result={ok:true,disposition:'created',link,driver_job_url:'https://example.invalid/driver-job/QA-ONE',native_app_alert:{reason:'provider_failed'},...resultOverrides};
  env.fetch=async(_url,options)=>{if(options?.method==='GET'){env.readCount=(env.readCount||0)+1;return{ok:true,json:async()=>({ok:true,links:[env.refreshLink||env.result.link]})};}env.requestCount++;if(env.beforeResponse)await env.beforeResponse();if(env.networkFails)throw Error('network failure');return{ok:env.result.ok,json:async()=>env.result};};
  const callbacks=new Function('env',`with(env){${runtime}}`)(env);
  Object.defineProperty(env,'dashboardDriverJobLinksReadState',{get:()=>env.dashboard});
  Object.defineProperty(env,'activeAdminDriverJobLink',{get:()=>env.adminDriverJobLinkState.link?.booking_reference===env.dispatchReleaseWorkflowBookingReference?env.adminDriverJobLinkState.link:null});
  Object.defineProperty(env,'driverJobLinkMessage',{get:callbacks.copyMessage});
  env.edit=patch=>{env.booking={...env.booking,...patch};env.bookingFormRef.current=env.booking;};
  env.nextBooking=()=>{env.driverJobLinkFormContextRevisionRef.current++;env.dispatchReleaseWorkflowBookingReference='QA-TWO';env.appliedAdminBookingSnapshotReferenceRef.current='QA-TWO';env.loadedBookingIdRef.current='QA-TWO';env.edit({name:'QA SECOND PASSENGER'});};
  return {env,...callbacks};
}

const driverPage = fs.readFileSync(new URL('../app/driver-job/[token]/page.tsx', import.meta.url), 'utf8');
const androidDownload = driverPage.match(/const driverBetaApkDownloadUrl = "([^"]+)"/)[1];
const iphoneDownload = driverPage.match(/const driverBetaTestFlightUrl = "([^"]+)"/)[1];
function assertInstallCopy(text) {
  for (const [label, url] of [['Android', androidDownload], ['iPhone', iphoneDownload]]) {
    assert.ok(text.includes(`${label}: ${url}`), `Copy Link must include the established ${label} download`);
    assert.equal(text.split(url).length - 1, 1, 'Each public download is included once');
    assert.ok(text.indexOf(url) < text.indexOf('https://example.invalid/driver-job/QA-ONE'), 'Install links precede the private job link');
  }
  assert.ok(text.includes('Install first, then reopen this job link.'));
  assert.ok(text.includes('iPhone: Install TestFlight if needed, then reopen the iPhone link above. Tap View in TestFlight, Accept, then Install Prestige Driver.'));
  assert.ok(text.includes('Already installed? Skip installation and open the job link below.'));
  assert.equal(text.split('https://example.invalid/driver-job/QA-ONE').length - 1, 1, 'Exact private link is unchanged and included once');
  assert.match(text, /Reference: 99001/);
  assert.match(text, /OTW \/ OTS \/ POB \/ Job Completed/);
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
    assertInstallCopy(h.env.copies[0]);
    assert.match(h.env.copies[0],/QA FIRST PASSENGER/);
    assert.doesNotMatch(h.env.copies[0],/QA NEW DRAFT|ANOTHER PICKUP/);
    assert.doesNotMatch(h.env.copies[0],/SECRET_CUSTOMER_PRICE|SECRET_INTERNAL_NOTE|SECRET_PAYOUT/);
    assert.equal(h.env.booking.name,'QA NEW DRAFT');assert.equal(h.env.resets,1);
    assert.equal(h.env.requestCount,1);assert.equal(h.env.dashboard.linksByReference['QA-ONE'].id,'qa-link-1');
    h.env.nextBooking();h.syncSelection();
    assert.equal(h.env.adminDriverJobLinkState.oneTimeUrl,'','Loading another booking retires prior copy');
  }
  assert.equal(makeHarness(runtime).copyMessage(), '', 'No download-only copy without an issued private link');
  const unassigned=makeHarness(runtime,false);await unassigned.createDriverJobLink();
  assert.equal(unassigned.env.resets,0);unassigned.env.copyFails=true;await unassigned.copyDriverJobLink();assert.equal(unassigned.env.resets,0);
  unassigned.env.copyFails=false;await unassigned.copyDriverJobLink();assert.equal(unassigned.env.resets,1);unassigned.syncSelection();
  assert.match(unassigned.copyMessage(),/QA FIRST PASSENGER/);
  // Actual GET refresh + actual form hydration, previously replaced with a no-op.
  for(const vehicle of ['Combi','S','VVV','AVF']) {
    const h=makeHarness(runtime,false);h.env.edit({vehicle});h.env.result.link.safe_summary.vehicle=vehicle;
    await h.createDriverJobLink();
    await h.refreshAdminDriverJobLinkForReference('QA-ONE',{silent:true});
    assert.equal(h.env.booking.driverVehicleModel,vehicle==='AVF'?'':vehicle);
    await h.copyDriverJobLink();
    assert.equal(h.env.resets,1,`Unassigned ${vehicle}: successful Copy must clear after real automatic vehicle hydration`);
    assert.equal(h.env.readCount,1);assert.equal(h.env.copies.length,1);assertInstallCopy(h.env.copies[0]);h.syncSelection();assert.match(h.copyMessage(),/QA FIRST PASSENGER/);
  }
  for(const patch of [{name:'EDITED'},{pickup:'EDITED'},{time:'1400'},{vehicle:'VVV'},{driverId:'9'},{driverName:'MANUAL DRIVER'},{driverContact:'99990000'},{driverPlate:'MANUAL1'},{driverVehicleModel:'MANUAL MODEL'}]) {
    const h=makeHarness(runtime,false);await h.createDriverJobLink();
    await h.refreshAdminDriverJobLinkForReference('QA-ONE',{silent:true});h.env.edit(patch);
    await h.copyDriverJobLink();assert.equal(h.env.resets,0,'Hydration allowance must preserve every real amendment');
  }
  const duringCopy=makeHarness(runtime,false);await duringCopy.createDriverJobLink();duringCopy.env.beforeCopy=()=>duringCopy.refreshAdminDriverJobLinkForReference('QA-ONE',{silent:true});
  await duringCopy.copyDriverJobLink();assert.equal(duringCopy.env.resets,1,'Exact automatic hydration during clipboard completion may clear');
  const claimed=makeHarness(runtime,false);await claimed.createDriverJobLink();claimed.env.refreshLink={...claimed.env.result.link,safe_summary:{...claimed.env.result.link.safe_summary,assigned_driver:'NEWLY ACKNOWLEDGED DRIVER'}};
  await claimed.refreshAdminDriverJobLinkForReference('QA-ONE',{silent:true});await claimed.copyDriverJobLink();assert.equal(claimed.env.resets,0,'Do not clear newly received driver identity');
  const wrongVehicle=makeHarness(runtime,false);wrongVehicle.env.result.link.safe_summary.vehicle='UNEXPECTED';await wrongVehicle.createDriverJobLink();
  await wrongVehicle.refreshAdminDriverJobLinkForReference('QA-ONE',{silent:true});await wrongVehicle.copyDriverJobLink();assert.equal(wrongVehicle.env.resets,0,'Unexpected server vehicle must not allow reset');
  const noCopy=makeHarness(runtime,false);await noCopy.createDriverJobLink();await noCopy.refreshAdminDriverJobLinkForReference('QA-ONE',{silent:true});noCopy.env.copyFails=true;await noCopy.copyDriverJobLink();assert.equal(noCopy.env.resets,0);
  const rawEdit=makeHarness(runtime,false);await rawEdit.createDriverJobLink();await rawEdit.refreshAdminDriverJobLinkForReference('QA-ONE',{silent:true});rawEdit.env.bookingMessageRef.current.value='NEW RAW MESSAGE';await rawEdit.copyDriverJobLink();assert.equal(rawEdit.env.resets,0);
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
  const dsp=makeHarness(runtime,true);dsp.env.isDspItinerary=true;dsp.env.itineraryDisplayStops=[{time:'1300',location:'FIRST STOP'},{time:'1500',location:'SECOND STOP'}];await dsp.createDriverJobLink();dsp.syncSelection();assertInstallCopy(dsp.copyMessage());assert.match(dsp.copyMessage(),/1300 - FIRST STOP/);assert.match(dsp.copyMessage(),/1500 - SECOND STOP/);
  // Reproduce the reported ACK -> still populated Dispatch boundary using actual callbacks.
  const ack=makeHarness(runtime,false);await ack.createDriverJobLink();
  ack.env.dashboard={status:'loaded',linksByReference:{'QA-ONE':{...ack.env.result.link,safe_summary:{...ack.env.result.link.safe_summary,acknowledged:true,acknowledged_at:'2030-10-01T13:01:00Z'}}}};
  ack.reconcileAcknowledgedCopy();
  assert.equal(ack.env.resets,1,'Exact fresh ACK must clear its unchanged issued booking');
  assert.equal(ack.env.adminDriverJobLinkState.oneTimeUrl,'','Exact ACK must retire the retained copy');
  async function pendingAck(assigned=false) {
    const h=makeHarness(runtime,assigned);await h.createDriverJobLink();
    h.env.dashboard={status:'loaded',linksByReference:{'QA-ONE':{...h.env.result.link,safe_summary:{...h.env.result.link.safe_summary,acknowledged:true,acknowledged_at:'2030-10-01T13:01:00Z'}}}};
    return h;
  }
  for (const mode of ['loading','error','idle','absent','other-link','other-booking','pending','no-timestamp','invalid-timestamp','revoked','expired','invalid-expiry','closed-only','busy','background','other-tab','new-context','saving','updating','conflict','ai-loading','ask-ai']) {
    const h=await pendingAck();const link=h.env.dashboard.linksByReference['QA-ONE'];
    if(['loading','error','idle'].includes(mode))h.env.dashboard.status=mode;
    if(mode==='absent')h.env.dashboard.linksByReference={};
    if(mode==='other-link')link.id='newer-link';
    if(mode==='other-booking')link.booking_reference='QA-TWO';
    if(mode==='pending')link.safe_summary.acknowledged=false;
    if(mode==='no-timestamp')link.safe_summary.acknowledged_at=null;
    if(mode==='invalid-timestamp')link.safe_summary.acknowledged_at='invalid';
    if(mode==='revoked')link.revoked_at='2030-10-01T13:02:00Z';
    if(mode==='expired')link.expires_at='2000-01-01';
    if(mode==='invalid-expiry')link.expires_at=null;
    if(mode==='closed-only'){link.safe_summary.acknowledged=false;link.safe_summary.ack_alert_closed=true;}
    if(mode==='saving')h.env.saving=true;
    if(mode==='updating')h.env.adminBookingPersistenceAction='update';
    if(mode==='conflict')h.env.adminBookingCrossDeviceConflict={bookingReference:'QA-ONE'};
    if(mode==='ai-loading')h.env.aiAssistLoading=true;
    if(mode==='ask-ai')h.env.aiAssistMode='assistant';
    if(mode==='busy')h.env.adminDriverJobLinkState.action='create';
    if(mode==='background')h.env.document.visibilityState='hidden';
    if(mode==='other-tab')h.env.activeTab='bookings';
    if(mode==='new-context')h.env.driverJobLinkFormContextRevisionRef.current++;
    h.reconcileAcknowledgedCopy();
    assert.equal(h.env.resets,0,mode);assert.ok(h.env.adminDriverJobLinkState.oneTimeUrl,mode);
  }
  for(const field of ['name','pickup','dropoff','date','time','vehicle','driverId','driverName','driverContact','driverPlate','driverVehicleModel','internalAdminNotes','customerPriceOverride','driverPayoutOverride']) {
    const h=await pendingAck();h.env.edit({[field]:'NEW UNSAVED VALUE'});h.reconcileAcknowledgedCopy();
    assert.equal(h.env.resets,0,`Preserve edited ${field}`);assert.equal(h.env.booking[field],'NEW UNSAVED VALUE');
  }
  const raw=await pendingAck();raw.env.bookingMessageRef.current.value='NEXT BOOKING';raw.reconcileAcknowledgedCopy();assert.equal(raw.env.resets,0);
  const copyEdit=await pendingAck();copyEdit.env.copyEditStates={customerCopy:{isEditing:true}};copyEdit.reconcileAcknowledgedCopy();assert.equal(copyEdit.env.resets,0);
  const next=await pendingAck();next.env.nextBooking();next.reconcileAcknowledgedCopy();assert.equal(next.env.resets,0);assert.equal(next.env.booking.name,'QA SECOND PASSENGER');
  const already=makeHarness(runtime,false);already.env.result.link.safe_summary.acknowledged=true;await already.createDriverJobLink();already.env.dashboard.linksByReference['QA-ONE'].safe_summary.acknowledged_at='2030-10-01';already.reconcileAcknowledgedCopy();assert.equal(already.env.resets,0,'Reopening/reusing an acknowledged link is not a new ACK');
  for(const remoteBaseline of [false,true]) {
    const h=await pendingAck();const link=h.env.dashboard.linksByReference['QA-ONE'];
    Object.assign(link.safe_summary,{assigned_driver:'QA DRIVER',assigned_driver_contact:'80000000',assigned_driver_plate:'QA1234',vehicle:'Combi'});
    h.env.refreshLink=link;await h.refreshAdminDriverJobLinkForReference('QA-ONE',{silent:true});
    if(remoteBaseline){h.env.edit({driverId:'42'});h.env.loadedAdminBookingBaselineRef.current={bookingReference:'QA-ONE',form:{...h.env.booking}};}
    h.reconcileAcknowledgedCopy();assert.equal(h.env.resets,1,'Exact safe ACK hydration can clear');assert.equal(h.env.requestCount,1,'ACK clearing performs no server write');
    h.reconcileAcknowledgedCopy();assert.equal(h.env.resets,1,'ACK clearing is once only');
  }
  for(const assigned of [false,true]) {
    const h=await pendingAck(assigned);if(!assigned)await h.copyDriverJobLink();
    assert.equal(h.env.resets,1);h.env.edit({name:'NEXT UNSAVED PASSENGER'});h.env.bookingMessageRef.current.value='NEXT RAW MESSAGE';
    h.reconcileAcknowledgedCopy();assert.equal(h.env.resets,1,'Old ACK must not reset the next draft');
    assert.equal(h.env.booking.name,'NEXT UNSAVED PASSENGER');assert.equal(h.env.bookingMessageRef.current.value,'NEXT RAW MESSAGE');
    assert.equal(h.env.adminDriverJobLinkState.oneTimeUrl,'','Retire only the acknowledged old preview');
  }
  console.log('PASS Driver link form clear: assigned/unassigned, exact retained copy, next booking, failed create/copy, late responses, newer draft, DSP and queue handoff. Synthetic callbacks; no live sends.');
}
if(process.argv[1]===new URL(import.meta.url).pathname) await runChecks();
