import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile("app/page.tsx", "utf8");
const messageStart = app.indexOf('data-dispatch-workflow-step="driver-dispatch-copy"');
const linkStart = app.indexOf('data-dispatch-workflow-step="driver-job-link"');
const panelEnd = app.indexOf('data-dispatch-workflow-step="admin-lower-status"', linkStart);

assert.notEqual(messageStart, -1, "Missing existing driver message lane.");
assert.notEqual(linkStart, -1, "Missing existing Driver Job Link lane.");
assert.notEqual(panelEnd, -1, "Missing Driver Job Link boundary.");

const messagePanel = app.slice(messageStart, linkStart);
const linkPanel = app.slice(linkStart, panelEnd);

for (const fragment of [
  'data-driver-message-disclosure="true"',
  "<summary",
  "Manual WhatsApp Copy — Optional",
  "Copy the assigned-driver update, then paste it into WhatsApp manually.",
  'data-driver-manual-copy-heading="true"',
  'className="text-sm font-semibold leading-5"',
  'data-driver-manual-copy-actions="true"',
  "lg:absolute lg:right-2 lg:top-2",
  'data-driver-manual-copy-feedback-row="true"',
  "min-h-9",
  'data-dispatch-compact-panel="driver-dispatch-copy-preview"',
  "text-[11px] font-semibold leading-5",
  'data-copy-edit-button="driverDispatch"',
  'data-copy-copy-button="driverDispatch"',
]) {
  assert.ok(messagePanel.includes(fragment), `Missing manual WhatsApp copy fragment: ${fragment}`);
}
assert.ok(!messagePanel.includes(">Driver Dispatch<"), "Visible Driver Dispatch title must be renamed.");
assert.ok(!messagePanel.includes('className="text-lg font-semibold">Manual WhatsApp Copy'), "Manual WhatsApp Copy heading must stay compact.");
assert.ok(!messagePanel.includes('bg-white p-3"\n              data-dispatch-workflow-step="driver-dispatch-copy"'), "Manual WhatsApp Copy card must not regain its taller padding.");
assert.ok(
  messagePanel.indexOf('data-driver-manual-copy-actions="true"') < messagePanel.indexOf('data-driver-manual-copy-feedback-row="true"'),
  "Clipboard error feedback must stay outside the desktop-positioned action group.",
);
assert.ok(!messagePanel.includes("Send Driver In-App"), "Dispatch must not retain a second in-app driver send action.");
assert.ok(!messagePanel.includes("Driver In-App status"), "Dispatch must not retain a second in-app driver status panel.");

for (const fragment of [
  'data-driver-job-link-booking-details="true"',
  "clean(dispatchReleaseWorkflowBookingReference)",
  'Booking {dispatchPublicBookingReference || "Reference unavailable"}',
  "Passenger",
  "Pickup",
  "Route",
  "Assigned driver",
  'data-driver-job-link-preview-disclosure="true"',
  "open",
  'data-admin-driver-reports-disclosure="true"',
  "Driver Reports",
]) {
  assert.ok(linkPanel.includes(fragment), `Missing human Driver Job Link fragment: ${fragment}`);
}

assert.ok(
  !linkPanel.includes("loaded here. Next: Create Link"),
  "Reference-only machine instruction must be replaced with booking details.",
);

console.log("Manual WhatsApp Copy + human Driver Job Link UI guard passed");

const generatorStart = app.indexOf("const draftDriverDispatchCard = useMemo(() => {");
const generatorEnd = app.indexOf("const driverJobLinkMessage = useMemo", generatorStart);
assert.ok(generatorStart >= 0 && generatorEnd > generatorStart);
const generator = app.slice(generatorStart, generatorEnd);
assert.ok(!generator.includes('["DRIVER DISPATCH"]'), "Manual copy must omit the heading by default");
assert.ok(!generator.includes('`Driver: ${clean(booking.driverName) || "Driver TBC"}`'), "Manual copy must omit the driver-name line for assigned and unassigned jobs");
const readiness = app.slice(app.indexOf("const dispatchReleaseDriverDispatchReady ="),app.indexOf("const dispatchReleaseDriverJobLinkReady ="));
assert.ok(!readiness.includes('startsWith("DRIVER DISPATCH")'), "Readiness must not require the removed heading");
for(const fragment of ["dispatchReleaseTripComplete", "dispatchReleaseDriverReady", "!dispatchReleaseDriverDispatchHasPlaceholder", "!dispatchReleaseDriverDispatchHasFinanceLine"]) {
  assert.ok(readiness.includes(fragment), "Retain readiness guard: " + fragment);
}

