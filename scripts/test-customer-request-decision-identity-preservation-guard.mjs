import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("app/page.tsx", "utf8");

function between(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Missing guarded block ${start}`);
  return source.slice(a, b);
}

const visibleRequestPanel = between(
  "const codexPreparedJobCardsPanel",
  "const bookingsFindToolbar",
);
for (const fragment of [
  "data-admin-prepared-job-card-close",
  "rememberHandledCustomerBookingRequest(requestBooking)",
  "Close",
]) {
  assert.ok(visibleRequestPanel.includes(fragment), `Visible request Close action must include ${fragment}`);
}

for (const removedDecisionFragment of [
  "bookingRecordToAdminBookingPersistenceRecord(requestBooking)",
  "data-admin-prepared-job-card-action-select",
  "data-admin-prepared-job-card-action-submit",
  'updateAdminCustomerRequestReviewDecision(requestRecord, "approve-internally")',
  'updateAdminCustomerRequestReviewDecision(requestRecord, "decline-internally")',
]) {
  assert.equal(
    visibleRequestPanel.includes(removedDecisionFragment),
    false,
    `Close-only prepared card must remove ${removedDecisionFragment}`,
  );
}

const hiddenOptionalTools = between(
  'data-dispatch-optional-workflow-tools="true"',
  'aria-label="Advanced Checks"',
);
assert.equal(
  hiddenOptionalTools.includes("data-admin-booking-customer-request-decision-button"),
  false,
  "Hidden Optional Workflow Tools must not keep a duplicate request decision control.",
);

for (const block of [between("function buildAdminBookingCancellationRequestApplyPayload", "function parsedSourceReference")]) {
  for (const field of ["company_id", "booker_id", "traveler_id"]) {
    assert.ok(
      block.includes(`${field}: adminDispatchVerifiedIdentityId(record.${field})`),
      `${field} must survive customer request status updates.`,
    );
  }
}

console.log("Customer request decision identity preservation guard passed.");
