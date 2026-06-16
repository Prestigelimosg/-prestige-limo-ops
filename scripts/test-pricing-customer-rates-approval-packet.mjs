import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const pricingHelperPath = "lib/pricing.ts";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

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
  pricingHelper,
  aiParseRoute,
  adminSavedBookingsRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(pricingHelperPath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const packetSection = sectionBetween(ledger, "### Pricing Customer Rates Runtime Approval Packet Lock");

for (const phrase of [
  "Approval status: pending future runtime-wiring approval.",
  "This is a docs/test-only approval packet guarded by `scripts/test-pricing-customer-rates-approval-packet.mjs`.",
  "Customer rates/pricing runtime remains parked.",
  "Pricing is coupled to `rate_settings`, company/traveler overrides, booking price/payout snapshots, and billing/payment/PDF-adjacent paths.",
  "`driver_payout_rules` and payout remain separate and parked.",
  "Current `rate_settings` read path is typed, but pricing/customer_rates runtime wiring is not approved.",
  "Current company/traveler rate override save/remove remains parked and still touches `customer_rates` with `driver_payout_rules`.",
  "Future pricing lane may include only customer-facing pricing/customer_rates setup or contract fields after separate approval.",
  "Future pricing lane must exclude payout, `driver_payout_rules`, payment/PDF/billing activation, provider/send, auth, location/photo/calendar, internal notes, debug, and secrets unless separately approved.",
  "Future DB write requires separate owner approval, env verification, table/policy verification, and rollback/manual recovery verification before any write execution.",
  "Future runtime wiring must not change Save Booking + CRM.",
  "Future runtime wiring must not change `/api/admin-saved-bookings`.",
  "Future runtime wiring must not change parser behavior or `/api/ai-parse`.",
  "Future runtime wiring must not add UI sectors/buttons/cards.",
  "Future runtime wiring must not add new shims.",
  "Required tests before any future wiring:",
  "Rollback note:",
  "No runtime implementation, UI/API/helper behavior change, env change, deployment, DB write, migration, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, payment/PDF/payout/provider/auth/location/photo/calendar activation, UI sector/button/card, or new shim is approved by this packet.",
]) {
  assertIncludes(packetSection, phrase, `Pricing/customer_rates approval packet phrase: ${phrase}`);
}

for (const forbiddenApprovalPhrase of [
  "runtime implementation approved",
  "safe to wire now",
  "DB write approved",
  "live write approved",
  "driver_payout_rules approved",
  "payout approved",
  "payment approved",
  "PDF approved",
  "billing approved",
]) {
  assertExcludes(packetSection, forbiddenApprovalPhrase, `Forbidden approval phrase ${forbiddenApprovalPhrase}`);
}

const saveDefaultRates = sliceBetween(appPage, "async function saveDefaultRates", "async function saveRateOverride");
for (const fragment of [
  "adminLegacyDataClient",
  ".from(adminLegacyTables.rateSettings)",
  "customer_rates: customerRates",
  "driver_payout_rules: driverPayoutRules",
  "midnight_surcharge: rateSettings.midnightSurcharge",
  "extra_stop_surcharge: rateSettings.extraStopSurcharge",
  "midnight_payout: rateSettings.midnightPayout",
  "extra_stop_payout: rateSettings.extraStopPayout",
  "child_seat_customer_surcharge: rateSettings.childSeatCustomerSurcharge",
  "child_seat_driver_payout: rateSettings.childSeatDriverPayout",
]) {
  assertIncludes(saveDefaultRates, fragment, `Parked saveDefaultRates fragment: ${fragment}`);
}

const saveRateOverride = sliceBetween(
  appPage,
  "async function saveRateOverride",
  "async function removeCompanyRateOverride",
);
const removeCompanyRateOverride = sliceBetween(
  appPage,
  "async function removeCompanyRateOverride",
  "async function removeBossRateOverride",
);
const removeBossRateOverride = sliceBetween(
  appPage,
  "async function removeBossRateOverride",
  "async function loadDrivers",
);

for (const [label, source] of [
  ["Parked rate override save", saveRateOverride],
  ["Parked company rate override remove", removeCompanyRateOverride],
  ["Parked traveler rate override remove", removeBossRateOverride],
]) {
  assertIncludes(source, "adminLegacyDataClient", label);
  assertIncludes(source, "customer_rates", label);
  assertIncludes(source, "driver_payout_rules", label);
}

for (const fragment of [
  "export function resolvePricing",
  "customer_rates",
  "company.customer_rates",
  "driver_payout_rules",
  "driverRecord?.driver_payout_rules",
  "midnightSurcharge",
  "extraStopSurcharge",
  "childSeatCustomerSurcharge",
  "export function calculateProfit",
]) {
  assertIncludes(pricingHelper, fragment, `Pricing helper coupling fragment: ${fragment}`);
}

const saveBooking = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBooking, 'fetch("/api/admin-bookings"', "Save Booking + CRM safe endpoint");
assertExcludes(saveBooking, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

assertExcludes(aiParseRoute, "customer_rates", "Parser customer_rates separation");
assertExcludes(aiParseRoute, "driver_payout_rules", "Parser driver_payout_rules separation");
assertExcludes(aiParseRoute, "resolvePricing", "Parser pricing separation");

assertExcludes(
  adminSavedBookingsRoute,
  "scripts/test-pricing-customer-rates-approval-packet.mjs",
  "admin-saved-bookings pricing approval guard separation",
);

assertIncludes(
  preactivationSuite,
  "scripts/test-pricing-customer-rates-approval-packet.mjs",
  "Preactivation suite registration",
);

console.log("pricing/customer_rates runtime approval packet guard passed");
