import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Exercise both actual parser passes used by PATCH, without a database or provider.
const module = {exports: {}};
const writes = [];
const code = ts.transpileModule(fs.readFileSync('lib/admin-booking-persistence.ts', 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
new Function('require', 'module', 'exports', code)((name) => {
  assert.equal(name, './admin-booking-supabase-adapter');
  return {updateAdminBookingThroughSupabaseAdapter: async (input) => {
    writes.push(input); return {ok: true, data: input.booking};
  }};
}, module, module.exports);
const api = module.exports;
const base = {
  target_booking_reference: 'QA-COMBO-ASSIGN',
  expected_updated_at: '2026-09-23T04:00:00.000Z',
  update_mode: 'driver_assignment',
  booking: {booking_reference: 'QA-COMBO-ASSIGN', source_channel: 'admin-dashboard',
    customer_display_name: 'Synthetic QA', passenger_name: 'Synthetic QA',
    pickup_datetime: '2026-10-01T02:00:00.000Z', service_type: 'TRF', route_type: 'TRF',
    pickup_location: 'QA pickup', dropoff_location: 'QA dropoff', contact_phone: '00000000',
    vehicle_type_or_category: 'Combi', driver_id: 45},
  route_points: [{point_type: 'pickup', location_text: 'QA pickup'}, {point_type: 'dropoff', location_text: 'QA dropoff'}],
  service_items: [],
};
const revision = '22222222-3333-4444-8555-666666666666';
assert.equal(api.parseAdminBookingUpdatePayload(base).ok, true, 'Valid ordinary assignment fixture');
for (const total of [null, 90, 99.99]) {
  const input = {...base, combo_assignment: {revision, total_payout_sgd: total}};
  const parsed = api.parseAdminBookingUpdatePayload(input);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.deepEqual(parsed.data.combo_assignment, input.combo_assignment);
  assert.equal((await api.updateAdminBooking(parsed.data, {actor_role: 'admin'})).ok, true);
  assert.deepEqual(writes.at(-1).combo_assignment, input.combo_assignment);
}
assert.equal(api.parseAdminBookingUpdatePayload(base).ok, true, 'Ordinary assignment remains supported');
for (const invalid of [0, -1, 100000, 1.001, '90', {}, [], Infinity, NaN, undefined]) {
  assert.equal(api.parseAdminBookingUpdatePayload({...base, combo_assignment: {revision, total_payout_sgd: invalid}}).ok, false);
}
for (const patch of [
  {update_mode: undefined}, {update_mode: 'driver_assignment_cancel'},
  {combo_assignment: {revision: 'bad', total_payout_sgd: null}},
  {combo_assignment: {revision, total_payout_sgd: null, invoice: 'forbidden'}},
  {combo_assignment: {revision, total_payout_sgd: {invoice: 'forbidden'}}},
  {booking: {...base.booking, payout: 90}}, {payout: 90},
]) {
  assert.equal(api.parseAdminBookingUpdatePayload({...base, combo_assignment: {revision, total_payout_sgd: null}, ...patch}).ok, false);
}
assert.equal(api.parseAdminBookingPersistencePayload({...base, combo_assignment: {revision, total_payout_sgd: null}}).ok, false);
console.log('PASS combo assignment payload: defaults/override through both parser passes; malformed and unrelated finance fields rejected.');
