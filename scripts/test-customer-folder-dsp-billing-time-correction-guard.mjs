import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  agents: await readFile("AGENTS.md", "utf8"),
  customerFolder: await readFile(
    "app/customers/[customerId]/saved-bookings-panel.tsx",
    "utf8",
  ),
  customers: await readFile("app/customers/page.tsx", "utf8"),
  dashboard: await readFile("app/page.tsx", "utf8"),
  helper: await readFile("lib/admin-driver-job-dsp-actual-time-read.ts", "utf8"),
  ledger: await readFile("docs/current-implementation-ledger.md", "utf8"),
  route: await readFile(
    "app/api/admin-driver-job-dsp-actual-time-summaries/route.ts",
    "utf8",
  ),
  suite: await readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
};

function mustInclude(source, fragment, label) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function mustExclude(source, fragment, label) {
  assert.equal(source.includes(fragment), false, `${label} must exclude ${fragment}.`);
}

function sectionBetween(source, startFragment, endFragment, label) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `${label} start must remain present.`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `${label} end must remain present.`);

  return source.slice(start, end);
}

for (const fragment of [
  'export async function POST(request: Request)',
  "saveAdminDriverJobDspBillingTimeCorrection",
  'allowServerSessionRoleMethodsWithoutRequestToken: ["POST"]',
]) {
  mustInclude(files.route, fragment, "existing DSP actual-time route");
}

for (const forbidden of [
  "export async function PATCH",
  "export async function PUT",
  "export async function DELETE",
]) {
  mustExclude(files.route, forbidden, "DSP actual-time route write boundary");
}

for (const fragment of [
  'billing_time_source: "admin_correction"',
  'actual_time_policy: "admin_billing_time_correction"',
  '.from("driver_job_dsp_actual_time_events")',
  'event_type: "dsp_end"',
  'source_surface: "admin_api"',
  "billing_started_at",
  "safe_event_note: parsed.data.correction_reason",
  "Correction reason is required",
  "DSP billing end must be after its start",
  "30-day",
]) {
  mustInclude(files.helper, fragment, "append-only DSP billing-time correction");
}

for (const forbidden of [
  '.from("driver_job_status_events").update',
  '.from("driver_job_status_events").delete',
  '.from("driver_job_dsp_actual_time_events").update',
  '.from("driver_job_dsp_actual_time_events").delete',
  '.from("bookings").update',
]) {
  mustExclude(files.helper, forbidden, "immutable Driver Reports and booking schedule");
}

const inlineEditor = sectionBetween(
  files.customerFolder,
  'data-customer-folder-inline-job-editor={booking.booking_reference || ""}',
  'data-customer-folder-price-review-save={booking.booking_reference || ""}',
  "existing Jobs not billed yet editor",
);

for (const fragment of [
  'data-customer-folder-dsp-billing-time-correction="true"',
  "DSP billing start (SGT)",
  "DSP billing end / JC (SGT)",
  "Correction reason",
  'data-customer-folder-dsp-billing-time-save="true"',
  "Save DSP billing times",
]) {
  mustInclude(inlineEditor, fragment, "existing unbilled-job DSP correction editor");
}

mustInclude(
  files.customerFolder,
  'customerInvoiceBookingType(inlineEditState.form.serviceType) === "DSP"',
  "DSP-only correction visibility",
);
mustInclude(
  files.customerFolder,
  "summary?.billing_time_source === \"admin_correction\"",
  "exact-customer corrected billing start selection",
);
mustInclude(
  files.customerFolder,
  "const recalculatedReviews = await loadAutomatedBillingReviews([booking], {",
  "same-lane explicit price recalculation after correction",
);
mustInclude(
  files.customerFolder,
  "forceRateSetup: true",
  "same-lane recalculation refreshes the current Rates setup",
);
mustExclude(
  files.customerFolder,
  '!parseInvoiceAmountToCents(String(booking.customer_price_label ?? ""))',
  "current-rate proposal calculation must not skip an unbilled job with an older saved price",
);
mustInclude(
  files.customerFolder,
  "setPriceDraft((recalculatedAmountCents / 100).toFixed(2))",
  "same-editor recalculated customer price refresh",
);
mustInclude(
  files.customerFolder,
  "but the customer proposal requires review.",
  "saved correction must not claim a rate recalculation when current rate evidence is unavailable",
);
mustInclude(
  inlineEditor,
  'data-customer-folder-inline-vehicle="true"',
  "saved vehicle display in the existing Section 3 editor",
);
mustExclude(
  files.dashboard,
  "data-admin-dsp-billing-time-correction",
  "read-only Dispatch Driver Reports",
);

for (const fragment of [
  'billing_time_source?: "admin_correction" | "automatic" | null',
  'summary?.billing_time_source === "admin_correction"',
  "summary?.dsp_started_at",
]) {
  mustInclude(files.customers, fragment, "customer invoice corrected billing interval");
}

for (const fragment of [
  "Admin-Editable DSP Billing Time Correction",
  "Jobs not billed yet",
  "append-only",
  "booking pickup",
  "Driver JC",
  "original Driver Reports evidence",
]) {
  mustInclude(files.ledger, fragment, "implementation ledger correction checkpoint");
  mustInclude(files.agents, fragment, "startup workflow correction lock");
}

mustInclude(
  files.suite,
  "scripts/test-customer-folder-dsp-billing-time-correction-guard.mjs",
  "preactivation suite registration",
);

console.log("Customer-folder DSP billing-time correction guard passed.");
