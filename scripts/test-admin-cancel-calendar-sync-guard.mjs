import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function fn(name) {
  let found;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    else ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(found, `Missing existing function ${name}`);
  return found.getText(tree);
}
const runtime = ts.transpileModule([
  ...['patchBookingStatusReference', 'updateBookingStatusOnly', 'markBookingCancelled',
    'markBookingCompleted', 'loadExactAdminBookingPersistenceRecord',
    'createGoogleCalendarSyncAgenda', 'autoSyncSavedBookingGoogleCalendar'].map(fn),
  'return { cancel: markBookingCancelled, complete: markBookingCompleted, status: updateBookingStatusOnly };',
].join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

// Execute the real admin UI -> status PATCH -> exact GET -> Calendar POST chain.
// All HTTP responses are synthetic; this test cannot contact a provider or DB.
function harness(options = {}) {
  const reference = options.reference || 'QA-CALENDAR-RETURN-RET';
  const row = { id: 364, booking_reference: reference, public_booking_reference: '11039', status: 'draft' };
  const saved = { ...row, status: 'cancelled', admin_internal_status: 'cancelled',
    updated_at: '2030-09-28T10:08:39.018Z', pickup_at: '2030-09-30T14:40:00Z',
    pickup_location: 'AMENDED PICKUP', dropoff_location: 'AMENDED AIRPORT', driver_name: 'VERIFIED DRIVER' };
  const env = {
    clean: v => String(v ?? '').trim(), cleanReferenceText: v => String(v ?? '').trim(),
    bookingRecordStableKey: r => r.booking_reference,
    bookingRecordStatusReference: r => r.booking_reference,
    adminSavedBookingStatusesApiPath: '/api/admin-saved-booking-statuses',
    adminBookingCalendarGoogleSyncApiPath: '/api/admin-booking-calendar-google-sync',
    adminLegacyDataPurpose: 'admin_dashboard', todayKey: '2030-09-28',
    requests: [], messages: [], local: [], mapped: [], statuses: {}, loading: null,
    activeTabRef: { current: 'bookings' },
    setMessage: value => { env.globalMessage = value; },
    setCompletingBookingId: v => { env.loading = v; },
    setBookingCompletionMessage: (id, m) => { env.messages.push({ id, ...m }); },
    applyBookingStatusLocally: (...args) => env.local.push(args),
    loadBookings: async () => { env.reloads = (env.reloads || 0) + 1; },
    readAdminLegacyDataError: (_body, fallback) => fallback, formatSupabaseError: v => String(v),
    adminBookingPersistenceFailureDetail: (_body, fallback) => fallback,
    adminBookingPersistencePrimaryStatus: r => r.admin_internal_status,
    adminBookingPersistenceRecordToCalendarBookingRecord: r => {
      env.mapped.push(r); return { ...r, status: r.admin_internal_status };
    },
    getBookingCalendarReference: r => r.booking_reference,
    buildSavedBookingCalendarEventPayload: r => r,
    setBookingGoogleCalendarStatuses: update => { env.statuses = update(env.statuses); },
    fetch: async (url, init) => {
      env.requests.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
      assert.equal(init.headers['x-prestige-admin-purpose']?.startsWith('admin'), true);
      if (url === '/api/admin-saved-booking-statuses') {
        return Response.json(options.patchFailure ? { ok: false } : { ok: true, booking: {
          id: '364', booking_reference: options.missingReference ? null : options.wrongPatchReference ? 'QA-OTHER-JOB' : reference,
          status: JSON.parse(init.body).status, updated_at: saved.updated_at,
        } }, { status: options.patchFailure ? 503 : 200 });
      }
      if (url.startsWith('/api/admin-bookings?')) {
        assert.equal(new URL(url, 'https://example.test').searchParams.get('booking_reference'), reference);
        return Response.json({ ok: !options.readFailure, booking: { ...saved,
          ...(options.wrongReadReference ? { booking_reference: 'QA-CALENDAR-OUT' } : {}),
          ...(options.reopened ? { admin_internal_status: 'draft' } : {}),
        } }, { status: options.readFailure ? 503 : 200 });
      }
      assert.equal(url, '/api/admin-booking-calendar-google-sync', 'No unrelated writer');
      if (options.changedTab) env.activeTabRef.current = 'dispatch';
      return Response.json(options.calendarFailure ? { ok: false, error: 'Calendar unavailable' } : {
        ok: true, sync: { event_count: 1, events_synced: 1, live_calendar_provider: 'google_calendar',
          live_calendar_write_performed: !options.noWrite, provider_connection: 'connected', send_updates: 'none' },
      }, { status: options.calendarFailure ? 503 : 200 });
    },
  };
  return { env, row, saved, ...new Function('env', `with(env){${runtime}}`)(env) };
}
const calendarRequests = h => h.env.requests.filter(r => r.url === '/api/admin-booking-calendar-google-sync');
for (const reference of ['QA-CALENDAR-RETURN-RET', 'QA-CALENDAR-OUT', 'QA-SEPARATE-JOB']) {
  const h = harness({ reference });
  assert.equal(await h.cancel(h.row), true);
  assert.equal(calendarRequests(h).length, 1, 'A saved cancellation must sync the exact Operations Calendar event');
  assert.deepEqual(h.env.requests.map(r => r.method), ['PATCH', 'GET', 'POST']);
  assert.equal(h.env.requests[0].body.booking_id, reference);
  const event = calendarRequests(h)[0].body.bookings[0];
  assert.equal(event.booking_reference, reference);
  assert.equal(event.status, 'cancelled');
  assert.equal(event.pickup_location, h.saved.pickup_location, 'Use current persisted details, not the stale card');
  assert.equal(event.pickup_at, h.saved.pickup_at);
  assert.equal(h.env.messages.at(-1).tone, 'success');
  assert.equal(h.env.globalMessage.tone, 'success', 'Result remains visible when cancelled card leaves Bookings');
  assert.match(h.env.messages.at(-1).text, /Booking cancelled.*Calendar/);
  assert.equal(h.env.loading, null);
  assert.equal(h.env.statuses[reference.toLowerCase()], 'cal_saved');
}
for (const failure of ['readFailure', 'wrongReadReference', 'missingReference', 'wrongPatchReference', 'reopened', 'calendarFailure', 'noWrite']) {
  const h = harness({ [failure]: true });
  assert.equal(await h.cancel(h.row), true, `${failure}: cancellation remains saved`);
  assert.ok(h.env.local.some(args => args[2] === 'cancelled'));
  assert.equal(calendarRequests(h).length, ['calendarFailure', 'noWrite'].includes(failure) ? 1 : 0);
  assert.equal(h.env.messages.at(-1).tone, 'error');
  assert.equal(h.env.globalMessage.tone, 'error', 'Partial failure must stay visible in the active Bookings tab');
  assert.match(h.env.messages.at(-1).text, /^Booking cancelled\. Calendar update failed/);
  assert.deepEqual(h.env.statuses, {}, 'Do not show Calendar saved after failure');
  assert.equal(h.env.loading, null);
  if (failure === 'wrongPatchReference') assert.equal(h.env.requests.length, 1, 'Reject mismatched status-response identity before reading another job');
}
const failed = harness({ patchFailure: true });
assert.equal(await failed.cancel(failed.row), false);
assert.equal(failed.env.requests.length, 1);
assert.equal(failed.env.local.length, 0);
for (const status of ['completed', 'draft', 'assigned']) {
  const h = harness();
  await h.status(h.row, status, 'Loading', 'Saved', 'Failed');
  assert.deepEqual(h.env.requests.map(r => r.method), ['PATCH'], `${status} must retain its existing behavior`);
  assert.equal(h.env.globalMessage, undefined, 'No new global feedback on another status lane');
}
const changedTab = harness({ changedTab: true });
await changedTab.cancel(changedTab.row);
assert.equal(changedTab.env.globalMessage, undefined, 'Late Calendar result must not overwrite another tab');
const repeated = harness();
await repeated.cancel(repeated.row); await repeated.cancel(repeated.row);
assert.deepEqual(calendarRequests(repeated).map(r => r.body.bookings[0].booking_reference),
  [repeated.row.booking_reference, repeated.row.booking_reference]);
const historyStart = source.indexOf('const rawBookingCompletionMessage', source.indexOf('data-completed-history-month-jobs'));
assert.ok(historyStart > 0);
assert.match(source.slice(historyStart, historyStart + 1000), /rawBookingCompletionMessage\?\.text\.startsWith\("Booking cancelled\."\)/,
  'History must show the saved cancellation and its Calendar success/failure');
console.log('PASS admin cancellation Calendar handoff: saved status, exact read, safe sync, visible partial failure, unchanged completion/undo');
