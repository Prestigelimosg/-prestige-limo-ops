import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeFiles = [
  "app/api/admin-customer-amendment-review-preview-setup/route.ts",
  "app/api/admin-customer-amendment-action-disabled-setup/route.ts",
];
const helperFiles = [
  "lib/customer-amendment-review-handoff-setup-foundation.ts",
  "lib/customer-amendment-action-audit-payload-setup-foundation.ts",
];
const boundaryFile = "lib/admin-dispatcher-auth-boundary.ts";
const harnessFiles = [...routeFiles, boundaryFile, ...helperFiles];
const allowedSetupOnlyStrings = [
  "admin-customer-amendment-action-disabled-setup",
  "admin-customer-amendment-review-preview-setup",
  "approve_amendment",
  "approve_cancellation",
  "blocked/no-op",
  "cancellation_request",
  "customer_amendment_action_audit_payload_setup_only",
  "customer_amendment_action_disabled_setup_only",
  "customer_amendment_review_handoff_setup_only",
  "date_change",
  "location_change",
  "reject_request",
  "setup_only",
  "setup_only_disabled",
  "time_change",
];
const providerImportPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@supabase\/supabase-js|@supabase\/ssr|@auth\/core|aws-sdk|googleapis|ical-generator|nodemailer|resend|sendgrid|mailgun|postmark|stripe|twilio|next-auth)["']|require\(\s*["'](?:@supabase\/supabase-js|@supabase\/ssr|@auth\/core|aws-sdk|googleapis|ical-generator|nodemailer|resend|sendgrid|mailgun|postmark|stripe|twilio|next-auth)["']\s*\)/i;
const envReadPattern =
  /\bprocess\.env\b|\bSUPABASE_[A-Z_]*\b|\bAUTH_[A-Z_]*\b|\bJWT_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b|\bGOOGLE_[A-Z_]*\b|\bCALENDAR_[A-Z_]*\b/;
const dbWritePattern =
  /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|auth\.users/i;
const calendarWritePattern =
  /calendar\.events|googleapis|ical-generator|calendarSync|calendar_sync|syncCalendar|cancelCalendar|updateCalendar|createCalendarEvent/i;
