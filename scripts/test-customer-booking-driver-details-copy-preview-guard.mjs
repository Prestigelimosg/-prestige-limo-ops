import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPath = "app/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customer-booking-driver-details-copy-preview-guard.mjs";

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

function sectionBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `Missing start marker: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `Missing end marker after ${startNeedle}: ${endNeedle}`);

  return source.slice(start, end);
}

function ledgerSection(source, heading) {
  const start = source.indexOf(heading);
  assert.notEqual(start, -1, `Missing ledger section: ${heading}`);
  const next = source.indexOf("\n### ", start + heading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const [appSource, ledger, preactivationSuite] = await Promise.all([
  readFile(appPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const customerCopyGenerator = sectionBetween(
  appSource,
  "const customerCopyCard = useMemo(() => {",
  "const draftDriverDispatchCard = useMemo(() => {",
);

const customerCopyUi = sectionBetween(
  appSource,
  'data-dispatch-workflow-step="customer-whatsapp-copy"',
  'data-dispatch-workflow-step="driver-dispatch-copy"',
);

for (const fragment of [
  'data-dispatch-workflow-step="customer-whatsapp-copy"',
  'data-copy-preview="customerCopy"',
  'data-copy-copy-button="customerCopy"',
  'data-copy-edit-button="customerCopy"',
]) {
  assertIncludes(appSource, fragment, `existing Customer Copy control ${fragment}`);
}

for (const fragment of [
  '"CUSTOMER BOOKING DETAILS"',
  '"DRIVER DETAILS"',
  "`Passenger name: ${clean(booking.name)}`",
  "`Booking reference: ${bookingReference}`",
  "`Service: ${serviceType}`",
  "`Pickup date: ${formatDate(booking.date)}`",
  "`Pickup time: ${formatPickupTime(booking.time)}`",
  "const flightLocationParts = dispatchCopyLocationFlightParts(booking);",
  "`Pickup location: ${flightLocationParts.pickup}`",
  "`Drop-off location: ${flightLocationParts.dropoff}`",
  "`Pax: ${Number(clean(booking.pax)) || 1}`",
  "flightLocationParts.standaloneFlightLine",
  "`Driver: ${bookingDriverName}`",
  "`Driver contact: ${bookingDriverContact}`",
  "`Car plate: ${customerCopyDriverPlate}`",
  "`Car type: ${carType}`",
]) {
  assertIncludes(customerCopyGenerator, fragment, `Customer Copy generator field ${fragment}`);
}

for (const forbidden of [
  "customerCopyTermsText",
  "customerTermsAndSurchargeSummary",
  "Customer notes included:",
  "NOTES",
  "Midnight surcharge",
  "Waiting time:",
  "Hourly bookings include",
  "amendment fee",
  "Your booking is confirmed once",
  "customerLiveLocation.copyLine",
  "Route:",
  "Itinerary:",
  "formatChildSeatNote",
  "childSeatLine",
  "booking.vehicle",
  "draftPricing",
  "driverPayout",
  "customerPrice",
  "customer_rates",
  "driver_payout_rules",
  "PayNow",
  "payment",
  "billing",
  "invoice",
  "internal",
  "debug",
  "token",
  "adminSavedBookingsApiPath",
  "adminCustomerDriverDetailsEmailSend",
  "fetch(",
  "RESEND_API_KEY",
  "Resend",
  "`Passenger: ${clean(booking.name)}`",
  "Customer/passenger/traveler name:",
]) {
  assertExcludes(customerCopyGenerator, forbidden, "Customer Copy generator forbidden content");
}

for (const forbidden of [
  "Send Email",
  "Send Telegram",
  "Send WhatsApp",
  "Send SMS",
  "Telegram API",
  "WhatsApp API",
  "Resend API",
  "data-customer-copy-terms-note",
]) {
  assertExcludes(customerCopyUi, forbidden, "Customer Copy UI provider-send wording");
}

const copyPreviewSection = ledgerSection(
  ledger,
  "### Customer Booking + Driver Details Copyable Message Preview Lock",
);

for (const phrase of [
  "This is a bounded runtime implementation in the existing Customer Copy section.",
  "It reuses `data-dispatch-workflow-step=\"customer-whatsapp-copy\"`, `data-copy-preview=\"customerCopy\"`, `data-copy-copy-button=\"customerCopy\"`, and `data-copy-edit-button=\"customerCopy\"`.",
  "The generated plain-text preview has only `CUSTOMER BOOKING DETAILS` and `DRIVER DETAILS` sections.",
  "Allowed customer booking fields are customer/passenger/traveler name when available with customer-facing label `Passenger name:`, booking reference when available, service type, pickup date, pickup time, pickup location, drop-off location, passenger count, and customer-facing flight number only if available.",
  "Allowed driver fields are driver name, driver contact, car plate, and car type from assigned driver profile data only.",
  "Telegram and WhatsApp remain generate/copy/manual-send only; no Telegram API send, WhatsApp API send, automatic fallback, automatic multi-channel blast, provider credentials, provider activation, or provider send is included.",
  "Email remains separate through the gated Resend route and is not activated by this preview.",
  "The preview excludes pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, payment/PDF/billing, invoice content, internal/admin notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, auth/location/photo/calendar/OTS data, live-location text, route extras, and child-seat/internal service extras.",
  "The Resend send route now uses a same-origin admin-surface closed-gate 503 proof path so the no-send gate can be verified without secret-token handling; that staging proof is completed for `81d91ec`, and any one-message Resend evidence still requires separate approval before a real send.",
]) {
  assertIncludes(copyPreviewSection, phrase, `copy preview ledger phrase ${phrase}`);
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation suite Customer Booking + Driver Details Copyable Message Preview guard registration",
);

console.log("Customer booking driver details copy preview guard passed");
