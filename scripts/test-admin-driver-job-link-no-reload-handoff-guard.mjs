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
