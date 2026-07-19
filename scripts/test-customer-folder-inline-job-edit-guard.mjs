import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const guardScript = "scripts/test-customer-folder-inline-job-edit-guard.mjs";
const [folder, savedRead, adminRoute, customers, ledger, suite] = await Promise.all([
  readFile("app/customers/[customerId]/saved-bookings-panel.tsx", "utf8"),
  readFile("lib/admin-customer-saved-bookings-read.ts", "utf8"),
  readFile("app/api/admin-bookings/route.ts", "utf8"),
  readFile("app/customers/page.tsx", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
  readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
]);

function includes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function sectionBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing section start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing section end: ${endFragment}`);

  return source.slice(start, end);
}

for (const fragment of [
  "public_booking_reference: string | null;",
  "public_booking_reference: safeText(booking.public_booking_reference, 80)",
]) {
  includes(savedRead, fragment, `safe public-reference projection ${fragment}`);
}

for (const fragment of [
  'return /^(?:[A-Z][A-Z0-9]{0,19}-)?\\d{5}$/.test(reference) ? reference : "";',
  'return safePublicBookingReference(booking.public_booking_reference) || "Reference unavailable";',
  "publicBookingReferenceDisplay(booking)",
  'data-customer-folder-inline-job-editor=',
  'data-customer-folder-inline-public-reference="true"',
  'data-customer-folder-inline-customer="true"',
  'data-customer-folder-inline-passenger="true"',
  'data-customer-folder-inline-pickup-time="true"',
  'data-customer-folder-inline-pickup="true"',
  'data-customer-folder-inline-dropoff="true"',
  'data-customer-folder-inline-route="true"',
  'data-customer-folder-inline-service="true"',
  'data-customer-folder-price-review-input=',
  'data-customer-folder-inline-save="true"',
  "Save price review",
  "Save job details",
  "openInlineBookingEditor",
  "inlineEditState.booking.public_booking_reference",
  "readOnly",
]) {
  includes(folder, fragment, `inline job editor ${fragment}`);
}

const exactRead = sectionBetween(
  folder,
  "async function openInlineBookingEditor",
  "function updateInlineEditField",
);
for (const fragment of [
  "adminBookingsApiPath",
  'method: "GET"',
  '"x-prestige-admin-purpose": "admin-booking-persistence"',
  "inlineEditText(exactBooking.booking_reference, 120) !== reference",
]) {
  includes(exactRead, fragment, `existing exact booking read ${fragment}`);
}

const exactSave = sectionBetween(
  folder,
  "async function saveInlineBookingDetails",
  "function openPriceReview",
);
for (const fragment of [
  "target_booking_reference: reference",
  "adminBookingsApiPath",
  'method: "PATCH"',
  '"x-prestige-admin-purpose": "admin-booking-persistence"',
  "route_points: inlineEditRoutePoints",
  "service_items: inlineEditServiceItems",
  "company_id: exactBooking.company_id",
  "booker_id: exactBooking.booker_id",
  "traveler_id: exactBooking.traveler_id",
]) {
  includes(exactSave, fragment, `existing exact booking PATCH ${fragment}`);
}
const exactSavePayload = sectionBetween(exactSave, "const payload = {", "\n    try {");
assert.equal(
  exactSavePayload.includes("public_booking_reference:"),
  false,
  "inline editor must never write or replace the immutable public reference",
);

for (const fragment of [
  "export async function GET(request: Request)",
  "export async function PATCH(request: Request)",
  "parseAdminBookingUpdatePayload",
  "requestReviewStatus === previousRequestReviewStatus",
  "previousBooking.data",
  "updateAdminBooking(parsed.data, actor",
]) {
  includes(adminRoute, fragment, `established admin bookings lane ${fragment}`);
}

for (const fragment of [
  "function customerFolderPublicBookingReference",
  "customerFolderPublicBookingReference(booking)",
  "missingPublicReference",
  "Repair its five-digit reference before invoice preparation.",
]) {
  includes(customers, fragment, `invoice public-reference boundary ${fragment}`);
}

const ledgerSection = sectionBetween(
  ledger,
  "### Customer-Folder Public Reference And Inline Job Editor (2026-07-19)",
  "\n### ",
);
for (const phrase of [
  "five digits, optionally preceded by the saved customer booking prefix",
  "The internal `booking_reference` remains the immutable server operation key",
  "`Save job details` reuses the established admin-only `PATCH /api/admin-bookings` writer",
  "`Save price review` updates only the in-memory invoice-preparation review",
  guardScript,
]) {
  includes(ledgerSection, phrase, `inline editor ledger phrase ${phrase}`);
}

includes(suite, guardScript, "preactivation inline job editor registration");

console.log("Customer-folder public reference and inline job edit guard passed");
