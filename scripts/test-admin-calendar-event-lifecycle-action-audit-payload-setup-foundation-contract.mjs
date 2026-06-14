import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-calendar-event-lifecycle-action-audit-payload-setup-foundation.ts";
const readinessHelperPath = "lib/admin-calendar-event-lifecycle-readiness-setup-foundation.ts";
const disabledActionRoutePath =
  "app/api/admin-calendar-event-lifecycle-action-disabled-setup/route.ts";
const previewRoutePath =
  "app/api/admin-calendar-event-lifecycle-readiness-preview-setup/route.ts";
const sourceFiles = [
  helperPath,
  readinessHelperPath,
  disabledActionRoutePath,
  previewRoutePath,
  "lib/admin-dispatcher-auth-boundary.ts",
];
const disabledActionSource = "admin-calendar-event-lifecycle-action-disabled-setup";
const previewReadinessSource = "admin-calendar-event-lifecycle-readiness-preview-setup";
const unsafeOutputPattern =
  /driver_payout|paynow|pay_now|internal_admin|admin_finance|parser|debug|mock_qa|dev_archive|customer_price|billing|invoice|payment|payout|pricing|secret|service_role|smtp|stripe|token|https?:\/\//i;
const expectedPlannedLifecycle = {
  cancel_existing_event_after_admin_approved_cancellation: "planned_only",
  create_event_for_confirmed_booking: "planned_only",
  update_existing_event_after_admin_approved_amendment: "planned_only",
};
const expectedPolicyNotes = {
  admin_approval_required_for_update_cancel: true,
  customer_amendment_cancellation_never_auto_updates_calendar: true,
  file_download_only_until_live_sync_approved: true,
};
const helperSource = await readFile(helperPath, "utf8");
const readinessHelperSource = await readFile(readinessHelperPath, "utf8");
const helperAndReadinessSource = `${helperSource}\n${readinessHelperSource}`;
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
  "Calendar lifecycle action audit helper must stay server-only.",
);
assert.equal(
  /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(helperSource),
  false,
  "Calendar lifecycle action audit helper must not use network APIs.",
);
assert.equal(
  /export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(helperSource),
  false,
  "Calendar lifecycle action audit helper must not define API route behavior.",
);
assert.equal(
  /\bprocess\.env\b|\bSUPABASE_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/i.test(
    helperSource,
  ),
  false,
  "Calendar lifecycle action audit helper must not read env/provider secrets.",
);
assert.equal(
  /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(/i.test(
    helperSource,
  ),
  false,
  "Calendar lifecycle action audit helper must not use DB reads or writes.",
);
assert.equal(
  /@supabase\/supabase-js|googleapis|calendar\.events|ical-generator|nodemailer|resend|sendgrid|mailgun|stripe|twilio/i.test(
    helperSource,
  ),
  false,
  "Calendar lifecycle action audit helper must not reference DB, calendar, provider, payment, or sending SDKs.",
);
assert.equal(
  /sendMail\s*\(|calendar\.events|events\.insert|events\.update|events\.delete|calendarCreate\s*\(|calendarUpdate\s*\(|calendarCancel\s*\(|createBooking\s*\(|updateBooking\s*\(|liveCalendarSync\s*\(|legacy_shim|shim\s*\(/i.test(
    helperSource,
  ),
  false,
  "Calendar lifecycle action audit helper must not send, sync, write, or introduce shims.",
);

for (const fragment of [
  "buildAdminCalendarEventLifecycleReadinessSetup",
  disabledActionSource,
  previewReadinessSource,
  "admin_calendar_event_lifecycle_action_audit_payload_setup_only",
  "adminCalendarEventLifecycleActionAuditActionSources",
  "create_confirmed_booking_event",
  "update_after_admin_approved_amendment",
  "cancel_after_admin_approved_cancellation",
  "actionType",
  "actionSource",
  "auditWriteEnabled: false",
  "audit_write_enabled",
  "blocked_no_op_result",
  "calendarCreateEnabled: false",
  "calendarUpdateEnabled: false",
  "calendarCancelEnabled: false",
  "liveCalendarSyncEnabled: false",
  "external_calendar: false",
  "adminApprovalRequired: true",
  "customer_amendment_auto_calendar_update_allowed",
]) {
  assert.ok(
    helperAndReadinessSource.includes(fragment),
    `Missing calendar lifecycle action audit fragment: ${fragment}`,
  );
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
  const url = new URL("http://localhost/api/admin-calendar-event-lifecycle-action-disabled-setup");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function previewApiUrl(params = {}) {
  const url = new URL(
    "http://localhost/api/admin-calendar-event-lifecycle-readiness-preview-setup",
  );

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function blockedNoOpResult() {
  return {
    adminApprovalRequired: true,
    admin_approval_required: true,
    calendarCancelEnabled: false,
    calendarCreateEnabled: false,
    calendarUpdateEnabled: false,
    calendar_cancel_enabled: false,
    calendar_create_enabled: false,
    calendar_update_enabled: false,
    customer_amendment_auto_calendar_update_allowed: false,
    external_calendar: false,
    liveCalendarSyncEnabled: false,
    live_calendar_sync_enabled: false,
    no_op: true,
    reason: "setup_only_disabled",
    result_label: "blocked/no-op",
    status: "blocked",
  };
}

function assertCalendarLifecycleDisabled(value, label) {
  assert.equal(value.calendarCreateEnabled, false, `${label} must keep calendarCreateEnabled false.`);
  assert.equal(value.calendar_create_enabled, false, `${label} must keep calendar_create_enabled false.`);
  assert.equal(value.calendarUpdateEnabled, false, `${label} must keep calendarUpdateEnabled false.`);
  assert.equal(value.calendar_update_enabled, false, `${label} must keep calendar_update_enabled false.`);
  assert.equal(value.calendarCancelEnabled, false, `${label} must keep calendarCancelEnabled false.`);
  assert.equal(value.calendar_cancel_enabled, false, `${label} must keep calendar_cancel_enabled false.`);
  assert.equal(value.liveCalendarSyncEnabled, false, `${label} must keep liveCalendarSyncEnabled false.`);
  assert.equal(value.live_calendar_sync_enabled, false, `${label} must keep live_calendar_sync_enabled false.`);
  assert.equal(value.external_calendar, false, `${label} must keep external_calendar false.`);
  assert.equal(value.adminApprovalRequired, true, `${label} must require admin approval.`);
  assert.equal(value.admin_approval_required, true, `${label} must require admin approval.`);
  assert.equal(
    value.customer_amendment_auto_calendar_update_allowed,
    false,
    `${label} must never allow customer amendment/cancel auto calendar updates.`,
  );

  if (Object.hasOwn(value, "auditWriteEnabled")) {
    assert.equal(value.auditWriteEnabled, false, `${label} must keep auditWriteEnabled false.`);
  }
}

function assertAuditPayload(value, label) {
  assertCalendarLifecycleDisabled(value, label);
  assert.equal(value.delivery_surface, "admin_calendar_event_lifecycle_action_audit_payload_setup_only");
  assert.equal(value.status, "setup_only", `${label} must stay setup-only.`);
  assert.equal(
    value.version,
    "admin-calendar-event-lifecycle-action-audit-payload-setup-foundation-v1",
  );
  assert.deepEqual(value.blocked_no_op_result, blockedNoOpResult(), `${label} must keep blocked result.`);
  assert.equal(value.disabled_action_status, "blocked", `${label} must identify disabled action result.`);
  assert.equal(value.disabledActionStatus, "blocked", `${label} must identify disabled action result.`);
  assert.deepEqual(value.planned_lifecycle, expectedPlannedLifecycle, `${label} must keep planned lifecycle.`);
  assert.deepEqual(value.policy_notes, expectedPolicyNotes, `${label} must keep policy notes.`);
  assert.equal(value.readiness_status, "blocked_pending_admin_approval", `${label} must stay readiness blocked.`);

  assertCalendarLifecycleDisabled(value.audit_payload, `${label} nested audit payload`);
  assert.equal(value.audit_payload.auditWriteEnabled, false);
  assert.deepEqual(value.audit_payload.blocked_no_op_result, blockedNoOpResult());
  assert.deepEqual(value.audit_payload.result, blockedNoOpResult());
  assert.equal(value.audit_payload.disabled_action_source, disabledActionSource);
  assert.equal(value.audit_payload.disabled_action_status, "blocked");
  assert.equal(value.audit_payload.disabledActionStatus, "blocked");
  assert.equal(value.audit_payload.preview_readiness_source, previewReadinessSource);
  assert.deepEqual(value.audit_payload.planned_lifecycle, expectedPlannedLifecycle);
  assert.deepEqual(value.audit_payload.policy_notes, expectedPolicyNotes);
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose finance, provider URL, token, parser, internal, payment, payout, or mock archive data.`,
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-calendar-action-audit-"));
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
    previewRoute: requireFromHarness(path.join(tempDir, previewRoutePath.replace(/\.ts$/, ".js"))),
    readiness: requireFromHarness(path.join(tempDir, readinessHelperPath.replace(/\.ts$/, ".js"))),
  };
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildAdminCalendarEventLifecycleActionAuditPayloadSetup } = harness.audit;
  const { buildAdminCalendarEventLifecycleReadinessSetup } = harness.readiness;
  const createParams = {
    action: "create calendar event for confirmed booking",
    booking_ref: "PLO-CAL-AUD-001",
  };
  const disabledResponse = await harness.disabledActionRoute.GET(
    new Request(disabledApiUrl(createParams), { headers: adminHeaders() }),
  );
  const previewResponse = await harness.previewRoute.GET(
    new Request(previewApiUrl(createParams), { headers: adminHeaders() }),
  );
  const disabled = await disabledResponse.json();
  const preview = await previewResponse.json();
  const auditPayload = buildAdminCalendarEventLifecycleActionAuditPayloadSetup({
    actionSource: "disabled-action-api",
    actionType: "create calendar event for confirmed booking",
    bookingRef: "PLO-CAL-AUD-001",
    disabledAction: disabled.result,
  });

  assert.equal(disabledResponse.status, 200);
  assert.equal(previewResponse.status, 200);
  assert.equal(disabled.status, "blocked");
  assert.equal(preview.status, "setup_only");
  assert.deepEqual(disabled.preview.planned_lifecycle, preview.preview.planned_lifecycle);
  assert.deepEqual(disabled.preview.policy_notes, preview.preview.policy_notes);
  assertAuditPayload(auditPayload, "Create calendar action audit payload");
  assert.equal(auditPayload.actionSource, "disabled_action_api");
  assert.equal(auditPayload.actionType, "create_confirmed_booking_event");
  assert.equal(auditPayload.action_source, "disabled_action_api");
  assert.equal(auditPayload.action_type, "create_confirmed_booking_event");
  assert.equal(auditPayload.bookingRef, "PLO-CAL-AUD-001");
  assert.equal(auditPayload.booking_ref, "PLO-CAL-AUD-001");
  assert.equal(auditPayload.audit_payload.actionType, "create_confirmed_booking_event");
  assert.equal(auditPayload.audit_payload.bookingRef, "PLO-CAL-AUD-001");
  assert.deepEqual(auditPayload.missing_requirements, []);
  assertNoUnsafeOutput(auditPayload, "Create calendar action audit payload");

  for (const [label, params, expectedActionType] of [
    [
      "Update amendment calendar action audit payload",
      {
        action_type: "update existing calendar event after admin-approved amendment",
        bookingRef: "PLO-CAL-AUD-002",
      },
      "update_after_admin_approved_amendment",
    ],
    [
      "Cancel approved cancellation calendar action audit payload",
      {
        booking_reference: "PLO-CAL-AUD-003",
        lifecycle_action: "cancel existing calendar event after admin-approved cancellation",
      },
      "cancel_after_admin_approved_cancellation",
    ],
  ]) {
    const response = await harness.disabledActionRoute.GET(
      new Request(disabledApiUrl(params), { headers: adminHeaders() }),
    );
    const body = await response.json();
    const payload = buildAdminCalendarEventLifecycleActionAuditPayloadSetup({
      actionSource: "preview readiness api",
      actionType: params.action_type ?? params.lifecycle_action,
      bookingRef: params.bookingRef ?? params.booking_reference,
      disabledActionResult: body.result,
    });

    assert.equal(response.status, 200);
    assertAuditPayload(payload, label);
    assert.equal(payload.actionSource, "preview_readiness_api");
    assert.equal(payload.actionType, expectedActionType);
    assert.equal(payload.audit_payload.actionType, expectedActionType);
    assert.deepEqual(payload.missing_requirements, []);
    assertNoUnsafeOutput(payload, label);
  }

  const explicitSetup = buildAdminCalendarEventLifecycleReadinessSetup({
    booking_ref: "PLO-CAL-AUD-004",
    lifecycle_action: "update after amendment",
  });
  const setupPayload = buildAdminCalendarEventLifecycleActionAuditPayloadSetup({
    actionSource: "setup_contract_test",
    disabledAction: disabled.result,
    setup: explicitSetup,
  });

  assertAuditPayload(setupPayload, "Explicit setup calendar action audit payload");
  assert.equal(setupPayload.actionSource, "setup_contract_test");
  assert.equal(setupPayload.actionType, "update_after_admin_approved_amendment");
  assert.equal(setupPayload.bookingRef, "PLO-CAL-AUD-004");
  assert.deepEqual(setupPayload.missing_requirements, []);
  assertNoUnsafeOutput(setupPayload, "Explicit setup calendar action audit payload");

  const missingPayload = buildAdminCalendarEventLifecycleActionAuditPayloadSetup({
    actionType: "approve calendar update",
    bookingRef: "PLO-CAL-AUD-005",
  });

  assertCalendarLifecycleDisabled(missingPayload, "Missing disabled result audit payload");
  assert.equal(missingPayload.actionType, "update_after_admin_approved_amendment");
  assert.equal(missingPayload.actionSource, null);
  assert.equal(missingPayload.disabled_action_status, "missing");
  assert.deepEqual(missingPayload.missing_requirements, [
    "action_source",
    "disabled_action_result",
  ]);
  assert.deepEqual(missingPayload.blocked_no_op_result, blockedNoOpResult());
  assertNoUnsafeOutput(missingPayload, "Missing disabled result audit payload");

  const unsafePayload = buildAdminCalendarEventLifecycleActionAuditPayloadSetup({
    actionSource: "disabled-action-api",
    actionType: "payment token calendar write",
    bookingRef: "server_secret",
    disabledAction: disabled.result,
  });

  assertCalendarLifecycleDisabled(unsafePayload, "Unsafe calendar action audit payload");
  assert.equal(unsafePayload.actionType, null);
  assert.equal(unsafePayload.bookingRef, null);
  assert.equal(unsafePayload.audit_payload.bookingRef, null);
  assert.equal(unsafePayload.disabled_action_status, "blocked");
  assert.deepEqual(unsafePayload.missing_requirements, ["booking_ref", "action_type"]);
  assertNoUnsafeOutput(unsafePayload, "Unsafe calendar action audit payload");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin calendar event lifecycle action audit payload setup foundation contract passed");
