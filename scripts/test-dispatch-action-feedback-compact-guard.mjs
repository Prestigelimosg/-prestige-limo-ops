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
const adminDraftPersistencePayloadBlock = sectionBetween(
  appPage,
  "const adminDraftPickupDateTimeFallback",
  "function safeAdminBookingPersistenceCount",
);
const saveBookingBlock = sectionBetween(
  appPage,
  "async function saveBooking",
  "function bookingRecordReferenceCandidates",
);
const updateAppliedSnapshotBlock = sectionBetween(
  appPage,
  "async function updateAppliedAdminBookingOperationalSnapshot",
  "async function updateAdminCustomerRequestReviewDecision",
);
const driverJobLinkLoadBlock = sectionBetween(
  appPage,
  "const refreshAdminDriverJobLinkForReference = useCallback",
  "useEffect(() => {",
);
const driverJobLinkMessageBlock = sectionBetween(
  appPage,
  "const driverJobLinkMessage = useMemo",
  "const generatedDispatchCopyMessages = useMemo",
);
const bookingStatusPatchBlock = sectionBetween(
  appPage,
  "async function patchBookingStatusReference",
  "async function updateBookingStatusOnly",
);
const driverJobLinkRevokeBlock = sectionBetween(
  appPage,
  "async function revokeDriverJobLink()",
  "function assignDraftDriver()",
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
  '"Update + Cal"',
  'bookingUpdateInFlight',
  'handleJobCardPrimaryBookingAction',
  'void updateAppliedAdminBookingOperationalSnapshot();',
  'jobCardEdited ? "Edited" : "Edit"',
  'customerCopyEdited ? "Edited" : "Edit"',
  'driverDispatchEdited ? "Edited" : "Edit"',
  'jobCardCopied ? "Copied" : "Copy"',
  'customerCopyCopied ? "Copied" : "Copy"',
  'driverDispatchCopied ? "Copied" : "Copy"',
  'adminCustomerDriverDetailsEmailSent',
  '"Emailed"',
  '"Email blocked"',
  '"WhatsApp checked"',
  '"SMS checked"',
  '"In-App queued"',
  '"Driver In-App queued"',
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
  "const oneTimeUrl = clean(adminDriverJobLinkState.oneTimeUrl);",
  "if (!oneTimeUrl) {\n      return \"\";\n    }",
]) {
  assertIncludes(driverJobLinkMessageBlock, fragment, `driver job link blank preview fragment ${fragment}`);
}

for (const fragment of [
  "link: null,",
  "patchBookingStatusReference(",
  'driverJobLinkBookingReference,\n            "cancelled"',
  "Driver job link revoked. Booking status changed to Cancelled and moved to Completed / History.",
  "Driver job link revoked, but booking status was not changed:",
  "oneTimeUrl: \"\",",
]) {
  assertIncludes(driverJobLinkRevokeBlock, fragment, `driver job link revoke clears preview fragment ${fragment}`);
}

for (const fragment of [
  "function adminInternalStatusForBookingStatus",
  "return \"driver_assigned\";",
  "return \"in_progress\";",
  "function applyBookingStatusToLocalRecord",
  "admin_internal_status: adminInternalStatusForBookingStatus(nextStatus)",
  "updatedBookingRecord.customer_facing_status = nextStatus;",
  "updatedBookingRecord.cancellation_review_status = \"cancelled\";",
]) {
  assertIncludes(appPage, fragment, `local booking status mirror fragment ${fragment}`);
}

for (const fragment of [
  "const responseBookingId = cleanReferenceText(responseBooking?.id);",
  "clean(responseBooking.status).toLowerCase() !== nextStatus",
  "const statusReferences = Array.from(",
  "applyBookingStatusToLocalRecord(currentBooking, nextStatus, responseUpdatedAt)",
  "setLoadBookingsTypedOperationalCardsById((current) => {",
  "booking_status: nextStatus,",
]) {
  assertIncludes(bookingStatusPatchBlock, fragment, `booking status patch local sync fragment ${fragment}`);
}

assertExcludes(
  bookingStatusPatchBlock,
  "String(responseBody.booking.id) !== bookingStatusReference",
  "booking status API response identifier validation",
);

assertIncludes(
  appPage,
  "const requiredFields: Array<keyof BookingForm> = [];",
  "admin Dispatch required-field marker list",
);
assertIncludes(
  validateBookingBlock,
  "Booker email must be valid when provided.",
  "Save Booking + CRM optional email format validation",
);
for (const fragment of [
  "adminDispatchSaveCrmMissingPickupMessage(booking)",
  "setBookingSaveMessage(missingPickupMessage);",
  "return false;",
]) {
  assertIncludes(validateBookingBlock, fragment, `Save Booking + CRM pickup date/time guard ${fragment}`);
}
for (const fragment of [
  "function adminDispatchSaveCrmMissingPickupFields",
  "fieldLabels.date",
  "fieldLabels.time",
  "No 2099 draft was saved.",
]) {
  assertIncludes(appPage, fragment, `Save Booking + CRM missing pickup helper ${fragment}`);
}
assertExcludes(
  validateBookingBlock,
  "Booker WhatsApp / Contact before saving",
  "Save Booking + CRM admin contact must-fill validation",
);

