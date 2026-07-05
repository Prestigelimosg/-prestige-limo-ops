import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const customersPagePath = "app/customers/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customer-folder-dispatch-handoff-guard.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function sectionBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing section start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing section end: ${endFragment}`);

  return source.slice(start, end);
}

const [appPage, customersPage, ledger, preactivationSuite] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(customersPagePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const customerFolderJobsSection = sectionBetween(
  customersPage,
  'data-customer-folder-jobs-panel="true"',
  'data-unbilled-customers-sector="true"',
);
const dispatchHandoffFunction = sectionBetween(
  appPage,
  "async function loadDispatchHandoffBookingFromUrl",
  "\n  useEffect(() => {",
);
const dispatchHandoffEffect = sectionBetween(
  appPage,
  "const searchParams = new URLSearchParams(window.location.search);",
  "\n  function openCustomerBookingRequestsReview",
);
const ledgerSection = sectionBetween(
  ledger,
  "### Customer Folder Dispatch Handoff",
  "\n### ",
);

for (const fragment of [
  'const customerFolderDispatchHandoffTab = "dispatch";',
  'const customerFolderDispatchHandoffReferenceParam = "booking_reference";',
  "function safeCustomerFolderDispatchHandoffReference(",
  "function customerFolderJobDispatchHref(",
  "[customerFolderDispatchHandoffReferenceParam]: bookingReference,",
  "tab: customerFolderDispatchHandoffTab,",
  'data-customer-folder-job-open-dispatch={bookingReference}',
  "Open in Dispatch",
]) {
  assertIncludes(customersPage, fragment, `customer folder dispatch handoff source ${fragment}`);
}

for (const fragment of [
  'data-customer-folder-job-view-toggle={bookingReference}',
  'data-customer-folder-job-details={bookingReference}',
  'data-customer-folder-job-open-dispatch={bookingReference}',
  "Open in Dispatch",
]) {
  assertIncludes(customerFolderJobsSection, fragment, `customer folder jobs section ${fragment}`);
}

for (const forbiddenFragment of [
  'data-customer-folder-job-delete',
  "deleteCustomerFolderJob",
  "method: \"DELETE\"",
  "adminSavedBookingsApiPath, {",
]) {
  assertExcludes(customerFolderJobsSection, forbiddenFragment, "customer folder job panel delete wiring");
}

for (const fragment of [
  'const dispatchHandoffReferenceQueryParam = "booking_reference";',
  'const dispatchHandoffAlternateReferenceQueryParam = "dispatch_booking_reference";',
  "function cleanDispatchHandoffBookingReference(",
  "const dispatchHandoffAttemptedReferenceRef = useRef(\"\");",
  "async function loadDispatchHandoffBookingFromUrl(targetBookingReference: string)",
  "setActiveTab(\"dispatch\");",
  "new URLSearchParams({ limit: adminLoadBookingsListLimit })",
  "method: \"GET\"",
  "`${adminSavedBookingsApiPath}?${searchParams.toString()}`",
  "`${adminBookingsApiPath}?${searchParams.toString()}`",
  "findLoadedBookingRecordByReference(",
  "loadSelectedBooking(targetBooking, { focusCustomerCopy: true });",
]) {
  assertIncludes(appPage, fragment, `dispatch handoff app source ${fragment}`);
}

for (const forbiddenPattern of [
  /method:\s*["'](?:POST|PATCH|DELETE)["']/,
  /create|update|delete|invoice|payment|payout|geolocation|watchPosition|provider|sendMail|telegram|whatsapp/i,
]) {
  assertExcludes(dispatchHandoffFunction, forbiddenPattern, "dispatch handoff function mutation/provider boundary");
}

for (const fragment of [
  "searchParams.get(\"tab\") !== \"dispatch\"",
  "searchParams.get(dispatchHandoffReferenceQueryParam)",
  "searchParams.get(dispatchHandoffAlternateReferenceQueryParam)",
  "void loadDispatchHandoffBookingFromUrl(safeTargetBookingReference || rawTargetBookingReference);",
]) {
  assertIncludes(dispatchHandoffEffect, fragment, `dispatch handoff effect ${fragment}`);
}

for (const phrase of [
  "Customer Folder `View jobs` now exposes one safe `Open in Dispatch` handoff for each saved booking row with an exact booking reference.",
  "The handoff uses `/?tab=dispatch&booking_reference=...`, performs only guarded admin GET reads, finds one exact booking reference, and then calls the existing Dispatch `loadSelectedBooking` editor/review path.",
  "Customer Folder does not expose a delete job button, raw internal booking id, PATCH, DELETE, invoice, payment, provider send, GPS/live-location, parser/debug, or mock archive action.",
  "Delete remains limited to the existing Completed / History lane, where the app resolves the internal saved booking id and only deletes completed/cancelled/driver-completed history jobs.",
  "Guard coverage lives in `scripts/test-customer-folder-dispatch-handoff-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `customer folder dispatch handoff ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation customer folder dispatch handoff guard registration");

console.log("Customer folder dispatch handoff guard passed");
