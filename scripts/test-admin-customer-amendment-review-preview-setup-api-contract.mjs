import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-customer-amendment-review-preview-setup/route.ts";
const helperPath = "lib/customer-amendment-review-handoff-setup-foundation.ts";
const sourceFiles = [
  routePath,
  "lib/admin-dispatcher-auth-boundary.ts",
  helperPath,
];
const unsafeOutputPattern =
  /driver_payout|paynow|pay_now|internal_admin|internal finance|admin_finance|parser|debug|mock_qa|dev_archive|customer_price|billing|invoice|payment|payout|pricing|secret|service_role|smtp|stripe|token/i;
const originalEnv = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function applyLocalAdminBoundary() {
  delete process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN;
}

function adminHeaders() {
  return {
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
  };
}

function apiUrl(params = {}) {
  const url = new URL("http://localhost/api/admin-customer-amendment-review-preview-setup");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertDisabledReview(value, label) {
  assert.equal(value.adminReviewRequired, true, `${label} must require admin review.`);
  assert.equal(value.bookingUpdateEnabled, false, `${label} must keep bookingUpdateEnabled false.`);
  assert.equal(value.booking_update_enabled, false, `${label} must keep booking_update_enabled false.`);
  assert.equal(value.calendarUpdateEnabled, false, `${label} must keep calendarUpdateEnabled false.`);
  assert.equal(value.calendar_update_enabled, false, `${label} must keep calendar_update_enabled false.`);
  if ("crmBookingUpdateEnabled" in value) {
    assert.equal(value.crmBookingUpdateEnabled, false, `${label} must keep crmBookingUpdateEnabled false.`);
  }
  if ("crm_booking_update_enabled" in value) {
    assert.equal(value.crm_booking_update_enabled, false, `${label} must keep crm_booking_update_enabled false.`);
  }
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);
  assert.equal(value.liveWriteEnabled, false, `${label} must keep liveWriteEnabled false.`);
  assert.equal(value.live_write_enabled, false, `${label} must keep live_write_enabled false.`);
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not leak finance, provider, token, parser, or internal details.`,
  );
}

function transpileTypescript(tsSource, filename) {
  return ts.transpileModule(tsSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

async function writeHarnessFile(tempDir, relativePath) {
  const source = await readFile(relativePath, "utf8");
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, relativePath));
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-amendment-review-api-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of sourceFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: createRequire(import.meta.url)(path.join(tempDir, routePath.replace(/\.ts$/, ".js"))),
  };
}

const routeSource = await readFile(routePath, "utf8");
const helperSource = await readFile(helperPath, "utf8");
const routeAndHelperSource = `${routeSource}\n${helperSource}`;

for (const fragment of [
  "buildCustomerAmendmentReviewHandoffSetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "adminReviewRequired",
  "jobCardDraftReady",
  "calendarActionPreview",
  "bookingUpdateEnabled",
  "calendarUpdateEnabled",
  "crmBookingUpdateEnabled",
  "liveWriteEnabled",
  "requestedFields",
  "originalBookingRef",
]) {
  assert.ok(routeAndHelperSource.includes(fragment), `Missing customer amendment preview API fragment: ${fragment}`);
}

for (const fragment of [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "sendBeacon",
  "createClient",
  "supabase",
  "insert(",
  "upsert(",
  "update(",
  "delete(",
  "calendar.events",
  "googleapis",
  "ical-generator",
  "sendMail",
  "nodemailer",
  "sendgrid",
  "mailgun",
  "postmark",
  "resend",
  "twilio",
  "stripe",
  "process.env",
]) {
  assert.ok(!routeSource.toLowerCase().includes(fragment.toLowerCase()), `Forbidden route fragment: ${fragment}`);
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const anonymousResponse = await harness.route.GET(new Request(apiUrl()));
  const anonymous = await anonymousResponse.json();

  assert.equal(anonymousResponse.status, 403, "Customer amendment preview API must stay admin-gated.");
  assert.equal(anonymous.ok, false);
  assert.equal(anonymous.status, "blocked");
  assertDisabledReview(anonymous, "Anonymous blocked response");
  assertDisabledReview(anonymous.preview, "Anonymous blocked preview");
  assertDisabledReview(anonymous.handoff, "Anonymous blocked handoff");
  assert.equal(anonymous.calendarActionPreview, "none");
  assert.equal(anonymous.jobCardDraftReady, false);
  assert.equal(anonymous.preview.calendarActionPreview, "none");
  assert.equal(anonymous.preview.jobCardDraftReady, false);

  const dateChangeResponse = await harness.route.GET(
    new Request(
      apiUrl({
        change_type: "date change",
        original_booking_ref: "PLO-AMD-API-001",
        requested_date: "2026-07-18",
      }),
      { headers: adminHeaders() },
    ),
  );
  const dateChange = await dateChangeResponse.json();

  assert.equal(dateChangeResponse.status, 200);
  assert.equal(dateChange.ok, true);
  assert.equal(dateChange.status, "setup_only");
  assert.equal(dateChange.originalBookingRef, "PLO-AMD-API-001");
  assert.equal(dateChange.original_booking_ref, "PLO-AMD-API-001");
  assert.equal(dateChange.changeType, "date_change");
  assert.equal(dateChange.change_type, "date_change");
  assert.equal(dateChange.requestedFields.date, "2026-07-18");
  assert.equal(dateChange.requested_fields.date, "2026-07-18");
  assert.equal(dateChange.jobCardDraftReady, true);
  assert.equal(dateChange.job_card_draft_ready, true);
  assert.equal(dateChange.calendarActionPreview, "update");
  assert.equal(dateChange.calendar_action_preview, "update");
  assert.deepEqual(dateChange.handoff.missing_requirements, []);
  assert.deepEqual(dateChange.preview.missing_requirements, []);
  assertDisabledReview(dateChange, "Date change response");
  assertDisabledReview(dateChange.preview, "Date change preview");
  assertDisabledReview(dateChange.handoff, "Date change handoff");
  assertNoUnsafeOutput(dateChange, "Date change response");

  const timeChangeResponse = await harness.route.GET(
    new Request(
      apiUrl({
        booking_reference: "PLO-AMD-API-002",
        changeType: "time_change",
        time: "14:30",
      }),
      { headers: adminHeaders() },
    ),
  );
  const timeChange = await timeChangeResponse.json();

  assert.equal(timeChangeResponse.status, 200);
  assert.equal(timeChange.changeType, "time_change");
  assert.equal(timeChange.requestedFields.time, "14:30");
  assert.equal(timeChange.calendarActionPreview, "update");
  assert.equal(timeChange.jobCardDraftReady, true);
  assert.deepEqual(timeChange.handoff.missing_requirements, []);
  assertDisabledReview(timeChange, "Time change response");
  assertDisabledReview(timeChange.preview, "Time change preview");
  assertNoUnsafeOutput(timeChange, "Time change response");

  const locationChangeResponse = await harness.route.GET(
    new Request(
      apiUrl({
        booking_ref: "PLO-AMD-API-003",
        change_type: "pickup/drop-off/location change",
        dropoffAddress: "Raffles Hotel Singapore",
        pickupAddress: "Changi Airport Terminal 3",
      }),
      { headers: adminHeaders() },
    ),
  );
  const locationChange = await locationChangeResponse.json();

  assert.equal(locationChangeResponse.status, 200);
  assert.equal(locationChange.changeType, "location_change");
  assert.equal(locationChange.requestedFields.pickup_address, "Changi Airport Terminal 3");
  assert.equal(locationChange.requestedFields.dropoff_address, "Raffles Hotel Singapore");
  assert.equal(locationChange.calendarActionPreview, "update");
  assert.equal(locationChange.jobCardDraftReady, true);
  assert.deepEqual(locationChange.handoff.missing_requirements, []);
  assertDisabledReview(locationChange, "Location change response");
  assertDisabledReview(locationChange.preview, "Location change preview");
  assertNoUnsafeOutput(locationChange, "Location change response");

  const cancellationResponse = await harness.route.GET(
    new Request(
      apiUrl({
        cancellation_reason: "Customer no longer needs the transfer",
        change_type: "cancellation request",
        originalBookingRef: "PLO-AMD-API-004",
      }),
      { headers: adminHeaders() },
    ),
  );
  const cancellation = await cancellationResponse.json();

  assert.equal(cancellationResponse.status, 200);
  assert.equal(cancellation.changeType, "cancellation_request");
  assert.equal(cancellation.requestedFields.cancellation_reason, "Customer no longer needs the transfer");
  assert.equal(cancellation.calendarActionPreview, "cancel");
  assert.equal(cancellation.jobCardDraftReady, true);
  assert.equal(cancellation.preview.job_card_draft_preview.action_label, "Review cancellation request");
  assert.deepEqual(cancellation.handoff.missing_requirements, []);
  assertDisabledReview(cancellation, "Cancellation response");
  assertDisabledReview(cancellation.preview, "Cancellation preview");
  assertNoUnsafeOutput(cancellation, "Cancellation response");

  const blockedResponse = await harness.route.GET(
    new Request(
      apiUrl({
        booking_reference: "payment-token",
        change_type: "route payment-token",
        pickup_address: "driver_payout pickup",
        reason: "internal_admin_note with PayNow payout",
      }),
      { headers: adminHeaders() },
    ),
  );
  const blocked = await blockedResponse.json();

  assert.equal(blockedResponse.status, 200);
  assert.equal(blocked.ok, true);
  assert.equal(blocked.changeType, "location_change");
  assert.equal(blocked.originalBookingRef, null);
  assert.equal(blocked.calendarActionPreview, "none");
  assert.equal(blocked.jobCardDraftReady, false);
  assert.deepEqual(blocked.handoff.missing_requirements, [
    "original_booking_ref",
    "requested_location",
  ]);
  assertDisabledReview(blocked, "Blocked response");
  assertDisabledReview(blocked.preview, "Blocked preview");
  assertDisabledReview(blocked.handoff, "Blocked handoff");
  assertNoUnsafeOutput(blocked, "Blocked response");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin customer amendment review preview setup API contract passed");
