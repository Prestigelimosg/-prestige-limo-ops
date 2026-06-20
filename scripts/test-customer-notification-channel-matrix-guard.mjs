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
  "Telegram may be used for live location and driver details only after the specific channel/action gate is separately approved.",
  "WhatsApp may be used for live location and driver details only after the specific channel/action gate is separately approved.",
  "Email may be used for driver details only and must not be used for live location.",
  "SMS is not approved for driver details or live location unless separately approved later.",
  "Admin must explicitly choose exactly one channel/action for each future send.",
  "No automatic fallback is approved.",
  "No automatic multi-channel blast is approved.",
  "No provider send is approved unless that specific channel/action gate is separately approved.",
  "Future admin choices remain separated: Send driver details by Email; Send driver details by Telegram; Send driver details by WhatsApp; Send live location by Telegram; Send live location by WhatsApp.",
  "Customer-facing provider messages must exclude driver payout details, payout preferences, `driver_payout_rules`, `customer_rates`, pricing breakdown unless separately approved, payment/PDF/billing unless separately approved, internal/admin notes, parser/debug fields, secrets/tokens, raw provider payloads, auth/location/photo/calendar/OTS data unless the selected lane explicitly allows it, Save Booking internals, and `/api/admin-saved-bookings` internals.",
  "Driver details messages must stay separate from payout, pricing, payment, internal/admin notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, and `/api/admin-saved-bookings` internals.",
  "Live location remains separated from Email and SMS; live location may only use Telegram or WhatsApp after separate owner approval for that channel/action gate.",
]) {
  assertIncludes(matrixSection, phrase, `customer notification matrix phrase: ${phrase}`);
}

for (const forbidden of [
  "Send live location by Email",
  "Send live location by SMS",
  "Email may be used for live location",
  "SMS may be used for live location",
  "Automatic fallback may be used",
  "Automatic multi-channel blast may be used",
  "provider send is approved without gate approval",
  "driver payout details may be included",
  "driver_payout_rules may be included",
  "customer_rates may be included",
  "pricing breakdown may be included",
  "payment/PDF/billing may be included",
  "internal/admin notes may be included",
  "parser/debug fields may be included",
  "secrets/tokens may be included",
  "raw provider payloads may be included",
]) {
  assertExcludes(matrixSection, forbidden, "forbidden customer notification matrix phrase");
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "Preactivation suite customer notification channel matrix registration",
);

console.log("Customer notification channel matrix guard passed");
