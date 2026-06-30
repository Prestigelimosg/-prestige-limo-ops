import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-dispatch-action-feedback-compact-guard.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function sectionBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing section start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing section end after ${startFragment}: ${endFragment}`);

  return source.slice(start, end);
}

const [appPage, ledger, preactivationSuite] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const actionFeedbackHelperBlock = sectionBetween(
  appPage,
  "function actionFeedbackButtonClass",
  "function bookingStatusClass",
);
const actionFeedbackStateBlock = sectionBetween(
  appPage,
  "const currentBookingSaveGuardKey = getBookingSaveGuardKey();",
  "return (",
);
const dispatchCopyUiBlock = sectionBetween(
  appPage,
  'data-dispatch-workflow-step="job-card-preview"',
  'data-dispatch-workflow-step="admin-lower-status"',
);
const validateBookingBlock = sectionBetween(
  appPage,
  "function validateBooking",
  "function applyNameMemory",
);
const saveBookingBlock = sectionBetween(
  appPage,
  "async function saveBooking",
  "function bookingRecordReferenceCandidates",
);
const driverJobLinkLoadBlock = sectionBetween(
  appPage,
  "async function refreshAdminDriverJobLinkForReference",
  "useEffect(() => {",
);
const ledgerSection = sectionBetween(ledger, "### Dispatch Action Feedback And Compact Review", "\n### ");

for (const fragment of [
  "function actionFeedbackButtonClass",
  "border-emerald-400 bg-emerald-100 text-emerald-950",
  "border-red-300 bg-red-50 text-red-800",
]) {
  assertIncludes(actionFeedbackHelperBlock, fragment, `action feedback helper fragment ${fragment}`);
}

for (const fragment of [
  'bookingSaveButtonLabel',
  '"Saved"',
  'jobCardEdited ? "Edited" : "Edit"',
  'customerCopyEdited ? "Edited" : "Edit"',
  'driverDispatchEdited ? "Edited" : "Edit"',
  'jobCardCopied ? "Copied" : "Copy"',
  'customerCopyCopied ? "Copied" : "Copy"',
  'driverDispatchCopied ? "Copied" : "Copy"',
  'adminCustomerDriverDetailsEmailSent',
  '"Emailed"',
  '"Email checked"',
  '"WhatsApp checked"',
  '"SMS checked"',
  '"Sent In-App"',
  '"Driver In-App sent"',
  '"Calendar Created"',
  '"Created"',
  '"Revoked"',
]) {
  assertIncludes(actionFeedbackStateBlock + dispatchCopyUiBlock, fragment, `button result fragment ${fragment}`);
}

for (const fragment of [
  'data-dispatch-compact-panel="manual-extra-charges"',
  'data-dispatch-compact-panel="job-card-copy-preview"',
  'data-dispatch-compact-panel="customer-driver-admin-checks"',
  'data-dispatch-compact-panel="driver-in-app-admin-checks"',
  'data-dispatch-compact-panel="driver-dispatch-copy-preview"',
  'data-dispatch-compact-panel="driver-job-link-preview"',
  'data-driver-job-link-preview-disclosure="true"',
  'data-job-card-action-toolbar="separated"',
  'data-job-card-save-toolbar="primary"',
  'data-job-card-utility-toolbar="compact"',
  'data-booking-save-feedback="job-card"',
  'className="flex max-w-full flex-wrap items-center justify-end gap-2"',
  'className="flex items-center rounded-md border border-red-100 bg-red-50/70 p-1"',
  "h-8 whitespace-nowrap rounded px-2.5 text-[11px]",
  'className="mb-2 inline-flex max-w-full rounded-full',
]) {
  assertIncludes(dispatchCopyUiBlock, fragment, `compact dispatch fragment ${fragment}`);
}

for (const fragment of [
  'driverJobLinkCopyMessage?.tone === "error"',
  'adminDriverJobLinkState.message?.tone === "error"',
]) {
  assertIncludes(dispatchCopyUiBlock, fragment, `driver job link error-only feedback fragment ${fragment}`);
}

for (const fragment of [
  "Save Booking + CRM needs Booker WhatsApp / Contact before saving.",
  "setBookingSaveMessage(saveMessage);",
]) {
  assertIncludes(validateBookingBlock, fragment, `Save Booking + CRM validation fragment ${fragment}`);
}

for (const fragment of [
  "setAdminBookingPersistenceMessage(null);",
  "Please review warnings before saving. Tick the review checkbox above, then save again.",
  "adminBookingPersistenceFailureDetail",
  "safe_error_category",
  "safe_error_operation",
]) {
  assertIncludes(saveBookingBlock, fragment, `Save Booking + CRM preflight fragment ${fragment}`);
}

for (const [source, label] of [
  [appPage, "whole app page"],
  [driverJobLinkLoadBlock, "driver job link load block"],
]) {
  assertExcludes(source, 'data-driver-job-link-status="true"', label);
  assertExcludes(source, "Loaded active driver job link for", label);
  assertExcludes(source, "No active driver job link loaded for", label);
}

for (const [section, label] of [
  [actionFeedbackHelperBlock, "action feedback helper"],
  [actionFeedbackStateBlock, "action feedback state"],
  [dispatchCopyUiBlock, "dispatch compact/action feedback UI"],
]) {
  for (const forbiddenPattern of [
    /\/api\/admin-driver-job-links|\/api\/admin-bookings|fetch\(/i,
    /process\.env|service_role|createClient/i,
    /navigator\.geolocation|watchPosition|getCurrentPosition/i,
    /driver payout|PayNow payout|customer price|internal admin notes|parser\/debug|mock QA|dev archive/i,
  ]) {
    assertExcludes(section, forbiddenPattern, `${label} UI-only/privacy boundary`);
  }
}

for (const phrase of [
  "Dispatch action buttons now reuse a common completed-state style so finished actions shade green and switch to result wording.",
  "Customer Copy, Job Card, Driver Dispatch, Driver Job Link, Email/WhatsApp/SMS checks, and in-app send controls use result labels only when their existing local state confirms success.",
  "The Driver Job Link card no longer renders the active-link status pill, copied success box, or loaded-active-link banner shown below the buttons; only errors remain as separate feedback.",
  "The Job Card Preview action toolbar is compact and wrapped; Save + CRM now sits in its own primary save group, separated from Calendar/Edit/Copy utility buttons and Manual Extra Charges, without changing the save or calendar handlers.",
  "Save Booking + CRM now preflights Booker WhatsApp / Contact before calling `/api/admin-bookings`, matching the admin persistence `contact_phone` contract.",
  "Job Card Preview now shows Save Booking + CRM feedback beside the compact toolbar, so failed/saved state is visible where the operator clicks instead of only in the lower persistence panel.",
  "Job Card extra charges, Job Card preview, Driver Dispatch preview, Driver Job Link preview, and admin readiness chips are collapsed behind compact disclosure rows.",
  "This keeps Save Booking + CRM on `POST /api/admin-bookings`; it does not change driver job link API payloads, provider sends, DB schema, env values, GPS/live location, billing/payment/PDF/invoice/payout, parser behavior, or deploy behavior.",
  "Guard coverage lives in `scripts/test-dispatch-action-feedback-compact-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation dispatch action feedback compact guard registration");

console.log("Dispatch action feedback compact guard passed");
