import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
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

const [appPage, aiParseRoute, preactivationSuite] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
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
  "function buildCompanyRateOverridePayload",
);
const companyRatePayload = sliceBetween(
  appPage,
  "function buildCompanyRateOverridePayload",
  "function buildTravelerRateOverridePayload",
);
const travelerRatePayload = sliceBetween(
  appPage,
  "function buildTravelerRateOverridePayload",
  "function statusClass",
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
}

assertIncludes(companyCrmPayload, "company_name", "Company CRM identity/contact payload");
assertIncludes(travelerCrmPayload, "company_id", "Traveler CRM identity/contact payload");
assertIncludes(travelerCrmPayload, "traveler_name", "Traveler CRM identity/contact payload");

assertIncludes(saveRateOverride, "buildCompanyCrmIdentityContactPayload", "Parked legacy override save");
assertIncludes(saveRateOverride, "buildTravelerCrmIdentityContactPayload", "Parked legacy override save");
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

for (const helperName of [
  "buildCompanyCrmIdentityContactPayload",
  "buildTravelerCrmIdentityContactPayload",
  "buildCompanyRateOverridePayload",
  "buildTravelerRateOverridePayload",
]) {
  assertExcludes(aiParseRoute, helperName, "AI parse route");
}

assertIncludes(
  preactivationSuite,
  "scripts/test-crm-identity-rate-override-payload-split.mjs",
  "Preactivation suite CRM identity/rate override payload split entry",
);

console.log("CRM identity/rate override payload split guard passed");
