import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-calendar-event-lifecycle-action-disabled-setup/route.ts";
const helperPath = "lib/admin-calendar-event-lifecycle-readiness-setup-foundation.ts";
const sourceFiles = [
  routePath,
  "lib/admin-dispatcher-auth-boundary.ts",
  helperPath,
];
const previewReadinessSetupApi =
  "admin-calendar-event-lifecycle-readiness-preview-setup";
const safeOutputLeakPattern =
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
const expectedActionGroups = {
  cancel_existing_event_after_admin_approved_cancellation: {
    calendarCancelEnabled: false,
    status: "blocked",
  },
  create_event_for_confirmed_booking: {
    calendarCreateEnabled: false,
    status: "blocked",
  },
  update_existing_event_after_admin_approved_amendment: {
    calendarUpdateEnabled: false,
    status: "blocked",
  },
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

function apiUrl(params = {}) {
  const url = new URL(
    "http://localhost/api/admin-calendar-event-lifecycle-action-disabled-setup",
  );

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
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

function assertReadiness(value, label) {
  assertCalendarLifecycleDisabled(value, label);
  assert.deepEqual(
    value.missing_requirements,
    expectedMissingRequirements,
    `${label} must keep admin/provider/live sync blockers.`,
  );
  assert.deepEqual(value.policy_notes, expectedPolicyNotes, `${label} must keep policy notes.`);
  assert.equal(value.readiness_status, "blocked_pending_admin_approval", `${label} must stay blocked.`);
  assert.equal(value.status, "blocked", `${label} must report blocked status.`);
}

function assertPreview(value, label) {
  assertCalendarLifecycleDisabled(value, label);
  assert.deepEqual(
    value.planned_lifecycle,
    expectedPlannedLifecycle,
    `${label} must keep lifecycle actions planned only.`,
  );
  assert.deepEqual(value.policy_notes, expectedPolicyNotes, `${label} must keep policy notes.`);
  assert.equal(
    value.delivery_surface,
    "admin_calendar_event_lifecycle_readiness_setup_only",
    `${label} must keep preview as setup-only readiness.`,
  );
}

function assertNoOpResult(result, label) {
  assertCalendarLifecycleDisabled(result, label);
  assert.deepEqual(
    result.action_groups,
    expectedActionGroups,
    `${label} must keep all lifecycle action groups blocked.`,
  );
  assert.equal(
    result.delivery_surface,
    "admin_calendar_event_lifecycle_action_disabled_setup_only",
    `${label} must report the disabled action surface.`,
  );
  assert.equal(result.no_op, true, `${label} must stay no-op.`);
  assert.equal(
    result.preview_readiness_source,
    previewReadinessSetupApi,
    `${label} must reference the preview/readiness setup API.`,
  );
  assert.equal(result.reason, "setup_only_disabled", `${label} must stay setup-only disabled.`);
  assert.equal(result.result_label, "blocked/no-op", `${label} must keep blocked/no-op label.`);
  assert.equal(result.status, "blocked", `${label} must stay blocked.`);
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    safeOutputLeakPattern.test(JSON.stringify(value)),
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

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-calendar-lifecycle-disabled-"));
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
  "buildAdminCalendarEventLifecycleReadinessSetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  previewReadinessSetupApi,
  "admin_calendar_event_lifecycle_action_disabled_setup_only",
  "create_event_for_confirmed_booking",
  "update_existing_event_after_admin_approved_amendment",
  "cancel_existing_event_after_admin_approved_cancellation",
  "calendarCreateEnabled: false",
  "calendarUpdateEnabled: false",
  "calendarCancelEnabled: false",
  "liveCalendarSyncEnabled: false",
  "external_calendar: false",
  "adminApprovalRequired: true",
  "customer_amendment_auto_calendar_update_allowed",
  "status: \"blocked\"",
]) {
  assert.ok(routeAndHelperSource.includes(fragment), `Missing disabled calendar lifecycle API fragment: ${fragment}`);
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
  "calendar.events",
  "calendarCreate(",
  "calendarUpdate(",
  "calendarCancel(",
  "events.insert",
  "events.update",
  "events.delete",
  "createClient",
  "supabase",
  ".from(",
  "insert(",
  "upsert(",
  "update(",
  "delete(",
  "process.env",
  "@supabase/supabase-js",
  "googleapis",
  "@googleapis/calendar",
  "microsoft-graph",
  "@microsoft/microsoft-graph-client",
  "ical-generator",
  "stripe",
  "sendMail(",
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

  assert.equal(anonymousResponse.status, 403, "Calendar lifecycle disabled action API must stay admin-gated.");
  assert.equal(anonymous.ok, false);
  assert.equal(anonymous.status, "blocked");
  assertCalendarLifecycleDisabled(anonymous, "Anonymous blocked response");
  assertPreview(anonymous.preview, "Anonymous blocked preview");
  assertReadiness(anonymous.readiness, "Anonymous blocked readiness");
  assertCalendarLifecycleDisabled(anonymous.setup, "Anonymous blocked setup");
  assert.equal(anonymous.setup.status, "setup_only");
  assertNoOpResult(anonymous.result, "Anonymous blocked result");
  assert.equal(anonymous.preview_readiness_source, previewReadinessSetupApi);
  assertNoUnsafeOutput(anonymous, "Anonymous blocked response");

  const createResponse = await harness.route.GET(
    new Request(
      apiUrl({
        action: "create calendar event for confirmed booking",
        booking_ref: "PLO-CAL-ACTION-001",
      }),
      { headers: adminHeaders() },
    ),
  );
  const createResult = await createResponse.json();

  assert.equal(createResponse.status, 200);
  assert.equal(createResult.ok, true);
  assert.equal(createResult.status, "blocked");
  assert.equal(
    createResult.version,
    "admin-calendar-event-lifecycle-readiness-setup-foundation-v1",
  );
  assertCalendarLifecycleDisabled(createResult, "Create response");
  assertPreview(createResult.preview, "Create preview");
  assertReadiness(createResult.readiness, "Create readiness");
  assertCalendarLifecycleDisabled(createResult.setup, "Create setup");
  assert.equal(createResult.setup.status, "setup_only");
  assertNoOpResult(createResult.result, "Create result");
  assert.equal(createResult.preview.booking_ref, "PLO-CAL-ACTION-001");
  assert.equal(createResult.preview.lifecycleAction, "create_confirmed_booking_event");
  assert.equal(createResult.result.booking_ref, "PLO-CAL-ACTION-001");
  assert.equal(createResult.result.lifecycleAction, "create_confirmed_booking_event");
  assert.equal(createResult.preview_readiness_source, previewReadinessSetupApi);
  assertNoUnsafeOutput(createResult, "Create response");

  const updateResponse = await harness.route.GET(
    new Request(
      apiUrl({
        action_type: "update existing calendar event after admin-approved amendment",
        bookingRef: "PLO-CAL-ACTION-002",
      }),
      { headers: adminHeaders() },
    ),
  );
  const updateResult = await updateResponse.json();

  assert.equal(updateResponse.status, 200);
  assert.equal(updateResult.ok, true);
  assert.equal(updateResult.status, "blocked");
  assertCalendarLifecycleDisabled(updateResult, "Update response");
  assertPreview(updateResult.preview, "Update preview");
  assertReadiness(updateResult.readiness, "Update readiness");
  assertNoOpResult(updateResult.result, "Update result");
  assert.equal(updateResult.preview.lifecycleAction, "update_after_admin_approved_amendment");
  assert.equal(updateResult.result.lifecycleAction, "update_after_admin_approved_amendment");
  assert.equal(
    updateResult.preview.policy_notes.admin_approval_required_for_update_cancel,
    true,
  );
  assert.equal(
    updateResult.preview.policy_notes.customer_amendment_cancellation_never_auto_updates_calendar,
    true,
  );
  assertNoUnsafeOutput(updateResult, "Update response");

  const cancelResponse = await harness.route.GET(
    new Request(
      apiUrl({
        booking_reference: "PLO-CAL-ACTION-003",
        lifecycle_action: "cancel existing calendar event after admin-approved cancellation",
      }),
      { headers: adminHeaders() },
    ),
  );
  const cancelResult = await cancelResponse.json();

  assert.equal(cancelResponse.status, 200);
  assert.equal(cancelResult.ok, true);
  assert.equal(cancelResult.status, "blocked");
  assertCalendarLifecycleDisabled(cancelResult, "Cancel response");
  assertPreview(cancelResult.preview, "Cancel preview");
  assertReadiness(cancelResult.readiness, "Cancel readiness");
  assertNoOpResult(cancelResult.result, "Cancel result");
  assert.equal(cancelResult.preview.lifecycleAction, "cancel_after_admin_approved_cancellation");
  assert.equal(cancelResult.result.lifecycleAction, "cancel_after_admin_approved_cancellation");
  assertNoUnsafeOutput(cancelResult, "Cancel response");

  const unsafeResponse = await harness.route.GET(
    new Request(
      apiUrl({
        actionType: "payment token calendar write",
        bookingRef: "server_secret",
      }),
      { headers: adminHeaders() },
    ),
  );
  const unsafe = await unsafeResponse.json();

  assert.equal(unsafeResponse.status, 200);
  assert.equal(unsafe.ok, true);
  assert.equal(unsafe.status, "blocked");
  assertCalendarLifecycleDisabled(unsafe, "Unsafe response");
  assertPreview(unsafe.preview, "Unsafe preview");
  assertReadiness(unsafe.readiness, "Unsafe readiness");
  assertNoOpResult(unsafe.result, "Unsafe result");
  assert.equal(unsafe.preview.booking_ref, null);
  assert.equal(unsafe.preview.lifecycleAction, null);
  assert.equal(unsafe.result.booking_ref, null);
  assert.equal(unsafe.result.lifecycleAction, null);
  assert.equal(unsafe.setup.booking_ref, null);
  assert.equal(unsafe.setup.lifecycleAction, null);
  assertNoUnsafeOutput(unsafe, "Unsafe response");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin calendar event lifecycle action disabled setup API contract passed");
