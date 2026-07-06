import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contractPath = "docs/customer-driver-status-visibility-contract.md";
const driverReportingContractPath = "docs/driver-reporting-status-contract.md";
const adminDriverExceptionContractPath = "docs/admin-driver-exception-handling-contract.md";
const limoApiIntegrationPlanPath = "docs/limo-api-integration-plan.md";
const driverWorkflowPlanPath = "docs/driver-job-link-workflow-plan.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customer-driver-status-visibility-contract.mjs";

const portalPagePath = "app/my-bookings/page.tsx";
const portalAdapterPath = "lib/customer-portal-saved-bookings-adapter.ts";
const customerSavedBookingsReadPath = "lib/customer-saved-bookings-read.ts";
const portalSurfaceGuardPath = "scripts/test-public-customer-portal-saved-booking-surface-guard.mjs";

const currentCustomerDisplayStatuses = [
  "Cancelled",
  "Completed",
  "Confirmed",
  "Pending Staff Review",
  "Requested",
];

const allowedPortalBookingFields = [
  "driverDetails",
  "dropoffLocation",
  "flightNumber",
  "id",
  "passengerName",
  "pickupDateTime",
  "pickupLocation",
  "serviceType",
  "specialRequest",
  "status",
  "vehicleType",
];

const allowedCurrentApiRecordFields = [
  "booking_month",
  "booking_reference",
  "created_at",
  "customer_driver_details",
  "customer_facing_status",
  "dropoff_location",
  "passenger_name",
  "pickup_at",
  "pickup_location",
  "service_type",
  "updated_at",
];

const allowedCurrentCustomerStatuses = [
  "cancelled",
  "confirmed",
  "declined",
  "driver_assigned",
  "driver_pending",
  "not_confirmed",
  "pending_review",
  "received",
  "completed",
];

const futureCustomerSafeDriverProgressLabels = [
  "Driver assigned",
  "Driver on the way",
  "Driver arrived",
  "Trip in progress",
  "Completed",
];

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, pattern, label) {
  assert.equal(pattern.test(source), false, `${label} must not match ${pattern}.`);
}

function assertSameList(actual, expected, label) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
}

function blockBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing source block start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing source block end after ${startFragment}: ${endFragment}`);

  return source.slice(start, end + endFragment.length);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function extractTypeUnionValues(source, typeName) {
  const match = source.match(new RegExp(`export\\s+type\\s+${typeName}\\s*=\\s*([^;]+);`));
  assert.ok(match, `Expected type union ${typeName}.`);

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractTypeKeys(source, typeName) {
  const match = source.match(new RegExp(`export\\s+type\\s+${typeName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  assert.ok(match, `Expected exported type ${typeName}.`);

  return [...match[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)\??:\s/gm)].map((item) => item[1]);
}

