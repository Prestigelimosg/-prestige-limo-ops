import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const ledger = fs.readFileSync(
  new URL("../docs/current-implementation-ledger.md", import.meta.url),
  "utf8",
);

function functionSource(functionName) {
  const sourceFile = ts.createSourceFile(
    "app/page.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let match = null;

  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === functionName
    ) {
      match = node;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  assert.ok(match, `missing function: ${functionName}`);
  return match.getText(sourceFile);
}

function compilePostSuccessFormAction() {
  const runtimeSource = [
    functionSource("adminDispatchVerifiedIdentityId"),
    functionSource("adminSaveCrmPostSuccessFormAction"),
    "module.exports = { adminSaveCrmPostSuccessFormAction };",
  ].join("\n");
  const compiled = ts.transpileModule(runtimeSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const runtimeModule = { exports: {} };
  new Function("module", "exports", compiled)(runtimeModule, runtimeModule.exports);
  return runtimeModule.exports.adminSaveCrmPostSuccessFormAction;
}

function between(start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const saveBlock = between(
  "async function saveBooking(",
  "function bookingRecordReferenceCandidates",
);
const updateBlock = between(
  "async function updateAppliedAdminBookingOperationalSnapshot(",
  "function getDispatchCopyText",
);
const primaryActionBlock = between(
  "function handleJobCardPrimaryBookingAction() {",
  "const jobCardFeedback",
);
const postSuccessFormAction = compilePostSuccessFormAction();

// Execute the existing saved-record handoff, including its real mapper. Display-only
// dependencies are stubbed; no database, Calendar or notification action is called.
function compileSavedRecordHandoff() {
  const runtimeSource = [
    functionSource("adminDispatchVerifiedIdentityId"),
    functionSource("adminBookingPersistenceRecordToCalendarBookingRecord"),
    functionSource("retainSavedBookingForDriverJobLinkHandoff"),
    "module.exports = { retainSavedBookingForDriverJobLinkHandoff };",
  ].join("\n");
  const compiled = ts.transpileModule(runtimeSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let loaded;
  const display = {
    clean: (value) => String(value ?? "").trim(),
    adminSnapshotSortedRoutePoints: (record) => record.route_points || [],
    adminBookingPersistenceRoutePointLocation: (point) => point?.location_text || "",
    adminBookingPersistenceRouteSummary: (record) => record.route_summary || "",
    adminBookingPersistencePickupDateTime: (record) => record.pickup_at || "",
    safeAdminBookingPersistenceCount: (value) => Number(value) || null,
    adminBookingPersistenceCustomerDisplayName: (record) => record.customer_display_name || "",
    billingIdentityBaseAccount: (value) => value,
    adminBookingPersistenceServiceType: (record) => record.service_type || "",
    adminSnapshotFlightReference: () => "",
    adminBookingPersistencePassengerDisplayName: (record) => record.passenger_name || "",
    formatPickupTimeFromTimestamp: () => "1200hrs",
    adminBookingPersistencePrimaryStatus: () => "Draft",
    loadSelectedBooking: (record, options) => { loaded = { record, options }; },
  };
  const runtimeModule = { exports: {} };
  new Function("module", "exports", ...Object.keys(display), compiled)(
    runtimeModule, runtimeModule.exports, ...Object.values(display),
  );
  return (record) => {
    runtimeModule.exports.retainSavedBookingForDriverJobLinkHandoff(record);
    return loaded;
  };
}

const handoffSavedRecord = compileSavedRecordHandoff();
for (const [inputId, expectedId] of [[401, 401], ["402", 402], [null, null], ["", null], [0, null], ["invalid", null]]) {
  const saved = {
    booking_reference: "LOCAL-AMENDMENT-REVIEW",
    driver_id: inputId,
    driver_name: "Synthetic Driver",
    driver_contact: "80000000",
    driver_plate_number: "QA1234",
    service_type: "TRF",
    pickup_at: "2030-01-01T04:00:00Z",
  };
  for (const service of ["TRF", "DSP", "DEP"]) {
    saved.service_type = service;
    const result = handoffSavedRecord(saved);
    assert.equal(result.record.driver_id, expectedId,
      `saved ${service} handoff must retain the verified driver ID, including repeated amendments`);
    assert.equal(result.record.booking_reference, saved.booking_reference);
    assert.equal(result.record.booking_type, service);
    assert.equal(result.record.driver_name, saved.driver_name);
    assert.equal(result.record.driver_contact, saved.driver_contact);
    assert.equal(result.record.driver_plate_number, saved.driver_plate_number);
    assert.equal(result.options.adminBookingRecordOverride, saved);
    assert.equal(result.options.focusDriverJobLink, true);
    assert.equal(result.options.bookingFormOverride, undefined);
  }
}

assert.match(functionSource("bookingRecordToForm"),
  /bookingRecordToOperationalFormFields\(bookingRecord\)/,
  "the existing form must consume the retained operational fields");
assert.match(functionSource("bookingRecordToOperationalFormFields"),
  /driverId: bookingRecord\.driver_id \? String\(bookingRecord\.driver_id\) : ""/,
  "the retained record must supply the existing form's verified driver selection");
assert.match(functionSource("buildAdminBookingPersistencePayload"),
  /driver_id: adminDispatchVerifiedIdentityId\(bookingValue\.driverId\)/,
  "later amendments must carry that selection through the existing booking payload");

for (const testCase of [
  {
    expected: "reset",
    input: {
      calendarSyncFailed: false,
      calendarSyncSkipped: false,
      customerReturnUrl: "",
      installedAdminNative: true,
      primarySavedDriverId: 9124,
      savedBookingCount: 1,
    },
    label: "native assigned booking",
  },
  {
    expected: "reset",
    input: {
      calendarSyncFailed: false,
      calendarSyncSkipped: false,
      customerReturnUrl: "",
      installedAdminNative: true,
      primarySavedDriverId: null,
      savedBookingCount: 1,
    },
    label: "native unassigned booking",
  },
  {
    expected: "retain",
    input: {
      calendarSyncFailed: false,
      calendarSyncSkipped: false,
      customerReturnUrl: "",
      installedAdminNative: false,
      primarySavedDriverId: "9124",
      savedBookingCount: 1,
    },
    label: "web assigned booking",
  },
  {
    expected: "reset",
    input: {
      calendarSyncFailed: false,
      calendarSyncSkipped: false,
      customerReturnUrl: "",
      installedAdminNative: false,
      primarySavedDriverId: null,
      savedBookingCount: 1,
    },
    label: "web unassigned booking",
  },
  {
    expected: "reset",
    input: {
      calendarSyncFailed: false,
      calendarSyncSkipped: false,
      customerReturnUrl: "",
      installedAdminNative: false,
      primarySavedDriverId: 9124,
      savedBookingCount: 2,
    },
    label: "linked return bookings",
  },
  {
    expected: "reset",
    input: {
      calendarSyncFailed: false,
      calendarSyncSkipped: false,
      customerReturnUrl: "/customers/192",
      installedAdminNative: false,
      primarySavedDriverId: 9124,
      savedBookingCount: 1,
    },
    label: "customer-folder return",
  },
  {
    expected: "intact",
    input: {
      calendarSyncFailed: true,
      calendarSyncSkipped: false,
      customerReturnUrl: "",
      installedAdminNative: true,
      primarySavedDriverId: 9124,
      savedBookingCount: 1,
    },
    label: "Calendar failure",
  },
  {
    expected: "reset",
    input: {
      calendarSyncFailed: false,
      calendarSyncSkipped: true,
      customerReturnUrl: "",
      installedAdminNative: false,
      primarySavedDriverId: 9124,
      savedBookingCount: 1,
    },
    label: "Calendar skipped",
  },
]) {
  assert.equal(postSuccessFormAction(testCase.input), testCase.expected, testCase.label);
}

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

assert.doesNotMatch(
  updateBlock,
  /adminSaveCrmPostSuccessFormAction|postSuccessFormAction|adminNativePushIsSupported/,
  "Update + Cal must remain outside the native Save + CRM reset decision",
);
assert.match(
  saveBlock,
  /fetch\("\/api\/admin-bookings",\s*\{[\s\S]*?method:\s*"POST"/,
  "new Save + CRM intent must keep the established admin-bookings POST lane",
);
assert.match(
  updateBlock,
  /fetch\("\/api\/admin-bookings",\s*\{[\s\S]*?method:\s*"PATCH"/,
  "loaded booking identity must keep the established Update + Cal PATCH lane",
);
assert.match(
  primaryActionBlock,
  /if\s*\(activeAppliedBookingReference\)\s*\{\s*void updateAppliedAdminBookingOperationalSnapshot\(\);\s*return;\s*\}/,
  "loaded booking identity must route to Update + Cal and return before any create call",
);
assert.match(
  primaryActionBlock,
  /if\s*\(bookingUpdateIdentityNeedsReload\s*\|\|\s*!adminBookingCreateIntentRef\.current\)[\s\S]*?no new booking was created[\s\S]*?return;[\s\S]*?void saveBooking\(\);/,
  "lost update identity must fail closed before the new-booking Save + CRM route",
);
assert.equal(
  (primaryActionBlock.match(/void saveBooking\(\);/g) || []).length,
  1,
  "one explicit new-booking create intent must route to exactly one Save + CRM call",
);

for (const fragment of [
  "savedBookingCount: savedBookings.length",
  "customerReturnUrl,",
  "adminNativePushIsSupported()",
  "primarySavedBooking.driver_id",
  "calendarSyncSkipped",
]) {
  assert.match(
    saveBlock + updateBlock,
    new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `no-reload handoff must preserve ${fragment}`,
  );
}

assert.match(
  saveBlock,
  /lastSuccessfulBookingSaveRef\.current\s*=\s*\{[\s\S]*?await completeActiveAdminEmailAiReviewAfterSave\(\);[\s\S]*?calendarSyncResults[\s\S]*?adminSaveCrmPostSuccessFormAction/,
  "Save + CRM must retain duplicate protection, close Email AI, and finish Calendar results before choosing the post-success form action",
);
assert.match(
  saveBlock,
  /adminSaveCrmPostSuccessFormAction[\s\S]*?retainSavedBookingForDriverJobLinkHandoff\(primarySavedBooking\)[\s\S]*?resetAdminBookingFormAfterSuccessfulPersistence\(\)[\s\S]*?setMessage\(saveMessage\)/,
  "Save + CRM must retain or reset through the existing helpers before publishing the final saved-reference message",
);
assert.doesNotMatch(
  saveBlock,
  /createAdminDriverJobLink|createDriverJobLink|\/api\/admin-driver-job-links[^\s\S]*method:\s*"POST"/,
  "Save + CRM must not create a Driver Job Link automatically",
);

for (const fragment of [
  "### Admin Native Save + CRM Post-Success Form Reset Repair (source checkpoint 2026-08-26)",
  "A Calendar failure leaves the completed form intact for recovery.",
  "The installed Admin native bridge always uses that reset",
  "authoritative returned `driver_id` is a valid verified identity",
  "Update + Cal, invoice, billing, payment and every provider/data boundary are unchanged",
]) {
  assert.match(
    ledger,
    new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `implementation ledger must retain ${fragment}`,
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
