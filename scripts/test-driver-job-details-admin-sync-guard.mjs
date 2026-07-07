import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-driver-job-details-admin-sync-guard.mjs";

const appPagePath = "app/page.tsx";
const driverJobRoutePath = "app/api/driver-job/[token]/route.ts";
const driverJobPagePath = "app/driver-job/[token]/page.tsx";
const driverJobContractPath = "lib/driver-job-link-contract.ts";
const driverJobProductionPath = "lib/driver-job-link-production.ts";
const driverStatusPersistencePath = "lib/driver-job-status-persistence.ts";
const adminBookingAdapterPath = "lib/admin-booking-supabase-adapter.ts";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);

  return source.slice(start, end);
}

const [
  ledger,
  preactivationSuite,
  appPage,
  driverJobRoute,
  driverJobPage,
  driverJobContract,
  driverJobProduction,
  driverStatusPersistence,
  adminBookingAdapter,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(driverJobRoutePath, "utf8"),
  readFile(driverJobPagePath, "utf8"),
  readFile(driverJobContractPath, "utf8"),
  readFile(driverJobProductionPath, "utf8"),
  readFile(driverStatusPersistencePath, "utf8"),
  readFile(adminBookingAdapterPath, "utf8"),
]);

const ledgerSection = sectionBetween(ledger, "### Driver Save And Acknowledge Details Admin Sync");