function extractSetItems(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*new\\s+Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(match, `Expected Set ${constName}.`);

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

const fileEntries = await Promise.all(
  [
    contractPath,
    driverReportingContractPath,
    adminDriverExceptionContractPath,
    limoApiIntegrationPlanPath,
    driverWorkflowPlanPath,
    docsIndexPath,
    ledgerPath,
    preactivationSuitePath,
    portalPagePath,
    portalAdapterPath,
    customerSavedBookingsReadPath,
    portalSurfaceGuardPath,
  ].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const contract = files[contractPath];
const driverReportingContract = files[driverReportingContractPath];
const adminDriverExceptionContract = files[adminDriverExceptionContractPath];
const limoApiIntegrationPlan = files[limoApiIntegrationPlanPath];
const driverWorkflowPlan = files[driverWorkflowPlanPath];
const docsIndex = files[docsIndexPath];
const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const portalPage = files[portalPagePath];
const portalAdapter = files[portalAdapterPath];
const customerSavedBookingsRead = files[customerSavedBookingsReadPath];
const portalSurfaceGuard = files[portalSurfaceGuardPath];
const ledgerSection = sectionBetween(ledger, "### Customer Driver Status Visibility Contract Lock");

for (const fragment of [
  "# Customer Driver Status Visibility Contract",
  "Customer surfaces must not receive raw driver reporting, raw driver issue reports, admin exception state, dispatcher notes, replacement-driver review, raw live location state, OTS photo/proof state, or internal closeout notes.",
  "Current customer saved-booking list display remains generic and customer-safe.",
  "These are customer-facing booking states, not raw driver workflow states.",
  "Owner direction: keep the Customer Portal saved-booking list generic, but allow the expanded booking detail view to show customer-safe assigned-driver details and one Grab/Uber-style customer tracking panel after staff confirmation.",
  "The current customer saved-booking record may use `customer_facing_status` and optional `customer_driver_details` only.",
  "This current path is referenced to prove the booking list remains generic and protected while the expanded detail card may show only customer-safe assigned-driver details and the approved customer tracking panel.",
  "The current approved `/my-bookings` expanded detail card may show:",
  "- driver name",
  "- driver contact",
  "- car plate",
  "- car type",
  "- pickup date/time",
  "- route",
  "The card appears from the customer saved-bookings projection only after safe assigned-driver fields exist.",
  "If those fields are not present, `/my-bookings` shows only the normal booking details and no empty Driver Details card.",
  "The current approved customer tracking display lives only in the expanded `/my-bookings` detail view.",
  "Those labels must be derived through a customer-safe projection.",
  "The customer tracking panel must stay out of the Customer Portal saved-booking list. It appears only after opening one booking detail.",
  "Customer live-location viewing is a gated detail-card tracking panel, not Customer Portal saved-booking list content.",
  "For eligible DEP, TRF, and hourly jobs, the customer may view the in-app map only after the driver presses OTW and shares location through the scoped customer app link.",
  "Arrival/MNG customer live location stays disabled unless separately approved.",
  "Customer-visible live location must auto-disable when the driver presses POB or POB is marked; any backend cleanup grace must not leave customer tracking visible after POB.",
  "raw coordinates must not be rendered as customer-visible text in `/my-bookings`.",
  "No customer surface may show raw issue values",
  "Customer public surfaces may show only customer-safe booking status/progress summaries.",
  "keep the Customer Portal saved-booking list generic;",
  "keep the assigned-driver detail card limited to customer-safe driver name, contact, car plate, car type, pickup time, and route;",
  "use one customer-safe Driver Tracking panel in the expanded booking detail instead of adding a duplicate customer tracking page;",
  "route customer live-location viewing through the existing gated customer map read and never render raw coordinates in `/my-bookings`;",
  "auto-disable customer-visible live location when the driver presses POB or POB is marked;",
  "keep Arrival/MNG customer live location disabled unless separately approved;",
  "preserve `/my-bookings` adapter allowlists and forbidden-field filtering;",
]) {
  assertIncludes(contract, fragment, `customer driver status contract phrase ${fragment}`);
}

for (const status of currentCustomerDisplayStatuses) {
  assertIncludes(contract, `\`${status}\``, `current customer display status ${status}`);
}

for (const label of futureCustomerSafeDriverProgressLabels) {
  assertIncludes(contract, `\`${label}\``, `future customer-safe driver progress label ${label}`);
}

for (const fragment of [
  "driver_otw -> ots -> pob -> completed",
  "OTW -> OTS -> POB -> Job Completed",
]) {
  assertIncludes(contract, fragment, `driver status chain in customer visibility contract ${fragment}`);
  assertIncludes(driverReportingContract, fragment, `driver status chain in driver reporting contract ${fragment}`);
}

for (const fragment of [
  "the customer can receive a live location link 30 minutes before pickup",
  "For Arrival/MNG jobs, customer live location is not used.",
  "Live location should auto-end when POB is marked.",
  "Driver location auto-ends at POB.",
  "No live location production behavior is implemented in this task.",
]) {
  assertIncludes(limoApiIntegrationPlan, fragment, `limo API live-location planning boundary ${fragment}`);
}

assertIncludes(
  driverWorkflowPlan,
  "Live location should auto-disable when POB is marked later; any backend cleanup grace must not keep customer-visible tracking open after POB.",
  "driver workflow plan POB auto-disable boundary",
);
assertExcludes(
  driverWorkflowPlan,
  /Live location should auto-disable 5 minutes after POB later\./,
  "driver workflow plan old customer-visible POB timing",
);

for (const fragment of [
  "No raw driver issue detail or internal handling state without a future approved customer contract.",
  "Raw driver issue details, replacement-driver reasoning, dispatcher notes, internal exception state, and closeout notes remain blocked until a future customer contract approves them.",
]) {
  assertIncludes(
    `${driverReportingContract}\n${adminDriverExceptionContract}`,
    fragment,
    `upstream customer visibility boundary ${fragment}`,
  );
}

assertSameList(
  extractTypeUnionValues(portalAdapter, "BookingStatus"),
  currentCustomerDisplayStatuses,
  "current CustomerPortal BookingStatus labels",
);
assertSameList(
  extractTypeKeys(portalAdapter, "CustomerPortalBooking"),
  allowedPortalBookingFields,
  "current CustomerPortalBooking fields",
);
assertSameList(
  extractSetItems(portalAdapter, "allowedApiRecordFields"),
  allowedCurrentApiRecordFields,
  "customer portal adapter API record fields",
);
assertSameList(
  extractSetItems(customerSavedBookingsRead, "allowedCustomerStatuses"),
  allowedCurrentCustomerStatuses,
  "customer saved-bookings allowed raw customer statuses",
);

const customerSavedBookingsSelectBlock = blockBetween(
  customerSavedBookingsRead,
  "const customerSavedBookingsCurrentSelect =",
  "const customerSavedBookingsAuthRequiredError =",
);
assertIncludes(customerSavedBookingsSelectBlock, "customer_facing_status", "customer saved-bookings select status");
for (const forbiddenSelectPattern of [
  /driver_(?:otw|status|issue|job|payout|token)/i,
  /\bots\b/i,
  /\bpob\b/i,
  /status_history/i,
  /exception/i,
  /replacement/i,
  /dispatcher/i,
  /safe_status_note/i,
  /driver_job_status_events/i,
]) {
  assertExcludes(customerSavedBookingsSelectBlock, forbiddenSelectPattern, "customer saved-bookings select");
}

for (const forbiddenSetPattern of [
  /driver_otw/i,
  /\bots\b/i,
  /\bpob\b/i,
  /passenger_no_show/i,
  /vehicle_issue/i,
  /replacement/i,
  /exception/i,
  /dispatcher/i,
]) {
  assertExcludes(blockBetween(customerSavedBookingsRead, "const allowedCustomerStatuses", "]);"), forbiddenSetPattern, "customer allowed statuses");
}

for (const fragment of [
  'status: safeStatus(record.customer_facing_status)',
  'if (normalized === "completed")',
  'if (normalized === "confirmed" || normalized === "driver_assigned")',
  'return "Pending Staff Review";',
]) {
  assertIncludes(portalAdapter, fragment, `customer portal status projection ${fragment}`);
}

for (const forbiddenPortalPattern of [
  /driver issue/i,
  /passenger no-show/i,
  /vehicle issue/i,
  /accident/i,
  /replacement driver/i,
  /dispatcher exception/i,
  /completed with exception/i,
  /status history/i,
  /safeStatus/i,
  /data-admin-/i,
]) {
  assertExcludes(portalPage, forbiddenPortalPattern, "/my-bookings customer driver-status visibility");
}

for (const fragment of [
  "`/my-bookings` saved-booking rows must render only customer-safe status, passenger, pickup/drop-off, service, vehicle, date/time, flight, and optional request-note display fields; the expanded detail view may additionally render a customer-safe assigned-driver details card and one approved Driver Tracking panel that combines gated in-app map viewing with compact Trip Updates for safe customer-app driver progress only.",
  "Customer saved-booking API and adapter output must stay limited to the approved saved-booking record fields plus optional `customer_driver_details` with driver name, driver contact, car plate, and car type only; it must exclude customer price, driver payout, PayNow payout, billing, invoice/payment/PDF, internal finance/admin notes, parser/debug, secrets/tokens, provider/send, notification payloads, raw live location/photo/proof, and mock QA/dev archive fields.",
  "Public customer portal saved-booking surface guard passed",
]) {
  assertIncludes(portalSurfaceGuard, fragment, `public customer portal guard coordination ${fragment}`);
}

for (const fragment of [
  "[Customer Driver Status Visibility Contract](customer-driver-status-visibility-contract.md)",
  "customer-safe visibility boundary for the `/my-bookings` expanded assigned-driver details card and one approved Driver Tracking panel, shown only inside one opened booking detail while keeping Customer Portal saved-booking lists generic",
  "with POB auto-disable and without exposing raw driver statuses, issue reports, admin exceptions, replacement review, raw live-location state, photo/proof, finance, payout, billing, or payment data",
]) {
  assertIncludes(docsIndex, fragment, `docs index customer driver status link ${fragment}`);
}

for (const fragment of [
  "Customer Driver Status Visibility Contract Lock",
  "`docs/customer-driver-status-visibility-contract.md`",
  "`scripts/test-customer-driver-status-visibility-contract.mjs`",
  "This bounded lock approves only the `/my-bookings` expanded assigned-driver details card when safe driver details are present, optional `customer_driver_details` projection, and one approved Driver Tracking panel that combines the existing gated customer map read with compact Trip Updates; it does not approve any additional customer/admin sectors, endpoint migration, env changes, deployment, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/calendar activation, raw GPS exposure, customer message sending, or new shims.",
  "Owner direction is locked: keep the Customer Portal saved-booking list generic, but allow the expanded booking detail view to show a customer-safe assigned-driver details card and one Driver Tracking panel only after staff confirmation produces safe assigned-driver details.",
  "Customer live-location viewing is a gated detail-card Driver Tracking panel, not Customer Portal saved-booking list content; for eligible DEP, TRF, and hourly jobs, the in-app map may appear only after the driver presses OTW and shares location through the scoped customer app link.",
  "Arrival/MNG customer live location stays disabled unless separately approved, and customer-visible live location must auto-disable when the driver presses POB or POB is marked; any backend cleanup grace must not leave customer tracking visible after POB.",
  "This bounded lock approves only the existing `/my-bookings` Driver Tracking panel; no additional runtime implementation, duplicate customer tracking page, endpoint migration, env change, deployment, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/calendar activation, parser change, Save Booking change, `/api/admin-saved-bookings` change, or new shim is approved by this lock.",
]) {
  assertIncludes(ledgerSection, fragment, `ledger customer driver status visibility fragment ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation customer driver status visibility guard registration");

console.log("Customer driver status visibility contract guard passed");
