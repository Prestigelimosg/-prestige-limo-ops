import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript =
  "scripts/test-customer-booking-driver-details-message-payload-safety-guard.mjs";

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

const [ledger, preactivationSuite] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const payloadSection = sectionBetween(
  ledger,
  "### Customer Booking + Driver Details Message Payload Safety Contract Lock",
);

for (const phrase of [
  "This is a docs/test-only guard for future customer-facing customer booking plus driver details message payloads; it does not activate provider sends, credentials, env changes, DB reads/writes, deployment, runtime API behavior, UI, route/helper changes, live location implementation, scheduler, fallback, or blast behavior.",
  "Customer-facing driver-details messages must include both approved sections: CUSTOMER BOOKING DETAILS and DRIVER DETAILS.",
  "Driver details must not be sent without the relevant customer booking context.",
  "Allowed customer booking detail fields are customer/passenger/traveler name when available with customer-facing label `Passenger name:`, booking reference if available, service type, pickup date, pickup time, pickup location, drop-off location, passenger count, and flight number only if already customer-facing.",
  "Allowed driver-detail fields are driver name, driver contact, car plate, and car type.",
  "No extra customer booking fields or extra driver fields are approved by this lock.",
  "Future Email may app-send customer booking plus driver details through Resend only after admin explicitly clicks the Email action and the exact Email driver-details channel/action gate is separately approved/opened.",
  "Future Telegram may generate/copy customer booking plus driver details for manual admin send outside the app only; Telegram provider/API driver-details sending is not approved by this lock.",
  "Future WhatsApp may generate/copy customer booking plus driver details for manual admin send outside the app only; WhatsApp provider/API driver-details sending is not approved by this lock.",
  "Telegram may later send true live location as the first-priority live-location channel; POB trigger and POB plus 5 minute auto-stop require separate readiness, guard coverage, and owner-approved activation and are not active here.",
  "Email may later send secure tracking-link live location only when admin explicitly chooses that exact channel/action; Email must not auto-send live location and must not send native/streaming live location.",
  "SMS remains unapproved unless separately approved later.",
  "Admin must explicitly choose exactly one channel/action for each future send; no automatic fallback, no automatic multi-channel blast, and no provider send is approved without that specific channel/action gate approval.",
  "Customer-facing provider payloads must exclude pricing, payout, payout preferences, `driver_payout_rules`, `customer_rates`, payment/PDF/billing, internal/admin notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, and auth/location/photo/calendar/OTS data unless the selected lane explicitly approves it later.",
  "This lock does not implement live location, Telegram auto-send, POB trigger, POB plus 5 minute auto-stop, provider activation, provider credentials, Telegram provider send, WhatsApp provider send, SMS send, runtime app/API behavior, UI, DB writes, or deploys.",
]) {
  assertIncludes(
    payloadSection,
    phrase,
    `customer booking driver-details payload safety phrase: ${phrase}`,
  );
}

for (const forbidden of [
  "Driver details may be sent without customer booking details",
  "DRIVER DETAILS only",
  "Extra customer booking fields may be included",
  "Extra booking fields may be included",
  "Extra driver fields may be included",
  "Email may auto-send live location",
  "Email may send native live location",
  "Email may send streaming live location",
  "Automatic fallback may be used",
  "Automatic multi-channel blast may be used",
  "provider send is approved without gate approval",
  "pricing may be included",
  "payout may be included",
  "payout preferences may be included",
  "driver_payout_rules may be included",
  "customer_rates may be included",
  "payment/PDF/billing may be included",
  "internal/admin notes may be included",
  "parser/debug fields may be included",
  "secrets/tokens may be included",
  "raw provider payloads may be included",
  "Save Booking internals may be included",
  "/api/admin-saved-bookings internals may be included",
  "live location is implemented by this lock",
  "POB plus 5 minute auto-stop is active now",
  "Telegram auto-send is active now",
  "WhatsApp is active now",
  "SMS is approved now",
]) {
  assertExcludes(payloadSection, forbidden, "forbidden customer payload safety phrase");
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "Preactivation suite customer booking driver-details payload safety registration",
);

console.log("Customer booking driver details message payload safety guard passed");