for (const phrase of [
  "Driver job link `Save & Acknowledge Job` now persists safe driver name/contact/plate/vehicle details through the verified driver job token path.",
  "The driver job page may prefill assigned driver details, but it does not mark the job acknowledged or show confirmed saved driver details until the driver presses `Save & Acknowledge Job`.",
  "Admin Dashboard, Bookings, and Dispatch silently re-read the existing admin-safe booking list every 3 seconds while loaded and merge only driver name/contact/plate/vehicle into the currently opened booking.",
  "Driver-entered vehicle model uses the existing safe booking vehicle display field only after driver details are present; no new DB schema, customer-wide vehicle exposure, provider send, GPS, billing, payout, or env gate is added.",
  "Customer Copy and Driver Dispatch can reflect driver-entered details without pressing Refresh or reloading the page.",
  "Customer Copy and Driver Dispatch also use the active driver job link safe vehicle summary as an admin-display fallback when the booking list has already picked up driver name/contact/plate but the driver vehicle model is still coming from the job-link payload.",
  "The admin Dispatch page quietly refreshes the existing active driver job link read once when booking sync sees driver name/contact/plate but no vehicle model on the currently loaded booking, so the safe vehicle summary can catch up after driver `Save & Acknowledge Job` without a manual refresh.",
  "If the loaded Dispatch booking already has driver name/contact/plate but no vehicle model, the same one-shot active driver job link safe-summary fallback starts immediately on load.",
  "This is not a customer send; admin still reviews Customer Copy before any customer-facing send.",
  "The auto-sync uses existing admin-safe booking read paths only and does not add public reads, broad writes, provider sends, Email/Resend/Telegram/WhatsApp/SMS, push sends, live GPS/customer map, billing/payment/PDF/invoice/payout, parser, calendar, or shims.",
  "Guard coverage lives in `scripts/test-driver-job-details-admin-sync-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Driver details sync ledger phrase ${phrase}`);
}

for (const forbidden of [
  "driver payout",
  "PayNow payout",
  "customer price",
  "billing",
  "invoice",
  "payment",
  "internal admin notes",
  "parser/debug",
  "secrets",
  "raw provider payloads",
]) {
  assertIncludes(ledgerSection, forbidden, `Driver details sync forbidden field ${forbidden}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation driver details sync guard registration");

assertIncludes(driverJobRoute, "export async function PATCH", "Driver job route details PATCH");
assertIncludes(driverJobRoute, "readDriverDetailsBody", "Driver job route detail parser");
assertIncludes(driverJobRoute, "applyProductionDriverJobDetailsUpdate", "Production details update helper call");
assertIncludes(driverJobRoute, "applyDriverJobDetailsUpdateContract", "Mock details update helper call");
assertIncludes(driverJobRoute, "invalid_details", "Invalid driver details rejection");

assertIncludes(driverJobPage, 'method: "PATCH"', "Driver page detail PATCH method");
assertIncludes(driverJobPage, "savingDriverDetails", "Driver page saving state");
for (const field of [
  "driver_contact: nextDetails.contact",
  "driver_name: nextDetails.name",
  "driver_plate_number: nextDetails.plate",
  "driver_vehicle_model: nextDetails.vehicleModel",
  "result.payload.assignedDriver",
]) {
  assertIncludes(driverJobPage, field, `Driver page details field ${field}`);
}

assertIncludes(driverJobContract, "applyDriverJobDetailsUpdateContract", "Mock details update contract");
assertIncludes(driverJobContract, "safeDriverDetailText", "Mock detail sanitizer");
assertIncludes(driverJobContract, "invalid_details", "Mock invalid details block");

assertIncludes(driverJobProduction, "applyProductionDriverJobDetailsUpdate", "Production details update export");
assertIncludes(driverJobProduction, "saveDriverJobDetailsThroughStatusPersistence", "Production persistence helper");

const detailsPersistenceBlock = sliceBetween(
  driverStatusPersistence,
  "export async function saveDriverJobDetailsThroughStatusPersistence",
  "export async function saveDriverJobStatusThroughStatusPersistence",
);

for (const fragment of [
  "safeDriverDetailsFromInput(input)",
  "resolveLinkForToken(input)",
  '.from("driver_job_links")',
  ".update({ safe_link_context: nextSafeContext })",
  '.from("bookings")',
  "driver_contact: nextDetails.contact || null",
  "driver_name: nextDetails.name",
  "driver_plate_number: nextDetails.plate || null",
  "bookingDriverDetailsUpdate.vehicle_type_or_category = nextDetails.vehicleModel",
  ".eq(\"booking_reference\", resolvedLink.link.booking_reference)",
  "payloadForLink(",
]) {
  assertIncludes(detailsPersistenceBlock, fragment, `Driver details persistence fragment ${fragment}`);
}

for (const forbidden of [
  "queueDriverStatusCustomerInAppNotification",
  "fetch(",
  "resend",
  "twilio",
  "whatsapp",
  "telegram",
  "sms",
  "invoice",
  "payout",
  "payment",
  "billing",
  "live_location",
  "gps",
]) {
  assertExcludes(detailsPersistenceBlock.toLowerCase(), forbidden.toLowerCase(), `Driver details persistence forbidden path ${forbidden}`);
}

for (const fragment of [
  "driver_name, driver_contact, driver_plate_number, vehicle_type_or_category",
  "driver_contact: textOrNull(booking.driver_contact)",
  "driver_name: textOrNull(booking.driver_name)",
  "driver_plate_number: textOrNull(booking.driver_plate_number)",
  "driver_contact: textOrNull(row.driver_contact)",
  "driver_name: textOrNull(row.driver_name)",
  "driver_plate_number: textOrNull(row.driver_plate_number)",
  "vehicle_type_or_category: textOrNull(row.vehicle_type_or_category)",
]) {
  assertIncludes(adminBookingAdapter, fragment, `Admin booking adapter driver detail fragment ${fragment}`);
}

for (const fragment of [
  "bookingAutoSyncInFlightRef",
  "bookingRecordReferenceCandidates",
  "findLoadedBookingRecordByReference",
  "mergeCurrentBookingDriverDetailsFromRecord",
  "mergeCurrentBookingDriverDetailsFromActiveLink",
  'void loadBookings("Bookings synced.", { silent: true })',
  "3 * 1000",
  "driverContact: driverContact || currentBooking.driverContact",
  "driverName: driverName || currentBooking.driverName",
  "driverPlate: driverPlate || currentBooking.driverPlate",
  "driverVehicleModel: driverVehicleModel || currentBooking.driverVehicleModel",
  "link.safe_summary.assigned_driver_contact",
  "link.safe_summary.assigned_driver_plate",
  "safeDriverVehicleModelFromBookingRecord",
  "safeDriverVehicleModelDisplay",
  "activeAdminDriverJobLink?.safe_summary.vehicle",
  "cleanReferenceText(activeAdminDriverJobLink?.booking_reference) ===",
  "cleanReferenceText(dispatchReleaseWorkflowBookingReference)",
  "if (activeTab !== \"dispatch\")",
  "driverJobLinkVehicleFallbackRefreshLastRequestedRef",
  "requestDriverJobLinkVehicleFallbackRefresh(recordReference)",
  "requestDriverJobLinkVehicleFallbackRefresh(bookingReference)",
  "requestDriverJobLinkVehicleFallbackRefresh(selectedBookingReference)",
  "now - lastRequestedAt < 8_000",
  "recordReference === currentBookingReference",
  "link_status: \"active\"",
  "const hasAssignedDriverDetails = Boolean",
  "safeDriverVehicleModelDisplay(booking.driverVehicleModel)",
  "safeDriverVehicleModelDisplay(assignedDriverRecord?.vehicle_type)",
  "Vehicle: ${driverVehicleModel}",
]) {
  assertIncludes(appPage, fragment, `Admin booking details auto-sync fragment ${fragment}`);
}

for (const fragment of [
  "setDriverDetails(loadedDriverDetails)",
  "setSavedDriverDetails(null)",
  "setAcknowledged(false)",
  "Driver details saved and job acknowledged.",
]) {
  assertIncludes(driverJobPage, fragment, `Driver job page acknowledgement fragment ${fragment}`);
}

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(loadBookingsBlock, "const silent = options?.silent === true;", "Load bookings silent mode");
assertExcludes(loadBookingsBlock, "skipSavedBookingsRead", "Load bookings legacy source bypass");
assertIncludes(loadBookingsBlock, "if (!silent)", "Load bookings avoids noisy loading state during sync");
assertIncludes(loadBookingsBlock, "mergeCurrentBookingDriverDetailsFromRecord", "Load bookings merges current driver details");
assertExcludes(loadBookingsBlock, "window.location.reload", "Load bookings reload");

console.log("Driver job details admin sync guard passed.");
