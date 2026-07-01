import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const safeDtoHelperPath = "lib/admin-load-bookings-safe-dto-contract.ts";
const safeUiAdapterHelperPath = "lib/admin-load-bookings-safe-ui-adapter-card-contract.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const safeDtoHelperExport = "buildAdminLoadBookingsSafeDtoContract";
const safeDtoHelperFragment = "admin-load-bookings-safe-dto-contract";
const safeUiAdapterHelperExport = "buildAdminLoadBookingsSafeUiAdapterCardContract";
const safeUiAdapterHelperFragment = "admin-load-bookings-safe-ui-adapter-card-contract";
const mappingGuardScript = "scripts/test-load-bookings-operational-runtime-mapping-guard.mjs";

const dbOrLivePathPattern =
  /@supabase\/supabase-js|createClient|supabase|\.from\(|\.select\(|\.insert\(|\.upsert\(|\.update\(|\.delete\(|rpc\s*\(|fetch\s*\(|process\.env|SUPABASE_[A-Z_]*|SERVICE_ROLE_KEY|SECRET_KEY|API_KEY|ACCESS_TOKEN|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;

const forbiddenFields = [
  "pricing",
  "payout",
  "`customer_rate`",
  "`customer_price_amount`",
  "`customer_rate_override`",
  "`customer_price_override_reason`",
  "`customer_rates`",
  "`driver_payout_rules`",
  "`driver_payout_min/max/amount/override/reason/unit`",
  "`driver_notes`",
  "`driver_dispatch_include_payout`",
  "midnight_surcharge/payout",
  "extra_stop_surcharge/payout",
  "child_seat_customer_surcharge/driver_payout",
  "`pricing_source`",
  "rate overrides",
  "payment",
  "PDF",
  "billing",
  "provider/send",
  "auth",
  "location/photo/calendar",
  "internal/admin notes",
  "debug",
  "secrets",
];

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
  appPage,
  aiParseRoute,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  safeDtoHelper,
  safeUiAdapterHelper,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(safeDtoHelperPath, "utf8"),
  readFile(safeUiAdapterHelperPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const mappingSection = sectionBetween(
  ledger,
  "### Operational-Only Load Bookings Runtime Mapping Guard Lock",
);

for (const phrase of [
  "Stage 1 operational-only Load Bookings display mapping is guarded.",
  "Current Load Bookings remains on `GET /api/admin-saved-bookings`.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "`/api/admin-saved-bookings` remains separate and unchanged.",
  "Safe DTO contract remains setup-only.",
  "Safe UI adapter/card contract remains setup-only.",
  "`app/page.tsx` uses a client-side operational display card mapper that mirrors the safe DTO plus safe UI adapter/card field shape without importing the server-only setup helpers.",
  "No blind endpoint swap is approved.",
  "Operational display mapping uses safe operational card fields only.",
  "When available, typed safe-card data is the primary operational display source and legacy saved-booking fields are fallback-only for the display card.",
  "Operational card render loops consume `LoadBookingsOperationalDisplayItem` pairs: typed-safe `operationalCard` for display, legacy `BookingRecord` for actions/form/detail fallback.",
  "Typed read preserves ordered safe-card ids as an operational display ordering hint; legacy `BookingRecord` remains the action/form/detail source.",
  "Operational display mapping must not feed safe operational card data into `bookingCardPriceLine`, `bookingRecordToForm` finance/payout mapping, driver dispatch payout copy, driver assignment payout controls, billing readiness finance paths, or `BookingRecord` finance/payout/internal fields.",
  "Dashboard/recent/completed operational display cards no longer render finance/payout price lines.",
  "Parser behavior and `/api/ai-parse` remain untouched.",
  "`app/page.tsx` now has a gated typed-read operational display bridge that hydrates operational display cards from `GET /api/admin-load-bookings-typed-read` before the legacy booking/form read when the typed read gate and admin boundary allow it.",
  "The bridge keeps the loaded booking/form source on `GET /api/admin-saved-bookings` and silently falls back to the existing operational display card mapper when typed read is blocked, closed, or unavailable.",
  "No direct Supabase, `adminLegacyDataClient`, or DB write path is introduced by this mapping guard.",
  "No new shims are added.",
  "This lock adds `scripts/test-load-bookings-operational-runtime-mapping-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(mappingSection, phrase, `Operational mapping ledger phrase ${phrase}`);
}

for (const forbiddenField of forbiddenFields) {
  assertIncludes(mappingSection, forbiddenField, `Operational mapping forbidden field ${forbiddenField}`);
}

for (const forbiddenApprovalPhrase of [
  "approved for runtime wiring",
  "runtime wiring is approved",
  "safe to wire now",
  "blind endpoint swap may proceed",
  "blind endpoint swap can proceed",
  "DB read/write is approved",
  "finance/payout approval granted",
]) {
  assertExcludes(
    mappingSection,
    forbiddenApprovalPhrase,
    `Operational mapping approval phrase ${forbiddenApprovalPhrase}`,
  );
}

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(
  loadBookingsBlock,
  "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`",
  "Current Load Bookings endpoint",
);
assertIncludes(loadBookingsBlock, 'method: "GET"', "Current Load Bookings method");
assertIncludes(
  loadBookingsBlock,
  "fetchLoadBookingsTypedOperationalDisplayResult(searchParams)",
  "Gated typed read operational display bridge",
);
const typedOperationalFetchIndex = loadBookingsBlock.indexOf(
  "fetchLoadBookingsTypedOperationalDisplayResult(searchParams)",
);
const legacySavedBookingsFetchIndex = loadBookingsBlock.indexOf(
  "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`",
);
assert.equal(
  typedOperationalFetchIndex > -1 && legacySavedBookingsFetchIndex > -1,
  true,
  "Load Bookings typed and legacy fetches must both be present.",
);
assert.equal(
  typedOperationalFetchIndex < legacySavedBookingsFetchIndex,
  true,
  "Typed safe-card hydration must run before the legacy saved-bookings form/detail read.",
);
assertIncludes(
  appPage,
  "function buildLoadBookingsOperationalDisplayCardFromTypedRead",
  "Typed read safe-card adapter",
);
assertIncludes(
  appPage,
  "function getLoadBookingsOperationalDisplayCard",
  "Operational display card selector",
);
assertIncludes(
  appPage,
  "setLoadBookingsTypedOperationalCardsById(typedOperationalDisplay?.cardsById ?? {})",
  "Typed read operational card state",
);
assertIncludes(
  appPage,
  "setLoadBookingsTypedOperationalCardOrder(typedOperationalDisplay?.orderedCardIds ?? [])",
  "Typed read operational card order state",
);
assertIncludes(
  appPage,
  "type LoadBookingsTypedOperationalDisplayResult = {",
  "Typed read operational display result type",
);
assertIncludes(appPage, "orderedCardIds: string[];", "Typed read operational ordered ids type");
assertIncludes(
  appPage,
  "function buildLoadBookingsTypedOperationalDisplayResult",
  "Typed read operational display result builder",
);
assertIncludes(appPage, "orderedCardIds.push(cardKey)", "Typed read operational ordered ids builder");
assertIncludes(
  appPage,
  "loadBookingsTypedOperationalCardOrderIndex",
  "Typed read operational order index",
);
assertIncludes(
  appPage,
  "useTypedOperationalOrder: true",
  "Typed read operational order display option",
);
assertIncludes(
  appPage,
  "function mergeLoadBookingsOperationalDisplayCard",
  "Typed read operational card primary field merge helper",
);
assertIncludes(
  appPage,
  "mergedCard[fieldName] = typedCard[fieldName] || fallbackCard[fieldName];",
  "Typed read operational card field-by-field primary precedence",
);
assertIncludes(appPage, "type LoadBookingsOperationalDisplayItem = {", "Operational display item type");
assertIncludes(appPage, "bookingRecord: BookingRecord;", "Operational display item legacy record boundary");
assertIncludes(
  appPage,
  "operationalCard: LoadBookingsOperationalDisplayCard;",
  "Operational display item safe card boundary",
);
assertIncludes(
  appPage,
  "function buildLoadBookingsOperationalDisplayItems",
  "Operational display item builder",
);
assertIncludes(
  appPage,
  "operationalCard: getLoadBookingsOperationalDisplayCard(bookingRecord)",
  "Operational display item safe-card source",
);
assertExcludes(
  loadBookingsBlock,
  "setBookings(typedOperationalCardsById",
  "Typed read operational cards must not replace booking/form source",
);
assertExcludes(
  loadBookingsBlock,
  "setBookings(typedOperationalDisplay",
  "Typed read operational ordered result must not replace booking/form source",
);
assertExcludes(loadBookingsBlock, safeDtoHelperExport, "Load Bookings safe DTO runtime wiring");
assertExcludes(loadBookingsBlock, safeDtoHelperFragment, "Load Bookings safe DTO runtime wiring");
assertExcludes(loadBookingsBlock, safeUiAdapterHelperExport, "Load Bookings safe UI adapter runtime wiring");
assertExcludes(loadBookingsBlock, safeUiAdapterHelperFragment, "Load Bookings safe UI adapter runtime wiring");
assertExcludes(loadBookingsBlock, "/api/admin-booking-read-contract-disabled-setup", "Blind typed-read endpoint swap");

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM path");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM path");
assertExcludes(saveBookingBlock, safeDtoHelperExport, "Save Booking + CRM safe DTO mapping");
assertExcludes(saveBookingBlock, safeUiAdapterHelperExport, "Save Booking + CRM safe UI adapter mapping");

assertExcludes(appPage, safeDtoHelperExport, "app/page.tsx safe DTO runtime wiring");
assertExcludes(appPage, safeDtoHelperFragment, "app/page.tsx safe DTO runtime wiring");
assertExcludes(appPage, safeUiAdapterHelperExport, "app/page.tsx safe UI adapter runtime wiring");
assertExcludes(appPage, safeUiAdapterHelperFragment, "app/page.tsx safe UI adapter runtime wiring");

assertIncludes(
  appPage,
  "function buildLoadBookingsOperationalDisplayCard",
  "Stage 1 operational display card mapper",
);
assertIncludes(
  appPage,
  "loadBookingsOperationalDisplayFieldNames",
  "Stage 1 operational display field list",
);
assertIncludes(
  appPage,
  "hasForbiddenLoadBookingsOperationalDisplayText",
  "Stage 1 operational display forbidden-value guard",
);
assertIncludes(
  appPage,
  "type LoadBookingsOperationalFormFields = Pick<",
  "Load Bookings operational form field boundary",
);
assertIncludes(
  appPage,
  "type LoadBookingsFinancePayoutInternalFormFields = Pick<",
  "Load Bookings finance/payout/internal form field boundary",
);

const bookingRecordToFormEntrypointBlock = sliceBetween(
  appPage,
  "function bookingRecordToForm",
  "function bookingRecordToOperationalFormFields",
);
for (const fragment of [
  "...createInitialBooking()",
  "...bookingRecordToOperationalFormFields(bookingRecord)",
  "...bookingRecordToFinancePayoutInternalFormFields(bookingRecord)",
]) {
  assertIncludes(bookingRecordToFormEntrypointBlock, fragment, `Load Bookings form mapping composition ${fragment}`);
}
for (const riskyField of [
  "customer_rate_override",
  "customer_price_override_reason",
  "driver_payout_override",
  "driver_payout_reason",
  "driver_notes",
  "driver_dispatch_include_payout",
]) {
  assertExcludes(
    bookingRecordToFormEntrypointBlock,
    riskyField,
    `Load Bookings form entrypoint raw finance/payout/internal field ${riskyField}`,
  );
}

const operationalFormFieldsBlock = sliceBetween(
  appPage,
  "function bookingRecordToOperationalFormFields",
  "function bookingRecordToFinancePayoutInternalFormFields",
);
for (const operationalField of [
  "company",
  "bookingType",
  "vehicle",
  "date",
  "time",
  "flight",
  "pickup",
  "extraStopLocation",
  "dropoff",
  "booker",
  "bookerContact",
  "bookerEmail",
  "name",
  "pax",
  "driverId",
  "driverName",
  "driverContact",
  "driverPlate",
  "childSeatRequired",
  "childSeatCount",
  "childSeatType",
  "extraStopCount",
]) {
  assertIncludes(operationalFormFieldsBlock, operationalField, `Load Bookings operational form field ${operationalField}`);
}
for (const riskyField of [
  "customer_rate_override",
  "customer_price_override_reason",
  "driver_payout_override",
  "driver_payout_reason",
  "driver_notes",
  "driver_dispatch_include_payout",
  "customerPriceOverride",
  "driverPayoutOverride",
  "driverNotes",
  "driverIncludePayout",
]) {
  assertExcludes(
    operationalFormFieldsBlock,
    riskyField,
    `Load Bookings operational form helper finance/payout/internal field ${riskyField}`,
  );
}

const financePayoutInternalFormFieldsBlock = sliceBetween(
  appPage,
  "function bookingRecordToFinancePayoutInternalFormFields",
  "function customerBookingTypeLabel",
);
for (const parkedField of [
  "customer_rate_override",
  "customer_price_override_reason",
  "driver_payout_override",
  "driver_payout_reason",
  "driver_notes",
  "driver_dispatch_include_payout",
  "customerPriceOverride",
  "customerPriceOverrideReason",
  "driverPayoutOverride",
  "savedDriverPayoutAmount",
  "driverPayoutReason",
  "driverNotes",
  "driverIncludePayout",
]) {
  assertIncludes(
    financePayoutInternalFormFieldsBlock,
    parkedField,
    `Load Bookings parked finance/payout/internal form field ${parkedField}`,
  );
}

const bookingRecordType = sliceBetween(appPage, "type BookingRecord = {", "type BookingStatusValue");
for (const riskyField of [
  "customer_rate",
  "customer_price_amount",
  "customer_rate_override",
  "customer_price_override_reason",
  "driver_payout_min",
  "driver_payout_max",
  "driver_payout_amount",
  "driver_payout_override",
  "driver_payout_reason",
  "driver_payout_unit",
  "driver_notes",
  "driver_dispatch_include_payout",
  "midnight_payout",
  "extra_stop_payout",
  "child_seat_driver_payout",
  "pricing_source",
]) {
  assertIncludes(bookingRecordType, riskyField, `Parked BookingRecord risky field ${riskyField}`);
}

for (const [label, start, end, expectedFragments] of [
  [
    "bookingCardPriceLine finance/payout path",
    "function bookingCardPriceAmounts",
    "function positiveRateOrDefault",
    [
      "customer_rate",
      "customer_price_amount",
      "customer_rate_override",
      "driver_payout_min",
      "driver_payout_override",
      "driver_payout_amount",
      "midnight_payout",
      "extra_stop_payout",
      "child_seat_driver_payout",
    ],
  ],
  [
    "bookingRecordToFinancePayoutInternalFormFields finance/payout path",
    "function bookingRecordToFinancePayoutInternalFormFields",
    "function customerBookingTypeLabel",
    [
      "customer_rate_override",
      "customer_price_override_reason",
      "driver_payout_override",
      "driver_payout_reason",
      "driver_notes",
      "driver_dispatch_include_payout",
    ],
  ],
]) {
  const source = sliceBetween(appPage, start, end);

  for (const expectedFragment of expectedFragments) {
    assertIncludes(source, expectedFragment, `${label} fragment ${expectedFragment}`);
  }

  assertExcludes(source, safeDtoHelperExport, `${label} safe DTO mapping`);
  assertExcludes(source, safeUiAdapterHelperExport, `${label} safe UI adapter mapping`);
}

for (const removedDashboardControl of [
  "function getDriverDispatchCard",
  "function bookingRecordToDriverDraft",
  "function getDriverDraft",
  "async function assignDriver",
  "async function copyDriverDispatch",
  "data-dashboard-action-group",
  "data-dashboard-assign-driver",
  "data-dashboard-copy-driver-dispatch",
  "data-dashboard-copy-job-card",
  "data-dashboard-mark-otw",
  "data-dashboard-mark-pob",
  "data-dashboard-mark-completed",
]) {
  assertExcludes(
    appPage,
    removedDashboardControl,
    `Dashboard direct action control removed from operational mapping ${removedDashboardControl}`,
  );
}

const priceLineUsages = appPage.match(/bookingCardPriceLine\(savedBooking\)/g) ?? [];
assert.equal(
  priceLineUsages.length,
  0,
  "Dashboard, recent, and completed operational display cards must not call bookingCardPriceLine(savedBooking).",
);

for (const [label, start, end, expectedDisplayItemMap, requiresVehiclePax] of [
  [
    "dashboard command-centre booking summaries",
    "function renderDashboardBookingSummaries",
    "const pricingPanel",
    "sectionItems.slice(0, 8).map(({ bookingRecord: savedBooking, operationalCard })",
    false,
  ],
  [
    "recent operational cards",
    "const recentBookingsPanel",
    "const completedEmptyState",
    "filteredRecentBookingDisplayItems.map(({ bookingRecord: savedBooking, operationalCard })",
    true,
  ],
  [
    "completed operational cards",
    "const completedBookingsPanel",
    "const jobCardCopyEditState",
    "monthGroup.displayItems.map(({ bookingRecord: savedBooking, operationalCard })",
    true,
  ],
]) {
  const source = sliceBetween(appPage, start, end);

  assertIncludes(source, expectedDisplayItemMap, label);
  assertExcludes(source, "bookingCardPriceLine(savedBooking)", label);
  assertExcludes(source, "Customer override:", label);
  assertExcludes(source, "Vehicle / pax / price", label);
  if (requiresVehiclePax) {
    assertIncludes(source, "Vehicle / pax", label);
  }
}

for (const billingDependency of [
  "buildCompletedBookingBillingReadinessAuditPayload",
  "hasSavedCustomerBillingAmountSource",
  "adminCompletedBookingBillingReadinessAudit",
]) {
  assertIncludes(appPage, billingDependency, `Billing readiness finance path ${billingDependency}`);
}

for (const [label, source] of [
  ["Safe DTO contract helper", safeDtoHelper],
  ["Safe UI adapter/card contract helper", safeUiAdapterHelper],
]) {
  assertIncludes(source, "server-only", label);
  assertIncludes(source, "loadBookingsRuntimeWiringEnabled: false", label);
  assertIncludes(source, "readEnabled: false", label);
  assertIncludes(source, "liveReadEnabled: false", label);
  assertIncludes(source, "dbReadEnabled: false", label);
  assertIncludes(source, "no_live_read: true", label);
  assertExcludes(source, dbOrLivePathPattern, label);
}

for (const field of [
  "pricing",
  "payout",
  "customer_rate",
  "customer_price_amount",
  "customer_rates",
  "driver_payout_rules",
  "driver_payout_amount",
  "driver_notes",
  "driver_dispatch_include_payout",
  "pricing_source",
  "payment",
  "pdf",
  "billing",
  "provider_send",
  "auth_session",
  "live_location",
  "photo",
  "calendar_event_id",
  "internal_admin_notes",
  "debug_payload",
  "secret_token",
]) {
  assertIncludes(safeDtoHelper, `"${field}"`, `Safe DTO forbidden field ${field}`);
  assertIncludes(safeUiAdapterHelper, `"${field}"`, `Safe UI adapter forbidden field ${field}`);
}

assertIncludes(adminSavedBookingsRoute, "export async function GET", "Admin saved bookings route");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "Admin saved bookings route");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "Admin saved bookings route");
assertExcludes(adminSavedBookingsRoute, safeDtoHelperExport, "Admin saved bookings route safe DTO separation");
assertExcludes(
  adminSavedBookingsRoute,
  safeUiAdapterHelperExport,
  "Admin saved bookings route safe UI adapter separation",
);

for (const [label, source] of [
  ["AI parse route", aiParseRoute],
  ["admin-bookings route", adminBookingsRoute],
]) {
  assertExcludes(source, safeDtoHelperExport, label);
  assertExcludes(source, safeDtoHelperFragment, label);
  assertExcludes(source, safeUiAdapterHelperExport, label);
  assertExcludes(source, safeUiAdapterHelperFragment, label);
}

for (const suiteEntry of [
  mappingGuardScript,
  "scripts/test-load-bookings-operational-runtime-wiring-approval-packet.mjs",
  "scripts/test-load-bookings-safe-ui-adapter-card-contract.mjs",
  "scripts/test-load-bookings-runtime-wiring-blocker.mjs",
  "scripts/test-load-bookings-safe-dto-no-live-guard.mjs",
  "scripts/test-load-bookings-safe-dto-contract.mjs",
  "scripts/test-admin-route-flow-lock.mjs",
  "scripts/test-shim-cleanup-no-new-shim-guard.mjs",
]) {
  assertIncludes(preactivationSuite, suiteEntry, `Preactivation suite entry ${suiteEntry}`);
}

console.log("Load Bookings operational runtime mapping guard passed");
