import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const guardScript = "scripts/test-load-bookings-typed-operational-display-merge-guard.mjs";
const typedReadPath = "/api/admin-load-bookings-typed-read";

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

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);

  return source.slice(start, end);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const [
  appPage,
  aiParseRoute,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  ledger,
  preactivationSuite,
] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Load Bookings Typed Operational Display Merge Guard Lock",
);

for (const phrase of [
  "Typed Load Bookings operational display merge is guarded.",
  "Typed safe-card fields are primary for operational display.",
  "Legacy saved-booking operational card fields are sanitized fallback only.",
  "The merge is field-by-field across `loadBookingsOperationalDisplayFieldNames`.",
  "Typed safe-card null/blank fields must not blank safe fallback operational display fields.",
  "Typed safe-card data must not replace the `BookingRecord` source used by form/action/detail paths.",
  "Load Bookings still keeps `GET /api/admin-saved-bookings` as the booking/form/detail source and fallback.",
  "No blind endpoint swap is approved.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` route endpoint swap is approved; the read helper may use the approved schema fallback only.",
  "No parser or `/api/ai-parse` change.",
  "No DB write, provider send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/card addition, or new shim is approved by this lock.",
  "This lock adds `scripts/test-load-bookings-typed-operational-display-merge-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Typed operational display merge ledger phrase ${phrase}`);
}

const mergeBlock = sliceBetween(
  appPage,
  "function mergeLoadBookingsOperationalDisplayCard",
  "function getLoadBookingsOperationalDisplayTitle",
);

for (const fragment of [
  "fallbackCard: LoadBookingsOperationalDisplayCard",
  "typedCard: LoadBookingsOperationalDisplayCard",
  "const mergedCard = createEmptyLoadBookingsOperationalDisplayCard();",
  "for (const fieldName of loadBookingsOperationalDisplayFieldNames)",
  "mergedCard[fieldName] = typedCard[fieldName] || fallbackCard[fieldName];",
  "return mergedCard;",
]) {
  assertIncludes(mergeBlock, fragment, `Typed operational display merge fragment ${fragment}`);
}

assertExcludes(mergeBlock, "...typedCard", "Typed operational display merge bulk typed spread");
assertExcludes(mergeBlock, "...fallbackCard", "Typed operational display merge bulk fallback spread");

const selectorBlock = sliceBetween(
  appPage,
  "function getLoadBookingsOperationalDisplayCard",
  "function buildLoadBookingsOperationalDisplayItems",
);

assertIncludes(selectorBlock, "const fallbackCard = buildLoadBookingsOperationalDisplayCard(bookingRecord);");
assertIncludes(selectorBlock, "loadBookingsTypedOperationalCardsById[cleanReferenceText(bookingRecord.id)]");
assertIncludes(selectorBlock, "loadBookingsTypedOperationalCardsById[cleanReferenceText(bookingRecord.booking_reference)]");
assertIncludes(selectorBlock, "loadBookingsTypedOperationalCardsById[cleanReferenceText(fallbackCard.booking_id)]");
assertIncludes(selectorBlock, "loadBookingsTypedOperationalCardsById[cleanReferenceText(fallbackCard.booking_reference)]");
assertIncludes(selectorBlock, "return fallbackCard;");
assertIncludes(selectorBlock, "return mergeLoadBookingsOperationalDisplayCard(fallbackCard, typedCard);");
assertExcludes(selectorBlock, "...typedCard", "Operational display selector bulk typed spread");
assertExcludes(selectorBlock, "...fallbackCard", "Operational display selector bulk fallback spread");

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(
  loadBookingsBlock,
  "fetchLoadBookingsTypedOperationalDisplayResult(searchParams)",
  "typed operational display fetch",
);
assertIncludes(
  loadBookingsBlock,
  "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`",
  "legacy saved-bookings read remains",
);
assertIncludes(
  loadBookingsBlock,
  "setBookings(loadedBookings);",
  "legacy BookingRecord source remains",
);
assertExcludes(loadBookingsBlock, "setBookings(typedOperationalDisplay", "typed display must not replace BookingRecord source");
assertExcludes(loadBookingsBlock, "setBookings(typedOperational", "typed display must not replace BookingRecord source");

const formBlock = sliceBetween(
  appPage,
  "function bookingRecordToForm",
  "function bookingRecordToOperationalFormFields",
);
assertExcludes(formBlock, "LoadBookingsOperationalDisplayCard", "safe card must not feed form mapping");
assertExcludes(formBlock, "loadBookingsTypedOperational", "typed display state must not feed form mapping");

for (const [label, source] of [
  ["AI parse route", aiParseRoute],
  ["admin-bookings route", adminBookingsRoute],
  ["admin-saved-bookings route", adminSavedBookingsRoute],
]) {
  assertExcludes(source, typedReadPath, `${label} typed Load Bookings route coupling`);
  assertExcludes(source, "mergeLoadBookingsOperationalDisplayCard", `${label} display merge coupling`);
}

assertIncludes(preactivationSuite, guardScript, "Preactivation suite typed operational display merge guard registration");

console.log("Load Bookings typed operational display merge guard passed");
