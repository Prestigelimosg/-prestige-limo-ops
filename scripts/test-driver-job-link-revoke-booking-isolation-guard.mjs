import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPage = await readFile("app/page.tsx", "utf8");
const ledger = await readFile("docs/current-implementation-ledger.md", "utf8");

function sliceBetween(start, end) {
  const startIndex = appPage.indexOf(start);
  const endIndex = appPage.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `missing source slice: ${start}`);
  return appPage.slice(startIndex, endIndex);
}

const revokeHandler = sliceBetween("async function revokeDriverJobLink()", "function assignDraftDriver()");

for (const forbidden of [
  "patchBookingStatusReference(",
  '"cancelled"',
  "Booking status changed to Cancelled",
  'loadBookings("Bookings synced.", { silent: true })',
]) {
  assert.equal(revokeHandler.includes(forbidden), false, `link revoke must not change booking state: ${forbidden}`);
}

assert.ok(
  revokeHandler.includes("Driver job link revoked. Booking status was not changed."),
  "link revoke must state that booking status is preserved",
);

for (const fragment of [
  "driverJobLinkSuccessFeedbackResetMs = 3_000",
  "window.setTimeout",
  "setDriverJobLinkCopyMessage(null)",
  "adminDriverJobLinkState.message",
]) {
  assert.ok(appPage.includes(fragment), `driver link transient feedback guard missing: ${fragment}`);
}

for (const phrase of [
  "Revoking a Driver Job Link now revokes only that access link and never cancels or changes the booking status.",
  "Driver Job Link Created, Copied, and Revoked success feedback resets after three seconds",
]) {
  assert.ok(ledger.includes(phrase), `implementation ledger missing driver link protection: ${phrase}`);
}

console.log("Driver Job Link revoke isolation guard passed.");
