import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const routePath =
  "app/api/admin-company-traveler-crm-identity-contact-write-contract-setup/route.ts";
const helperPath =
  "lib/admin-company-traveler-crm-identity-contact-write-contract-setup-foundation.ts";
const appPagePath = "app/page.tsx";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const legacyRoutePath = "app/api/admin-legacy-data/rest/v1/[table]/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const setupApiPath = "/api/admin-company-traveler-crm-identity-contact-write-contract-setup";
const setupApiName = "admin-company-traveler-crm-identity-contact-write-contract-setup";
const helperExportName = "buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup";
const forbiddenRouteVerbPattern = /export async function (POST|PUT|PATCH|DELETE)/;
const directWriteOrLivePattern =
  /@supabase\/supabase-js|createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|fetch\s*\(|sendMail\s*\(|sendMessage\s*\(|sendSms\s*\(|messages\.create|paymentIntent|checkout\.sessions|calendar\.events|storage\.from/i;
const shimPattern = /adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;

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
  route,
  helper,
  appPage,
  adminSavedBookingsRoute,
  aiParseRoute,
  legacyRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(legacyRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const lockSection = sectionBetween(
  ledger,
  "### Company/Traveler CRM Identity/Contact Write Foundation Lock",
);

for (const phrase of [
  "This lock is guarded by `scripts/test-company-traveler-crm-write-foundation-lock.mjs`.",
  "Typed company/traveler CRM identity/contact write contract foundation is done at `25d0703 Add typed company traveler CRM write foundation`.",
  `Setup endpoint path: \`${setupApiPath}\`.`,
  "New setup endpoint: `app/api/admin-company-traveler-crm-identity-contact-write-contract-setup/route.ts`.",
  "New foundation helper: `lib/admin-company-traveler-crm-identity-contact-write-contract-setup-foundation.ts`.",
  "This is setup-only and GET-only.",
  "No UI wiring was added.",
  "No `app/page.tsx` save flow changed.",
  "Save Booking + CRM behavior was not changed.",
  "`/api/admin-saved-bookings` was not changed.",
  "No parser or `/api/ai-parse` changes were made.",
  "No DB/write/live activation happened.",
  "Forbidden fields remain rejected/excluded:",
  "`customer_rates`, `driver_payout_rules`, rate overrides, pricing, and payout remain parked.",
  "No new shims were added.",
  "company/traveler CRM write foundation lock guard",
]) {
  assertIncludes(lockSection, phrase, `CRM write foundation ledger phrase: ${phrase}`);
}

for (const forbiddenArea of [
  "rate",
  "pricing",
  "payout",
  "payment",
  "PDF",
  "billing",
  "provider/send",
  "auth",
  "location",
  "photo",
  "calendar",
  "internal",
  "debug",
]) {
  assertIncludes(lockSection, forbiddenArea, `CRM write foundation forbidden area: ${forbiddenArea}`);
}

assertIncludes(route, "export async function GET", "CRM write foundation setup endpoint");
assertExcludes(route, forbiddenRouteVerbPattern, "CRM write foundation setup endpoint");
assertIncludes(route, "resolveAdminDispatcherBoundary", "CRM write foundation setup endpoint");
assertIncludes(route, "adminBookingPersistencePurpose", "CRM write foundation setup endpoint");
assertIncludes(route, "actionEnabled: false", "CRM write foundation setup endpoint");
assertIncludes(route, "writeEnabled: false", "CRM write foundation setup endpoint");
assertIncludes(route, "liveWriteEnabled: false", "CRM write foundation setup endpoint");
assertIncludes(route, "external_send: false", "CRM write foundation setup endpoint");

assertIncludes(helper, "server-only", "CRM write foundation helper");
assertIncludes(helper, helperExportName, "CRM write foundation helper");
assertIncludes(
  helper,
  "company_traveler_crm_identity_contact_write_contract_setup_only",
  "CRM write foundation helper",
);
assertIncludes(helper, "actionEnabled: false", "CRM write foundation helper");
assertIncludes(helper, "writeEnabled: false", "CRM write foundation helper");
assertIncludes(helper, "liveWriteEnabled: false", "CRM write foundation helper");
assertIncludes(helper, "external_send: false", "CRM write foundation helper");

for (const [label, source] of [
  ["CRM write foundation setup endpoint", route],
  ["CRM write foundation helper", helper],
]) {
  assertExcludes(source, directWriteOrLivePattern, label);
  assertExcludes(source, shimPattern, label);
}

assertExcludes(
  helper,
  /process\.env|SUPABASE_[A-Z_]*|SERVICE_ROLE_KEY|API_KEY|ACCESS_TOKEN|SECRET_KEY/i,
  "CRM write foundation helper",
);

for (const forbiddenField of [
  "customer_rates",
  "driver_payout_rules",
  "pricing",
  "payout",
  "rate_override",
  "payment",
  "pdf",
  "billing",
  "provider",
  "send",
  "auth",
  "location",
  "photo",
  "calendar",
  "internal",
  "debug",
]) {
  assertIncludes(helper, forbiddenField, `CRM write foundation forbidden field policy ${forbiddenField}`);
}

assertExcludes(appPage, setupApiName, "App page must not wire CRM write foundation endpoint");
assertExcludes(appPage, helperExportName, "App page must not import CRM write foundation helper");

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");

assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM safe route");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM safe route");
assertExcludes(saveBookingBlock, setupApiName, "Save Booking + CRM must not use CRM write foundation endpoint");

assertIncludes(adminSavedBookingsRoute, "export async function GET", "Admin saved bookings route remains separate");
assertIncludes(adminSavedBookingsRoute, "export async function POST", "Admin saved bookings route remains separate");
assertExcludes(adminSavedBookingsRoute, setupApiName, "Admin saved bookings route");
assertExcludes(adminSavedBookingsRoute, helperExportName, "Admin saved bookings route");

assertExcludes(aiParseRoute, setupApiName, "AI parse route");
assertExcludes(aiParseRoute, helperExportName, "AI parse route");

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
  ["Parked traveler/name rate override remove", removeBossRateOverride],
]) {
  assertIncludes(source, "adminLegacyDataClient", label);
  assertIncludes(source, "customer_rates", label);
  assertIncludes(source, "driver_payout_rules", label);
}

assertIncludes(saveRateOverride, "adminLegacyTables.companies", "Parked company runtime write path");
assertIncludes(saveRateOverride, "adminLegacyTables.travelers", "Parked traveler runtime write path");
assertIncludes(removeCompanyRateOverride, "adminLegacyTables.companies", "Parked company rate remove");
assertIncludes(removeBossRateOverride, "adminLegacyTables.travelers", "Parked traveler rate remove");

for (const fragment of [
  "companies: new Set",
  "travelers: new Set",
  '"customer_rates"',
  '"driver_payout_rules"',
]) {
  assertIncludes(legacyRoute, fragment, `Legacy parked company/traveler fragment ${fragment}`);
}

assertIncludes(
  preactivationSuite,
  "scripts/test-company-traveler-crm-write-foundation-lock.mjs",
  "Preactivation suite CRM write foundation lock entry",
);

console.log("company/traveler CRM write foundation lock passed");
