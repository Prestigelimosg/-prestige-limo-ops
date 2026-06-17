import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const forbiddenCrmPayloadPattern =
  /customer_rates|driver_payout_rules|\bpricing\b|\bpayout\b|rate_override|surcharge|pricing_source|payment|pdf|billing|provider|send|auth|location|photo|calendar|internal_admin_notes|admin_note|debug/i;

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

const [appPage, aiParseRoute, adminSavedBookingsRoute, ledger, preactivationSuite] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const companyCrmPayload = sliceBetween(
  appPage,
  "function buildCompanyCrmIdentityContactPayload",
  "function buildTravelerCrmIdentityContactPayload",
);
const travelerCrmPayload = sliceBetween(
  appPage,
  "function buildTravelerCrmIdentityContactPayload",
  "function crmRuntimeRecordId",
);
const companyRatePayload = sliceBetween(
  appPage,
  "function buildCompanyRateOverridePayload",
  "function buildTravelerRateOverridePayload",
);
const travelerRatePayload = sliceBetween(
  appPage,
  "function buildTravelerRateOverridePayload",
  "function buildLegacyCompanyRateOverrideInsertPayload",
);
const legacyCompanyRateOverrideInsertPayload = sliceBetween(
  appPage,
  "function buildLegacyCompanyRateOverrideInsertPayload",
  "function buildLegacyTravelerRateOverrideInsertPayload",
);
const legacyTravelerRateOverrideInsertPayload = sliceBetween(
  appPage,
  "function buildLegacyTravelerRateOverrideInsertPayload",
  "function statusClass",
);
const crmRuntimeClientHelper = sliceBetween(
  appPage,
  "async function saveCompanyTravelerCrmIdentityContactRuntime",
  "function customerRatesRuntimeRejectedFields",
);
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
const saveBooking = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
const ledgerSection = sectionBetween(ledger, "### CRM Identity/Rate Override Payload Split Lock");

