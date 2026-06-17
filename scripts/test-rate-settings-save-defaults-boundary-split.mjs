import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const guardScript = "scripts/test-rate-settings-save-defaults-boundary-split.mjs";
const typedRuntimeRoute = "/api/admin-rate-settings-runtime-write-action";

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

const [appPage, ledger, preactivationSuite] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(ledger, "### Rate Settings Save Defaults Boundary Split Lock");

for (const phrase of [
  "Default rate save payload construction is split into `buildDefaultRateSettingsScalarPayload` and `buildDefaultRateSettingsLegacyRateMapsPayload`.",
  "The scalar helper contains only `id`, `midnight_surcharge`, `extra_stop_surcharge`, `midnight_payout`, `extra_stop_payout`, `child_seat_customer_surcharge`, and `child_seat_driver_payout`.",
  "The parked legacy maps helper contains `customer_rates` and `driver_payout_rules` only to preserve the current legacy `saveDefaultRates` behavior.",
  "`saveDefaultRates` calls `saveDefaultRateSettingsScalarRuntime` before the parked legacy save; the typed call sends only scalar fields and treats closed-gate no-op responses as non-blocking.",
  "`saveDefaultRates` still uses `.from(adminLegacyTables.rateSettings)` for the parked legacy `customer_rates` and `driver_payout_rules` maps.",
  "No env change, deployment, DB write execution, Save Booking + CRM change, `/api/admin-saved-bookings` change, parser change, UI sector/card, provider activation, live send, or new shim is included.",
]) {
  assertIncludes(ledgerSection, phrase, `Rate settings save defaults split ledger phrase: ${phrase}`);
}

const scalarPayloadType = sliceBetween(
  appPage,
  "type DefaultRateSettingsScalarRuntimePayload = {",
  "type DefaultRateSettingsLegacyRateMapsPayload = {",
);
for (const field of [
  "id: \"default\"",
  "midnight_surcharge",
  "extra_stop_surcharge",
  "midnight_payout",
  "extra_stop_payout",
  "child_seat_customer_surcharge",
  "child_seat_driver_payout",
]) {
  assertIncludes(scalarPayloadType, field, `Scalar payload type ${field}`);
}
assertExcludes(scalarPayloadType, "customer_rates", "Scalar payload type customer rates");
assertExcludes(scalarPayloadType, "driver_payout_rules", "Scalar payload type driver payout rules");

const scalarHelper = sliceBetween(
  appPage,
  "function buildDefaultRateSettingsScalarPayload",
  "function buildDefaultRateSettingsLegacyRateMapsPayload",
);
for (const fragment of [
  "settings.childSeatCustomerSurcharge",
  "settings.childSeatDriverPayout",
  "settings.extraStopPayout",
  "settings.extraStopSurcharge",
  "id: \"default\"",
  "settings.midnightPayout",
  "settings.midnightSurcharge",
]) {
  assertIncludes(scalarHelper, fragment, `Scalar helper ${fragment}`);
}
assertExcludes(scalarHelper, "customer_rates", "Scalar helper customer rates");
assertExcludes(scalarHelper, "driver_payout_rules", "Scalar helper driver payout rules");
assertExcludes(scalarHelper, "normalizeCustomerRateRules", "Scalar helper customer-rate normalizer");
assertExcludes(scalarHelper, "normalizeDriverPayoutRules", "Scalar helper driver-payout normalizer");

const legacyMapsHelper = sliceBetween(
  appPage,
  "function buildDefaultRateSettingsLegacyRateMapsPayload",
  "type CompanyCrmIdentityContactPayload",
);
for (const fragment of [
  "customer_rates",
  "driver_payout_rules",
  "...defaultCustomerRates",
  "...normalizeCustomerRateRules(settings.customerRates)",
  "...defaultDriverPayoutRules",
  "...normalizeDriverPayoutRules(settings.driverPayoutRules)",
]) {
  assertIncludes(legacyMapsHelper, fragment, `Parked maps helper ${fragment}`);
}

const scalarRuntimeHelper = sliceBetween(
  appPage,
  "async function saveDefaultRateSettingsScalarRuntime",
  "type CompanyCrmIdentityContactPayload",
);
for (const fragment of [
  "payload: DefaultRateSettingsScalarRuntimePayload",
  "fetch(adminRateSettingsRuntimeWriteActionApiPath",
  "body: JSON.stringify(payload)",
  '"x-prestige-admin-purpose": adminLegacyDataPurpose',
  'method: "POST"',
  "isRateSettingsRuntimeWriteBlockedNoOp(responseBody)",
]) {
  assertIncludes(scalarRuntimeHelper, fragment, `Scalar runtime helper ${fragment}`);
}
assertExcludes(scalarRuntimeHelper, "customer_rates", "Scalar runtime helper customer rates");
assertExcludes(scalarRuntimeHelper, "driver_payout_rules", "Scalar runtime helper driver payout rules");
assertExcludes(scalarRuntimeHelper, "normalizeCustomerRateRules", "Scalar runtime helper customer-rate normalizer");
assertExcludes(scalarRuntimeHelper, "normalizeDriverPayoutRules", "Scalar runtime helper driver-payout normalizer");

const saveDefaultRates = sliceBetween(
  appPage,
  "async function saveDefaultRates",
  "async function saveRateOverride",
);
for (const fragment of [
  "const scalarRateSettings = buildDefaultRateSettingsScalarPayload(rateSettings);",
  "const legacyRateMapFields = buildDefaultRateSettingsLegacyRateMapsPayload(rateSettings);",
  "const customerRates = legacyRateMapFields.customer_rates;",
  "const driverPayoutRules = legacyRateMapFields.driver_payout_rules;",
  "const scalarRuntimeSave = await saveDefaultRateSettingsScalarRuntime(scalarRateSettings);",
  ".from(adminLegacyTables.rateSettings)",
  "customer_rates: customerRates",
  "driver_payout_rules: driverPayoutRules",
  "midnight_surcharge: scalarRateSettings.midnight_surcharge",
  "extra_stop_surcharge: scalarRateSettings.extra_stop_surcharge",
  "midnight_payout: scalarRateSettings.midnight_payout",
  "extra_stop_payout: scalarRateSettings.extra_stop_payout",
  "child_seat_customer_surcharge: scalarRateSettings.child_seat_customer_surcharge",
  "child_seat_driver_payout: scalarRateSettings.child_seat_driver_payout",
]) {
  assertIncludes(saveDefaultRates, fragment, `saveDefaultRates split fragment: ${fragment}`);
}
assertIncludes(appPage, typedRuntimeRoute, "app/page.tsx typed runtime route path");
assertExcludes(saveDefaultRates, typedRuntimeRoute, "saveDefaultRates direct typed runtime route literal");
assertExcludes(appPage, `fetch(${typedRuntimeRoute}`, "app/page.tsx direct typed runtime fetch literal");

assertIncludes(preactivationSuite, guardScript, "Preactivation suite rate settings save defaults split guard");

console.log("rate settings save defaults boundary split guard passed");
