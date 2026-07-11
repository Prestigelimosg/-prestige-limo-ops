import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile("app/page.tsx", "utf8");

const loadSelectedBookingStart = page.indexOf("function loadSelectedBooking(");
const loadSelectedBookingEnd = page.indexOf("\n  function updateCompanyProfileDraft", loadSelectedBookingStart);
const loadSelectedBooking = page.slice(loadSelectedBookingStart, loadSelectedBookingEnd);

assert.match(loadSelectedBooking, /setAdminDriverJobStatusReadState\(\{/);
assert.match(loadSelectedBooking, /setAdminDriverOtsPhotoProofReadState\(\{/);
assert.match(loadSelectedBooking, /status: "loading"/);
assert.match(loadSelectedBooking, /statuses: \[\]/);
assert.match(loadSelectedBooking, /proofs: \[\]/);

assert.match(page, /adminDriverJobStatusMatchesLoadedBooking/);
assert.match(page, /adminDriverOtsPhotoProofMatchesLoadedBooking/);
assert.match(page, /adminDriverJobStatusReadoutMessage/);
assert.match(page, /adminDriverOtsPhotoProofReadoutMessage/);
assert.match(
  page,
  /if \(currentBookingReference !== bookingReference\) \{\s*return;\s*\}/,
);
assert.ok(
  page.match(/if \(currentBookingReference !== bookingReference\) \{\s*return;\s*\}/g)?.length >= 4,
  "Both status/photo refresh success and error paths must reject stale booking responses.",
);

console.log("Admin driver job cross-booking state guard passed");