for (const phrase of [
  "CRM identity/contact payload code is separated from rate override payload code at `d65aac1 Split CRM identity payload from rate override payload`.",
  "Stage 1 CRM identity/contact runtime route mapping calls the typed CRM runtime write action from the existing Company/Boss Overrides save path with identity/contact payloads only.",
  "Closed-gate/no-op CRM route responses preserve current legacy rate override behavior.",
  "Rate override save/remove remains parked.",
  "`customer_rates` is tracked separately by the customer_rates runtime gate and app wiring locks.",
  "`driver_payout_rules` remains parked.",
  "Save Booking + CRM is unchanged and remains on `POST /api/admin-bookings`.",
  "`/api/admin-saved-bookings` is unchanged and remains separate.",
  "Parser behavior and `/api/ai-parse` are unchanged.",
  "No new shims were added.",
  "The split is guarded by `scripts/test-crm-identity-rate-override-payload-split.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `CRM identity/rate override payload split ledger phrase: ${phrase}`);
}

for (const [label, source] of [
  ["Company CRM identity/contact payload", companyCrmPayload],
  ["Traveler CRM identity/contact payload", travelerCrmPayload],
]) {
  assertExcludes(source, forbiddenCrmPayloadPattern, label);
}

for (const [label, source] of [
  ["Company rate override payload", companyRatePayload],
  ["Traveler rate override payload", travelerRatePayload],
]) {
  assertIncludes(source, "customer_rates", label);
  assertIncludes(source, "driver_payout_rules", label);
  assertExcludes(source, "company_name", label);
  assertExcludes(source, "company_id", label);
  assertExcludes(source, "traveler_name", label);
}

assertIncludes(companyCrmPayload, "company_name", "Company CRM identity/contact payload");
assertIncludes(travelerCrmPayload, "company_id", "Traveler CRM identity/contact payload");
assertIncludes(travelerCrmPayload, "traveler_name", "Traveler CRM identity/contact payload");
assertIncludes(crmRuntimeClientHelper, "saveCompanyTravelerCrmIdentityContactRuntime", "CRM runtime client helper");
assertIncludes(
  crmRuntimeClientHelper,
  "adminCompanyTravelerCrmRuntimeWriteActionApiPath",
  "CRM runtime client helper",
);
assertIncludes(crmRuntimeClientHelper, "JSON.stringify(payload)", "CRM runtime client helper");
assertExcludes(crmRuntimeClientHelper, forbiddenCrmPayloadPattern, "CRM runtime client helper");

assertIncludes(
  legacyCompanyRateOverrideInsertPayload,
  "buildCompanyCrmIdentityContactPayload",
  "Legacy company rate override insert composition",
);
assertIncludes(
  legacyCompanyRateOverrideInsertPayload,
  "buildCompanyRateOverridePayload",
  "Legacy company rate override insert composition",
);
assertIncludes(
  legacyTravelerRateOverrideInsertPayload,
  "buildTravelerCrmIdentityContactPayload",
  "Legacy traveler rate override insert composition",
);
assertIncludes(
  legacyTravelerRateOverrideInsertPayload,
  "buildTravelerRateOverridePayload",
  "Legacy traveler rate override insert composition",
);

assertIncludes(saveRateOverride, "buildLegacyCompanyRateOverrideInsertPayload", "Parked legacy override save");
assertIncludes(saveRateOverride, "buildLegacyTravelerRateOverrideInsertPayload", "Parked legacy override save");
assertIncludes(saveRateOverride, "saveCompanyTravelerCrmIdentityContactRuntime", "CRM identity/contact runtime split");
assertIncludes(saveRateOverride, "buildCompanyCrmIdentityContactPayload", "CRM identity/contact runtime split");
assertIncludes(saveRateOverride, "buildTravelerCrmIdentityContactPayload", "CRM identity/contact runtime split");
assertIncludes(saveRateOverride, "buildCompanyRateOverridePayload", "Parked legacy override save");
assertIncludes(saveRateOverride, "buildTravelerRateOverridePayload", "Parked legacy override save");
assertIncludes(saveRateOverride, "adminLegacyDataClient", "Parked legacy override save");
assertIncludes(saveRateOverride, "adminLegacyTables.companies", "Parked legacy company write path");
assertIncludes(saveRateOverride, "adminLegacyTables.travelers", "Parked legacy traveler write path");

assertIncludes(removeCompanyRateOverride, "buildCompanyRateOverridePayload", "Parked company override remove");
assertIncludes(removeCompanyRateOverride, "adminLegacyDataClient", "Parked company override remove");
assertIncludes(removeCompanyRateOverride, "adminLegacyTables.companies", "Parked company override remove");

assertIncludes(removeBossRateOverride, "buildTravelerRateOverridePayload", "Parked boss/name override remove");
assertIncludes(removeBossRateOverride, "adminLegacyDataClient", "Parked boss/name override remove");
assertIncludes(removeBossRateOverride, "adminLegacyTables.travelers", "Parked boss/name override remove");

assertIncludes(saveBooking, 'fetch("/api/admin-bookings"', "Save Booking + CRM safe route");
assertExcludes(saveBooking, "/api/admin-saved-bookings", "Save Booking + CRM safe route");
assertExcludes(saveBooking, "buildCompanyCrmIdentityContactPayload", "Save Booking + CRM safe route");
assertExcludes(saveBooking, "buildCompanyRateOverridePayload", "Save Booking + CRM safe route");

assertIncludes(adminSavedBookingsRoute, "export async function GET", "Admin saved bookings route");
assertIncludes(adminSavedBookingsRoute, "export async function POST", "Admin saved bookings route");
assertIncludes(adminSavedBookingsRoute, "export async function DELETE", "Admin saved bookings route");
assertExcludes(adminSavedBookingsRoute, "buildCompanyCrmIdentityContactPayload", "Admin saved bookings route");
assertExcludes(adminSavedBookingsRoute, "buildTravelerCrmIdentityContactPayload", "Admin saved bookings route");
assertExcludes(adminSavedBookingsRoute, "buildCompanyRateOverridePayload", "Admin saved bookings route");
assertExcludes(adminSavedBookingsRoute, "buildTravelerRateOverridePayload", "Admin saved bookings route");

for (const helperName of [
  "buildCompanyCrmIdentityContactPayload",
  "buildTravelerCrmIdentityContactPayload",
  "buildCompanyRateOverridePayload",
  "buildTravelerRateOverridePayload",
  "buildLegacyCompanyRateOverrideInsertPayload",
  "buildLegacyTravelerRateOverrideInsertPayload",
]) {
  assertExcludes(aiParseRoute, helperName, "AI parse route");
}

assertIncludes(
  preactivationSuite,
  "scripts/test-crm-identity-rate-override-payload-split.mjs",
  "Preactivation suite CRM identity/rate override payload split entry",
);

console.log("CRM identity/rate override payload split guard passed");