// Run the existing formatter with synthetic jobs; other copy generators are not replaced.
const generatorBody = generator.slice(generator.indexOf("() => {") + 7, generator.lastIndexOf("  }, ["));
const formatCopy = new Function("booking", "options", `
  const clean = value => String(value ?? "").trim();
  const cleanReferenceText = clean;
  const safeDriverVehicleModelDisplay = clean;
  const driverAssignmentDisplayDrivers = options.drivers || [];
  const activeAdminDriverJobLink = null;
  const dispatchReleaseWorkflowBookingReference = "";
  const draftPricing = {driverPayout:65};
  const formatChildSeatNote = () => "Child seat: 1 booster";
  const dispatchCopyLocationFlightParts = b => ({pickup:b.pickup,dropoff:b.dropoff,standaloneFlightLine:b.flight ? "Flight: " + b.flight : ""});
  const formatDate = value => value || "Date TBC";
  const formatPickupTime = value => value ? "1800hrs" : "Time TBC";
  const isDspItinerary = options.dsp || false;
  const itineraryDisplayStops = options.stops || [];
  ${generatorBody}
`);
const copyBooking = {date:"2026-09-14",time:"1800",vehicle:"VVV",bookingType:"DEP",pickup:"Example pickup",dropoff:"Example airport",name:"Example passenger",pax:2};
const basicCopy = formatCopy(copyBooking,{});
assert.equal(basicCopy,"VVV DEP\n14 Sept Mon, 1800hrs\n\nExample pickup > Example airport\n\nPassenger: Example passenger\nPax: 2");
const assignedCopy = formatCopy({...copyBooking,driverName:"Example chauffeur",driverContact:"00000000",driverPlate:"EXAMPLE",driverVehicleModel:"V-Class",flight:"QA123",extraStopLocation:"Example stop",childSeatRequired:"yes",driverIncludePayout:true},{});
assert.doesNotMatch(assignedCopy,/DRIVER DISPATCH|^Driver:/m);
for (const line of ["Contact: 00000000","Plate: EXAMPLE","Vehicle: V-Class","Flight: QA123","Example pickup > Example stop > Example airport","Child seat: 1 booster","Payout: $65"]) assert.ok(assignedCopy.includes(line),line);
const dspCopy = formatCopy({...copyBooking,bookingType:"DSP"},{dsp:true,stops:[{time:"1900",location:"Example stop"}]});
assert.match(dspCopy,/Itinerary:\n1900 - Example stop/);
assert.doesNotMatch(dspCopy,/DRIVER DISPATCH|^Driver:/m);
const checkReady = new Function("driverDispatchCopyText", "booking", "dispatchReleaseTripComplete", "dispatchReleaseDriverReady", `
 const clean = value => String(value ?? "").trim();
 const dispatchReleaseDriverDispatchHasPlaceholder = /\\bTBC\\b|Pickup > Drop-off|Date TBC|Time TBC/i.test(driverDispatchCopyText);
 const dispatchReleaseDriverDispatchHasFinanceLine = /payout\\s*:/i.test(driverDispatchCopyText);
 ${readiness}
 return dispatchReleaseDriverDispatchReady;
`);
assert.equal(checkReady(basicCopy,copyBooking,true,true),true,"New default format can be ready");
assert.equal(checkReady(basicCopy+"\nManual note",copyBooking,true,true),true,"Manual edits remain supported");
for (const invalid of ["","DRIVER DISPATCH","Unrelated note",basicCopy.replace("VVV DEP","AVF DEP"),basicCopy+"\nTBC",basicCopy+"\nPayout: $65"]) assert.equal(checkReady(invalid,copyBooking,true,true),false);
assert.equal(checkReady(basicCopy,copyBooking,false,true),false);
assert.equal(checkReady(basicCopy,copyBooking,true,false),false,"Removing driver text must not bypass assignment readiness");
console.log("Default manual copy and dependent readiness runtime checks passed");

assert.match(formatCopy({...copyBooking,date:"2025-09-14"},{}),/14 Sept Sun, 1800hrs/);
assert.match(formatCopy({...copyBooking,date:"2026-09-13"},{}),/13 Sept Sun, 1800hrs/);
assert.match(formatCopy({...copyBooking,date:"2026-01-01"},{}),/01 Jan Thu, 1800hrs/);
assert.match(formatCopy({...copyBooking,date:"2028-02-29"},{}),/29 Feb Tue, 1800hrs/);
assert.match(formatCopy({...copyBooking,date:"",time:""},{}),/Date TBC, Time TBC/);
assert.match(formatCopy({...copyBooking,date:"invalid"},{}),/invalid, 1800hrs/);
console.log("Manual copy weekday is derived from the booking date; missing and invalid dates preserve fallback");
