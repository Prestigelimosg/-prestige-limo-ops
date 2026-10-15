import assert from "node:assert/strict";
import ts from "typescript";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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

// One outer disclosure must reveal the existing message without another toggle.
const uiTree = ts.createSourceFile("page.tsx", app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let manualElement;
function findManualElement(node) {
  if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(
    attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(uiTree) === "data-driver-message-disclosure",
  )) manualElement = node;
  ts.forEachChild(node, findManualElement);
}
findManualElement(uiTree);
assert.ok(manualElement, "Existing outer manual-copy disclosure is required");
const manualJsx = manualElement.getText(uiTree);
const renderManual = new Function("React", "env", ts.transpileModule(
  `with (env) { return (${manualJsx}); }`,
  {compilerOptions:{target:ts.ScriptTarget.ES2022, jsx:ts.JsxEmit.React}},
).outputText);
const syntheticText = "AVF MNG\n17 Oct Sat, 0035hrs\n\nQA719 > Example Hotel\n\nPassenger: Example Passenger\nPax: 1";
const noAction = () => { throw new Error("Rendering must not invoke actions"); };
const uiEnv = {
  driverDispatchCopyEditState:{isEditing:false,draftText:"Reviewed draft"},
  driverDispatchFeedback:null, driverDispatchEdited:false, driverDispatchCopied:false,
  driverDispatchCopyText:syntheticText,
  actionFeedbackButtonClass:()=>"",statusClass:()=>"",
  saveCopyEdit:noAction,cancelCopyEdit:noAction,startCopyEdit:noAction,
  copyDraftDriverDispatch:noAction,updateCopyEditDraft:noAction,
};
const normalHtml = renderToStaticMarkup(renderManual(React,uiEnv));
assert.equal((normalHtml.match(/<details[ >]/g)||[]).length,1,"One click must reveal the message: no nested disclosure");
assert.equal((normalHtml.match(/<summary[ >]/g)||[]).length,1,"Only the outer section may toggle");
assert.match(normalHtml,/data-copy-preview="driverDispatch"/);
assert.ok(normalHtml.includes("QA719 &gt; Example Hotel"));
for (const marker of ['data-copy-edit-button="driverDispatch"','data-copy-copy-button="driverDispatch"']) assert.ok(normalHtml.includes(marker));
const editingHtml=renderToStaticMarkup(renderManual(React,{...uiEnv,driverDispatchCopyEditState:{isEditing:true,draftText:"Reviewed draft"}}));
assert.match(editingHtml,/data-copy-edit-textarea="driverDispatch"/);
assert.match(editingHtml,/Reviewed draft/);
assert.doesNotMatch(editingHtml,/data-copy-preview="driverDispatch"/);
for (const marker of ['data-copy-save-edit="driverDispatch"','data-copy-cancel-edit="driverDispatch"']) assert.ok(editingHtml.includes(marker));
if (process.env.MANUAL_COPY_PREVIEW_HTML) {
  await writeFile(process.env.MANUAL_COPY_PREVIEW_HTML, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local manual copy preview</title><link rel="stylesheet" href="/preview.css"><main style="max-width:900px;margin:16px auto">${normalHtml}</main>`);
}
console.log("Actual manual-copy JSX: one disclosure, retained message/Edit/Copy, and Edit Save/Cancel branch passed");

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

// Execute real flight-location helpers, not a simplified formatter stub.
const compile = source => ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function functionSource(source, name) {
  const tree = ts.createSourceFile("source.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let result;
  function visit(node) {
    if(ts.isFunctionDeclaration(node) && node.name?.text === name) result=node.getText(tree).replace(/^export /, "");
    ts.forEachChild(node,visit);
  }
  visit(tree);
  assert.ok(result, `Missing actual function ${name}`);
  return result;
}
const pricing = await readFile("lib/pricing.ts", "utf8");
const flightHelpers = compile([
  functionSource(pricing,"normalizeBookingType"),
  ...["bookingTypeIsDeparture","bookingTypeIsArrival","appendFlightDetailToLocation","dispatchCopyLocationFlightParts"].map(name=>functionSource(app,name)),
].join("\n"));
globalThis.fetch = () => { throw new Error("No network allowed in manual-copy guard"); };

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
  ${flightHelpers}
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
for (const line of ["Contact: 00000000","Plate: EXAMPLE","Vehicle: V-Class","Example pickup > Example stop > QA123","Child seat: 1 booster","Payout: $65"]) assert.ok(assignedCopy.includes(line),line);
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

// Service-specific route regressions: no change to booking data or other copy targets.
const arrival = {...copyBooking,bookingType:"MNG",pickup:"Changi Airport",dropoff:"Example hotel",flight:"QA719"};
const arrivalBefore = JSON.stringify(arrival);
assert.ok(formatCopy(arrival,{}).includes("\n\nQA719 > Example hotel\n\n"));
assert.equal(JSON.stringify(arrival),arrivalBefore,"Formatting must not mutate booking fields");
assert.ok(formatCopy({...arrival,extraStopLocation:"Stop one > Stop two"},{}).includes("QA719 > Stop one > Stop two > Example hotel"));
assert.ok(formatCopy({...copyBooking,flight:"QA207"},{}).includes("Example pickup > QA207"));
for (const [type,expected] of [["MNG","Changi Airport > Example hotel"],["DEP","Changi Airport > Example hotel"]]) {
  assert.ok(formatCopy({...arrival,bookingType:type,flight:" "},{}).includes(expected),"Missing flight retains existing location fallback");
}
for (const type of ["TRF","DSP"]) {
  const result=formatCopy({...arrival,bookingType:type,extraStopLocation:"Stop"},{});
  assert.ok(result.includes("Flight: QA719\nChangi Airport > Stop > Example hotel"),type+" unchanged");
}
assert.ok(formatCopy({...arrival,bookingType:"Arrival"},{}).includes("QA719 > Example hotel"));
assert.ok(formatCopy({...copyBooking,bookingType:"Departure",flight:"QA207"},{}).includes("Example pickup > QA207"));
const mismatch = {...arrival,bookingType:"DEP"};
assert.ok(formatCopy(mismatch,{}).includes("Changi Airport > QA719"));
assert.equal(mismatch.bookingType,"DEP","Never guess or change stored service from airport text");
for (const result of [formatCopy(arrival,{}),assignedCopy]) {
  assert.doesNotMatch(result,/\(Flight:/,"Airport endpoint is compact only in this manual target");
}

// Use the existing selector/edit/copy callbacks; the preview and clipboard share it.
const env = {
  generatedDispatchCopyMessages:{driverDispatch:formatCopy(arrival,{})}, dispatchCopyResetKey:"BOOKING-A",
  copyEditStates:{driverDispatch:{sourceKey:"",generatedText:"",editedText:null,draftText:"",isEditing:false}},
  loadedBookingId:"BOOKING-A", dispatchCopyLabels:{driverDispatch:"Driver dispatch"},
  writes:[], setCopyFeedback:()=>{},
};
env.setCopyEditStates = update => {env.copyEditStates=update(env.copyEditStates);};
env.navigator={clipboard:{writeText:async text=>env.writes.push(text)}};
const callbacks=compile(["getDispatchCopyText","startCopyEdit","updateCopyEditDraft","saveCopyEdit","cancelCopyEdit","copyDispatchCopy","copyDraftDriverDispatch"].map(name=>functionSource(app,name)).join("\n"));
const actions = new Function("env",`with(env){${callbacks};return {getDispatchCopyText,startCopyEdit,updateCopyEditDraft,saveCopyEdit,cancelCopyEdit,copyDraftDriverDispatch};}`)(env);
await actions.copyDraftDriverDispatch();
await actions.copyDraftDriverDispatch();
assert.deepEqual(env.writes,[env.generatedDispatchCopyMessages.driverDispatch,env.generatedDispatchCopyMessages.driverDispatch]);
actions.startCopyEdit("driverDispatch");
actions.updateCopyEditDraft("driverDispatch","Manual reviewed route");
actions.saveCopyEdit("driverDispatch");
await actions.copyDraftDriverDispatch();
assert.equal(env.writes.at(-1),"Manual reviewed route");
actions.cancelCopyEdit("driverDispatch");
assert.equal(actions.getDispatchCopyText("driverDispatch"),env.generatedDispatchCopyMessages.driverDispatch);
env.generatedDispatchCopyMessages.driverDispatch=formatCopy({...copyBooking,flight:"QA207"},{});
env.dispatchCopyResetKey="BOOKING-B";
await actions.copyDraftDriverDispatch();
assert.equal(env.writes.at(-1),env.generatedDispatchCopyMessages.driverDispatch,"New booking copies current generated message");
assert.ok(messagePanel.includes('{driverDispatchCopyText}'),"Existing preview consumes the same selected text");
console.log("Manual airport routes, fallbacks, stops, repeated Copy, Edit/Cancel and booking switch passed; no network or booking writes.");

// Preserve shared locations, Customer Copy, Driver Job Link, Email and edit/clipboard handlers.
const preservedBlocks = [["function bookingTypeIsDeparture", "function hasParsedValue", "8d869fb3fe7747c7c35c44d38f5260fbd918a4b084665f0c50bea4e60a19c5cc"], ["  const customerCopyCard = useMemo", "  const draftDriverDispatchCard", "799d950e8b4cef6176a4b7199cd13c3a1668093ea60267617323b3faba13c464"], ["  const driverJobLinkMessage = useMemo", "  const generatedDispatchCopyMessages", "6c3721207adaff6a59cdc0ca0d09e4d50199810c9d0b12c03a19eb3cf1891151"], ["  function getDispatchCopyText", "  async function copyJobCard", "1c163c5a3b5a56dcc2042bad933e116eb3399cb946dec59104aaa76a5562cc79"], ["  async function sendAdminCustomerDriverDetailsEmail", "\n  async function ", "b342def3ed38a82fc7a6697466100c0f6272ec7aa96c98e94d0f077eb075a8cf"]];
for (const [start,end,hash] of preservedBlocks) {
  const i=app.indexOf(start), j=app.indexOf(end,i+start.length);
  assert.ok(i>=0 && j>i);
  assert.equal(createHash("sha256").update(app.slice(i,j)).digest("hex"),hash,`Unchanged boundary: ${start}`);
}
