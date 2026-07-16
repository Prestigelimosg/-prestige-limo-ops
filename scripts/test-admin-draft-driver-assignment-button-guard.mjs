import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);

  return source.slice(start, end);
}

const appPage = await readFile("app/page.tsx", "utf8");
const assignedDriverSection = sliceBetween(
  appPage,
  'data-dispatch-workflow-step="driver-assignment"',
  "</section>",
);
const assignDraftDriverFunction = sliceBetween(
  appPage,
  "function assignDraftDriver()",
  "async function copyDraftDriverDispatch()",
);

assert.match(appPage, /function draftDriverAssignmentSignature\([\s\S]*?driverVehicleModel/);
assert.match(appPage, /const \[appliedDraftDriverAssignmentSignature, setAppliedDraftDriverAssignmentSignature\] = useState\(""\);/);
assert.match(appPage, /const draftDriverAssignmentApplied = Boolean\(/);
assert.match(appPage, /function applyDriverToBooking\(driverId: string\)[\s\S]*?setAppliedDraftDriverAssignmentSignature\(""\);/);
assert.match(assignDraftDriverFunction, /if \(draftDriverAssignmentApplied\)[\s\S]*?setAppliedDraftDriverAssignmentSignature\(""\);/);
assert.match(assignDraftDriverFunction, /setAppliedDraftDriverAssignmentSignature\(currentDraftDriverAssignmentSignature\);/);
assert.doesNotMatch(assignDraftDriverFunction, /fetch\(|autoSyncSavedBookingGoogleCalendar|createGoogleCalendarSyncAgenda|adminSavedBookingsApiPath/);
assert.match(assignedDriverSection, /aria-pressed=\{draftDriverAssignmentApplied\}/);
assert.match(assignedDriverSection, /data-admin-draft-driver-assignment-state=/);
assert.match(assignedDriverSection, /Applied \/ Cancel to Revise/);

console.log("Admin draft driver assignment button guard passed.");
