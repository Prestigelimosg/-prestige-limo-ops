import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const source = readFileSync('app/page.tsx', 'utf8');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['getRoutePoints', 'bookingRecordToOperationalFormFields', 'singaporePickupDateTimePartsFromTimestamp', 'adminDriverJobLinkCanonicalOperationalText', 'adminDriverJobLinkCanonicalOperationalRoute', 'savedBookingMatchesDriverJobLinkOperationalPayload'];
const functions = ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text)).map(n => n.getText(ast)).join('\n');
assert.equal(ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text)).length, names.length);
const clean = v => v == null ? '' : String(v).trim();
const bindings = { clean, getJobCardRouteLine: () => '', normalizeExtraStopCount: v => Number(v) || 0, normalizePickupTimeForStorage: () => '1640', formatPickupTimeFromRecord: () => '1640', safeDriverVehicleModelFromBookingRecord: () => 'AVF', getBookingCustomerAccountDisplayName: () => 'QA COMPANY', getBookingDateKey: () => '2026-09-30', getBookerName: () => 'QA BOOKER', getBookingName: r => r.passenger_name, safeAdminBookingPersistenceCount: () => null, normalizeChildSeatCount: () => 0, adminBookingPersistenceServiceType: r => r.service_type, adminBookingPersistenceRouteSummary: r => r.route_summary };
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const api = new Function(...Object.keys(bindings), compile(functions + '\nreturn {bookingRecordToOperationalFormFields,savedBookingMatchesDriverJobLinkOperationalPayload};'))(...Object.values(bindings));
// Production 11074 route/time shape; all identities are synthetic. No network or writes.
const base = { service_type: 'DSP', pickup_at: '2026-09-30T08:40:00Z', pickup_location: 'Asia sq Tower 1', dropoff_location: 'South Beach Tower (Middle Road) > 40C Harding Road (end)', route_summary: 'Asia sq Tower 1 > South Beach Tower (Middle Road) > 40C Harding Road (end)', passenger_name: 'QA PASSENGER', driver_name: 'QA DRIVER', driver_contact: '90000001', driver_plate_number: 'QA1001', vehicle_type_or_category: 'AVF' };
function load(record) {
  const form = api.bookingRecordToOperationalFormFields(record);
  const payload = { booking_type: form.bookingType, pickup_location: form.pickup, dropoff_location: form.dropoff, passenger_name: form.name, flight_no: form.flight, assigned_driver_name: form.driverName, assigned_driver_contact: form.driverContact, assigned_driver_plate: form.driverPlate, pickup_date: form.date, pickup_time: form.time, route: [form.pickup, form.extraStopLocation, form.dropoff].filter(Boolean).join(' > ') };
  return { form, payload };
}
const loaded = load(base);
assert.equal(loaded.form.extraStopLocation, '', 'Loading a DSP combined drop-off must not manufacture a duplicated stop.');
assert.equal(loaded.form.extraStopCount, '', 'Do not manufacture an extra-stop quantity.');
assert.equal(loaded.form.dropoff, base.dropoff_location);
assert.equal(loaded.payload.route, base.route_summary);
assert.equal(api.savedBookingMatchesDriverJobLinkOperationalPayload(base, loaded.payload), true, 'An unchanged loaded job must pass the existing amendment gate.');
for (const key of ['route', 'pickup_location', 'dropoff_location', 'passenger_name', 'assigned_driver_name', 'assigned_driver_contact', 'assigned_driver_plate', 'pickup_date', 'pickup_time']) {
  assert.equal(api.savedBookingMatchesDriverJobLinkOperationalPayload(base, { ...loaded.payload, [key]: 'Changed' }), false, `Real ${key} amendments must still require saving.`);
}
for (const [record, expectedStops, expectedCount] of [
  [{ ...base, extra_stop_count: 3 }, '', '3'], // Retain explicitly persisted quantity, never rewrite billing.
  [{ ...base, pickup_location: 'A', dropoff_location: 'B > A > C', route_summary: 'A > B > A > C' }, '', ''], // Genuine repeat visit remains.
  [{ ...base, pickup_location: 'A', dropoff_location: 'C', route_summary: 'A > B > A > C' }, 'B > A', '2'],
  [{ ...base, pickup_location: 'A', dropoff_location: 'D', route_summary: 'A > B at 1700hrs > C at 1800hrs > D', extra_stop_count: 2 }, 'B at 1700hrs > C at 1800hrs', '2'],
  [{ ...base, pickup_location: 'A', dropoff_location: 'B', route_summary: 'A > B' }, '', ''],
]) {
  const { form, payload } = load(record);
  assert.equal(form.extraStopLocation, expectedStops);
  assert.equal(form.extraStopCount, expectedCount);
  assert.equal(payload.route, record.route_summary);
  assert.equal(api.savedBookingMatchesDriverJobLinkOperationalPayload(record, payload), true);
}
for (const service_type of ['MNG', 'DEP', 'TRF']) {
  const record = { ...base, service_type, pickup_location: 'A', dropoff_location: 'C', route_summary: 'A > B > C', extra_stop_count: 1 };
  const { form, payload } = load(record);
  assert.equal(form.extraStopLocation, 'B');
  assert.equal(form.extraStopCount, '1');
  assert.equal(payload.route, record.route_summary);
  assert.equal(api.savedBookingMatchesDriverJobLinkOperationalPayload(record, payload), true);
}
// Exercise the actual Create Link payload builder, not just a reconstructed payload.
let builder;
function findBuilder(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'buildAdminDriverJobLinkCreatePayload') builder = node.getText(ast);
  ts.forEachChild(node, findBuilder);
}
findBuilder(ast);
assert.ok(builder);
const builderBindings = { clean, booking: loaded.form, dispatchReleaseWorkflowBookingReference: 'QA-DSP-ROUTE', assignedDriverRecord: null, assignedDriverPlate: loaded.form.driverPlate, formatPickupDateTime: (d, t) => `${d} ${t}`, normalizeBookingType: v => v, adminDraftDropoffFallback: 'Drop-off To Confirm', dispatchReleaseAppliedStatus: 'assigned', formatPickupTime: v => v, isDspItinerary: false, itineraryDisplayStops: [], appliedAdminBookingSnapshot: base, savedBookingMatchesDriverJobLinkOperationalPayload: api.savedBookingMatchesDriverJobLinkOperationalPayload };
const build = new Function(...Object.keys(builderBindings), compile(builder + '\nreturn buildAdminDriverJobLinkCreatePayload;'))(...Object.values(builderBindings));
assert.equal(build().ok, true);
assert.equal(build().data.booking_reference, 'QA-DSP-ROUTE');
assert.equal(build().data.driver_job_payload.route, base.route_summary);
builderBindings.booking.dropoff = 'Changed destination';
assert.equal(build().ok, false);
builderBindings.booking.dropoff = base.dropoff_location;

