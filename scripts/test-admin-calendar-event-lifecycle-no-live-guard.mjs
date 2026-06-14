import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeFiles = [
  "app/api/admin-calendar-event-lifecycle-action-disabled-setup/route.ts",
  "app/api/admin-calendar-event-lifecycle-readiness-preview-setup/route.ts",
];
const helperFiles = [
  "lib/admin-calendar-event-lifecycle-action-audit-payload-setup-foundation.ts",
  "lib/admin-calendar-event-lifecycle-readiness-setup-foundation.ts",
];
const boundaryFile = "lib/admin-dispatcher-auth-boundary.ts";
const harnessFiles = [...routeFiles, boundaryFile, ...helperFiles];
const disabledActionSetupApi = "admin-calendar-event-lifecycle-action-disabled-setup";
const previewReadinessSetupApi =
  "admin-calendar-event-lifecycle-readiness-preview-setup";
const allowedSetupOnlyStrings = [
  "admin-calendar-event-lifecycle-action-disabled-setup",
  "admin-calendar-event-lifecycle-readiness-preview-setup",
  "admin_calendar_event_lifecycle_action_audit_payload_setup_only",
  "admin_calendar_event_lifecycle_action_disabled_setup_only",
  "admin_calendar_event_lifecycle_readiness_setup_only",
  "blocked/no-op",
  "cancel_after_admin_approved_cancellation",
  "create_confirmed_booking_event",
  "customer_amendment_cancellation_never_auto_updates_calendar",
  "setup_only",
  "setup_only_disabled",
  "update_after_admin_approved_amendment",
];
const providerImportPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@supabase\/supabase-js|@supabase\/ssr|aws-sdk|googleapis|@googleapis\/calendar|ical-generator|nodemailer|resend|sendgrid|mailgun|postmark|stripe|twilio|microsoft-graph|@microsoft\/microsoft-graph-client)["']|require\(\s*["'](?:@supabase\/supabase-js|@supabase\/ssr|aws-sdk|googleapis|@googleapis\/calendar|ical-generator|nodemailer|resend|sendgrid|mailgun|postmark|stripe|twilio|microsoft-graph|@microsoft\/microsoft-graph-client)["']\s*\)/i;
const envReadPattern =
  /\bprocess\.env\b|\bSUPABASE_[A-Z_]*\b|\bGOOGLE_[A-Z_]*\b|\bCALENDAR_[A-Z_]*\b|\bMICROSOFT_[A-Z_]*\b|\bOUTLOOK_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b|\bCLIENT_SECRET\b/;