const authActivationPattern =
  /\bcookies\s*\(|\bheaders\s*\(|getServerSession|signIn\s*\(|signOut\s*\(|NextAuth|createSession|createUser|signUp\s*\(|signInWith|exchangeCodeForSession|setSession|refreshSession|verifyOtp|magicLink|issueToken|createToken|jwt\.sign|jsonwebtoken|Authorization/i;
const externalLiveCallPattern =
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|request\s*\(|sendMail\s*\(|sendMessage\s*\(|send_message\s*\(|sendSms\s*\(|sendSMS\s*\(|messages\.create|client\.messages|publish\s*\(/i;
const liveTruePattern =
  /bookingUpdateEnabled\s*[:=]\s*true|crmUpdateEnabled\s*[:=]\s*true|calendarUpdateEnabled\s*[:=]\s*true|calendarCancelEnabled\s*[:=]\s*true|jobCardCreateEnabled\s*[:=]\s*true|customerNotificationEnabled\s*[:=]\s*true|driverNotificationEnabled\s*[:=]\s*true|liveWriteEnabled\s*[:=]\s*true|auditWriteEnabled\s*[:=]\s*true|external_send\s*[:=]\s*true/i;
const paymentOrShimPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["']stripe["']|require\(\s*["']stripe["']\s*\)|paymentLink|payment_link\s*[:=]|payNowUrl|paynowUrl|checkoutSession|createCheckout|invoice_payment\s*[:=]|legacy_shim|shim\s*\(/i;
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

function apiUrl(pathname, params = {}) {
  const url = new URL(`http://localhost${pathname}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function hasOwn(value, key) {
  return Object.hasOwn(value ?? {}, key);
}

function assertSetupLocked(value, label) {
  assert.equal(value?.adminReviewRequired, true, `${label} must require admin review.`);
  assert.equal(value?.bookingUpdateEnabled, false, `${label} must keep bookingUpdateEnabled false.`);

  if (hasOwn(value, "crmUpdateEnabled")) {
    assert.equal(value.crmUpdateEnabled, false, `${label} must keep crmUpdateEnabled false.`);
  }

  if (hasOwn(value, "crmBookingUpdateEnabled")) {
    assert.equal(
      value.crmBookingUpdateEnabled,
      false,
      `${label} must keep crmBookingUpdateEnabled false.`,
    );
  }

  assert.equal(value?.calendarUpdateEnabled, false, `${label} must keep calendarUpdateEnabled false.`);

  if (hasOwn(value, "calendarCancelEnabled")) {
    assert.equal(value.calendarCancelEnabled, false, `${label} must keep calendarCancelEnabled false.`);
  }

  if (hasOwn(value, "jobCardCreateEnabled")) {
    assert.equal(value.jobCardCreateEnabled, false, `${label} must keep jobCardCreateEnabled false.`);
  }

  if (hasOwn(value, "customerNotificationEnabled")) {
    assert.equal(
      value.customerNotificationEnabled,
      false,
      `${label} must keep customerNotificationEnabled false.`,
    );
  }

  if (hasOwn(value, "driverNotificationEnabled")) {
    assert.equal(
      value.driverNotificationEnabled,
      false,
      `${label} must keep driverNotificationEnabled false.`,
    );
  }

  assert.equal(value?.liveWriteEnabled, false, `${label} must keep liveWriteEnabled false.`);
  assert.equal(value?.external_send ?? false, false, `${label} must keep external_send false.`);
  assert.equal(value?.auditWriteEnabled ?? false, false, `${label} must keep auditWriteEnabled false.`);
}

function assertDraftOnly(value, label) {
  if (hasOwn(value, "job_card_draft_preview")) {
    assert.equal(
      value.job_card_draft_preview.draftCreated,
      false,
      `${label} must not create a real job card draft.`,
    );
    assert.equal(
      value.job_card_draft_preview.draft_created,
      false,
      `${label} must not create a real job card draft.`,
    );
  }
}

function assertDisabledActionFields(value, label) {
  assertSetupLocked(value, label);
  assert.equal(value?.crmUpdateEnabled, false, `${label} must keep crmUpdateEnabled false.`);
  assert.equal(value?.calendarCancelEnabled, false, `${label} must keep calendarCancelEnabled false.`);
  assert.equal(value?.jobCardCreateEnabled, false, `${label} must keep jobCardCreateEnabled false.`);
  assert.equal(
    value?.customerNotificationEnabled,
    false,
    `${label} must keep customerNotificationEnabled false.`,
  );
  assert.equal(
    value?.driverNotificationEnabled,
    false,
    `${label} must keep driverNotificationEnabled false.`,
  );
}

function assertNoOpResult(result, label, expectedActionType = null) {
  assertDisabledActionFields(result, label);

  if (hasOwn(result, "actionType") || expectedActionType !== null) {
    assert.equal(result?.actionType ?? null, expectedActionType, `${label} must expose normalized actionType.`);
  }

  if (hasOwn(result, "action_type") || expectedActionType !== null) {
    assert.equal(result?.action_type ?? null, expectedActionType, `${label} must expose normalized action_type.`);
  }

  if (hasOwn(result, "delivery_surface")) {
    assert.equal(result.delivery_surface, "customer_amendment_action_disabled_setup_only");
  }

  assert.equal(result?.no_op, true, `${label} must stay no-op.`);
  assert.equal(result?.reason, "setup_only_disabled", `${label} must keep setup-only disabled reason.`);
  assert.equal(result?.result_label, "blocked/no-op", `${label} must keep blocked/no-op result label.`);
  assert.equal(result?.status, "blocked", `${label} must stay blocked.`);
}

function assertAuditPayloadLocked(value, label) {
  assertDisabledActionFields(value, label);
  assert.equal(value?.auditWriteEnabled, false, `${label} must keep auditWriteEnabled false.`);
  assert.equal(value?.delivery_surface, "customer_amendment_action_audit_payload_setup_only");
  assert.equal(value?.status, "setup_only", `${label} must stay setup-only.`);
  assertNoOpResult(value?.blocked_no_op_result, `${label} blocked/no-op result`);
  assertDisabledActionFields(value?.audit_payload, `${label} nested audit payload`);
  assert.equal(
    value?.audit_payload?.auditWriteEnabled,
    false,
    `${label} nested audit payload must keep auditWriteEnabled false.`,
  );
  assertNoOpResult(value?.audit_payload?.result, `${label} nested audit result`);
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-amendment-no-live-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of harnessFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  const requireFromHarness = createRequire(import.meta.url);

  return {
    audit: requireFromHarness(
      path.join(tempDir, "lib/customer-amendment-action-audit-payload-setup-foundation.js"),
    ),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    handoff: requireFromHarness(
      path.join(tempDir, "lib/customer-amendment-review-handoff-setup-foundation.js"),
    ),
    routes: {
      disabledAction: requireFromHarness(
        path.join(tempDir, "app/api/admin-customer-amendment-action-disabled-setup/route.js"),
      ),
      preview: requireFromHarness(
        path.join(tempDir, "app/api/admin-customer-amendment-review-preview-setup/route.js"),
      ),
    },
  };
}

const amendmentRouteFiles = (await readdir("app/api", { recursive: true }))
  .filter((file) => file.endsWith("route.ts"))
  .map((file) => path.join("app/api", file))
  .filter((file) => file.includes("customer-amendment"))
  .sort();

assert.deepEqual(
  amendmentRouteFiles,
  [...routeFiles].sort(),
  "Customer amendment setup chain must keep only the preview and disabled action GET routes.",
);

for (const routeFile of routeFiles) {
  const source = await readFile(routeFile, "utf8");

  assert.match(source, /export async function GET/, `${routeFile} must remain a GET setup route.`);
  assert.equal(
    /export async function (POST|PUT|PATCH|DELETE)/.test(source),
    false,
    `${routeFile} must not expose write/live amendment verbs.`,
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

  assert.equal(providerImportPattern.test(source), false, `${file} must not import provider SDKs.`);
  assert.equal(envReadPattern.test(source), false, `${file} must not read provider/auth/calendar env.`);
  assert.equal(dbWritePattern.test(source), false, `${file} must not use DB writes.`);
  assert.equal(calendarWritePattern.test(source), false, `${file} must not sync or mutate calendars.`);
  assert.equal(authActivationPattern.test(source), false, `${file} must not activate customer auth.`);
  assert.equal(externalLiveCallPattern.test(source), false, `${file} must not call external live APIs.`);
  assert.equal(liveTruePattern.test(source), false, `${file} must not enable live/write flags.`);
  assert.equal(paymentOrShimPattern.test(source), false, `${file} must not introduce payment or shim paths.`);
}

const setupChainSource = (
  await Promise.all([...routeFiles, ...helperFiles].map((file) => readFile(file, "utf8")))
).join("\n");

for (const setupOnlyString of allowedSetupOnlyStrings) {
  assert.ok(
    setupChainSource.includes(setupOnlyString),
    `Setup-only customer amendment string must remain allowed: ${setupOnlyString}.`,
  );
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildCustomerAmendmentReviewHandoffSetup } = harness.handoff;
  const { buildCustomerAmendmentActionAuditPayloadSetup } = harness.audit;
  const dateHandoff = buildCustomerAmendmentReviewHandoffSetup({
    change_type: "date change",
    original_booking_ref: "PLO-AMEND-GUARD-001",
    requested_date: "2026-07-18",
  });

  assertSetupLocked(dateHandoff, "Date amendment handoff helper");
  assertDraftOnly(dateHandoff, "Date amendment handoff helper");
  assert.equal(dateHandoff.status, "setup_only");
  assert.equal(dateHandoff.delivery_surface, "customer_amendment_review_handoff_setup_only");
  assert.equal(dateHandoff.changeType, "date_change");
  assert.equal(dateHandoff.calendarActionPreview, "update");
  assert.equal(dateHandoff.jobCardDraftReady, true);
  assert.deepEqual(dateHandoff.missing_requirements, []);
  assertNoUnsafeOutput(dateHandoff, "Date amendment handoff helper");

  for (const [label, params, expectedChangeType, expectedCalendarAction] of [
    [
      "Time amendment",
      {
        changeType: "time_change",
        original_booking_ref: "PLO-AMEND-GUARD-002",
        requested_time: "14:30",
      },
      "time_change",
      "update",
    ],
    [
      "Location amendment",
      {
        change_type: "pickup/drop-off/location change",
        dropoff_address: "Raffles Hotel Singapore",
        original_booking_ref: "PLO-AMEND-GUARD-003",
        pickup_address: "Changi Airport Terminal 3",
      },
      "location_change",
      "update",
    ],
    [
      "Cancellation request",
      {
        change_type: "cancellation request",
        originalBookingRef: "PLO-AMEND-GUARD-004",
        requested_cancellation_reason: "Customer no longer needs the transfer",
      },
      "cancellation_request",
      "cancel",
    ],
  ]) {
    const handoff = buildCustomerAmendmentReviewHandoffSetup(params);

    assertSetupLocked(handoff, `${label} handoff helper`);
    assertDraftOnly(handoff, `${label} handoff helper`);
    assert.equal(handoff.changeType, expectedChangeType);
    assert.equal(handoff.calendarActionPreview, expectedCalendarAction);
    assert.equal(handoff.jobCardDraftReady, true);
    assert.deepEqual(handoff.missing_requirements, []);
    assertNoUnsafeOutput(handoff, `${label} handoff helper`);
  }

  const anonymousPreviewResponse = await harness.routes.preview.GET(
    new Request(apiUrl("/api/admin-customer-amendment-review-preview-setup")),
  );
  const anonymousPreview = await anonymousPreviewResponse.json();

  assert.equal(anonymousPreviewResponse.status, 403);
  assert.equal(anonymousPreview.ok, false);
  assert.equal(anonymousPreview.status, "blocked");
  assertSetupLocked(anonymousPreview, "Anonymous amendment preview API");
  assertSetupLocked(anonymousPreview.preview, "Anonymous amendment preview API preview");
  assertSetupLocked(anonymousPreview.handoff, "Anonymous amendment preview API handoff");
  assertDraftOnly(anonymousPreview.handoff, "Anonymous amendment preview API handoff");
  assertNoUnsafeOutput(anonymousPreview, "Anonymous amendment preview API");

  const previewResponse = await harness.routes.preview.GET(
    new Request(
      apiUrl("/api/admin-customer-amendment-review-preview-setup", {
        change_type: "date change",
        original_booking_ref: "PLO-AMEND-GUARD-005",
        requested_date: "2026-07-20",
      }),
      { headers: adminHeaders() },
    ),
  );
  const preview = await previewResponse.json();

  assert.equal(previewResponse.status, 200);
  assert.equal(preview.ok, true);
  assert.equal(preview.status, "setup_only");
  assert.equal(preview.changeType, "date_change");
  assert.equal(preview.calendarActionPreview, "update");
  assert.equal(preview.jobCardDraftReady, true);
  assertSetupLocked(preview, "Amendment preview API");
  assertSetupLocked(preview.preview, "Amendment preview API preview");
  assertSetupLocked(preview.handoff, "Amendment preview API handoff");
  assertDraftOnly(preview.handoff, "Amendment preview API handoff");
  assertNoUnsafeOutput(preview, "Amendment preview API");

  const disabledByAction = {};

  for (const [actionLabel, expectedActionType, params] of [
    [
      "approve date amendment",
      "approve_amendment",
      {
        action: "approve date amendment",
        change_type: "date change",
        original_booking_ref: "PLO-AMEND-GUARD-006",
        requested_date: "2026-07-21",
      },
    ],
    [
      "approve time amendment",
      "approve_amendment",
      {
        action_type: "approve time amendment",
        booking_reference: "PLO-AMEND-GUARD-007",
        changeType: "time_change",
        time: "15:15",
      },
    ],
    [
      "approve location amendment",
      "approve_amendment",
      {
        action: "approve location amendment",
        booking_ref: "PLO-AMEND-GUARD-008",
        change_type: "pickup/drop-off/location change",
        location: "Marina Bay Sands",
      },
    ],
    [
      "approve cancellation",
      "approve_cancellation",
      {
        action: "approve cancellation",
        cancellation_reason: "Customer no longer needs the transfer",
        change_type: "cancellation request",
        originalBookingRef: "PLO-AMEND-GUARD-009",
      },
    ],
    [
      "reject request",
      "reject_request",
      {
        action: "reject request",
        booking_reference: "PLO-AMEND-GUARD-010",
        change_type: "date change",
        requested_date: "2026-07-22",
      },
    ],
  ]) {
    const response = await harness.routes.disabledAction.GET(
      new Request(apiUrl("/api/admin-customer-amendment-action-disabled-setup", params), {
        headers: adminHeaders(),
      }),
    );
    const body = await response.json();

    assert.equal(response.status, 200, `${actionLabel} disabled action API must respond.`);
    assert.equal(body.ok, true, `${actionLabel} disabled action API must be ok.`);
    assert.equal(body.status, "blocked", `${actionLabel} disabled action API must stay blocked.`);
    assertDisabledActionFields(body, `${actionLabel} disabled action API`);
    assertDisabledActionFields(body.preview, `${actionLabel} disabled action API preview`);
    assertSetupLocked(body.handoff, `${actionLabel} disabled action API handoff`);
    assertDraftOnly(body.handoff, `${actionLabel} disabled action API handoff`);
    assertNoOpResult(body.result, `${actionLabel} disabled action API result`, expectedActionType);
    assertNoUnsafeOutput(body, `${actionLabel} disabled action API`);

    disabledByAction[expectedActionType] = body.result;
  }

  const anonymousDisabledResponse = await harness.routes.disabledAction.GET(
    new Request(apiUrl("/api/admin-customer-amendment-action-disabled-setup")),
  );
  const anonymousDisabled = await anonymousDisabledResponse.json();

  assert.equal(anonymousDisabledResponse.status, 403);
  assert.equal(anonymousDisabled.ok, false);
  assert.equal(anonymousDisabled.status, "blocked");
  assertDisabledActionFields(anonymousDisabled, "Anonymous disabled amendment action API");
  assertDisabledActionFields(anonymousDisabled.preview, "Anonymous disabled amendment action API preview");
  assertNoOpResult(anonymousDisabled.result, "Anonymous disabled amendment action API result");
  assertNoUnsafeOutput(anonymousDisabled, "Anonymous disabled amendment action API");

  const auditPayload = buildCustomerAmendmentActionAuditPayloadSetup({
    actionSource: "disabled_action_api",
    actionType: "approve date amendment",
    disabledAction: disabledByAction.approve_amendment,
    setup: dateHandoff,
  });

  assertAuditPayloadLocked(auditPayload, "Date amendment action audit payload");
  assert.equal(auditPayload.actionType, "approve_amendment");
  assert.equal(auditPayload.actionSource, "disabled_action_api");
  assert.equal(auditPayload.changeType, "date_change");
  assert.equal(auditPayload.originalBookingRef, "PLO-AMEND-GUARD-001");
  assert.deepEqual(auditPayload.missing_requirements, []);
  assertNoUnsafeOutput(auditPayload, "Date amendment action audit payload");

  const cancellationAuditPayload = buildCustomerAmendmentActionAuditPayloadSetup({
    action_source: "disabled_action_api",
    action_type: "approve cancellation",
    cancellation_reason: "Customer no longer needs the transfer",
    change_type: "cancellation request",
    disabled_action_result: disabledByAction.approve_cancellation,
    original_booking_ref: "PLO-AMEND-GUARD-011",
  });

  assertAuditPayloadLocked(cancellationAuditPayload, "Cancellation action audit payload");
  assert.equal(cancellationAuditPayload.actionType, "approve_cancellation");
  assert.equal(cancellationAuditPayload.changeType, "cancellation_request");
  assert.equal(cancellationAuditPayload.calendarActionPreview, "cancel");
  assert.deepEqual(cancellationAuditPayload.missing_requirements, []);
  assertNoUnsafeOutput(cancellationAuditPayload, "Cancellation action audit payload");

  const rejectAuditPayload = buildCustomerAmendmentActionAuditPayloadSetup({
    actionSource: "setup contract test",
    actionType: "reject request",
    booking_reference: "PLO-AMEND-GUARD-012",
    change_type: "time change",
    disabledActionResult: disabledByAction.reject_request,
    requested_time: "16:45",
  });

  assertAuditPayloadLocked(rejectAuditPayload, "Reject request action audit payload");
  assert.equal(rejectAuditPayload.actionType, "reject_request");
  assert.equal(rejectAuditPayload.actionSource, "setup_contract_test");
  assert.equal(rejectAuditPayload.changeType, "time_change");
  assert.deepEqual(rejectAuditPayload.missing_requirements, []);
  assertNoUnsafeOutput(rejectAuditPayload, "Reject request action audit payload");

  const unsafeAuditPayload = buildCustomerAmendmentActionAuditPayloadSetup({
    actionSource: "server_secret",
    actionType: "approve route payment-token",
    booking_reference: "payment-token",
    change_type: "route payment-token",
    disabledActionResult: {
      adminReviewRequired: true,
      bookingUpdateEnabled: true,
      calendarCancelEnabled: true,
      calendarUpdateEnabled: true,
      crmUpdateEnabled: true,
      customerNotificationEnabled: true,
      delivery_surface: "customer_amendment_action_disabled_setup_only",
      driverNotificationEnabled: true,
      external_send: true,
      jobCardCreateEnabled: true,
      liveWriteEnabled: true,
      no_op: false,
      reason: "active",
      result_label: "active",
      status: "active",
    },
    pickup_address: "driver_payout pickup",
    reason: "internal_admin_note with PayNow payout",
  });

  assertAuditPayloadLocked(unsafeAuditPayload, "Unsafe amendment action audit payload");
  assert.equal(unsafeAuditPayload.actionType, "approve_amendment");
  assert.equal(unsafeAuditPayload.actionSource, null);
  assert.equal(unsafeAuditPayload.originalBookingRef, null);
  assert.deepEqual(unsafeAuditPayload.missing_requirements, [
    "original_booking_ref",
    "action_source",
    "disabled_action_result",
  ]);
  assertNoUnsafeOutput(unsafeAuditPayload, "Unsafe amendment action audit payload");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("customer amendment no-live guard passed");
