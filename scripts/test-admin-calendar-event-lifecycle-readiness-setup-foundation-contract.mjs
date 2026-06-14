import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-calendar-event-lifecycle-readiness-setup-foundation.ts";
const helperSource = await readFile(helperPath, "utf8");
const unsafeOutputPattern =
  /raw_token|service_role|server_secret|secret|api_key|access_token|private_key|password|driver_payout|paynow|pay_now|internal_admin|admin_finance|parser_debug|mock_archive|customer_price|billing|invoice|payment|payout|pricing/i;
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

assert.equal(
  helperSource.includes("server-only"),
  true,
  "Calendar event lifecycle readiness helper must stay server-only.",
);
assert.equal(
  /export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(helperSource),
  false,
  "Calendar event lifecycle readiness helper must not define API route behavior.",
);
assert.equal(
  /\bprocess\.env\b|\bGOOGLE_[A-Z_]*\b|\bMICROSOFT_[A-Z_]*\b|\bOUTLOOK_[A-Z_]*\b|\bCALENDAR_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/.test(
    helperSource,
  ),
  false,
  "Calendar event lifecycle readiness helper must not read env/provider secrets.",
);
assert.equal(
  /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(/i.test(
    helperSource,
  ),
  false,
  "Calendar event lifecycle readiness helper must not use DB reads or writes.",
);
assert.equal(
  /@supabase\/supabase-js|googleapis|@googleapis\/calendar|microsoft-graph|@microsoft\/microsoft-graph-client|ical-generator|nodemailer|resend|sendgrid|mailgun|stripe|twilio/i.test(
    helperSource,
  ),
  false,
  "Calendar event lifecycle readiness helper must not reference DB, calendar, provider, payment, or sending SDKs.",
);
assert.equal(
  /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|calendar\.events|calendarUpdate\s*\(|calendarCancel\s*\(|calendarCreate\s*\(|events\.insert|events\.update|events\.delete|sendMail\s*\(|messages\.create|liveCalendarSyncEnabled\s*[:=]\s*true|calendarCreateEnabled\s*[:=]\s*true|calendarUpdateEnabled\s*[:=]\s*true|calendarCancelEnabled\s*[:=]\s*true|external_calendar\s*[:=]\s*true|adminApprovalRequired\s*[:=]\s*false/i.test(
    helperSource,
  ),
  false,
  "Calendar event lifecycle readiness helper must not call live calendar/sending APIs or enable calendar writes.",
);
assert.equal(
  /legacy_shim|shim\s*\(/i.test(helperSource),
  false,
  "Calendar event lifecycle readiness helper must not introduce shims.",
);

for (const fragment of [
  "admin-calendar-event-lifecycle-readiness-setup-foundation-v1",
  "buildAdminCalendarEventLifecycleReadinessSetup",
  "admin_calendar_event_lifecycle_readiness_setup_only",
  "create_confirmed_booking_event",
  "update_after_admin_approved_amendment",
  "cancel_after_admin_approved_cancellation",
  "calendarCreateEnabled: false",
  "calendarUpdateEnabled: false",
  "calendarCancelEnabled: false",
  "liveCalendarSyncEnabled: false",
  "external_calendar: false",
  "adminApprovalRequired: true",
  "customer_amendment_cancellation_never_auto_updates_calendar",
]) {
  assert.ok(helperSource.includes(fragment), `Missing calendar lifecycle setup fragment: ${fragment}`);
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

async function loadHelper() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-calendar-lifecycle-readiness-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const outputPath = path.join(tempDir, helperPath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(helperSource, helperPath));

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: createRequire(import.meta.url)(outputPath),
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
}

function assertCommonPolicy(value, label) {
  assertCalendarLifecycleDisabled(value, label);
  assert.deepEqual(
    value.missing_requirements,
    expectedMissingRequirements,
    `${label} must keep admin/provider/live sync blockers.`,
  );
  assert.deepEqual(
    value.planned_lifecycle,
    expectedPlannedLifecycle,
    `${label} must keep lifecycle actions planned only.`,
  );
  assert.deepEqual(
    value.policy_notes,
    expectedPolicyNotes,
    `${label} must keep admin approval and no-auto-update rules.`,
  );
  assert.equal(value.readiness_status, "blocked_pending_admin_approval", `${label} must stay blocked.`);
  assert.equal(value.status, "setup_only", `${label} must stay setup-only.`);
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose finance, provider, token, parser, or internal details.`,
  );
}

const harness = await loadHelper();

try {
  const { buildAdminCalendarEventLifecycleReadinessSetup } = harness.helper;
  const createPolicy = buildAdminCalendarEventLifecycleReadinessSetup({
    booking_ref: "PLO-CAL-001",
    lifecycleAction: "create calendar event for confirmed booking",
  });

  assert.deepEqual(createPolicy, {
    adminApprovalRequired: true,
    admin_approval_required: true,
    booking_ref: "PLO-CAL-001",
    calendarCancelEnabled: false,
    calendarCreateEnabled: false,
    calendarUpdateEnabled: false,
    calendar_cancel_enabled: false,
    calendar_create_enabled: false,
    calendar_update_enabled: false,
    customer_amendment_auto_calendar_update_allowed: false,
    delivery_surface: "admin_calendar_event_lifecycle_readiness_setup_only",
    external_calendar: false,
    lifecycleAction: "create_confirmed_booking_event",
    lifecycle_action: "create_confirmed_booking_event",
    liveCalendarSyncEnabled: false,
    live_calendar_sync_enabled: false,
    missing_requirements: expectedMissingRequirements,
    planned_lifecycle: expectedPlannedLifecycle,
    policy_notes: expectedPolicyNotes,
    readiness_status: "blocked_pending_admin_approval",
    status: "setup_only",
    version: "admin-calendar-event-lifecycle-readiness-setup-foundation-v1",
  });
  assertCommonPolicy(createPolicy, "Create calendar lifecycle policy");

  const updatePolicy = buildAdminCalendarEventLifecycleReadinessSetup({
    bookingRef: "PLO-CAL-002",
    lifecycle_action: "update existing calendar event after admin-approved amendment",
  });

  assert.equal(updatePolicy.lifecycleAction, "update_after_admin_approved_amendment");
  assert.equal(updatePolicy.booking_ref, "PLO-CAL-002");
  assertCommonPolicy(updatePolicy, "Update calendar lifecycle policy");

  const cancelPolicy = buildAdminCalendarEventLifecycleReadinessSetup({
    bookingRef: "PLO-CAL-003",
    lifecycleAction: "cancel existing calendar event after admin-approved cancellation",
  });

  assert.equal(cancelPolicy.lifecycleAction, "cancel_after_admin_approved_cancellation");
  assert.equal(cancelPolicy.booking_ref, "PLO-CAL-003");
  assertCommonPolicy(cancelPolicy, "Cancel calendar lifecycle policy");

  const fallbackPolicy = buildAdminCalendarEventLifecycleReadinessSetup();

  assert.equal(fallbackPolicy.lifecycleAction, null);
  assert.equal(fallbackPolicy.booking_ref, null);
  assertCommonPolicy(fallbackPolicy, "Fallback calendar lifecycle policy");

  const unsafePolicy = buildAdminCalendarEventLifecycleReadinessSetup({
    bookingRef: "server_secret",
    lifecycleAction: "payment token calendar write",
  });

  assert.equal(unsafePolicy.lifecycleAction, null);
  assert.equal(unsafePolicy.booking_ref, null);
  assertCommonPolicy(unsafePolicy, "Unsafe calendar lifecycle policy");
} finally {
  await harness.cleanup();
}

console.log("admin calendar event lifecycle readiness setup foundation contract passed");
