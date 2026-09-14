// Execute the existing parent cancellation writer with synthetic transport only.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('app/page.tsx', 'utf8');
const start = source.indexOf('  async function cancelAssignedDriverPoolAssignment(');
const end = source.indexOf('  async function loadAdminDriverPoolPendingBooking(', start);
assert.ok(start > 0 && end > start);
const code = ts.transpileModule(source.slice(start, end), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
}).outputText;
for (const outcome of ['success', 'stale', 'not-cancelled']) {
  const requests = [], loads = [], busy = [], messages = [];
  const bindings = {
    driverPoolAssignmentCancellationBusy: false,
    setDriverPoolAssignmentCancellationBusy: value => busy.push(value),
    fetch: async (url, options) => {
      requests.push({url, ...options, body: JSON.parse(options.body)});
      return {ok: outcome !== 'stale', json: async () => ({ok: outcome !== 'stale', assignment_cancelled: outcome === 'success', error: outcome === 'stale' ? 'Driver Pool state changed.' : undefined})};
    },
    loadExactAdminBookingPersistenceRecord: async ref => {loads.push(ref);return {booking_reference: ref};},
    adminBookingPersistenceRecordToCalendarBookingRecord: record => record,
    bookingRecordToForm: record => record,
    loadSelectedBooking: async (record, options) => {assert.equal(record.booking_reference,'EXACT-OTHER-JOB');assert.equal(options.suppressCustomerRequestHandledMemory,true);},
    setAssignedDriverPoolAdminOffer: () => {}, setDriverPoolAssignmentCancelled: () => {},
    setAdminBookingPersistenceMessage: message => messages.push(message), setMessage: () => {}, setBookingSaveMessage: () => {},
  };
  const cancel = new Function(...Object.keys(bindings), `${code};return cancelAssignedDriverPoolAssignment;`)(...Object.values(bindings));
  const offer = {booking_reference: 'EXACT-OTHER-JOB', offer_key: 'b'.repeat(64), updated_at: '2026-09-14T12:00:00.123456+00:00'};
  if (outcome === 'success') assert.equal(await cancel(offer), true);
  else await assert.rejects(cancel(offer));
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,'/api/admin-driver-job-bid-offers');
  assert.equal(requests[0].method,'PATCH');
  assert.deepEqual(requests[0].body,{expected_updated_at:offer.updated_at,offer_key:offer.offer_key});
  assert.equal(requests[0].headers['x-prestige-admin-purpose'],'admin-booking-persistence');
  assert.deepEqual(loads,outcome === 'success' ? ['EXACT-OTHER-JOB'] : []);
  assert.deepEqual(busy,[true,false]);
  assert.equal(messages.at(-1).tone,outcome === 'success' ? 'success' : 'error');
}
const component = await readFile('app/admin-driver-pool-control.tsx', 'utf8');
const widenCode = ts.transpileModule(component.slice(component.indexOf('  async function selectOrWiden('), component.indexOf('  async function cancel()')), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
}).outputText;
const wideRequests = [];
const wideBindings = {
  offer: null, busy: false, attentionWorkingKey: '', bookingReference: 'DIFFERENT-LOADED-JOB',
  setBusy: () => {}, setFeedback: () => {}, setAttentionFeedback: () => {},
  headers: {'x-prestige-admin-purpose':'admin-booking-persistence'},
  crypto: {randomUUID: () => '00000000-0000-4000-8000-000000000001'},
  fetch: async (url, options) => {wideRequests.push({url,body:JSON.parse(options.body),method:options.method});return {ok:true,json:async()=>({ok:true})};},
  load: async () => {}, loadAttention: async () => {},
  onLoadBooking: async () => {throw Error('Widening must not create/load a Job Link');},
};
const widen = new Function(...Object.keys(wideBindings), `${widenCode};return selectOrWiden;`)(...Object.values(wideBindings));
await widen('widen', undefined, {booking_reference:'EXACT-ROW-JOB',public_booking_reference:'99002',offer_status:'open',offer_key:'c'.repeat(64),updated_at:'2026-09-14T12:00:00.123456+00:00',offer_payout_sgd:88,safe_vehicle_label:'COMBI'});
assert.equal(wideRequests.length,1);
assert.equal(wideRequests[0].method,'PATCH');
assert.equal(wideRequests[0].url,'/api/admin-driver-job-bid-offers');
assert.equal(wideRequests[0].body.booking_reference,'EXACT-ROW-JOB');
assert.equal(wideRequests[0].body.offer_key,'c'.repeat(64));
assert.equal(wideRequests[0].body.offer_payout_sgd,88);
assert.equal(wideRequests[0].body.vehicle_requirement,'COMBI');
console.log('PASS exact per-job parent cancellation and widening: existing PATCH paths, exact row identity despite another loaded booking, unchanged concurrency token, reload only after confirmed cancellation, stale/error propagation, and no link/Calendar/notification writer added.');
