import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customer-notification-channel-matrix-guard.mjs";

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

const matrixSection = sectionBetween(
  ledger,
  "### Customer Notification Channel Matrix Lock",
);

for (const phrase of [
  "This is a docs/test-only guard for future customer notification channel selection; it does not activate provider sends, credentials, env changes, DB reads/writes, deployment, UI, API, route, helper, scheduler, fallback, or blast behavior.",
  "Telegram may be used for true live location and driver details only after the specific channel/action gate is separately approved.",
  "Telegram is the first future live-location channel and the only future channel allowed to auto-send true live location after separate owner approval.",
  "Future Telegram auto-send and POB plus 5 minute auto-stop are requirements for a later lane only; this lock does not implement or activate them.",
  "Email may be used for driver details only after the specific channel/action gate is separately approved.",
  "Email may send an admin-selected secure tracking-link live-location email only after the exact channel/action gate is separately approved.",
  "Email must not auto-send live location and must not send native/streaming live location.",
  "WhatsApp is later-phase only for driver details and live location and must remain unactivated.",
  "SMS is not approved for driver details or live location unless separately approved later.",
  "Admin must explicitly choose exactly one channel/action for each future send, except for the future separately approved Telegram auto-send lane.",
  "No automatic fallback is approved.",
  "No automatic multi-channel blast is approved.",
  "No provider send is approved unless that specific channel/action gate is separately approved.",
  "Future admin choices remain separated: Send driver details by Email; Send driver details by Telegram; Send driver details by WhatsApp; Send true live location by Telegram; Send secure tracking-link live location by Email; later-phase Send live location by WhatsApp.",
  "Telegram live location means future true live-location send, Email live location means future admin-selected secure tracking link only, and WhatsApp live location means future later phase only.",
  "Allowed driver-detail payload fields are driver name, driver contact, car plate, and car type.",
  "Customer-facing provider messages must exclude pricing, payout, payout preferences, `driver_payout_rules`, `customer_rates`, payment/PDF/billing, internal/admin notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, and auth/location/photo/calendar/OTS data outside the selected approved lane.",
  "Driver details messages must stay separate from payout, payout preferences, `driver_payout_rules`, `customer_rates`, pricing, payment/PDF/billing, internal/admin notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, and `/api/admin-saved-bookings` internals.",
]) {
  assertIncludes(matrixSection, phrase, `customer notification matrix phrase: ${phrase}`);
}

for (const forbidden of [
  "Send live location by SMS",
  "SMS may be used for live location",
  "Email may auto-send live location",
  "Email may send native live location",
  "Email may send streaming live location",
  "WhatsApp is active for live location",
  "WhatsApp is the first future live-location channel",
  "Telegram auto-send is active now",
  "POB plus 5 minute auto-stop is active now",
  "POB+5min auto-stop is active now",
  "SMS is approved for driver details",
  "SMS is approved for live location",
  "Automatic fallback may be used",
  "Automatic multi-channel blast may be used",
  "provider send is approved without gate approval",
  "driver payout details may be included",
  "payout preferences may be included",
  "driver_payout_rules may be included",
  "customer_rates may be included",
  "pricing may be included",
  "payment/PDF/billing may be included",
  "internal/admin notes may be included",
  "parser/debug fields may be included",
  "secrets/tokens may be included",
  "raw provider payloads may be included",
  "Save Booking internals may be included",
  "/api/admin-saved-bookings internals may be included",
  "Email may be used for driver details only and must not be used for live location",
  "Live location remains separated from Email and SMS",
]) {
  assertExcludes(matrixSection, forbidden, "forbidden customer notification matrix phrase");
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "Preactivation suite customer notification channel matrix registration",
);

console.log("Customer notification channel matrix guard passed");
