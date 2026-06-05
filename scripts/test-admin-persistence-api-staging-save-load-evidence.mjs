import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const successEvidencePath = path.join(
  process.cwd(),
  "docs/admin-persistence-api-staging-save-load-success-evidence.md",
);
const docsIndexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");
const runnerPath = path.join(
  process.cwd(),
  "scripts/run-admin-booking-api-staging-save-load-verification.mjs",
);
const adminRoutePath = path.join(process.cwd(), "app/api/admin-bookings/route.ts");
const customerRoutePath = path.join(process.cwd(), "app/api/customer-booking-requests/route.ts");

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertMatches(text, pattern, message = `Missing required pattern: ${pattern}`) {
  assert.match(text, pattern, message);
}

function assertNotMatches(text, pattern, message = `Forbidden pattern present: ${pattern}`) {
  assert.doesNotMatch(text, pattern, message);
}

const successEvidence = existsSync(successEvidencePath)
  ? await readFile(successEvidencePath, "utf8")
  : "";
const docsIndex = await readFile(docsIndexPath, "utf8");
const runner = await readFile(runnerPath, "utf8");
const adminRoute = await readFile(adminRoutePath, "utf8");
const customerRoute = await readFile(customerRoutePath, "utf8");

for (const requiredText of [
  'const approvalValue = "stage-4a-394-william-approved";',
  "STAGING-API-VERIFY-4A394-",
  "prestige-stage4a394-controlled-api-route-live-write-attempted.marker",
  'stage: "4A-394"',
  "app/api/admin-bookings/route.ts",
  "adminRoute.POST",
  "adminRoute.GET",
  "customerRoute.POST",
  "rejected-before-api-adapter-use",
  "blocked-by-api-route-preflight-gates",
  "liveApiRouteVerificationAttemptCount: 1",
]) {
  assertIncludes(runner, requiredText);
}

for (const requiredText of [
  "requireAdminDispatcherBoundary",
  "resolveAdminDispatcherBoundary",
  "createAdminBooking",
  "listAdminBookings",
  "parseAdminBookingPersistencePayload",
]) {
  assertIncludes(adminRoute, requiredText);
}

assertIncludes(customerRoute, "customerBookingRequestPersistenceAdapterActor");
assertNotMatches(
  runner,
  /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}/,
);

if (successEvidence) {
  for (const requiredText of [
    "Stage 4A-394",
    "f3fd965 Record controlled staging persistence save load verification",
    "PRESTIGE_ADMIN_BOOKING_STAGING_WRITE_VERIFICATION_APPROVED=stage-4a-394-william-approved node scripts/run-admin-booking-api-staging-save-load-verification.mjs",
    "API route save result: `passed`.",
    "API route load result: `passed`.",
    "API route safe field verification result: `passed`.",
    "Kill-switch before result: `blocked-503`.",
    "Kill-switch after result: `blocked-503`.",
    "Admin/dispatcher gate result: `required`.",
    "Customer, public, driver, and anonymous paths result: `blocked-by-api-route-preflight-gates`.",
    "Unsafe field probe result: `rejected-before-api-adapter-use`.",
    "Live API-route verification attempt count: `1`.",
    "No Supabase CLI command was run.",
    "No migration was created.",
    "No raw SQL write was performed.",
    "No production write was performed.",
    "No staging row deletion was performed.",
    "No environment file was committed.",
    "No secret, token, URL, key prefix, service-role key, or environment value was printed or committed.",
    "Persistence still defaults OFF.",
    "The kill-switch remains `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`.",
    "Admin/dispatcher server-session gating remains required.",
    "Customer, public, driver, and anonymous paths remain blocked from admin persistence writes.",
    "Unsafe fields continue to be rejected before adapter use.",
  ]) {
    assertIncludes(successEvidence, requiredText);
  }

  assertMatches(successEvidence, /STAGING-API-VERIFY-4A394-\d{14}-[A-Z0-9]{2,}/);
  assertIncludes(docsIndex, "admin-persistence-api-staging-save-load-success-evidence.md");
  assertNotMatches(
    successEvidence,
    /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}/,
  );
}

console.log("Admin persistence API staging save-load evidence audit passed.");
