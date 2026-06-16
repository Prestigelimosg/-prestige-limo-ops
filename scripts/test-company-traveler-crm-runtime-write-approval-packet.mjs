import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const legacyRoutePath = "app/api/admin-legacy-data/rest/v1/[table]/route.ts";
const contractRoutePath = "app/api/admin-company-traveler-crm-identity-contact-write-contract-setup/route.ts";
const disabledActionRoutePath =
  "app/api/admin-company-traveler-crm-identity-contact-write-action-disabled-setup/route.ts";
const auditPayloadRoutePath =
  "app/api/admin-company-traveler-crm-identity-contact-write-action-audit-payload-setup/route.ts";
const contractHelperPath = "lib/admin-company-traveler-crm-identity-contact-write-contract-setup-foundation.ts";
const disabledActionHelperPath = "lib/admin-company-traveler-crm-identity-contact-write-action-disabled-setup.ts";
const auditPayloadHelperPath =
  "lib/admin-company-traveler-crm-identity-contact-write-action-audit-payload-setup.ts";

const setupRouteFragments = [
  "/api/admin-company-traveler-crm-identity-contact-write-contract-setup",
  "/api/admin-company-traveler-crm-identity-contact-write-action-disabled-setup",
  "/api/admin-company-traveler-crm-identity-contact-write-action-audit-payload-setup",
];

const helperExportFragments = [
  "buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup",
  "buildAdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetup",
  "buildAdminCompanyTravelerCrmIdentityContactWriteActionAuditPayloadSetup",
];

