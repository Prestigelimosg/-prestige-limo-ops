import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

function between(start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const saveBlock = between(
  "async function saveBooking()",
  "function bookingRecordReferenceCandidates",
);
const updateBlock = between(
  "async function updateAppliedAdminBookingOperationalSnapshot()",
  "function getDispatchCopyText",
);

for (const [label, block] of [
  ["Save + CRM", saveBlock],
  ["Update + Cal", updateBlock],
]) {
  assert.match(
    block,
    /retainSavedBookingForDriverJobLinkHandoff/,
    `${label} must retain the exact successfully saved booking for the existing Driver Job Link handoff`,
  );
  assert.match(
    block,
    /resetAdminBookingFormAfterSuccessfulPersistence\(\)/,
    `${label} must preserve the established reset for customer-folder or ambiguous handoffs`,
  );
}

for (const fragment of [
  "savedBookings.length === 1",
  "!customerReturnUrl",
]) {
  assert.match(
    saveBlock + updateBlock,
    new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `no-reload handoff must preserve ${fragment}`,
  );
}

for (const fragment of [
  "focusDriverJobLink: true",
  "adminBookingPersistenceRecordToCalendarBookingRecord",
  "adminBookingRecordOverride: savedRecord",
]) {
  assert.match(
    source,
    new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `exact saved-booking retention must preserve ${fragment}`,
  );
}

console.log("Admin Driver Job Link no-reload handoff guard passed");
