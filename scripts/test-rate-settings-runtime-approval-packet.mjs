import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const rateSetupRoutePath = "app/api/admin-rate-setup/route.ts";
const rateSetupReadHelperPath = "lib/admin-rate-setup-read.ts";
const disabledActionRoutePath = "app/api/admin-rate-settings-write-action-disabled-setup/route.ts";
const disabledActionHelperPath = "lib/admin-rate-settings-write-action-disabled-setup.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const disabledSetupRouteFragment = "/api/admin-rate-settings-write-action-disabled-setup";
const liveWritePattern =
  /@supabase\/supabase-js|createClient|\.from\(|\.insert\(|\.upsert\(|\.update\(|\.delete\(|rpc\s*\(|process\.env|SUPABASE_[A-Z_]*|SERVICE_ROLE_KEY|API_KEY|ACCESS_TOKEN|SECRET_KEY|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;

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
  adminSavedBookingsRoute,
  rateSetupRoute,
  rateSetupReadHelper,
  disabledActionRoute,
  disabledActionHelper,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(rateSetupRoutePath, "utf8"),
  readFile(rateSetupReadHelperPath, "utf8"),
  readFile(disabledActionRoutePath, "utf8"),
  readFile(disabledActionHelperPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const packetSection = sectionBetween(ledger, "### Rate Settings Runtime Approval Packet Lock");

for (const phrase of [
  "Approval status: Stage 1 scalar runtime wiring is active behind the closed typed write gate; full `rate_settings` save/upsert migration remains pending future approval.",
  "This is a docs/test-only approval packet guarded by `scripts/test-rate-settings-runtime-approval-packet.mjs`.",
  "`rate_settings` read path is typed through `GET /api/admin-rate-setup`.",
  "`rate_settings` safe scalar write path is called through `POST /api/admin-rate-settings-runtime-write-action`.",
  "`saveDefaultRates` still uses the legacy `rate_settings` shim path for parked `customer_rates` and `driver_payout_rules` map fields.",
  "Disabled `rate_settings` write action setup exists at `GET /api/admin-rate-settings-write-action-disabled-setup` and remains no-write/no-op.",
  "Current scalar runtime lane excludes `customer_rates`, `driver_payout_rules`, pricing, payout snapshots, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal notes, debug, and secrets unless separately approved.",
  "Future DB write requires separate owner approval, env verification, table/policy verification, and rollback/manual recovery verification before any write execution.",
  "Current and future runtime wiring must not change Save Booking + CRM.",
  "Current and future runtime wiring must not change `/api/admin-saved-bookings`.",
  "Current and future runtime wiring must not change parser behavior or `/api/ai-parse`.",
  "Current and future runtime wiring must not add UI sectors/buttons/cards.",
  "Current and future runtime wiring must not add new shims.",
  "Required tests before any future wiring:",
  "Rollback note:",
  "No UI/API/helper behavior change outside the scalar rate settings boundary, env change, deployment, DB write execution, migration, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, risky activation, UI sector/button/card, or new shim is approved by this packet.",
]) {
  assertIncludes(packetSection, phrase, `Rate settings runtime approval packet phrase: ${phrase}`);
}

for (const forbiddenApprovalPhrase of [
  "runtime implementation approved",
  "safe to wire now",
  "DB write approved",
  "live write approved",
  "customer_rates approved",
  "driver_payout_rules approved",
  "pricing approved",
  "payout approved",
]) {
  assertExcludes(packetSection, forbiddenApprovalPhrase, `Forbidden approval phrase ${forbiddenApprovalPhrase}`);
}

const saveDefaultRates = sliceBetween(appPage, "async function saveDefaultRates", "async function saveRateOverride");

for (const fragment of [
  "adminLegacyDataClient",
  ".from(adminLegacyTables.rateSettings)",
  "const scalarRateSettings = buildDefaultRateSettingsScalarPayload(rateSettings);",
  "const scalarRuntimeSave = await saveDefaultRateSettingsScalarRuntime(scalarRateSettings);",
  "const legacyRateMapFields = buildDefaultRateSettingsLegacyRateMapsPayload(rateSettings);",
  "customer_rates: customerRates",
  "driver_payout_rules: driverPayoutRules",
  "midnight_surcharge: scalarRateSettings.midnight_surcharge",
  "extra_stop_surcharge: scalarRateSettings.extra_stop_surcharge",
  "midnight_payout: scalarRateSettings.midnight_payout",
  "extra_stop_payout: scalarRateSettings.extra_stop_payout",
  "child_seat_customer_surcharge: scalarRateSettings.child_seat_customer_surcharge",
  "child_seat_driver_payout: scalarRateSettings.child_seat_driver_payout",
]) {
  assertIncludes(saveDefaultRates, fragment, `Parked saveDefaultRates fragment: ${fragment}`);
}

assertExcludes(saveDefaultRates, disabledSetupRouteFragment, "saveDefaultRates disabled setup route wiring");

const saveBooking = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBooking, 'fetch("/api/admin-bookings"', "Save Booking + CRM safe endpoint");
assertExcludes(saveBooking, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

for (const [label, source] of [
  ["app/page.tsx", appPage],
  ["parser route", aiParseRoute],
  ["admin-saved-bookings route", adminSavedBookingsRoute],
]) {
  assertExcludes(source, disabledSetupRouteFragment, `${label} disabled rate settings setup route wiring`);
  assertExcludes(
    source,
    "buildAdminRateSettingsWriteActionDisabledSetup",
    `${label} disabled rate settings setup helper wiring`,
  );
}

assertIncludes(rateSetupRoute, "export async function GET", "Typed rate setup read route");
assertIncludes(rateSetupRoute, "loadAdminRateSetup", "Typed rate setup read route helper");
assertIncludes(rateSetupReadHelper, '.from("rate_settings")', "Typed rate setup read helper table");
assertIncludes(rateSetupReadHelper, "rateSettingsSelect", "Typed rate setup read helper select contract");

assertIncludes(disabledActionRoute, "export async function GET", "Disabled rate settings setup route");
assertExcludes(disabledActionRoute, "export async function POST", "Disabled rate settings setup route");
assertExcludes(disabledActionRoute, "export async function PATCH", "Disabled rate settings setup route");
assertExcludes(disabledActionRoute, "export async function DELETE", "Disabled rate settings setup route");
assertExcludes(disabledActionRoute, liveWritePattern, "Disabled rate settings setup route live write path");
assertExcludes(disabledActionHelper, liveWritePattern, "Disabled rate settings setup helper live write path");

for (const fragment of [
  "writeEnabled: false",
  "liveWriteEnabled: false",
  "no_op: true",
  "customer_rates",
  "driver_payout_rules",
  "pricing",
  "payout_snapshot",
  "payment",
  "billing",
  "provider",
  "auth",
  "location",
  "photo",
  "calendar",
  "debug",
]) {
  assertIncludes(disabledActionHelper, fragment, `Disabled rate settings helper fragment: ${fragment}`);
}

assertIncludes(
  preactivationSuite,
  "scripts/test-rate-settings-runtime-approval-packet.mjs",
  "Preactivation suite registration",
);

console.log("Rate settings runtime approval packet guard passed.");
