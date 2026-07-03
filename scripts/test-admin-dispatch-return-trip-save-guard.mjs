import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const appPage = await readFile(appPagePath, "utf8");

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function blockBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing block start ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing block end ${endFragment}`);

  return source.slice(start, end);
}

for (const fragment of [
  "returnTripRequested: string;",
  "returnDate: string;",
  "returnTime: string;",
  "returnFlight: string;",
  "returnPickup: string;",
  "returnDropoff: string;",
  'data-admin-dispatch-return-trip-checkbox="true"',
  'data-admin-dispatch-return-trip-fields="true"',
  "Save + CRM creates outbound and return as two linked booking records.",
]) {
  assertIncludes(appPage, fragment, `admin dispatch return trip UI fragment ${fragment}`);
}

for (const fragment of [
  "function adminDispatchReturnTripRequested",
  "function adminDispatchReturnTripMissingFields",
  "function buildAdminDispatchReturnTripBooking",
  "function buildAdminDispatchReturnTripPersistencePayloads",
  '`${groupReference}-OUT`',
  '`${groupReference}-RET`',
  "Linked return group",
]) {
  assertIncludes(appPage, fragment, `admin dispatch return helper ${fragment}`);
}

const saveBookingBlock = blockBetween(
  appPage,
  "async function saveBooking(): Promise<AdminBookingPersistenceRecord | null> {",
  "  function bookingRecordReferenceCandidates",
);

for (const fragment of [
  "buildAdminDispatchReturnTripPersistencePayloads",
  "for (const bookingPayload of bookingPayloads)",
  "savedBookings.push",
  "Booking save failed on linked",
  "for (const savedBooking of savedBookings)",
  "autoSyncSavedBookingGoogleCalendar(savedBooking.record)",
]) {
  assertIncludes(saveBookingBlock, fragment, `Save + CRM return trip save fragment ${fragment}`);
}

const updateBlock = blockBetween(
  appPage,
  "async function updateAppliedAdminBookingOperationalSnapshot()",
  "  async function updateAdminCustomerRequestReviewDecision",
);

assert.equal(
  updateBlock.includes("buildAdminDispatchReturnTripPersistencePayloads"),
  false,
  "Update + Cal must remain a single-record update and must not create a return trip pair.",
);

console.log("Admin dispatch return trip save guard passed");
