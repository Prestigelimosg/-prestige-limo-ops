import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const appPagePath = "app/page.tsx";
const appPage = await readFile(appPagePath, "utf8");

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function blockBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing block start ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing block end ${endFragment}`);

  return source.slice(start, end);
}

for (const fragment of [
  "returnTripRequested: string;",
  "returnDate: string;",
  "returnTime: string;",
  "returnFlight: string;",
  "returnPickup: string;",
  "returnDropoff: string;",
  'data-admin-dispatch-return-trip-checkbox="true"',
  'data-admin-dispatch-return-trip-fields="true"',
  "Save + CRM creates outbound and return as two linked booking records.",
]) {
  assertIncludes(appPage, fragment, `admin dispatch return trip UI fragment ${fragment}`);
}

for (const fragment of [
  "function adminDispatchReturnTripRequested",
  "function adminDispatchReturnTripMissingFields",
  "function buildAdminDispatchReturnTripBooking",
  "function buildAdminDispatchReturnTripPersistencePayloads",
  '`${groupReference}-OUT`',
  '`${groupReference}-RET`',
  "Linked return group",
]) {
  assertIncludes(appPage, fragment, `admin dispatch return helper ${fragment}`);
}

const saveBookingBlock = blockBetween(
  appPage,
  "async function saveBooking(",
  "  function bookingRecordReferenceCandidates",
);

for (const fragment of [
  "buildAdminDispatchReturnTripPersistencePayloads",
  "for (const bookingPayload of bookingPayloads)",
  "savedBookings.push",
  'bookingPayload.legLabel === "return"',
  "createdAgencyCustomerId",
  "bookingPayload.payload.booking.customer_id = createdAgencyCustomerId",
  "Booking save failed on linked",
  "for (const savedBooking of savedBookings)",
  "autoSyncSavedBookingGoogleCalendar(savedBooking.record)",
]) {
  assertIncludes(saveBookingBlock, fragment, `Save + CRM return trip save fragment ${fragment}`);
}

const updateBlock = blockBetween(
  appPage,
  "async function updateAppliedAdminBookingOperationalSnapshot(",
  "  function getDispatchCopyText",
);

assert.equal(
  updateBlock.includes("buildAdminDispatchReturnTripPersistencePayloads"),
  false,
  "Update + Cal must remain a single-record update and must not create a return trip pair.",
);

const returnPayloadBuilderBlock = blockBetween(
  appPage,
  "function buildAdminDispatchReturnTripPersistencePayloads",
  "function safeAdminBookingPersistenceCount",
);

assertIncludes(
  returnPayloadBuilderBlock,
  "hotelAgencyFolderCreateOverride: false",
  "return trip must never carry first-agency-folder creation intent",
);


// Execute the existing validation and leg builder; no database or provider calls.
const parsed = ts.createSourceFile(appPagePath, appPage, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["adminDispatchReturnTripRequested", "adminDispatchReturnTripMissingFields", "buildAdminDispatchReturnTripBooking"];
const functions = names.map(name => {
  const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, name);
  return declaration.getText(parsed);
}).join("\n");
const context = { clean: value => String(value ?? "").trim(), fieldLabels: {
  returnDate: "Return pickup date", returnTime: "Return pickup time", returnPickup: "Return pickup", returnDropoff: "Return drop-off",
}};
runInNewContext(ts.transpileModule(functions, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText, context);
const form = { returnTripRequested:"yes", returnDate:"2030-10-03", returnTime:"1030", returnPickup:"QA Hotel", returnDropoff:"", returnFlight:"QA002", date:"2030-10-01", time:"1225", pickup:"QA Airport", dropoff:"QA Hotel", companyId:"42", bookerId:"4201", travelerId:"42001", customerId:"420", bookingType:"MNG", vehicle:"AVF", driverId:"17", priceOverride:"85", dspEndDate:"", dspEndTime:"" };
for (const destination of ["", "   ", "Airport"]) {
  const candidate = {...form, returnDropoff:destination};
  assert.equal(context.adminDispatchReturnTripMissingFields(candidate).length, 0, "Blank return drop-off must use the same saved placeholder as a single trip");
  const leg = context.buildAdminDispatchReturnTripBooking(candidate);
  assert.equal(leg.dropoff, destination.trim());
  assert.equal(leg.pickup, "QA Hotel");
  assert.equal(leg.flight, "QA002");
  assert.equal(leg.date, "2030-10-03");
  assert.equal(leg.time, "1030");
  for (const key of ["companyId","bookerId","travelerId","customerId","bookingType","vehicle","driverId","priceOverride","dspEndDate","dspEndTime"]) assert.equal(leg[key], form[key], key + " must remain unchanged");
  assert.equal(candidate.dropoff, "QA Hotel", "Outbound destination must not change");
}
for (const field of ["returnDate","returnTime","returnPickup"]) {
  const missing = context.adminDispatchReturnTripMissingFields({...form,[field]:" "});
  assert.equal(missing.length, 1);
  assert.equal(missing[0], context.fieldLabels[field]);
}
assert.equal(context.adminDispatchReturnTripMissingFields({...form,returnTripRequested:"no",returnDate:"",returnTime:"",returnPickup:""}).length, 0);
console.log("Return drop-off validation and unchanged leg identity runtime checks passed");