for (const fragment of [
  'adminDraftPickupDateTimeFallback = "2099-12-31T00:00:00+08:00"',
  'adminDraftPickupFallback = "Pickup To Confirm"',
  'adminDraftDropoffFallback = "Drop-off To Confirm"',
  'adminDraftCustomerFallback = "Customer To Confirm"',
  'adminDraftContactFallback = "Contact To Confirm"',
  "adminBookingCalendarReadyForRealSync",
  "pickupLocation = clean(bookingValue.pickup) || adminDraftPickupFallback",
  "dropoffLocation = clean(bookingValue.dropoff) || adminDraftDropoffFallback",
  "contact_phone: clean(bookingValue.bookerContact) || adminDraftContactFallback",
]) {
  assertIncludes(
    adminDraftPersistencePayloadBlock,
    fragment,
    `admin draft persistence placeholder fragment ${fragment}`,
  );
}

for (const fragment of [
  "Save Booking + CRM needs Booker WhatsApp / Contact before saving.",
  "Please review warnings before saving. Tick the review checkbox above, then save again.",
  "I reviewed these warnings and still want to save",
]) {
  assertExcludes(appPage, fragment, `removed admin must-fill save gate fragment ${fragment}`);
}

for (const fragment of [
  "setAdminBookingPersistenceMessage(null);",
  "adminBookingCalendarReadyForRealSync(savedBooking.bookingValue)",
  "Google Calendar auto-sync skipped because the saved admin draft still has date/time or route details to confirm.",
  "Calendar skipped until date/time or route is confirmed; no guest email sent.",
  "adminBookingPersistenceFailureDetail",
  "safe_error_category",
  "safe_error_operation",
  "markAdminBookingAsActiveForUpdates(primarySavedBookingReference, primarySavedBooking);",
  "key: getBookingSaveGuardKey(primarySavedBookingReference)",
]) {
  assertIncludes(saveBookingBlock, fragment, `Save Booking + CRM preflight fragment ${fragment}`);
}

for (const fragment of [
  'adminDispatchSaveCrmMissingPickupMessage(\n      booking,\n      "Save Operational Snapshot"',
  'adminDispatchSaveCrmMissingPickupMessage(\n      booking,\n      "Update + Cal"',
]) {
  assertIncludes(appPage, fragment, `lower persistence pickup guard fragment ${fragment}`);
}

for (const fragment of [
  "markAdminBookingAsActiveForUpdates(updatedBookingReference, updatedBooking);",
  "setBookingSaveMessage(updateMessage);",
  "key: getBookingSaveGuardKey(updatedBookingReference)",
]) {
  assertIncludes(updateAppliedSnapshotBlock, fragment, `Update applied snapshot feedback fragment ${fragment}`);
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

for (const fragment of [
  'data-job-card-readable-summary="true"',
  "jobCardSaveFeedbackDuplicatesBillingIdentity",
  "Billing account reviewed",
]) {
  assertIncludes(dispatchCopyUiBlock, fragment, `Job Card readable summary fragment ${fragment}`);
}

for (const phrase of [
  "Dispatch action buttons now reuse a common completed-state style so finished actions shade green and switch to result wording.",
  "Customer Copy, Job Card, Driver Dispatch, Driver Job Link, Email/WhatsApp/SMS checks, and in-app send controls use result labels only when their existing local state confirms success.",
  "The Driver Job Link card no longer renders the active-link status pill, copied success box, or loaded-active-link banner shown below the buttons; only errors remain as separate feedback.",
  "The Driver Job Link preview stays empty unless the current create action has returned a fresh one-time URL; revoking a link clears the local link record and preview text.",
  "The Job Card Preview action toolbar is compact and wrapped; Save + CRM now sits in its own primary save group, separated from Calendar/Edit/Copy utility buttons and Manual Extra Charges, without changing the save or calendar handlers.",
  "Admin Dispatch fields no longer show required asterisks; Save + CRM now blocks blank outbound pickup date/time before writing, so normal operations cannot silently create Dec 2099 draft bookings.",
  "Blank admin draft customer/contact/route values still use safe `To Confirm` placeholders where the `/api/admin-bookings` contract requires text, while optional Booker email still validates only when typed.",
  "Google Calendar auto-sync is skipped for incomplete admin drafts that do not have real date/time or route details, so placeholder draft saves do not create fake calendar events.",
  "Job Card Preview now shows Save Booking + CRM feedback beside the compact toolbar, so failed/saved state is visible where the operator clicks instead of only in the lower persistence panel.",
  "Job Card extra charges, Job Card preview, Driver Dispatch preview, Driver Job Link preview, and admin readiness chips are collapsed behind compact disclosure rows.",
  "This keeps Save Booking + CRM on `POST /api/admin-bookings`; it does not change driver job link API payloads, provider sends, DB schema, env values, GPS/live location, billing/payment/PDF/invoice/payout, parser behavior, or deploy behavior.",
  "Guard coverage lives in `scripts/test-dispatch-action-feedback-compact-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation dispatch action feedback compact guard registration");

console.log("Dispatch action feedback compact guard passed");