const liveWritePattern =
  /@supabase\/supabase-js|createClient|supabase|\.from\(|\.insert\(|\.upsert\(|\.update\(|\.delete\(|rpc\s*\(|fetch\s*\(|process\.env|SUPABASE_[A-Z_]*|SERVICE_ROLE_KEY|API_KEY|ACCESS_TOKEN|SECRET_KEY|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;

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
  legacyRoute,
  contractRoute,
  disabledActionRoute,
  auditPayloadRoute,
  contractHelper,
  disabledActionHelper,
  auditPayloadHelper,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(legacyRoutePath, "utf8"),
  readFile(contractRoutePath, "utf8"),
  readFile(disabledActionRoutePath, "utf8"),
  readFile(auditPayloadRoutePath, "utf8"),
  readFile(contractHelperPath, "utf8"),
  readFile(disabledActionHelperPath, "utf8"),
  readFile(auditPayloadHelperPath, "utf8"),
]);

const packetSection = sectionBetween(ledger, "### Company/Traveler CRM Runtime Write Approval Packet Lock");

for (const phrase of [
  "Approval status: pending future runtime-write approval.",
  "This is a docs/test-only approval packet guarded by `scripts/test-company-traveler-crm-runtime-write-approval-packet.mjs`.",
  "Current company/traveler runtime writes remain parked.",
  "Existing legacy write flow still mixes CRM identity/contact with rate overrides, `customer_rates`, and `driver_payout_rules`.",
  "Existing CRM identity/contact write contract, disabled action, and audit payload setup remains setup-only/no-write/no-op.",
  "Future runtime lane may include only CRM identity/contact fields.",
  "Future runtime lane must exclude rate overrides, `customer_rates`, `driver_payout_rules`, pricing, payout, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal notes, debug, and secrets.",
  "Future runtime wiring must not change Save Booking + CRM.",
  "Future runtime wiring must not change `/api/admin-saved-bookings`.",
  "Future runtime wiring must not change parser behavior or `/api/ai-parse`.",
  "Future runtime wiring must not add new shims.",
  "Runtime DB write requires separate owner approval, env verification, table/policy verification, and rollback/manual recovery verification before any write execution.",
  "Required tests before any future wiring:",
  "Rollback note:",
  "No runtime implementation, UI/API/helper behavior change, env change, deployment, DB write, migration, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, risky activation, UI sector/button/card, or new shim is approved by this packet.",
]) {
  assertIncludes(packetSection, phrase, `CRM runtime approval packet phrase: ${phrase}`);
}

for (const forbiddenApprovalPhrase of [
  "runtime implementation approved",
  "safe to wire now",
  "DB write approved",
  "live write approved",
  "rate override approved",
  "pricing approved",
  "payout approved",
]) {
  assertExcludes(packetSection, forbiddenApprovalPhrase, `Forbidden approval phrase ${forbiddenApprovalPhrase}`);
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
  ["Parked company override remove", removeCompanyRateOverride],
  ["Parked traveler override remove", removeBossRateOverride],
]) {
  assertIncludes(source, "adminLegacyDataClient", label);
  assertIncludes(source, "customer_rates", label);
  assertIncludes(source, "driver_payout_rules", label);

  for (const setupRouteFragment of setupRouteFragments) {
    assertExcludes(source, setupRouteFragment, `${label} setup route wiring`);
  }
}

for (const fragment of [
  "buildCompanyCrmIdentityContactPayload",
  "buildTravelerCrmIdentityContactPayload",
  "buildCompanyRateOverridePayload",
  "buildTravelerRateOverridePayload",
  "buildLegacyCompanyRateOverrideInsertPayload",
  "buildLegacyTravelerRateOverrideInsertPayload",
]) {
  assertIncludes(appPage, fragment, `CRM/rate payload split helper ${fragment}`);
}

const legacyCompanyInsert = sliceBetween(
  appPage,
  "function buildLegacyCompanyRateOverrideInsertPayload",
  "function buildLegacyTravelerRateOverrideInsertPayload",
);
const legacyTravelerInsert = sliceBetween(
  appPage,
  "function buildLegacyTravelerRateOverrideInsertPayload",
  "function statusClass",
);

for (const [label, source] of [
  ["Legacy company insert", legacyCompanyInsert],
  ["Legacy traveler insert", legacyTravelerInsert],
]) {
  assertIncludes(source, "CrmIdentityContactPayload", label);
  assertIncludes(source, "RateOverridePayload", label);
}

const saveBooking = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBooking, 'fetch("/api/admin-bookings"', "Save Booking + CRM safe endpoint");
assertExcludes(saveBooking, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

for (const setupRouteFragment of setupRouteFragments) {
  assertExcludes(appPage, setupRouteFragment, `app/page.tsx setup route wiring ${setupRouteFragment}`);
  assertExcludes(aiParseRoute, setupRouteFragment, `parser setup route wiring ${setupRouteFragment}`);
  assertExcludes(adminSavedBookingsRoute, setupRouteFragment, `admin-saved-bookings setup route wiring ${setupRouteFragment}`);
}

for (const helperExportFragment of helperExportFragments) {
  assertExcludes(appPage, helperExportFragment, `app/page.tsx setup helper wiring ${helperExportFragment}`);
  assertExcludes(aiParseRoute, helperExportFragment, `parser setup helper wiring ${helperExportFragment}`);
  assertExcludes(
    adminSavedBookingsRoute,
    helperExportFragment,
    `admin-saved-bookings setup helper wiring ${helperExportFragment}`,
  );
}

for (const [label, routeSource] of [
  ["CRM identity/contact contract setup route", contractRoute],
  ["CRM identity/contact disabled action route", disabledActionRoute],
  ["CRM identity/contact audit payload setup route", auditPayloadRoute],
]) {
  assertIncludes(routeSource, "export async function GET", label);
  assertIncludes(routeSource, "resolveAdminDispatcherBoundary", label);
  assertExcludes(routeSource, "export async function POST", label);
  assertExcludes(routeSource, "export async function PATCH", label);
  assertExcludes(routeSource, "export async function DELETE", label);
  assertExcludes(routeSource, liveWritePattern, label);
}

for (const [label, helperSource] of [
  ["CRM identity/contact contract helper", contractHelper],
  ["CRM identity/contact disabled action helper", disabledActionHelper],
  ["CRM identity/contact audit payload helper", auditPayloadHelper],
]) {
  assertIncludes(helperSource, "server-only", label);
  assertIncludes(helperSource, "writeEnabled: false", label);
  assertIncludes(helperSource, "liveWriteEnabled: false", label);
  assertExcludes(helperSource, liveWritePattern, label);
}

for (const forbiddenFragment of [
  "customer_rates",
  "driver_payout_rules",
  "pricing",
  "payout",
  "rate_override",
  "payment",
  "billing",
  "pdf",
  "provider",
  "auth",
  "location",
  "photo",
  "calendar",
  "internal",
  "debug",
  "secret",
]) {
  assertIncludes(contractHelper, forbiddenFragment, `CRM contract forbidden fragment ${forbiddenFragment}`);
}

for (const fragment of [
  "companies: new Set",
  "travelers: new Set",
  '"customer_rates"',
  '"driver_payout_rules"',
]) {
  assertIncludes(legacyRoute, fragment, `Legacy parked company/traveler fragment ${fragment}`);
}

console.log("company/traveler CRM runtime write approval packet guard passed");