// Render the actual existing route-extras JSX, including its service conditions.
let section;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(p => ts.isJsxAttribute(p) && p.name.getText(ast) === 'data-route-extras-child-seat-section')) section = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(section);
const render = new Function('React', 'booking', 'clean', 'update', 'setBooking', 'visibleChildSeatTypeOptions', 'isDspItinerary', 'itineraryDisplayStops', compile(`return (${section});`));
for (const bookingType of ['DSP', 'MNG', 'DEP', 'TRF']) {
  const booking = { ...loaded.form, bookingType, extraStopLocation: bookingType === 'DSP' ? 'B at 1700hrs > C at 1800hrs' : 'B', extraStopCount: '2' };
  const html = renderToStaticMarkup(render(React, booking, clean, () => {}, () => {}, [], false, []));
  if (bookingType === 'DSP') {
    assert.doesNotMatch(html, />Extra Stops<|>Extra stop location</);
    assert.match(html, />Itinerary stops</);
    assert.match(html, /B at 1700hrs &gt; C at 1800hrs/);
  } else {
    assert.match(html, />Extra Stops</);
    assert.match(html, />Extra stop location</);
  }
  assert.match(html, />Child seat required</);
  assert.match(html, />Extra Charges</);
}
console.log('DSP saved-route load, real-amendment gate, repeated visits, timed itinerary and service-specific route controls passed.');
