import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

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
export const runtime = ts.transpileModule([
  fn('adminDispatchVerifiedIdentityId'), fn('adminBookingFormSyncSignature'),
  fn('singaporePickupDateTimePartsFromTimestamp'), fn('openSavedBookingInBookings'),
  fn('updateAppliedAdminBookingOperationalSnapshot'),
  'return {update: updateAppliedAdminBookingOperationalSnapshot};',
].join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

// Execute the complete real update callback. Only API/provider and UI bindings are
// doubles. No database, Calendar, invoice or notification writes occur here.
export function makeHarness(options = {}) {
  const record = { booking_reference: 'QA-UPDATE', pickup_at: '2030-10-01T17:00:00Z', driver_id: null, status: 'draft', updated_at: '2030-09-01T01:00:00Z' };
  const booking = { name: 'QA AMENDMENT', date: '2030-10-02', time: '0100', pickup: 'QA START', dropoff: 'QA END', driverId: '', companyId: '53', customerId: '192', bookerId: '26', travelerId: '40' };
  const env = {
    clean: v => String(v ?? '').trim(), cleanReferenceText: v => String(v ?? '').trim(),
    record, booking, appliedAdminBookingSnapshot: record,
    appliedAdminBookingSnapshotReferenceRef: { current: 'QA-UPDATE' }, appliedAdminBookingSnapshotReference: 'QA-UPDATE',
    loadedBookingIdRef: { current: 'QA-UPDATE' }, loadedBookingId: 'QA-UPDATE',
    dispatchHandoffCustomerReturnUrlRef: { current: options.customerUrl || '' },
    updateCalReturnBookingReferenceRef: { current: options.otherOrigin ? '' : 'QA-UPDATE' },
    driverJobLinkFormContextRevisionRef: { current: 1 }, activeTabRef: { current: 'dispatch' },
    bookingFormRef: { current: booking }, bookingMessageRef: { current: { value: 'QA RAW' } },
    loadedAdminBookingBaselineRef: { current: { bookingReference: 'QA-UPDATE', form: booking } },
    appliedAdminBookingSnapshotIsPendingCustomerRequest: !!options.customerRequest,
    driverAssignmentDisplayDrivers: [{ id: 46, driver_name: 'QA DRIVER', contact_number: '80000000', plate_number: 'QA1234', vehicle_type: 'AVF' }],
    draftDriverAssignmentSignature: () => 'QA', currentDraftDriverAssignmentSignature: 'QA',
    saveLoadedDriverAssignmentAvailable: true, isInactiveDriver: () => false,
    adminBookingFormMatchesLoadedBaselineOutsideDriverAssignment: () => true,
    rateCompanies: [], currentTimeMs: 1, dispatchCombo: null,
    activeTab: 'dispatch', requests: [], calendarCalls: [], notifications: [], saved: [], retained: 0, resets: 0, timers: [], returns: [],
    window: { setTimeout: callback => env.timers.push(callback), location: { assign: url => env.returns.push(url) } },
    adminDispatchSaveCrmMissingPickupMessage: () => null,
    verifyLoadedAdminBookingVersionBeforeUpdate: async () => options.versionFailure ? null : 'expected-version',
    resolveSaveCrmBillingIdentityAccountForSave: async () => ({ ok: true, accountLabel: 'QA CUSTOMER' }),
    resolveServiceChangePriceReviewForSave: () => ({ ok: true }),
    loadSaveCrmAgencyCustomerClassification: async () => false,
    resolveSaveCrmCorporateIdentityForSave: async () => ({ ok: true, bookerId: 26, companyId: 53, travelerId: 40, bookerName: 'QA BOOKER' }),
    buildAdminBookingPersistencePayload: () => ({ booking: { ...record } }),
    adminBookingPersistenceCustomerDisplayName: () => 'QA CUSTOMER', safeAdminBookingPersistenceCount: () => null,
    adminBookingPersistenceFailureDetail: (_result, message) => message,
    adminBookingPersistenceFailureMessage: (_action, error) => error.message,
    fetch: async (url, init) => { env.requests.push({ url, ...init }); if (env.beforeResponse) await env.beforeResponse(); return { ok: !options.saveFailure, json: async () => ({ ok: !options.saveFailure, booking: env.record }) }; },
    markAdminBookingAsActiveForUpdates: () => {}, upsertLoadedBookingFromAdminRecord: value => env.saved.push(value),
    autoSyncSavedBookingGoogleCalendar: async value => { env.calendarCalls.push(value); if (env.beforeCalendarReturn) await env.beforeCalendarReturn(); return { ok: !options.calendarFailure, message: 'Calendar unavailable; booking is saved.' }; },
    queueCustomerBookingRequestConfirmedNotification: async reference => env.notifications.push(reference),
    lastSuccessfulBookingSaveRef: { current: null }, getBookingSaveGuardKey: value => value,
    retainSavedBookingForDriverJobLinkHandoff: () => { env.retained++; },
    resetAdminBookingFormAfterSuccessfulPersistence: () => { env.resets++; },
    refreshDashboardDriverJobLinksRead: async () => {}, bookingRecordToForm: () => booking,
    setAppliedDraftDriverAssignmentSignature: () => {},
    adminBookingPersistenceRecordToCalendarBookingRecord: value => value,
    bookingRecordBelongsInCompletedHistoryAfterAdminConfirmation: () => !!options.history,
    savedBookingListFocusAppliedRef: { current: '' },
  };
  for (const [setter, key] of Object.entries({ setActiveTab: 'activeTab', setBookingsSelectedDate: 'date', setBookingsShowUpcoming: 'upcoming', setBookingsSearchTerm: 'search', setBookingsUpcomingPage: 'page', setCompletedMonthFilter: 'month', setCompletedSearchTerm: 'historySearch', setSavedBookingListFocus: 'focus', setAdminBookingPersistenceMessage: 'message', setMessage: 'message', setBookingSaveMessage: 'message', setAdminBookingPersistenceAction: 'action', setBooking: 'booking' })) {
    env[setter] = value => { env[key] = typeof value === 'function' ? value(env[key]) : value; };
  }
  return { env, ...new Function('env', `with(env){${runtime}}`)(env) };
}

export async function checks() {
  // Preserve origin wiring in the one existing Open / Edit control and clear it
  // whenever another record or a fresh draft replaces that selection.
  assert.match(source, /loadSelectedBooking\(savedBooking, \{ returnToBookings: activeTab === "bookings" \}\)/);
  assert.match(fn('clearLoadedBookingSelectionContext'), /updateCalReturnBookingReferenceRef.current = ""/);
  assert.match(fn('applyAdminBookingOperationalSnapshot'), /updateCalReturnBookingReferenceRef.current = ""/);
  assert.match(fn('loadSelectedBooking'), /updateCalReturnBookingReferenceRef.current = options.returnToBookings \? persistedBookingReference : ""/);
  const success = makeHarness(); await success.update();
  assert.equal(success.env.requests.length, 1);
  assert.equal(success.env.requests[0].method, 'PATCH');
  assert.equal(JSON.parse(success.env.requests[0].body).expected_updated_at, 'expected-version');
  assert.equal(success.env.calendarCalls.length, 1);
  assert.equal(success.env.activeTab, 'bookings', 'Update + Cal must return a Bookings-origin amendment to the saved job');
  assert.equal(success.env.date, '2030-10-02', 'Use returned Singapore date, not UTC date');
  assert.equal(success.env.focus, 'QA-UPDATE'); assert.equal(success.env.search, '');
  assert.equal(success.env.upcoming, false); assert.equal(success.env.page, 1);
  assert.equal(success.env.saved[0], success.env.record);
  assert.equal(success.env.notifications.length, 0);
  assert.match(success.env.message.text, /auto-synced/);

  for (const failure of ['saveFailure', 'calendarFailure', 'versionFailure']) {
    const h = makeHarness({ [failure]: true }); await h.update();
    assert.equal(h.env.activeTab, 'dispatch', failure); assert.equal(h.env.resets, 0, failure);
    assert.equal(h.env.focus, undefined, failure); assert.equal(h.env.returns.length, 0);
    if (failure === 'calendarFailure') { assert.equal(h.env.saved.length, 1); assert.match(h.env.message.text, /booking is saved/); }
    else assert.equal(h.env.calendarCalls.length, 0);
  }
  for (const change of ['draft', 'raw', 'context', 'tab']) {
    const h = makeHarness(); h.env.beforeCalendarReturn = () => {
      if (change === 'draft') h.env.bookingFormRef.current = { ...h.env.booking, name: 'NEXT EDIT' };
      if (change === 'raw') h.env.bookingMessageRef.current.value = 'NEXT RAW';
      if (change === 'context') h.env.driverJobLinkFormContextRevisionRef.current++;
      if (change === 'tab') h.env.activeTabRef.current = 'drivers';
    };
    await h.update(); assert.equal(h.env.focus, undefined, `No late navigation after ${change}`);
    assert.equal(h.env.resets, 0); assert.equal(h.env.retained, 0);
  }
  const folder = makeHarness({ otherOrigin: true, customerUrl: '/customers/192?load_saved_jobs=1&focus_booking_reference=QA-UPDATE' });
  await folder.update(); folder.env.timers.forEach(callback => callback());
  assert.deepEqual(folder.env.returns, ['/customers/192?load_saved_jobs=1&focus_booking_reference=QA-UPDATE']);
  assert.equal(folder.env.focus, undefined);
  const failedFolder = makeHarness({ otherOrigin: true, customerUrl: '/customers/192', calendarFailure: true });
  await failedFolder.update(); assert.equal(failedFolder.env.timers.length, 0);
  const request = makeHarness({ customerRequest: true }); await request.update();
  assert.equal(request.env.activeTab, 'dispatch'); assert.deepEqual(request.env.notifications, ['QA-UPDATE']);
  const assignment = makeHarness(); assignment.env.booking.driverId = '46'; await assignment.update({ assignmentOnly: true });
  assert.equal(assignment.env.activeTab, 'dispatch'); assert.equal(assignment.env.calendarCalls.length, 0);
  assert.match(assignment.env.message.text, /Create Link is ready/);
  const other = makeHarness({ otherOrigin: true }); await other.update(); assert.equal(other.env.activeTab, 'dispatch'); assert.equal(other.env.retained, 1);
  const unknownDate = makeHarness(); unknownDate.env.record.pickup_at = null; await unknownDate.update(); assert.equal(unknownDate.env.activeTab, 'dispatch'); assert.equal(unknownDate.env.resets, 0);
  const staleFolder = makeHarness({ customerUrl: '/customers/999' }); await staleFolder.update();
  assert.equal(staleFolder.env.activeTab, 'bookings'); assert.equal(staleFolder.env.timers.length, 0, 'Explicit Bookings origin overrides an older URL handoff');
  const wrongOrigin = makeHarness(); wrongOrigin.env.updateCalReturnBookingReferenceRef.current = 'ANOTHER-BOOKING';
  await wrongOrigin.update(); assert.equal(wrongOrigin.env.activeTab, 'dispatch');
  const changedDate = makeHarness(); changedDate.env.record.pickup_at = '2030-10-08T00:00:00Z';
  await changedDate.update(); assert.equal(changedDate.env.date, '2030-10-08', 'Saved response overrides the old date');
  const history = makeHarness({ history: true }); await history.update(); assert.equal(history.env.activeTab, 'completed'); assert.equal(history.env.focus, 'QA-UPDATE');
  console.log('Update + Cal actual callback: exact saved date/job, origin, failures, newer edits, assignment and Accept + Cal passed.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await checks();
