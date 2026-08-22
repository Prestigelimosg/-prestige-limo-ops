import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [appPage, globalStyles, ledger] = await Promise.all([
  readFile("app/page.tsx", "utf8"),
  readFile("app/globals.css", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
]);

function sectionBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing section start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing section end after ${startFragment}: ${endFragment}`);
  return source.slice(start, end);
}

const dispatchUi = sectionBetween(
  appPage,
  'data-dispatch-workflow="true"',
  '{activeTab === "bookings" ? (',
);
const parseHandler = sectionBetween(
  appPage,
  "async function applyParsedBookingMessage",
  "async function handleAiAssistParse",
);
const saveHandler = sectionBetween(
  appPage,
  "function handleJobCardPrimaryBookingAction",
  "const jobCardFeedback =",
);

for (const fragment of [
  'type MobileDispatchBookingStep = "message" | "details" | "options" | "review";',
  'data-mobile-dispatch-step={mobileDispatchBookingStep}',
  'data-mobile-dispatch-quick-booking="true"',
  'data-mobile-dispatch-booking-summary="true"',
  'data-mobile-dispatch-quick-step={step}',
  'data-admin-mobile-compact-header="true"',
  'data-admin-mobile-header-status="true"',
  'data-admin-mobile-primary-tabs="true"',
  'data-admin-mobile-access-links="true"',
  'data-dashboard-tab-has-alert-badge={showAdminActionBadge ? "true" : undefined}',
  '{ label: "Message", step: "message" }',
  '{ label: "Details", step: "details" }',
  '{ label: "Options", step: "options" }',
  '{ label: "Review", step: "review" }',
  'Nothing saves automatically.',
  '{clean(booking.name) || "Passenger not set"} · {String(Number(clean(booking.pax)) || 1)} pax',
  '{clean(booking.pickup) || "Pickup not set"} → {clean(booking.dropoff) || "Drop-off not set"}',
]) {
  assert.equal(appPage.includes(fragment), true, `Mobile quick booking must include ${fragment}`);
}

for (const fragment of [
  'data-customer-copy-action-grid="true"',
  'className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-row"',
  'data-customer-copy-readable-summary="true"',
  'data-customer-copy-readable-summary-item="true"',
  'data-customer-copy-readable-summary-wide=',
  'grid-cols-2 gap-1.5',
  'col-span-2 sm:col-span-1',
  'w-full rounded-md border border-amber-200',
]) {
  assert.equal(
    dispatchUi.includes(fragment),
    true,
    `Mobile Customer Copy space-use repair must include ${fragment}`,
  );
}

assert.equal(
  appPage.includes(
    'const customerCopyReadableSummaryPrimaryOrder = [\n    "Passenger",\n    "Reference",\n    "Service",\n    "Pax",',
  ),
  true,
  "Mobile Customer Copy must pair Passenger/Reference and Service/Pax before the full-width trip rows.",
);

for (const fragment of [
  'button[data-dashboard-tab-has-alert-badge="true"]',
  'flex-direction: column',
  'gap: 0.125rem',
  'padding-inline: 0.25rem',
  '[data-bookings-new-request-badge="true"]',
  'max-width: 100%',
  'padding-inline: 0.375rem',
  'white-space: nowrap',
]) {
  assert.equal(
    globalStyles.includes(fragment),
    true,
    `Mobile Dashboard alert badge containment must include ${fragment}`,
  );
}

for (const fragment of [
  'const parsed = await applyParsedBookingMessage(bookingMessage);',
  'setMobileDispatchBookingStep("review");',
]) {
  assert.equal(parseHandler.includes(fragment), true, `Parse handoff must include ${fragment}`);
}

assert.equal(
  dispatchUi.includes('onClick={handleParseBookingMessage}'),
  true,
  "The existing Create Job Card parser action must remain wired.",
);

assert.equal(
  dispatchUi.includes('onClick={handleJobCardPrimaryBookingAction}'),
  true,
  "The existing Job Card Preview Save + CRM action must remain wired.",
);
assert.equal(
  saveHandler.includes("saveBooking()"),
  true,
  "The existing Save + CRM handler must retain its established booking save call.",
);

for (const fragment of [
  '@media (max-width: 639px)',
  '[data-mobile-dispatch-step] > .contents > *',
  '[data-mobile-dispatch-quick-booking="true"]',
  '[data-mobile-dispatch-step="message"]',
  '[data-dispatch-workflow-step="booking-input-parser"]',
  '[data-mobile-dispatch-step="details"]',
  '[data-dispatch-workflow-step="booking-details"]',
  '[data-dispatch-workflow-step="pickup-dropoff-vehicle"]',
  '[data-mobile-dispatch-step="review"]',
  '[data-dispatch-workflow-step="job-card-preview"]',
  '[data-mobile-dispatch-step="options"]',
  '[data-admin-mobile-header-status="true"]',
  '[data-admin-mobile-primary-tabs="true"]',
  '[data-admin-mobile-access-links="true"]',
  'overflow-x: auto',
]) {
  assert.equal(globalStyles.includes(fragment), true, `Responsive visibility rules must include ${fragment}`);
}

for (const fragment of [
  '[data-mobile-dispatch-step="details"]\n    > .contents\n    > [data-dispatch-workflow-step="trip-extras"]',
  '[data-dispatch-workflow-step="pickup-dropoff-vehicle"]\n    ):not([data-dispatch-workflow-step="trip-extras"]):not(',
  '[data-dispatch-workflow-step="admin-lower-pricing"] {\n    order: 61;',
]) {
  assert.equal(
    globalStyles.includes(fragment),
    true,
    `Mobile Details and Options placement must include ${fragment}`,
  );
}

assert.equal(
  dispatchUi.indexOf('data-dispatch-workflow-step="pickup-dropoff-vehicle"') <
    dispatchUi.indexOf('data-dispatch-workflow-step="trip-extras"'),
  true,
  "The established Route Extras & Child Seat sector must remain after Pickup / Drop-off in source order.",
);
assert.equal(
  dispatchUi.indexOf('data-dispatch-workflow-step="driver-assignment"') <
    dispatchUi.indexOf('data-dispatch-workflow-step="admin-lower-pricing"'),
  false,
  "Desktop source order must stay unchanged; the phone-only CSS override owns Pricing placement.",
);

assert.equal(
  globalStyles.includes("min-width: 640px"),
  true,
  "The guard must retain an explicit desktop all-sections-visible contract.",
);

for (const forbidden of [
  "/api/mobile",
  "/api/quick-booking",
  "mobileSaveBooking",
  "mobileParseBooking",
]) {
  assert.equal(
    appPage.includes(forbidden),
    false,
    `Mobile quick booking must not add a parallel parser or save lane: ${forbidden}`,
  );
}

assert.equal(
  ledger.includes("### Mobile Dispatch Quick Booking Focus"),
  true,
  "Implementation ledger must record the bounded mobile Dispatch change.",
);

console.log("Mobile Dispatch quick booking guard passed.");
