import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-customer-amendment-action-disabled-setup/route.ts";
const previewRoutePath = "app/api/admin-customer-amendment-review-preview-setup/route.ts";
const helperPath = "lib/customer-amendment-review-handoff-setup-foundation.ts";
const sourceFiles = [
  routePath,
  previewRoutePath,
  "lib/admin-dispatcher-auth-boundary.ts",
  helperPath,
];
const previewReadinessSetupApi = "admin-customer-amendment-review-preview-setup";
const safeOutputLeakPattern =
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
  const url = new URL("http://localhost/api/admin-customer-amendment-action-disabled-setup");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function previewApiUrl(params = {}) {
  const url = new URL("http://localhost/api/admin-customer-amendment-review-preview-setup");

  for (const [key, value] of Object.entries(params)) {
    if (key !== "action" && key !== "actionType" && key !== "action_type") {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

function assertDisabledActionFields(value, label) {
  assert.equal(value.adminReviewRequired, true, `${label} must require admin review.`);
  assert.equal(value.bookingUpdateEnabled, false, `${label} must keep bookingUpdateEnabled false.`);
  assert.equal(value.booking_update_enabled, false, `${label} must keep booking_update_enabled false.`);
  assert.equal(value.crmUpdateEnabled, false, `${label} must keep crmUpdateEnabled false.`);
  assert.equal(value.crm_update_enabled, false, `${label} must keep crm_update_enabled false.`);
  assert.equal(value.calendarUpdateEnabled, false, `${label} must keep calendarUpdateEnabled false.`);
  assert.equal(value.calendar_update_enabled, false, `${label} must keep calendar_update_enabled false.`);
  assert.equal(value.calendarCancelEnabled, false, `${label} must keep calendarCancelEnabled false.`);
  assert.equal(value.calendar_cancel_enabled, false, `${label} must keep calendar_cancel_enabled false.`);
  assert.equal(value.jobCardCreateEnabled, false, `${label} must keep jobCardCreateEnabled false.`);
  assert.equal(value.job_card_create_enabled, false, `${label} must keep job_card_create_enabled false.`);
  assert.equal(value.customerNotificationEnabled, false, `${label} must keep customerNotificationEnabled false.`);
  assert.equal(value.customer_notification_enabled, false, `${label} must keep customer_notification_enabled false.`);
  assert.equal(value.driverNotificationEnabled, false, `${label} must keep driverNotificationEnabled false.`);
  assert.equal(value.driver_notification_enabled, false, `${label} must keep driver_notification_enabled false.`);
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);
  assert.equal(value.liveWriteEnabled, false, `${label} must keep liveWriteEnabled false.`);
  assert.equal(value.live_write_enabled, false, `${label} must keep live_write_enabled false.`);
}

function assertNoOpResult(result, label, expectedActionType = null) {
  assertDisabledActionFields(result, label);
  assert.equal(result.actionType, expectedActionType, `${label} must expose normalized actionType.`);
  assert.equal(result.action_type, expectedActionType, `${label} must expose normalized action_type.`);
  assert.equal(result.delivery_surface, "customer_amendment_action_disabled_setup_only");
  assert.equal(result.no_op, true, `${label} must stay no-op.`);
  assert.equal(result.preview_readiness_source, previewReadinessSetupApi);
  assert.equal(result.reason, "setup_only_disabled", `${label} must keep setup-only disabled reason.`);
  assert.equal(result.result_label, "blocked/no-op", `${label} must keep blocked/no-op result label.`);
  assert.equal(result.status, "blocked", `${label} must stay blocked.`);
  assert.deepEqual(result.booking_update, {
    bookingUpdateEnabled: false,
    crmUpdateEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(result.calendar_update, {
    calendarCancelEnabled: false,
    calendarUpdateEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(result.customer_notification, {
    customerNotificationEnabled: false,
    external_send: false,
    status: "blocked",
  });
  assert.deepEqual(result.driver_notification, {
    driverNotificationEnabled: false,
    external_send: false,
    status: "blocked",
  });
  assert.deepEqual(result.job_card, {
    jobCardCreateEnabled: false,
    status: "blocked",
  });
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    safeOutputLeakPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose finance, provider, token, parser, internal, payment, payout, or mock archive data.`,
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-amendment-action-disabled-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of sourceFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    previewRoute: createRequire(import.meta.url)(
      path.join(tempDir, previewRoutePath.replace(/\.ts$/, ".js")),
    ),
    route: createRequire(import.meta.url)(path.join(tempDir, routePath.replace(/\.ts$/, ".js"))),
  };
}

const routeSource = await readFile(routePath, "utf8");
const previewRouteSource = await readFile(previewRoutePath, "utf8");
const helperSource = await readFile(helperPath, "utf8");
const routeAndHelperSource = `${routeSource}\n${previewRouteSource}\n${helperSource}`;

for (const fragment of [
  "buildCustomerAmendmentReviewHandoffSetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  previewReadinessSetupApi,
  "customer_amendment_action_disabled_setup_only",
  "adminReviewRequired: true",
  "bookingUpdateEnabled: false",
  "crmUpdateEnabled: false",
  "calendarUpdateEnabled: false",
  "calendarCancelEnabled: false",
  "jobCardCreateEnabled: false",
  "customerNotificationEnabled: false",
  "driverNotificationEnabled: false",
  "liveWriteEnabled: false",
  "no_op: true",
  "result_label: \"blocked/no-op\"",
  "status: \"blocked\"",
]) {
  assert.ok(routeAndHelperSource.includes(fragment), `Missing disabled customer amendment fragment: ${fragment}`);
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
  ".from(",
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
  "legacy_shim",
  "shim(",
]) {
  assert.ok(!routeSource.toLowerCase().includes(fragment.toLowerCase()), `Forbidden route fragment: ${fragment}`);
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const anonymousResponse = await harness.route.GET(new Request(apiUrl()));
  const anonymous = await anonymousResponse.json();

  assert.equal(anonymousResponse.status, 403, "Disabled customer amendment action API must stay admin-gated.");
  assert.equal(anonymous.ok, false);
  assert.equal(anonymous.status, "blocked");
  assertDisabledActionFields(anonymous, "Anonymous blocked response");
  assertDisabledActionFields(anonymous.preview, "Anonymous blocked preview");
  assertNoOpResult(anonymous.result, "Anonymous blocked result");
  assert.equal(anonymous.preview_readiness_source, previewReadinessSetupApi);
  assertNoUnsafeOutput(anonymous, "Anonymous blocked response");

  const dateParams = {
    action: "approve date amendment",
    change_type: "date change",
    original_booking_ref: "PLO-AMD-ACT-001",
    requested_date: "2026-07-18",
  };
  const dateResponse = await harness.route.GET(
    new Request(apiUrl(dateParams), { headers: adminHeaders() }),
  );
  const datePreviewResponse = await harness.previewRoute.GET(
    new Request(previewApiUrl(dateParams), { headers: adminHeaders() }),
  );
  const dateAction = await dateResponse.json();
  const datePreview = await datePreviewResponse.json();

  assert.equal(dateResponse.status, 200);
  assert.equal(dateAction.ok, true);
  assert.equal(dateAction.status, "blocked");
  assert.equal(dateAction.actionType, "approve_amendment");
  assert.equal(dateAction.action_type, "approve_amendment");
  assert.equal(dateAction.handoff.changeType, "date_change");
  assert.equal(dateAction.handoff.jobCardDraftReady, true);
  assert.equal(dateAction.handoff.calendarActionPreview, "update");
  assert.deepEqual(dateAction.preview.requestedFields, datePreview.preview.requestedFields);
  assert.deepEqual(dateAction.preview.requested_fields, datePreview.preview.requested_fields);
  assertDisabledActionFields(dateAction, "Date action response");
  assertDisabledActionFields(dateAction.preview, "Date action preview");
  assertNoOpResult(dateAction.result, "Date action result", "approve_amendment");
  assertNoUnsafeOutput(dateAction, "Date action response");

  const timeParams = {
    action_type: "approve time amendment",
    booking_reference: "PLO-AMD-ACT-002",
    changeType: "time_change",
    time: "14:30",
  };
  const timeResponse = await harness.route.GET(
    new Request(apiUrl(timeParams), { headers: adminHeaders() }),
  );
  const timeAction = await timeResponse.json();

  assert.equal(timeResponse.status, 200);
  assert.equal(timeAction.actionType, "approve_amendment");
  assert.equal(timeAction.handoff.changeType, "time_change");
  assert.equal(timeAction.handoff.requestedFields.time, "14:30");
  assert.equal(timeAction.handoff.calendarActionPreview, "update");
  assert.equal(timeAction.handoff.jobCardDraftReady, true);
  assertDisabledActionFields(timeAction, "Time action response");
  assertNoOpResult(timeAction.result, "Time action result", "approve_amendment");
  assertNoUnsafeOutput(timeAction, "Time action response");

  const locationParams = {
    action: "approve location amendment",
    booking_ref: "PLO-AMD-ACT-003",
    change_type: "pickup/drop-off/location change",
    dropoffAddress: "Raffles Hotel Singapore",
    pickupAddress: "Changi Airport Terminal 3",
  };
  const locationResponse = await harness.route.GET(
    new Request(apiUrl(locationParams), { headers: adminHeaders() }),
  );
  const locationAction = await locationResponse.json();

  assert.equal(locationResponse.status, 200);
  assert.equal(locationAction.actionType, "approve_amendment");
  assert.equal(locationAction.handoff.changeType, "location_change");
  assert.equal(locationAction.handoff.requestedFields.pickup_address, "Changi Airport Terminal 3");
  assert.equal(locationAction.handoff.requestedFields.dropoff_address, "Raffles Hotel Singapore");
  assert.equal(locationAction.handoff.calendarActionPreview, "update");
  assert.equal(locationAction.handoff.jobCardDraftReady, true);
  assertDisabledActionFields(locationAction, "Location action response");
  assertNoOpResult(locationAction.result, "Location action result", "approve_amendment");
  assertNoUnsafeOutput(locationAction, "Location action response");

  const cancellationParams = {
    action: "approve cancellation",
    cancellation_reason: "Customer no longer needs the transfer",
    change_type: "cancellation request",
    originalBookingRef: "PLO-AMD-ACT-004",
  };
  const cancellationResponse = await harness.route.GET(
    new Request(apiUrl(cancellationParams), { headers: adminHeaders() }),
  );
  const cancellationAction = await cancellationResponse.json();

  assert.equal(cancellationResponse.status, 200);
  assert.equal(cancellationAction.actionType, "approve_cancellation");
  assert.equal(cancellationAction.handoff.changeType, "cancellation_request");
  assert.equal(cancellationAction.handoff.calendarActionPreview, "cancel");
  assert.equal(cancellationAction.handoff.jobCardDraftReady, true);
  assertDisabledActionFields(cancellationAction, "Cancellation action response");
  assertNoOpResult(cancellationAction.result, "Cancellation action result", "approve_cancellation");
  assertNoUnsafeOutput(cancellationAction, "Cancellation action response");

  const rejectParams = {
    action: "reject request",
    booking_reference: "PLO-AMD-ACT-005",
    change_type: "date change",
    requested_date: "2026-07-20",
  };
  const rejectResponse = await harness.route.GET(
    new Request(apiUrl(rejectParams), { headers: adminHeaders() }),
  );
  const rejectAction = await rejectResponse.json();

  assert.equal(rejectResponse.status, 200);
  assert.equal(rejectAction.actionType, "reject_request");
  assert.equal(rejectAction.handoff.changeType, "date_change");
  assert.equal(rejectAction.handoff.calendarActionPreview, "update");
  assertDisabledActionFields(rejectAction, "Reject action response");
  assertNoOpResult(rejectAction.result, "Reject action result", "reject_request");
  assertNoUnsafeOutput(rejectAction, "Reject action response");

  const unsafeResponse = await harness.route.GET(
    new Request(
      apiUrl({
        action: "approve route payment-token",
        booking_reference: "payment-token",
        change_type: "route payment-token",
        pickup_address: "driver_payout pickup",
        reason: "internal_admin_note with PayNow payout",
      }),
      { headers: adminHeaders() },
    ),
  );
  const unsafe = await unsafeResponse.json();

  assert.equal(unsafeResponse.status, 200);
  assert.equal(unsafe.ok, true);
  assert.equal(unsafe.actionType, "approve_amendment");
  assert.equal(unsafe.handoff.changeType, "location_change");
  assert.equal(unsafe.handoff.originalBookingRef, null);
  assert.equal(unsafe.handoff.calendarActionPreview, "none");
  assert.equal(unsafe.handoff.jobCardDraftReady, false);
  assert.deepEqual(unsafe.handoff.missing_requirements, [
    "original_booking_ref",
    "requested_location",
  ]);
  assertDisabledActionFields(unsafe, "Unsafe blocked response");
  assertNoOpResult(unsafe.result, "Unsafe blocked result", "approve_amendment");
  assertNoUnsafeOutput(unsafe, "Unsafe blocked response");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin customer amendment action disabled setup API contract passed");
