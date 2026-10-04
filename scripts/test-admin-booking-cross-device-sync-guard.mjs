import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const appPagePath = "app/page.tsx";
const persistencePath = "lib/admin-booking-persistence.ts";
const adapterPath = "lib/admin-booking-supabase-adapter.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const bookingUiBrowserPath = "scripts/test-booking-ui-browser.mjs";
const guardScript = "scripts/test-admin-booking-cross-device-sync-guard.mjs";

function includes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function excludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), false, `${label} must exclude ${fragment}.`);
}

function sectionBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing section start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing section end after ${startFragment}: ${endFragment}`);
  return source.slice(start, end);
}

const [appPage, persistence, adapter, ledger, preactivationSuite, bookingUiBrowser] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(persistencePath, "utf8"),
  readFile(adapterPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(bookingUiBrowserPath, "utf8"),
]);

const parserModule = { exports: {} };
const parserCode = ts.transpileModule(await readFile("lib/booking-parser.ts", "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
new Function("module", "exports", parserCode)(parserModule, parserModule.exports);
const { parseJobCardBookingMessage, mergeParsedBookingState } = parserModule.exports;

// Execute the existing parser/reset/remote-sync functions, not a second draft lane.
const ast = ts.createSourceFile("page.tsx", appPage, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, node.getText(ast));
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, `const ${node.getText(ast)};`);
  ts.forEachChild(node, visit);
}
visit(ast);
const names = ["clean", "cleanReferenceText", "hasParsedValue", "compactParsedBooking", "createInitialBooking",
  "parseBookingMessageForState", "mergeParsedBookingIntoForm", "adminDispatchSelectableBookingForm",
  "adminDispatchSafeServiceTypeValue", "adminDispatchSafeVehicleTypeValue", "normalizeCompanyAccount",
  "getPublicEmailLocalPart", "normaliseEmail", "normaliseEmailDomain", "isPublicEmailDomain",
  "isInternalPrestigeEmailDomain", "isIgnoredAccountEmailDomain", "isInternalPrestigeAccount", "isValidEmail",
  "publicEmailDomains", "internalPrestigeEmailDomains", "internalPrestigeAccountTokens",
  "adminDispatchServiceTypeOptions", "adminDispatchVehicleTypeOptions",
  "clearLoadedBookingSelectionContext", "applyParsedBookingMessage", "handleParseBookingMessage",
  "syncLoadedBookingFromRemoteRecord"];
const runtimeSource = ts.transpileModule(names.map(name => {
  assert.ok(declarations.has(name), name);
  return declarations.get(name);
}).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const nextMessage = "AVF TRF\n7 Oct 2030, 1000hrs\n276 Example Road > Example Hotel\nPassenger: NEXT JOB\n1 pax";
function setup(scenario = "loaded") {
  const oldForm = { name: "OLD JOB", customerId: "163", companyId: "31", bookerId: "24", travelerId: "9",
    driverId: "72", driverName: "Old driver", customerPriceOverride: "999", driverPayoutOverride: "888" };
  const oldReference = scenario === "new" || scenario === "lost-identity" ? "" : "SAVED-POOL-JOB";
  const state = { form: oldForm, message: null, step: "message", resets: 0, writes: 0, parsed: 0 };
  const ref = current => ({ current });
  const context = {
    parseJobCardBookingMessage: text => {
      state.parsed++;
      if (scenario === "parser-error") throw Error("Synthetic parser failure");
      if (scenario === "unrecognized") return {};
      if (scenario === "multiple") return { multipleBookingsDetected: true, extractedBookingsPreview: [{ pickup: "A", dropoff: "B" }] };
      return parseJobCardBookingMessage(text);
    },
    mergeParsedBookingState,
    normalizeBookingType: value => value,
    bookingMessage: scenario === "empty" ? "  " : scenario === "no-details" ? "!!!" : nextMessage,
    activeAdminEmailAiIntakeId: scenario === "missing-email-review" ? "missing" : "",
    adminEmailAiIntakeReadState: { records: [] },
    adminBookingPersistenceAction: scenario === "saving" ? "save" : scenario === "updating" ? "update" : null,
    appliedAdminBookingSnapshotReferenceRef: ref(oldReference), loadedBookingIdRef: ref(oldReference),
    adminBookingCreateIntentRef: ref(scenario === "new"),
    loadedAdminBookingBaselineRef: ref(oldReference ? { bookingReference: oldReference } : null),
    driverJobLinkFormContextRevisionRef: ref(0), updateCalReturnBookingReferenceRef: ref(oldReference),
    pendingSaveCrmBillingIdentityIntentRef: ref({ customerId: 163 }),
    driverJobLinkHandoffFocusAppliedRef: ref(oldReference), adminDispatchCustomerAccountChooserRef: ref(null),
    adminEmailAiCustomerRecommendationRevisionRef: ref(0), activeAdminEmailAiIntakeIdRef: ref(""),
    bookingFormRef: ref(oldForm),
    setBooking: updater => { state.form = typeof updater === "function" ? updater(state.form) : updater; },
    setMessage: message => { state.message = message; },
    setMobileDispatchBookingStep: step => { state.step = step; },
    clearParseArtifacts: () => { state.resets++; },
    setAdminEmailAiCustomerProfileSuggestion: () => {}, setMultiBookingNotice: value => { state.multi = value; },
    setParsedDebugBooking: () => {}, getNeedsReviewWarnings: () => [], lookupNameMemory: async () => null,
    fetch: () => { state.writes++; assert.fail("Create Job Card must not write or publish"); },
  };
  for (const setter of declarations.get("clearLoadedBookingSelectionContext").matchAll(/\b(set[A-Z]\w*)\(/g)) {
    context[setter[1]] ??= () => {};
  }
  runInNewContext(runtimeSource, context);
  return { context, state, oldForm };
}
for (const scenario of ["loaded", "new", "lost-identity"]) {
  const { context, state } = setup(scenario);
  await context.handleParseBookingMessage();
  assert.equal(state.form.pickup, "276 Example Road", `${scenario}: Create Job Card must start the pasted job directly`);
  assert.equal(state.form.name, "NEXT JOB");
  for (const key of ["customerId", "companyId", "bookerId", "travelerId", "driverId", "driverName", "customerPriceOverride", "driverPayoutOverride"]) {
    assert.equal(state.form[key], "", `${scenario}: old saved ${key} must not enter the new job`);
  }
  assert.equal(context.loadedBookingIdRef.current, "");
  assert.equal(context.appliedAdminBookingSnapshotReferenceRef.current, "");
  assert.equal(context.loadedAdminBookingBaselineRef.current, null);
  assert.equal(context.adminBookingCreateIntentRef.current, true);
  assert.equal(context.updateCalReturnBookingReferenceRef.current, "");
  assert.equal(context.pendingSaveCrmBillingIdentityIntentRef.current, null);
  assert.equal(state.step, "details");
  assert.equal(context.syncLoadedBookingFromRemoteRecord({ booking_reference: "SAVED-POOL-JOB" }), "unchanged", "Old pending-job refresh must not overwrite the new draft");
  assert.equal(state.writes, 0);
}
for (const scenario of ["empty", "no-details", "unrecognized", "parser-error", "missing-email-review", "saving", "updating"]) {
  const { context, state, oldForm } = setup(scenario);
  if (scenario === "parser-error") await assert.rejects(context.handleParseBookingMessage(), /Synthetic parser failure/);
  else await context.handleParseBookingMessage();
  assert.equal(state.form, oldForm, `${scenario}: rejected input must preserve the saved form`);
  assert.equal(context.loadedBookingIdRef.current, "SAVED-POOL-JOB");
  assert.equal(context.adminBookingCreateIntentRef.current, false);
  assert.equal(state.step, "message");
  assert.equal(state.resets, 0);
  assert.equal(state.writes, 0);
}
{
  const { context, state } = setup("multiple");
  await context.handleParseBookingMessage();
  assert.equal(state.multi.multipleBookingsDetected, true, "Keep existing extracted-booking review");
  assert.equal(context.loadedBookingIdRef.current, "", "Extracted booking choices must not overwrite the previous saved booking");
  assert.equal(state.form.customerId, "");
  assert.equal(state.step, "message");
}

const clearMessageBlock = sectionBetween(
  appPage,
  'data-dispatcher-clear-message-button="true"',
  "{aiAssistMessage ? (",
);
const parseBookingBlock = sectionBetween(
  appPage,
  "async function applyParsedBookingMessage",
  "async function handleParseBookingMessage",
);
const saveBookingBlock = sectionBetween(
  appPage,
  "async function saveBooking",
  "function bookingRecordReferenceCandidates",
);
const loadBookingsBlock = sectionBetween(
  appPage,
  "async function loadBookings",
  "function rememberHandledCustomerBookingRequest",
);
const syncLoadedBookingBlock = sectionBetween(
  appPage,
  "function syncLoadedBookingFromRemoteRecord",
  "function requestDriverJobLinkVehicleFallbackRefresh",
);
const updateBookingBlock = sectionBetween(
  appPage,
  "async function updateAppliedAdminBookingOperationalSnapshot",
  "function getDispatchCopyText",
);
const verifyBookingVersionBlock = sectionBetween(
  appPage,
  "async function verifyLoadedAdminBookingVersionBeforeUpdate",
  "async function updateAppliedAdminBookingOperationalSnapshot",
);
const applyOperationalSnapshotBlock = sectionBetween(
  appPage,
  "function applyAdminBookingOperationalSnapshot",
  "function applyLatestAdminBookingOperationalSnapshot",
);
const primaryActionBlock = sectionBetween(
  appPage,
  "const activeAppliedBookingReference =",
  "const jobCardFeedback =",
);
excludes(
  clearMessageBlock,
  "clearLoadedBookingSelectionContext();",
  "Clear Message must preserve the exact loaded booking edit identity",
);
includes(clearMessageBlock, "clearBookingMessageInput();", "Clear Message still clears only parser text");

for (const fragment of [
  "adminBookingPersistenceAction !== null",
  "explicitNewBooking: true",
  "mergeParsedBookingIntoForm(\n      createInitialBooking()",
]) {
  includes(parseBookingBlock, fragment, `explicit new Job Card draft contract ${fragment}`);
}

includes(
  loadBookingsBlock,
  "syncLoadedBookingFromRemoteRecord",
  "three-second booking load invokes cross-device form sync",
);
for (const fragment of ["loadedAdminBookingBaselineRef", "adminBookingFormSyncSignature"]) {
  includes(syncLoadedBookingBlock, fragment, `cross-device polling sync ${fragment}`);
}

includes(
  updateBookingBlock,
  "verifyLoadedAdminBookingVersionBeforeUpdate",
  "Update + Cal runs the version preflight",
);
includes(updateBookingBlock, "expected_updated_at", "PATCH carries the loaded version");
includes(
  verifyBookingVersionBlock,
  "setAdminBookingCrossDeviceConflict",
  "version preflight records an exact-booking conflict",
);
for (const fragment of [
  "adminBookingCreateIntentRef.current = false",
  "loadedAdminBookingBaselineRef.current",
  "adminBookingFormSyncSignature(appliedSnapshot.booking)",
  "updatedAt: clean(record.updated_at)",
]) {
  includes(
    applyOperationalSnapshotBlock,
    fragment,
    `applied operational snapshot version baseline ${fragment}`,
  );
}

for (const fragment of [
  "adminBookingCreateIntentRef.current",
  "Booking update identity was lost",
  "Editing booking",
]) {
  includes(primaryActionBlock, fragment, `primary exact-booking action ${fragment}`);
}

includes(
  saveBookingBlock,
  "resetAdminBookingFormAfterSuccessfulPersistence();",
  "successful Save + CRM clears the completed form",
);
includes(
  updateBookingBlock,
  "resetAdminBookingFormAfterSuccessfulPersistence();",
  "successful Update + Cal clears the completed form",
);

for (const fragment of [
  "expected_updated_at?: string | null;",
  '"expected_updated_at"',
  "Missing or malformed expected booking update timestamp.",
]) {
  includes(persistence, fragment, `PATCH version contract ${fragment}`);
}

for (const fragment of [
  "safeUpdateConflictError",
  "expected_updated_at",
  "409",
  '.eq("updated_at", existing.updated_at)',
]) {
  includes(adapter, fragment, `Supabase compare-and-set update ${fragment}`);
}

const ledgerSection = sectionBetween(
  ledger,
  "### Exact-Booking Cross-Device Edit Identity And Conflict Repair",
  "\n### ",
);

for (const fragment of [
  "10866",
  "10867",
  "Clear Message",
  "three-second",
  "expected_updated_at",
  "Calendar",
]) {
  includes(ledgerSection, fragment, `ledger cross-device repair ${fragment}`);
}

includes(preactivationSuite, guardScript, "cross-device sync guard registration");
for (const fragment of [
  "clearMessageEditIdentityState.primaryLabel, \"Update + Cal\"",
  "clearMessageEditIdentityState.editIdentity, /Editing booking 10839/",
  "updateAfterDriverDeleteState.bookingUpdate?.expected_updated_at",
  "updateAfterDriverDeleteState.flightValue, \"DL9905\"",
  "updateAfterDriverDeleteState.editIdentityCount, 1",
  "updateAfterDriverDeleteState.primarySaveLabel, \"Update + Cal\"",
]) {
  includes(bookingUiBrowser, fragment, `visible browser save-reset coverage ${fragment}`);
}

console.log("Admin booking cross-device sync guard passed");
