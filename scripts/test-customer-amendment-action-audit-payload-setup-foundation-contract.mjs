import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/customer-amendment-action-audit-payload-setup-foundation.ts";
const handoffHelperPath = "lib/customer-amendment-review-handoff-setup-foundation.ts";
const disabledActionRoutePath = "app/api/admin-customer-amendment-action-disabled-setup/route.ts";
const previewRoutePath = "app/api/admin-customer-amendment-review-preview-setup/route.ts";
const sourceFiles = [
  helperPath,
  handoffHelperPath,
  disabledActionRoutePath,
  previewRoutePath,
  "lib/admin-dispatcher-auth-boundary.ts",
];
const disabledActionSource = "admin-customer-amendment-action-disabled-setup";
const previewReadinessSource = "admin-customer-amendment-review-preview-setup";
const unsafeOutputPattern =
  /driver_payout|paynow|pay_now|internal_admin|internal finance|admin_finance|parser|debug|mock_qa|dev_archive|customer_price|billing|invoice|payment|payout|pricing|secret|service_role|smtp|stripe|token/i;
const helperSource = await readFile(helperPath, "utf8");
const originalEnv = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
};

assert.equal(
  helperSource.includes("server-only"),
  true,
  "Customer amendment action audit helper must stay server-only.",
);
assert.equal(
  /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(helperSource),
  false,
  "Customer amendment action audit helper must not use network APIs.",
);
assert.equal(
  /export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(helperSource),
  false,
  "Customer amendment action audit helper must not define API route behavior.",
);
assert.equal(
  /\bprocess\.env\b|\bSUPABASE_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/i.test(
    helperSource,
  ),
  false,
  "Customer amendment action audit helper must not read env/provider secrets.",
);
assert.equal(
  /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(/i.test(
    helperSource,
  ),
  false,
  "Customer amendment action audit helper must not use DB reads or writes.",
);
assert.equal(
  /@supabase\/supabase-js|googleapis|calendar\.events|ical-generator|nodemailer|resend|sendgrid|mailgun|stripe|twilio/i.test(
    helperSource,
  ),
  false,
  "Customer amendment action audit helper must not reference DB, calendar, provider, payment, or sending SDKs.",
);
assert.equal(
  /sendMail\s*\(|messages\.create|calendar\.events|calendarUpdate\s*\(|calendarCancel\s*\(|createBooking\s*\(|updateBooking\s*\(|crmUpdate\s*\(|liveWrite\s*\(|legacy_shim|shim\s*\(/i.test(
    helperSource,
  ),
  false,
  "Customer amendment action audit helper must not send, sync, write, or introduce shims.",
);

for (const fragment of [
  "buildCustomerAmendmentReviewHandoffSetup",
  disabledActionSource,
  previewReadinessSource,
  "customer_amendment_action_audit_payload_setup_only",
  "customerAmendmentActionAuditActionTypes",
  "approve_amendment",
  "approve_cancellation",
  "reject_request",
  "actionType",
  "actionSource",
  "auditWriteEnabled: false",
  "audit_write_enabled",
  "blocked_no_op_result",
  "adminReviewRequired: true",
  "bookingUpdateEnabled: false",
  "crmUpdateEnabled: false",
  "calendarUpdateEnabled: false",
  "calendarCancelEnabled: false",
  "jobCardCreateEnabled: false",
  "customerNotificationEnabled: false",
  "driverNotificationEnabled: false",
  "liveWriteEnabled: false",
  "external_send: false",
]) {
  assert.ok(helperSource.includes(fragment), `Missing customer amendment action audit fragment: ${fragment}`);
}

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

function disabledApiUrl(params = {}) {
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

function blockedNoOpResult() {
  return {
    adminReviewRequired: true,
    bookingUpdateEnabled: false,
    calendarCancelEnabled: false,
    calendarUpdateEnabled: false,
    crmUpdateEnabled: false,
    customerNotificationEnabled: false,
    driverNotificationEnabled: false,
    external_send: false,
    jobCardCreateEnabled: false,
    liveWriteEnabled: false,
    no_op: true,
    reason: "setup_only_disabled",
    result_label: "blocked/no-op",
    status: "blocked",
  };
}

function assertAuditDisabled(value, label) {
  assert.equal(value.adminReviewRequired, true, `${label} must require admin review.`);
  assert.equal(value.bookingUpdateEnabled, false, `${label} must keep bookingUpdateEnabled false.`);
  assert.equal(value.crmUpdateEnabled, false, `${label} must keep crmUpdateEnabled false.`);
  assert.equal(value.calendarUpdateEnabled, false, `${label} must keep calendarUpdateEnabled false.`);
  assert.equal(value.calendarCancelEnabled, false, `${label} must keep calendarCancelEnabled false.`);
  assert.equal(value.jobCardCreateEnabled, false, `${label} must keep jobCardCreateEnabled false.`);
  assert.equal(value.customerNotificationEnabled, false, `${label} must keep customerNotificationEnabled false.`);
  assert.equal(value.driverNotificationEnabled, false, `${label} must keep driverNotificationEnabled false.`);
  assert.equal(value.liveWriteEnabled, false, `${label} must keep liveWriteEnabled false.`);
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);

  if (Object.hasOwn(value, "auditWriteEnabled")) {
    assert.equal(value.auditWriteEnabled, false, `${label} must keep auditWriteEnabled false.`);
  }
}

function assertBlockedNoOp(value, label) {
  assert.deepEqual(value, blockedNoOpResult(), `${label} must stay blocked/no-op.`);
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(value)),
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-amendment-action-audit-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of sourceFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  const requireFromHarness = createRequire(import.meta.url);

  return {
    audit: requireFromHarness(path.join(tempDir, helperPath.replace(/\.ts$/, ".js"))),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    disabledActionRoute: requireFromHarness(
      path.join(tempDir, disabledActionRoutePath.replace(/\.ts$/, ".js")),
    ),
    handoff: requireFromHarness(path.join(tempDir, handoffHelperPath.replace(/\.ts$/, ".js"))),
    previewRoute: requireFromHarness(path.join(tempDir, previewRoutePath.replace(/\.ts$/, ".js"))),
  };
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildCustomerAmendmentActionAuditPayloadSetup } = harness.audit;
  const { buildCustomerAmendmentReviewHandoffSetup } = harness.handoff;
  const dateParams = {
    action: "approve date amendment",
    change_type: "date change",
    original_booking_ref: "PLO-AMD-AUD-001",
    requested_date: "2026-07-18",
  };
  const disabledResponse = await harness.disabledActionRoute.GET(
    new Request(disabledApiUrl(dateParams), { headers: adminHeaders() }),
  );
  const previewResponse = await harness.previewRoute.GET(
    new Request(previewApiUrl(dateParams), { headers: adminHeaders() }),
  );
  const disabled = await disabledResponse.json();
  const preview = await previewResponse.json();
  const setup = buildCustomerAmendmentReviewHandoffSetup({
    change_type: "date change",
    original_booking_ref: "PLO-AMD-AUD-001",
    requested_date: "2026-07-18",
  });
  const auditPayload = buildCustomerAmendmentActionAuditPayloadSetup({
    actionSource: "disabled-action-api",
    actionType: "approve date amendment",
    disabledAction: disabled.result,
    setup,
  });

  assert.equal(disabledResponse.status, 200);
  assert.equal(previewResponse.status, 200);
  assert.deepEqual(disabled.preview.requestedFields, preview.preview.requestedFields);
  assert.deepEqual(auditPayload, {
    actionSource: "disabled_action_api",
    actionType: "approve_amendment",
    action_source: "disabled_action_api",
    action_type: "approve_amendment",
    adminReviewRequired: true,
    auditWriteEnabled: false,
    audit_payload: {
      actionSource: "disabled_action_api",
      actionType: "approve_amendment",
      action_source: "disabled_action_api",
      action_type: "approve_amendment",
      adminReviewRequired: true,
      auditWriteEnabled: false,
      blocked_no_op_result: blockedNoOpResult(),
      bookingUpdateEnabled: false,
      calendarActionPreview: "update",
      calendarCancelEnabled: false,
      calendarUpdateEnabled: false,
      calendar_action_preview: "update",
      changeType: "date_change",
      change_type: "date_change",
      crmUpdateEnabled: false,
      customerNotificationEnabled: false,
      disabledActionStatus: "blocked",
      disabled_action_source: disabledActionSource,
      disabled_action_status: "blocked",
      driverNotificationEnabled: false,
      external_send: false,
      jobCardCreateEnabled: false,
      jobCardDraftReady: true,
      job_card_draft_ready: true,
      liveWriteEnabled: false,
      originalBookingRef: "PLO-AMD-AUD-001",
      original_booking_ref: "PLO-AMD-AUD-001",
      preview_readiness_source: previewReadinessSource,
      requestedFields: {
        cancellation_reason: null,
        date: "2026-07-18",
        dropoff_address: null,
        location: null,
        pickup_address: null,
        time: null,
      },
      requested_fields: {
        cancellation_reason: null,
        date: "2026-07-18",
        dropoff_address: null,
        location: null,
        pickup_address: null,
        time: null,
      },
      result: blockedNoOpResult(),
      review_status: "ready_for_admin_review",
    },
    audit_write_enabled: false,
    blocked_no_op_result: blockedNoOpResult(),
    bookingUpdateEnabled: false,
    calendarActionPreview: "update",
    calendarCancelEnabled: false,
    calendarUpdateEnabled: false,
    calendar_action_preview: "update",
    changeType: "date_change",
    change_type: "date_change",
    crmUpdateEnabled: false,
    customerNotificationEnabled: false,
    delivery_surface: "customer_amendment_action_audit_payload_setup_only",
    disabledActionStatus: "blocked",
    disabled_action_status: "blocked",
    driverNotificationEnabled: false,
    external_send: false,
    jobCardCreateEnabled: false,
    jobCardDraftReady: true,
    job_card_draft_ready: true,
    liveWriteEnabled: false,
    missing_requirements: [],
    originalBookingRef: "PLO-AMD-AUD-001",
    original_booking_ref: "PLO-AMD-AUD-001",
    requestedFields: {
      cancellation_reason: null,
      date: "2026-07-18",
      dropoff_address: null,
      location: null,
      pickup_address: null,
      time: null,
    },
    requested_fields: {
      cancellation_reason: null,
      date: "2026-07-18",
      dropoff_address: null,
      location: null,
      pickup_address: null,
      time: null,
    },
    review_status: "ready_for_admin_review",
    status: "setup_only",
    version: "customer-amendment-action-audit-payload-setup-foundation-v1",
  });
  assertAuditDisabled(auditPayload, "Ready amendment action audit payload");
  assertAuditDisabled(auditPayload.audit_payload, "Ready nested amendment action audit payload");
  assertBlockedNoOp(auditPayload.blocked_no_op_result, "Ready blocked result");
  assertBlockedNoOp(auditPayload.audit_payload.result, "Ready nested result");
  assertNoUnsafeOutput(auditPayload, "Ready amendment action audit payload");

  for (const [actionType, params, expected] of [
    [
      "approve time amendment",
      {
        action: "approve time amendment",
        booking_reference: "PLO-AMD-AUD-002",
        changeType: "time_change",
        time: "14:30",
      },
      {
        calendarActionPreview: "update",
        changeType: "time_change",
        normalizedActionType: "approve_amendment",
      },
    ],
    [
      "approve location amendment",
      {
        action: "approve location amendment",
        booking_ref: "PLO-AMD-AUD-003",
        change_type: "pickup/drop-off/location change",
        pickupAddress: "Changi Airport Terminal 3",
      },
      {
        calendarActionPreview: "update",
        changeType: "location_change",
        normalizedActionType: "approve_amendment",
      },
    ],
    [
      "approve cancellation",
      {
        action: "approve cancellation",
        cancellation_reason: "Customer no longer needs the transfer",
        change_type: "cancellation request",
        originalBookingRef: "PLO-AMD-AUD-004",
      },
      {
        calendarActionPreview: "cancel",
        changeType: "cancellation_request",
        normalizedActionType: "approve_cancellation",
      },
    ],
    [
      "reject request",
      {
        action: "reject request",
        booking_reference: "PLO-AMD-AUD-005",
        change_type: "date change",
        requested_date: "2026-07-20",
      },
      {
        calendarActionPreview: "update",
        changeType: "date_change",
        normalizedActionType: "reject_request",
      },
    ],
  ]) {
    const response = await harness.disabledActionRoute.GET(
      new Request(disabledApiUrl(params), { headers: adminHeaders() }),
    );
    const body = await response.json();
    const payload = buildCustomerAmendmentActionAuditPayloadSetup({
      actionSource: "disabled_action_api",
      actionType,
      disabled_action_result: body.result,
      ...params,
    });

    assert.equal(response.status, 200);
    assert.equal(payload.actionType, expected.normalizedActionType);
    assert.equal(payload.changeType, expected.changeType);
    assert.equal(payload.calendarActionPreview, expected.calendarActionPreview);
    assert.equal(payload.disabledActionStatus, "blocked");
    assert.deepEqual(payload.missing_requirements, []);
    assertAuditDisabled(payload, `${actionType} audit payload`);
    assertAuditDisabled(payload.audit_payload, `${actionType} nested audit payload`);
    assertBlockedNoOp(payload.blocked_no_op_result, `${actionType} blocked result`);
    assertNoUnsafeOutput(payload, `${actionType} audit payload`);
  }

  const unsafeResponse = await harness.disabledActionRoute.GET(
    new Request(
      disabledApiUrl({
        action: "approve route payment-token",
        booking_reference: "payment-token",
        change_type: "route payment-token",
        pickup_address: "driver_payout pickup",
        reason: "internal_admin_note with PayNow payout",
      }),
      { headers: adminHeaders() },
    ),
  );
  const unsafeDisabled = await unsafeResponse.json();
  const unsafeAuditPayload = buildCustomerAmendmentActionAuditPayloadSetup({
    actionSource: "setup-contract-test",
    actionType: "approve route payment-token",
    disabledAction: unsafeDisabled.result,
    booking_reference: "payment-token",
    change_type: "route payment-token",
    pickup_address: "driver_payout pickup",
    reason: "internal_admin_note with PayNow payout",
  });

  assert.equal(unsafeResponse.status, 200);
  assert.equal(unsafeAuditPayload.actionSource, "setup_contract_test");
  assert.equal(unsafeAuditPayload.actionType, "approve_amendment");
  assert.equal(unsafeAuditPayload.changeType, "location_change");
  assert.equal(unsafeAuditPayload.originalBookingRef, null);
  assert.equal(unsafeAuditPayload.calendarActionPreview, "none");
  assert.equal(unsafeAuditPayload.jobCardDraftReady, false);
  assert.deepEqual(unsafeAuditPayload.missing_requirements, ["original_booking_ref"]);
  assertAuditDisabled(unsafeAuditPayload, "Unsafe amendment action audit payload");
  assertAuditDisabled(unsafeAuditPayload.audit_payload, "Unsafe nested amendment action audit payload");
  assertBlockedNoOp(unsafeAuditPayload.blocked_no_op_result, "Unsafe blocked result");
  assertNoUnsafeOutput(unsafeAuditPayload, "Unsafe amendment action audit payload");

  const missingAuditPayload = buildCustomerAmendmentActionAuditPayloadSetup({
    original_booking_ref: "PLO-AMD-AUD-MISSING",
    requested_date: "2026-07-22",
  });

  assert.deepEqual(missingAuditPayload.missing_requirements, [
    "action_type",
    "action_source",
    "disabled_action_result",
  ]);
  assert.equal(missingAuditPayload.disabledActionStatus, "missing");
  assertAuditDisabled(missingAuditPayload, "Missing disabled action audit payload");
  assertBlockedNoOp(missingAuditPayload.blocked_no_op_result, "Missing disabled action blocked result");
  assertNoUnsafeOutput(missingAuditPayload, "Missing disabled action audit payload");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("Customer amendment action audit payload setup foundation contract passed.");
