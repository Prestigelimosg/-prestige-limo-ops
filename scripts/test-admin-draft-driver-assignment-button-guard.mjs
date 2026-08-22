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
  "async function assignDraftDriver()",
  "async function copyDraftDriverDispatch()",
);
const updateAppliedBookingFunction = sliceBetween(
  appPage,
  "async function updateAppliedAdminBookingOperationalSnapshot(",
  "function getDispatchCopyText",
);

assert.match(appPage, /function draftDriverAssignmentSignature\([\s\S]*?driverVehicleModel/);
assert.match(appPage, /const \[appliedDraftDriverAssignmentSignature, setAppliedDraftDriverAssignmentSignature\] = useState\(""\);/);
assert.match(appPage, /const draftDriverAssignmentApplied = Boolean\(/);
assert.match(appPage, /function applyDriverToBooking\(driverId: string\)[\s\S]*?setAppliedDraftDriverAssignmentSignature\(""\);/);
assert.match(assignDraftDriverFunction, /if \(draftDriverAssignmentApplied\)[\s\S]*?setAppliedDraftDriverAssignmentSignature\(""\);/);
assert.match(assignDraftDriverFunction, /setAppliedDraftDriverAssignmentSignature\(currentDraftDriverAssignmentSignature\);/);
assert.match(
  appPage,
  /function adminBookingFormMatchesLoadedBaselineOutsideDriverAssignment\([\s\S]*?driverId[\s\S]*?driverName[\s\S]*?driverContact[\s\S]*?driverPlate[\s\S]*?driverVehicleModel/,
  "loaded assignment save must fail closed unless every field outside the exact safe driver assignment matches its loaded baseline",
);
assert.match(
  appPage,
  /function adminBookingFormSyncSignature\(booking: BookingForm\)[\s\S]*?Object\.entries\(booking\)[\s\S]*?sort/,
  "the loaded baseline signature must cover every BookingForm field rather than a hand-picked mutable subset",
);
assert.match(
  appPage,
  /const loadedDriverAssignmentDiffersFromBaseline = Boolean\([\s\S]*?currentDraftDriverAssignmentSignature !==[\s\S]*?draftDriverAssignmentSignature\(loadedAdminBookingBaselineRef\.current\.form\)[\s\S]*?const saveLoadedDriverAssignmentAvailable = Boolean\([\s\S]*?loadedDriverAssignmentDiffersFromBaseline/,
  "an unchanged already-saved driver assignment must not expose the assignment-save action or perform a no-op PATCH",
);
assert.match(
  assignDraftDriverFunction,
  /saveLoadedDriverAssignmentAvailable[\s\S]*?updateAppliedAdminBookingOperationalSnapshot\(\{[\s\S]*?assignmentOnly: true[\s\S]*?\}\)/,
  "one loaded saved booking must reuse the existing update lane for its exact assignment-only save",
);
assert.match(
  updateAppliedBookingFunction,
  /assignmentOnly[\s\S]*?verifyLoadedAdminBookingVersionBeforeUpdate[\s\S]*?expected_updated_at: expectedUpdatedAt/,
  "assignment-only persistence must retain the established expected_updated_at concurrency gate",
);
assert.match(
  updateAppliedBookingFunction,
  /assignmentOnly[\s\S]*?adminBookingFormMatchesLoadedBaselineOutsideDriverAssignment/,
  "assignment-only persistence must reject any non-driver draft amendment",
);
assert.match(
  updateAppliedBookingFunction,
  /assignmentOnly[\s\S]*?appliedAdminBookingSnapshotIsPendingCustomerRequest/,
  "assignment-only persistence must preserve the complete existing pending-customer-request predicate, including queued notification evidence",
);
assert.match(
  updateAppliedBookingFunction,
  /assignmentOnly[\s\S]*?driverAssignmentDisplayDrivers\.find/,
  "assignment-only persistence must require the exact verified Driver Database profile",
);
assert.match(
  updateAppliedBookingFunction,
  /if \(assignmentOnly\)[\s\S]*?retainSavedBookingForDriverJobLinkHandoff\(updatedBooking,[\s\S]*?return;[\s\S]*?autoSyncSavedBookingGoogleCalendar\(updatedBooking\)/,
  "assignment-only persistence must retain and focus the saved booking before the later normal amendment Calendar branch",
);
const assignmentOnlySuccessBranch = sliceBetween(
  updateAppliedBookingFunction,
  "if (assignmentOnly)",
  "const calendarSyncResult = await autoSyncSavedBookingGoogleCalendar(updatedBooking);",
);
assert.doesNotMatch(
  assignmentOnlySuccessBranch,
  /autoSyncSavedBookingGoogleCalendar|createGoogleCalendarSyncAgenda|adminBookingCalendarGoogleSyncApiPath/,
  "assignment-only persistence must not perform the redundant middle Operations Calendar upsert",
);
assert.doesNotMatch(
  assignDraftDriverFunction,
  /\/api\/admin-saved-booking-driver-assignments/,
  "Dispatch Type 2 must not cross into the separate Dashboard payout/status assignment route",
);
assert.match(assignedDriverSection, /aria-pressed=\{draftDriverAssignmentApplied\}/);
assert.match(assignedDriverSection, /data-admin-draft-driver-assignment-state=/);
assert.match(assignedDriverSection, /Applied \/ Cancel to Revise/);
assert.match(
  assignedDriverSection,
  /saveLoadedDriverAssignmentAvailable[\s\S]*?Save Driver Assignment[\s\S]*?Apply Driver to Draft/,
  "the existing control must truthfully distinguish saved Type 2 assignment from an unsaved draft assignment",
);

console.log("Admin draft driver assignment button guard passed.");
