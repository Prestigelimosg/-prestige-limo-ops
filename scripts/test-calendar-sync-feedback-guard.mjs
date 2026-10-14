import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createHash } from 'node:crypto';
const page = fs.readFileSync('app/page.tsx', 'utf8');
const tree = ts.createSourceFile('page.tsx', page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = [];
function visit(node) { nodes.push(node); ts.forEachChild(node, visit); }
visit(tree);
const fn = name => nodes.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(tree);
const effect = nodes.find(n => ts.isCallExpression(n) && n.expression.getText(tree) === 'useEffect' && n.arguments[0]?.getText(tree).includes('async function loadConfiguredGoogleCalendarStatuses')).arguments[0].getText(tree);
const display = nodes.find(n => ts.isVariableDeclaration(n) && n.name.getText(tree) === 'visibleBookingGoogleCalendarStatusMessage')?.initializer.getText(tree) || 'bookingGoogleCalendarStatusMessage';
const compile = s => ts.transpileModule(s, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const run = (env,s) => new Function('env', `with(env){${compile(s)}}`)(env);
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve,reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
const booking = (ref='A', time='13:15') => ({booking_reference:ref, pickup_time:time});
const ok = statuses => Response.json({ok:true,statuses});
function harness(records=[booking()]) {
  const env = {
    activeTab:'bookings', bookingGoogleCalendarStatusPayloadSignature:'fixture',
    bookingGoogleCalendarStatuses:{}, bookingGoogleCalendarPayouts:{}, bookingGoogleCalendarStatusMessage:null,
    bookingGoogleCalendarStatusSourceRef:{current:records}, bookingGoogleCalendarStatusRequestRevisionRef:{current:0},
    bookingGoogleCalendarSyncedPayloadsRef:{current:{}}, visibleRecentBookingDisplayItems:records.map(bookingRecord=>({bookingRecord})), visibleCompletedBookings:records,
    adminBookingCalendarGoogleSyncApiPath:'/api/admin-booking-calendar-google-sync',adminLegacyDataPurpose:'admin_dashboard',todayKey:'2030-01-01',
    cleanReferenceText:v=>String(v||'').trim(), getBookingCalendarReference:v=>v.booking_reference,
    buildSavedBookingCalendarEventPayload:v=>v, adminBookingPersistenceRecordToCalendarBookingRecord:v=>v,
    listeners:new Map(), reads:[], writes:[],
    read:async()=>{throw new TypeError('Load failed');},
    sync:async()=>({providerConnection:'connected',liveCalendarProvider:'google_calendar',liveCalendarWritePerformed:true,sendUpdates:'none',eventsSynced:1}),
  };
  for(const key of ['Statuses','Payouts','StatusMessage']) env['setBookingGoogleCalendar'+key] = value => {
    const name='bookingGoogleCalendar'+key; env[name] = typeof value==='function' ? value(env[name]) : value;
  };
  env.window={addEventListener:(name,cb)=>env.listeners.set(name,cb),removeEventListener:name=>env.listeners.delete(name)};
  env.document={...env.window,visibilityState:'visible'};
  env.fetch=(url,init)=>{assert.equal(url,'/api/admin-booking-calendar-google-sync?mode=status');env.reads.push(JSON.parse(init.body));return env.read();};
  env.createGoogleCalendarSyncAgenda=(records,label)=>{env.writes.push({records,label});return env.sync();};
  const sync = run(env,fn('autoSyncSavedBookingGoogleCalendar')+'\nreturn autoSyncSavedBookingGoogleCalendar;');
  const start=()=>run(env,'return ('+effect+')();');
  return {env,sync,start,warning:()=>run(env,'return '+display+';')};
}
// Reproduce the actual stale-warning sequence using the existing React effect and sync callback.
{
 const h=harness(); const cleanup=h.start(); await flush();
 assert.match(h.warning().text,/Load failed/);
 const result=await h.sync(booking()); assert.equal(result.ok,true);
 assert.equal(h.warning(),null,'Exact successful sync must remove its old status warning');
 assert.equal(h.env.bookingGoogleCalendarStatuses.a,'cal_saved');
 assert.equal(h.env.writes.length,1); cleanup();
}
// A delayed read failure or older result must not erase a newer exact sync success.
for(const outcome of ['failure','save_to_calendar','update_calendar']) {
 const h=harness(); const pending=deferred(); h.env.read=()=>pending.promise; const cleanup=h.start();
 await h.sync(booking());
 if(outcome==='failure')pending.reject(new TypeError('Load failed'));
 else pending.resolve(ok([{booking_reference:'A',status:outcome}]));
 await flush(); assert.equal(h.env.bookingGoogleCalendarStatuses.a,'cal_saved',outcome+' cannot erase newer sync');
 assert.equal(h.warning(),null); cleanup();
}
// Independent booking failures stay visible only for the affected displayed records.
{
 const h=harness([booking(),booking('B')]); const cleanup=h.start(); await flush();
 await h.sync(booking()); assert.ok(h.warning(),'B still has an unresolved read failure');
 h.env.visibleRecentBookingDisplayItems=[{bookingRecord:booking()}]; assert.equal(h.warning(),null,'A must not show B warning');
 h.env.visibleRecentBookingDisplayItems=[{bookingRecord:booking('B')}]; assert.ok(h.warning());
 await h.sync(booking('B')); assert.equal(h.warning(),null); cleanup();
}
// Failed/unsynced writes never clear a warning or invent Cal saved.
for(const outcome of ['throw','not_synced']) {
 const h=harness(); const cleanup=h.start(); await flush();
 h.env.sync=async()=>{if(outcome==='throw')throw Error('provider failure');return {liveCalendarWritePerformed:false};};
 assert.equal((await h.sync(booking())).ok,false); assert.ok(h.warning()); assert.equal(h.env.bookingGoogleCalendarStatuses.a,undefined);cleanup();
}
// Changed itinerary and an old write completion must not carry a previous green badge forward.
{
 const h=harness(); let cleanup=h.start(); await flush();await h.sync(booking());cleanup();
 h.env.bookingGoogleCalendarStatusSourceRef.current=[booking('A','18:00')];
 h.env.visibleRecentBookingDisplayItems=[{bookingRecord:booking('A','18:00')}];
 cleanup=h.start();await flush();assert.equal(h.env.bookingGoogleCalendarStatuses.a,undefined);assert.ok(h.warning());
 await h.sync(booking());assert.equal(h.env.bookingGoogleCalendarStatuses.a,undefined,'Old itinerary completion cannot mark amended itinerary saved');assert.ok(h.warning());cleanup();
}
// A later successful provider read remains authoritative, including genuine Update Cal/missing event.
for(const status of ['update_calendar','save_to_calendar','cal_saved']) {
 const h=harness(); const cleanup=h.start();await flush();await h.sync(booking());
 h.env.read=async()=>ok([{booking_reference:'A',status}]);h.env.listeners.get('focus')();await flush();
 assert.equal(h.env.bookingGoogleCalendarStatuses.a,status);assert.equal(h.warning(),null);
 if(status!=='cal_saved'){h.env.read=async()=>{throw Error('offline');};h.env.listeners.get('online')();await flush();assert.notEqual(h.env.bookingGoogleCalendarStatuses.a,'cal_saved','Later provider contradiction invalidates older success');assert.ok(h.warning());}
 cleanup();
}
// Fresh read failures retain an unchanged successful save, but do not manufacture success for other jobs.
{
 const h=harness();const cleanup=h.start();await flush();await h.sync(booking());
 h.env.listeners.get('online')();await flush();assert.equal(h.warning(),null);assert.equal(h.env.bookingGoogleCalendarStatuses.a,'cal_saved');cleanup();
}
// Completed amount/read warnings remain unchanged; successful writes do not verify the payout reader.
{
 const h=harness();h.env.activeTab='completed';const cleanup=h.start();await flush();await h.sync(booking());assert.ok(h.env.bookingGoogleCalendarStatusMessage);cleanup();
}
assert.match(page,/data-bookings-calendar-status-message="true"/);
assert.equal((page.match(/\{visibleBookingGoogleCalendarStatusMessage \? \(/g)||[]).length,1,'Only the Bookings warning slot uses scoped feedback');
assert.doesNotMatch(effect,/setInterval|syncAdminBooking|createGoogleCalendarSyncAgenda/);
// Baseline main 7652f4cd: feedback changes must preserve the existing writer, payload,
// saved-booking conversion, complete update/approval flow, green style and app links.
const preservedFunctions = {
  "createGoogleCalendarSyncAgenda": "d809c30440b6480e5eefd4c6c3146eb7c35dd026000a817380bf0f55c39547a8",
  "buildSavedBookingCalendarEventPayload": "88e692232ba0a82f361cb5f7c2a61bf108c203db49e0924138a6c257890e54f9",
  "adminBookingPersistenceRecordToCalendarBookingRecord": "13f9816d0c94591aa6e336051b0eba36772bcda174f21eb3c3ec264db0772419",
  "updateAppliedAdminBookingOperationalSnapshot": "ce9a7d499537f7f3b55bc06d77a76d60547c83be08d03268d40dc2a191160e79",
  "statusClass": "41bdea08315b76a79149b00430e9a28c216aa7bc5153aeed78768585de22ffc0",
  "copyCustomerDriverDetailsWithCustomerAppLink": "d7cdb4e5b123fecb423105c74b439f5a767f32d2565fe188b24f5815c6b754d0"
};
for (const [name, hash] of Object.entries(preservedFunctions)) {
  assert.equal(createHash('sha256').update(fn(name)).digest('hex'), hash, name+' must remain unchanged');
}
console.log('PASS: stale warning, delayed failure/result, exact booking/itinerary, independent failures, failed writes, authoritative later reads, existing recovery and Completed scope. Synthetic callbacks only; no real sends or writes.');
