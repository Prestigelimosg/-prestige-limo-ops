import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/customer-amendment-review-handoff-setup-foundation.ts";
const helperSource = await readFile(helperPath, "utf8");
const unsafeOutputPattern =
  /driver_payout|paynow|pay_now|internal_admin|internal finance|admin_finance|parser|debug|mock_qa|dev_archive|customer_price|billing|invoice|payment|payout|pricing|secret|service_role|smtp|stripe|token/i;

assert.equal(
  helperSource.includes("server-only"),
  true,
  "Customer amendment review handoff helper must stay server-only.",
);
assert.equal(
  /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(helperSource),
  false,
  "Customer amendment review handoff helper must not use network APIs.",
);
assert.equal(
  /export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(helperSource),
  false,
  "Customer amendment review handoff helper must not define API route behavior.",
);
assert.equal(
  /\bprocess\.env\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/i.test(
    helperSource,
  ),
  false,
  "Customer amendment review handoff helper must not read env/provider secrets.",
);
assert.equal(
  /createClient|supabase|insert\(|upsert\(|update\(|delete\(/i.test(helperSource),
  false,
  "Customer amendment review handoff helper must not use DB writes.",
);
assert.equal(
  /calendar\.events|googleapis|ical-generator|sendMail|from\s+["'](?:nodemailer|sendgrid|mailgun|postmark|resend|twilio|stripe)|new\s+(?:Stripe|Twilio)/i.test(
    helperSource,
  ),
  false,
  "Customer amendment review handoff helper must not call calendar, provider, or payment SDKs.",
);

for (const fragment of [
  "customer_amendment_review_handoff_setup_only",
  "adminReviewRequired: true",
  "bookingUpdateEnabled: false",
  "calendarUpdateEnabled: false",
  "liveWriteEnabled: false",
  "external_send: false",
  "calendarActionPreview",
  "jobCardDraftReady",
  "draftCreated: false",
]) {
  assert.ok(helperSource.includes(fragment), `Missing customer amendment setup fragment: ${fragment}`);
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-amendment-handoff-"));
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

function assertSetupDisabled(value, label) {
  assert.equal(value.adminReviewRequired, true, `${label} must require admin review.`);
  assert.equal(value.bookingUpdateEnabled, false, `${label} must keep bookingUpdateEnabled false.`);
  assert.equal(value.booking_update_enabled, false, `${label} must keep booking_update_enabled false.`);
  assert.equal(value.calendarUpdateEnabled, false, `${label} must keep calendarUpdateEnabled false.`);
  assert.equal(value.calendar_update_enabled, false, `${label} must keep calendar_update_enabled false.`);
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);
  assert.equal(value.liveWriteEnabled, false, `${label} must keep liveWriteEnabled false.`);
  assert.equal(value.live_write_enabled, false, `${label} must keep live_write_enabled false.`);
  assert.equal(value.job_card_draft_preview.draftCreated, false, `${label} must not create a draft.`);
  assert.equal(value.job_card_draft_preview.draft_created, false, `${label} must not create a draft.`);
}

const harness = await loadHelper();

try {
  const { buildCustomerAmendmentReviewHandoffSetup } = harness.helper;
  const dateChange = buildCustomerAmendmentReviewHandoffSetup({
    changeType: "date change",
    originalBookingRef: "PLO-AMD-001",
    requestedFields: {
      date: "2026-07-18",
    },
  });

  assert.deepEqual(dateChange, {
    adminReviewRequired: true,
    bookingUpdateEnabled: false,
    booking_update_enabled: false,
    calendarActionPreview: "update",
    calendarUpdateEnabled: false,
    calendar_action_preview: "update",
    calendar_update_enabled: false,
    changeType: "date_change",
    change_type: "date_change",
    delivery_surface: "customer_amendment_review_handoff_setup_only",
    external_send: false,
    jobCardDraftReady: true,
    job_card_draft_preview: {
      action_label: "Review booking amendment",
      draftCreated: false,
      draft_created: false,
      summary_lines: [
        "Original booking: PLO-AMD-001",
        "Customer request: date change",
        "Requested date: 2026-07-18",
      ],
    },
    job_card_draft_ready: true,
    liveWriteEnabled: false,
    live_write_enabled: false,
    missing_requirements: [],
    originalBookingRef: "PLO-AMD-001",
    original_booking_ref: "PLO-AMD-001",
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
    version: "customer-amendment-review-handoff-setup-foundation-v1",
  });
  assertSetupDisabled(dateChange, "Date change handoff");

  const timeChange = buildCustomerAmendmentReviewHandoffSetup({
    change_type: "time_change",
    original_booking_ref: "PLO-AMD-002",
    requested_time: "14:30",
  });
  assert.equal(timeChange.changeType, "time_change");
  assert.equal(timeChange.requestedFields.time, "14:30");
  assert.equal(timeChange.calendarActionPreview, "update");
  assert.equal(timeChange.jobCardDraftReady, true);
  assert.deepEqual(timeChange.missing_requirements, []);
  assertSetupDisabled(timeChange, "Time change handoff");

  const locationChange = buildCustomerAmendmentReviewHandoffSetup({
    changeType: "pickup/drop-off/location change",
    originalBookingRef: "PLO-AMD-003",
    requestedFields: {
      dropoffAddress: "Raffles Hotel Singapore",
      pickupAddress: "Changi Airport Terminal 3",
    },
  });
  assert.equal(locationChange.changeType, "location_change");
  assert.equal(locationChange.requestedFields.pickup_address, "Changi Airport Terminal 3");
  assert.equal(locationChange.requestedFields.dropoff_address, "Raffles Hotel Singapore");
  assert.equal(locationChange.calendarActionPreview, "update");
  assert.equal(locationChange.jobCardDraftReady, true);
  assert.deepEqual(locationChange.missing_requirements, []);
  assertSetupDisabled(locationChange, "Location change handoff");

  const cancellationRequest = buildCustomerAmendmentReviewHandoffSetup({
    changeType: "cancellation request",
    originalBookingRef: "PLO-AMD-004",
    requestedFields: {
      cancellationReason: "Customer no longer needs the transfer",
    },
  });
  assert.equal(cancellationRequest.changeType, "cancellation_request");
  assert.equal(cancellationRequest.calendarActionPreview, "cancel");
  assert.equal(cancellationRequest.jobCardDraftReady, true);
  assert.equal(cancellationRequest.job_card_draft_preview.action_label, "Review cancellation request");
  assert.deepEqual(cancellationRequest.missing_requirements, []);
  assertSetupDisabled(cancellationRequest, "Cancellation request handoff");

  const blocked = buildCustomerAmendmentReviewHandoffSetup({
    changeType: "route payment-token",
    originalBookingRef: "payment-token",
    requestedFields: {
      pickupAddress: "driver_payout pickup",
      reason: "internal_admin_note with PayNow payout",
    },
  });
  assert.equal(blocked.changeType, "location_change");
  assert.equal(blocked.originalBookingRef, null);
  assert.equal(blocked.calendarActionPreview, "none");
  assert.equal(blocked.jobCardDraftReady, false);
  assert.equal(blocked.review_status, "blocked_for_admin_review");
  assert.deepEqual(blocked.missing_requirements, ["original_booking_ref", "requested_location"]);
  assertSetupDisabled(blocked, "Blocked handoff");
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(blocked)),
    false,
    "Customer amendment handoff output must not leak finance, provider, token, parser, or internal details.",
  );
} finally {
  await harness.cleanup();
}

console.log("Customer amendment review handoff setup foundation contract tests passed.");