const dbWritePattern =
  /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(/i;
const externalLiveCallPattern =
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|request\s*\(|sendMail\s*\(|sendMessage\s*\(|messages\.create|client\.messages|publish\s*\(/i;
const calendarLivePattern =
  /calendar\.events|events\.insert|events\.update|events\.delete|googleapis|ical-generator|createCalendarEvent\s*\(|calendarCreate\s*\(|calendarUpdate\s*\(|calendarCancel\s*\(|syncCalendar\s*\(|liveCalendarSync\s*\(|calendarProvider\s*\(/i;
const liveTruePattern =
  /calendarCreateEnabled\s*[:=]\s*true|calendarUpdateEnabled\s*[:=]\s*true|calendarCancelEnabled\s*[:=]\s*true|liveCalendarSyncEnabled\s*[:=]\s*true|external_calendar\s*[:=]\s*true|auditWriteEnabled\s*[:=]\s*true|adminApprovalRequired\s*[:=]\s*false/i;
const paymentOrShimPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["']stripe["']|require\(\s*["']stripe["']\s*\)|paymentLink|payment_link\s*[:=]|payNowUrl|paynowUrl|checkoutSession|createCheckout|invoice_payment\s*[:=]|legacy_shim|shim\s*\(/i;
const unsafeOutputPattern =
  /raw_token|service_role|server_secret|secret|api_key|access_token|private_key|password|driver_payout|paynow|pay_now|internal_admin|admin_finance|parser_debug|mock_archive|customer_price|billing|invoice|payment|payout|pricing|https?:\/\//i;
const expectedMissingRequirements = [
  "confirmed_booking",
  "admin_approval",
  "calendar_provider_approval",
  "live_calendar_sync_approval",
];
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

function apiUrl(pathname, params = {}) {
  const url = new URL(`http://localhost${pathname}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertCalendarLifecycleDisabled(value, label) {
  assert.equal(value?.calendarCreateEnabled, false, `${label} must keep calendarCreateEnabled false.`);
  assert.equal(value?.calendar_create_enabled, false, `${label} must keep calendar_create_enabled false.`);
  assert.equal(value?.calendarUpdateEnabled, false, `${label} must keep calendarUpdateEnabled false.`);
  assert.equal(value?.calendar_update_enabled, false, `${label} must keep calendar_update_enabled false.`);
  assert.equal(value?.calendarCancelEnabled, false, `${label} must keep calendarCancelEnabled false.`);
  assert.equal(value?.calendar_cancel_enabled, false, `${label} must keep calendar_cancel_enabled false.`);
  assert.equal(value?.liveCalendarSyncEnabled, false, `${label} must keep liveCalendarSyncEnabled false.`);
  assert.equal(value?.live_calendar_sync_enabled, false, `${label} must keep live_calendar_sync_enabled false.`);
  assert.equal(value?.external_calendar, false, `${label} must keep external_calendar false.`);
  assert.equal(value?.adminApprovalRequired, true, `${label} must require admin approval.`);
  assert.equal(value?.admin_approval_required, true, `${label} must require admin approval.`);
  assert.equal(
    value?.customer_amendment_auto_calendar_update_allowed,
    false,
    `${label} must never allow customer amendment/cancel auto calendar updates.`,
  );
  assert.equal(value?.auditWriteEnabled ?? false, false, `${label} must keep auditWriteEnabled false.`);
  assert.equal(value?.audit_write_enabled ?? false, false, `${label} must keep audit_write_enabled false.`);
}

function assertReadiness(value, label) {
  assertCalendarLifecycleDisabled(value, label);
  assert.deepEqual(value?.missing_requirements, expectedMissingRequirements, `${label} must keep blockers.`);
  assert.deepEqual(value?.policy_notes, expectedPolicyNotes, `${label} must keep policy notes.`);
  assert.equal(value?.readiness_status, "blocked_pending_admin_approval", `${label} must stay blocked.`);
}

function assertPlannedLifecycle(value, label) {
  assert.deepEqual(
    value?.planned_lifecycle,
    expectedPlannedLifecycle,
    `${label} must keep lifecycle actions planned only.`,
  );
}

function assertBlockedNoOp(value, label) {
  assertCalendarLifecycleDisabled(value, label);
  assert.equal(value?.status, "blocked", `${label} must stay blocked.`);
  assert.equal(value?.no_op, true, `${label} must stay no-op.`);
  assert.equal(value?.reason, "setup_only_disabled", `${label} must stay setup-only disabled.`);
  assert.equal(value?.result_label, "blocked/no-op", `${label} must keep blocked/no-op label.`);
}

function assertAuditPayload(value, label) {
  assertCalendarLifecycleDisabled(value, label);
  assert.equal(
    value?.delivery_surface,
    "admin_calendar_event_lifecycle_action_audit_payload_setup_only",
    `${label} must remain setup-only audit payload.`,
  );
  assert.equal(value?.status, "setup_only", `${label} must stay setup-only.`);
  assert.equal(value?.auditWriteEnabled, false, `${label} must keep auditWriteEnabled false.`);
  assert.equal(value?.audit_write_enabled, false, `${label} must keep audit_write_enabled false.`);
  assertBlockedNoOp(value?.blocked_no_op_result, `${label} blocked/no-op result`);
  assertCalendarLifecycleDisabled(value?.audit_payload, `${label} nested audit payload`);
  assert.equal(
    value?.audit_payload?.auditWriteEnabled,
    false,
    `${label} nested audit payload must keep auditWriteEnabled false.`,
  );
  assertBlockedNoOp(value?.audit_payload?.result, `${label} nested result`);
  assert.deepEqual(value?.audit_payload?.planned_lifecycle, expectedPlannedLifecycle);
  assert.deepEqual(value?.audit_payload?.policy_notes, expectedPolicyNotes);
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose secrets, tokens, finance, provider URLs, parser, or mock archive text.`,
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

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-calendar-lifecycle-no-live-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of harnessFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  const requireFromHarness = createRequire(import.meta.url);

  return {
    auditPayload: requireFromHarness(
      path.join(
        tempDir,
        "lib/admin-calendar-event-lifecycle-action-audit-payload-setup-foundation.js",
      ),
    ),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    readiness: requireFromHarness(
      path.join(tempDir, "lib/admin-calendar-event-lifecycle-readiness-setup-foundation.js"),
    ),
    routes: {
      disabledAction: requireFromHarness(
        path.join(
          tempDir,
          "app/api/admin-calendar-event-lifecycle-action-disabled-setup/route.js",
        ),
      ),
      previewReadiness: requireFromHarness(
        path.join(
          tempDir,
          "app/api/admin-calendar-event-lifecycle-readiness-preview-setup/route.js",
        ),
      ),
    },
  };
}

const appApiFiles = await listFiles("app/api");
const calendarLifecycleRouteFiles = appApiFiles
  .filter((file) => file.endsWith("route.ts") && file.includes("admin-calendar-event-lifecycle"))
  .sort();

assert.deepEqual(
  calendarLifecycleRouteFiles,
  [...routeFiles].sort(),
  "Calendar event lifecycle setup chain must keep only preview/readiness and disabled action GET routes.",
);

for (const routeFile of routeFiles) {
  const source = await readFile(routeFile, "utf8");

  assert.match(source, /export async function GET/, `${routeFile} must remain GET-only.`);
  assert.equal(
    /export async function (POST|PUT|PATCH|DELETE)/.test(source),
    false,
    `${routeFile} must not expose write/live calendar verbs.`,
  );
}

for (const helperFile of helperFiles) {
  const source = await readFile(helperFile, "utf8");

  assert.equal(source.includes("server-only"), true, `${helperFile} must stay server-only.`);
  assert.equal(
    /export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source),
    false,
    `${helperFile} must not define API behavior.`,
  );
}

for (const file of [...routeFiles, ...helperFiles]) {
  const source = await readFile(file, "utf8");

  assert.equal(providerImportPattern.test(source), false, `${file} must not import DB/calendar/provider/payment/sending SDKs.`);
  assert.equal(envReadPattern.test(source), false, `${file} must not read calendar provider/env secrets.`);
  assert.equal(dbWritePattern.test(source), false, `${file} must not use DB reads or writes.`);
  assert.equal(externalLiveCallPattern.test(source), false, `${file} must not call external live APIs.`);
  assert.equal(calendarLivePattern.test(source), false, `${file} must not call live calendar provider APIs.`);
  assert.equal(liveTruePattern.test(source), false, `${file} must not enable calendar/live/audit flags.`);
  assert.equal(paymentOrShimPattern.test(source), false, `${file} must not introduce payment or shim paths.`);
}

const setupChainSource = (
  await Promise.all([...routeFiles, ...helperFiles].map((file) => readFile(file, "utf8")))
).join("\n");

for (const setupOnlyString of allowedSetupOnlyStrings) {
  assert.ok(
    setupChainSource.includes(setupOnlyString),
    `Setup-only calendar lifecycle string must remain present: ${setupOnlyString}.`,
  );
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildAdminCalendarEventLifecycleActionAuditPayloadSetup } = harness.auditPayload;
  const { buildAdminCalendarEventLifecycleReadinessSetup } = harness.readiness;
  const setup = buildAdminCalendarEventLifecycleReadinessSetup({
    booking_ref: "PLO-CAL-GUARD-001",
    lifecycle_action: "create calendar event for confirmed booking",
  });

  assertCalendarLifecycleDisabled(setup, "Calendar lifecycle readiness foundation");
  assert.equal(setup.status, "setup_only");
  assert.equal(setup.delivery_surface, "admin_calendar_event_lifecycle_readiness_setup_only");
  assertReadiness(setup, "Calendar lifecycle readiness foundation");
  assertPlannedLifecycle(setup, "Calendar lifecycle readiness foundation");
  assertNoUnsafeOutput(setup, "Calendar lifecycle readiness foundation");

  const anonymousPreviewResponse = await harness.routes.previewReadiness.GET(
    new Request(apiUrl(`/api/${previewReadinessSetupApi}`)),
  );
  const anonymousPreview = await anonymousPreviewResponse.json();

  assert.equal(anonymousPreviewResponse.status, 403);
  assert.equal(anonymousPreview.ok, false);
  assert.equal(anonymousPreview.status, "blocked");
  assertCalendarLifecycleDisabled(anonymousPreview, "Anonymous calendar lifecycle preview API");
  assertCalendarLifecycleDisabled(
    anonymousPreview.preview,
    "Anonymous calendar lifecycle preview API preview",
  );
  assertReadiness(anonymousPreview.readiness, "Anonymous calendar lifecycle preview API readiness");
  assertCalendarLifecycleDisabled(
    anonymousPreview.setup,
    "Anonymous calendar lifecycle preview API setup",
  );
  assert.equal(anonymousPreview.setup.status, "setup_only");
  assertNoUnsafeOutput(anonymousPreview, "Anonymous calendar lifecycle preview API");

  const previewResponse = await harness.routes.previewReadiness.GET(
    new Request(
      apiUrl(`/api/${previewReadinessSetupApi}`, {
        booking_ref: "PLO-CAL-GUARD-002",
        lifecycle_action: "update existing calendar event after admin-approved amendment",
      }),
      { headers: adminHeaders() },
    ),
  );
  const preview = await previewResponse.json();

  assert.equal(previewResponse.status, 200);
  assert.equal(preview.ok, true);
  assert.equal(preview.status, "setup_only");
  assertCalendarLifecycleDisabled(preview, "Calendar lifecycle preview API");
  assertCalendarLifecycleDisabled(preview.preview, "Calendar lifecycle preview API preview");
  assertReadiness(preview.readiness, "Calendar lifecycle preview API readiness");
  assertCalendarLifecycleDisabled(preview.setup, "Calendar lifecycle preview API setup");
  assertPlannedLifecycle(preview.preview, "Calendar lifecycle preview API preview");
  assertPlannedLifecycle(preview.setup, "Calendar lifecycle preview API setup");
  assert.equal(preview.preview.lifecycleAction, "update_after_admin_approved_amendment");
  assert.equal(
    preview.preview.policy_notes.customer_amendment_cancellation_never_auto_updates_calendar,
    true,
  );
  assertNoUnsafeOutput(preview, "Calendar lifecycle preview API");

  const anonymousDisabledResponse = await harness.routes.disabledAction.GET(
    new Request(apiUrl(`/api/${disabledActionSetupApi}`)),
  );
  const anonymousDisabled = await anonymousDisabledResponse.json();

  assert.equal(anonymousDisabledResponse.status, 403);
  assert.equal(anonymousDisabled.ok, false);
  assert.equal(anonymousDisabled.status, "blocked");
  assertCalendarLifecycleDisabled(anonymousDisabled, "Anonymous disabled calendar lifecycle action API");
  assertCalendarLifecycleDisabled(
    anonymousDisabled.preview,
    "Anonymous disabled calendar lifecycle action API preview",
  );
  assertReadiness(
    anonymousDisabled.readiness,
    "Anonymous disabled calendar lifecycle action API readiness",
  );
  assertCalendarLifecycleDisabled(
    anonymousDisabled.setup,
    "Anonymous disabled calendar lifecycle action API setup",
  );
  assertBlockedNoOp(anonymousDisabled.result, "Anonymous disabled calendar lifecycle action API result");
  assertNoUnsafeOutput(anonymousDisabled, "Anonymous disabled calendar lifecycle action API");

  const disabledResponse = await harness.routes.disabledAction.GET(
    new Request(
      apiUrl(`/api/${disabledActionSetupApi}`, {
        booking_ref: "PLO-CAL-GUARD-003",
        lifecycle_action: "cancel existing calendar event after admin-approved cancellation",
      }),
      { headers: adminHeaders() },
    ),
  );
  const disabled = await disabledResponse.json();

  assert.equal(disabledResponse.status, 200);
  assert.equal(disabled.ok, true);
  assert.equal(disabled.status, "blocked");
  assertCalendarLifecycleDisabled(disabled, "Disabled calendar lifecycle action API");
  assertCalendarLifecycleDisabled(disabled.preview, "Disabled calendar lifecycle action API preview");
  assertReadiness(disabled.readiness, "Disabled calendar lifecycle action API readiness");
  assertCalendarLifecycleDisabled(disabled.setup, "Disabled calendar lifecycle action API setup");
  assertBlockedNoOp(disabled.result, "Disabled calendar lifecycle action API result");
  assert.equal(disabled.delivery_surface, "admin_calendar_event_lifecycle_action_disabled_setup_only");
  assert.equal(disabled.preview_readiness_source, previewReadinessSetupApi);
  assert.equal(disabled.result.lifecycleAction, "cancel_after_admin_approved_cancellation");
  assert.deepEqual(disabled.result.action_groups.create_event_for_confirmed_booking, {
    calendarCreateEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(disabled.result.action_groups.update_existing_event_after_admin_approved_amendment, {
    calendarUpdateEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(disabled.result.action_groups.cancel_existing_event_after_admin_approved_cancellation, {
    calendarCancelEnabled: false,
    status: "blocked",
  });
  assertNoUnsafeOutput(disabled, "Disabled calendar lifecycle action API");

  const auditPayload = buildAdminCalendarEventLifecycleActionAuditPayloadSetup({
    actionSource: "disabled-action-api",
    actionType: "cancel existing calendar event after admin-approved cancellation",
    disabledAction: disabled.result,
    setup,
  });

  assertAuditPayload(auditPayload, "Calendar lifecycle action audit payload");
  assert.equal(auditPayload.auditWriteEnabled, false);
  assert.equal(auditPayload.audit_write_enabled, false);
  assert.equal(auditPayload.actionType, "cancel_after_admin_approved_cancellation");
  assert.equal(auditPayload.actionSource, "disabled_action_api");
  assert.equal(auditPayload.bookingRef, "PLO-CAL-GUARD-001");
  assert.equal(auditPayload.disabledActionStatus, "blocked");
  assert.deepEqual(auditPayload.missing_requirements, []);
  assertNoUnsafeOutput(auditPayload, "Calendar lifecycle action audit payload");

  const unsafeAuditPayload = buildAdminCalendarEventLifecycleActionAuditPayloadSetup({
    actionSource: "server_secret",
    actionType: "payment token calendar write",
    bookingRef: "raw_token_calendar",
    disabledAction: {
      adminApprovalRequired: false,
      calendarCancelEnabled: true,
      calendarCreateEnabled: true,
      calendarUpdateEnabled: true,
      delivery_surface: "admin_calendar_event_lifecycle_action_disabled_setup_only",
      external_calendar: true,
      liveCalendarSyncEnabled: true,
      no_op: false,
      reason: "active",
      result_label: "active",
      status: "active",
    },
  });

  assertCalendarLifecycleDisabled(unsafeAuditPayload, "Unsafe calendar lifecycle action audit payload");
  assertCalendarLifecycleDisabled(
    unsafeAuditPayload.audit_payload,
    "Unsafe calendar lifecycle action audit payload nested audit payload",
  );
  assertBlockedNoOp(
    unsafeAuditPayload.blocked_no_op_result,
    "Unsafe calendar lifecycle action audit payload blocked result",
  );
  assert.equal(unsafeAuditPayload.actionType, null);
  assert.equal(unsafeAuditPayload.actionSource, null);
  assert.equal(unsafeAuditPayload.bookingRef, null);
  assert.equal(unsafeAuditPayload.disabledActionStatus, "missing");
  assert.deepEqual(unsafeAuditPayload.missing_requirements, [
    "booking_ref",
    "action_type",
    "action_source",
    "disabled_action_result",
  ]);
  assertNoUnsafeOutput(unsafeAuditPayload, "Unsafe calendar lifecycle action audit payload");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("calendar event lifecycle no-live guard passed");
