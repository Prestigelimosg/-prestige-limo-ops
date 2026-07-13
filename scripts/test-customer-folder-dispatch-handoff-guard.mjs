import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const customersPagePath = "app/customers/page.tsx";
const customerFolderSavedBookingsPanelPath = "app/customers/[customerId]/saved-bookings-panel.tsx";
const adminCustomerSavedBookingsReadPath = "lib/admin-customer-saved-bookings-read.ts";
const persistencePath = "lib/admin-booking-persistence.ts";
const adapterPath = "lib/admin-booking-supabase-adapter.ts";
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

const [
  appPage,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  customersPage,
  customerFolderSavedBookingsPanel,
  adminCustomerSavedBookingsRead,
  persistence,
  adapter,
  ledger,
  preactivationSuite,
] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(customersPagePath, "utf8"),
  readFile(customerFolderSavedBookingsPanelPath, "utf8"),
  readFile(adminCustomerSavedBookingsReadPath, "utf8"),
  readFile(persistencePath, "utf8"),
  readFile(adapterPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const customerFolderExactBookingLoadFunction = sectionBetween(
  customersPage,
  "async function loadCustomerFolderExactBookingForEdit",
  "\n  function mergeCustomerFolderSavedBookingFromExact",
);
const customerFolderExactBookingReadFunction = sectionBetween(
  customersPage,
  "async function readCustomerFolderExactBooking",
  "\n  async function loadCustomerFolderExactBookingForEdit",
);
const customerFolderExactBookingSaveFunction = sectionBetween(
  customersPage,
  "async function saveCustomerFolderExactBookingEdit",
  "\n  async function deleteCustomerFolderExactBooking",
);
const customerFolderExactBookingDeleteFunction = sectionBetween(
  customersPage,
  "async function deleteCustomerFolderExactBooking",
  "\n  async function viewCustomerFolderJobs",
);
const dispatchHandoffFunction = sectionBetween(
  appPage,
  "async function loadDispatchHandoffBookingFromUrl",
  "\n  function openBookingInCompletedCancelReview",
);
const dispatchHandoffEffect = sectionBetween(
  appPage,
  "const searchParams = new URLSearchParams(window.location.search);",
  "\n  function openCustomerBookingRequestsReview",
);
const adminBookingsGetRoute = sectionBetween(
  adminBookingsRoute,
  "export async function GET(request: Request)",
  "\nexport async function POST",
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
  "function customerFolderExactBookingCanDelete(",
  "function customerFolderExactBookingDeleteBlockReason(",
  "cleaned.match(/^(\\d{4}-\\d{2}-\\d{2})T(\\d{2}:\\d{2})$/)",
  "function customerFolderExactBookingPayload(",
  "target_booking_reference: bookingReference,",
  "async function loadCustomerFolderExactBookingForEdit(",
  "async function saveCustomerFolderExactBookingEdit()",
  "async function deleteCustomerFolderExactBooking()",
  "[customerFolderDispatchHandoffReferenceParam]: bookingReference,",
  "tab: customerFolderDispatchHandoffTab,",
  "fetch(`${adminBookingsApiPath}?${params.toString()}`",
  "fetch(adminBookingsApiPath, {",
  "fetch(adminSavedBookingsApiPath, {",
  "Delete is locked until this exact job is completed or cancelled.",
  "data-customer-folder-saved-bookings-edit",
  ">\n                            Edit\n                          </Link>",
]) {
  const source = fragment.includes("data-customer-folder-saved-bookings") || fragment.startsWith(">\n")
    ? customerFolderSavedBookingsPanel
    : customersPage;

  assertIncludes(source, fragment, `customer folder dispatch handoff source ${fragment}`);
}

for (const fragment of [
  "data-customer-folder-saved-bookings-list",
  "data-customer-folder-saved-bookings-row",
  "data-customer-folder-saved-bookings-edit",
  "max-h-96 overflow-auto",
  ">\n                            Edit\n                          </Link>",
]) {
  assertIncludes(customerFolderSavedBookingsPanel, fragment, `customer folder jobs section ${fragment}`);
}

for (const fragment of [
  "const params = new URLSearchParams({ booking_reference: bookingReference });",
  "fetch(`${adminBookingsApiPath}?${params.toString()}`",
  "method: \"GET\"",
  "exactReference !== bookingReference",
]) {
  assertIncludes(
    customerFolderExactBookingReadFunction,
    fragment,
    `customer folder exact booking read ${fragment}`,
  );
}
assertIncludes(
  customerFolderExactBookingLoadFunction,
  "const exactBooking = await readCustomerFolderExactBooking(bookingReference);",
  "customer folder exact booking load reuses guarded read",
);

for (const fragment of [
  "const payloadResult = customerFolderExactBookingPayload(",
  "fetch(adminBookingsApiPath, {",
  "method: \"PATCH\"",
  "updatedReference !== bookingReference",
]) {
  assertIncludes(
    customerFolderExactBookingSaveFunction,
    fragment,
    `customer folder exact booking save ${fragment}`,
  );
}

for (const fragment of [
  "const deleteBookingId = customerFolderExactBookingId(exactBooking);",
  "const blockReason = customerFolderExactBookingDeleteBlockReason(exactBooking);",
  "if (!bookingReference || !deleteBookingId || blockReason)",
  "window.confirm(",
  "fetch(adminSavedBookingsApiPath, {",
  "body: JSON.stringify({ booking_id: deleteBookingId })",
  "method: \"DELETE\"",
  "responseBookingId !== deleteBookingId",
  "![\"completed\", \"cancelled\"].includes(responseStatus)",
]) {
  assertIncludes(
    customerFolderExactBookingDeleteFunction,
    fragment,
    `customer folder exact booking delete ${fragment}`,
  );
}

for (const fragment of [
  'const customerFolderDeleteMethod = request.method === "DELETE";',
  'additionalSameOriginRefererPathPrefixes: customerFolderDeleteMethod ? ["/customers/"] : [],',
  'additionalSameOriginRefererPathnames: customerFolderDeleteMethod ? ["/customers"] : [],',
  'allowServerSessionRoleMethodsWithoutRequestToken: ["DELETE"],',
]) {
  assertIncludes(adminSavedBookingsRoute, fragment, `admin saved bookings customer-folder delete boundary ${fragment}`);
}

for (const forbiddenFragment of [
  "deleteCustomerFolderJob",
  "method: \"DELETE\"",
  "adminSavedBookingsApiPath, {",
]) {
  assertExcludes(customerFolderExactBookingLoadFunction, forbiddenFragment, "customer folder exact load mutation boundary");
  assertExcludes(customerFolderExactBookingReadFunction, forbiddenFragment, "customer folder exact read mutation boundary");
}

for (const forbiddenPattern of [
  /invoice|payment|payout|geolocation|watchPosition|provider|sendMail|telegram|whatsapp/i,
]) {
  assertExcludes(customerFolderExactBookingLoadFunction, forbiddenPattern, "customer folder exact load boundary");
  assertExcludes(customerFolderExactBookingReadFunction, forbiddenPattern, "customer folder exact read boundary");
  assertExcludes(customerFolderExactBookingSaveFunction, forbiddenPattern, "customer folder exact save boundary");
  assertExcludes(customerFolderExactBookingDeleteFunction, forbiddenPattern, "customer folder exact delete boundary");
}

for (const fragment of [
  'const dispatchHandoffReferenceQueryParam = "booking_reference";',
  'const dispatchHandoffAlternateReferenceQueryParam = "dispatch_booking_reference";',
  "function cleanDispatchHandoffBookingReference(",
  "const dispatchHandoffAttemptedReferenceRef = useRef(\"\");",
  "async function loadDispatchHandoffBookingFromUrl(targetBookingReference: string)",
  "setActiveTab(\"dispatch\");",
  "[dispatchHandoffReferenceQueryParam]: safeTargetBookingReference,",
  "method: \"GET\"",
  "`${adminBookingsApiPath}?${searchParams.toString()}`",
  "responseBody?.booking ?? null",
  "const responseReference = targetBooking",
  "responseReference !== safeTargetBookingReference",
  "bookingRecordPersistedReference(currentBooking) !== safeTargetBookingReference",
  "loadSelectedBooking(targetBooking, { focusCustomerCopy: true });",
]) {
  assertIncludes(appPage, fragment, `dispatch handoff app source ${fragment}`);
}

for (const forbiddenFragment of [
  "new URLSearchParams({ limit: adminLoadBookingsListLimit })",
  "`${adminSavedBookingsApiPath}?${searchParams.toString()}`",
  "findLoadedBookingRecordByReference(",
  "Array.isArray(responseBody.bookings)",
]) {
  assertExcludes(dispatchHandoffFunction, forbiddenFragment, "dispatch handoff exact reference read");
}

for (const forbiddenPattern of [
  /method:\s*["'](?:POST|PATCH|DELETE)["']/,
  /adminCustomerInvoicesApiPath|adminSavedBookingsApiPath|navigator\.geolocation|watchPosition|sendMail|api\.telegram\.org|twilio/i,
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

for (const fragment of [
  "loadAdminBookingByReference,",
  'const customerFolderExactEditMethod = request.method === "GET" || request.method === "PATCH";',
  'additionalSameOriginRefererPathPrefixes: customerFolderExactEditMethod ? ["/customers/"] : [],',
  'additionalSameOriginRefererPathnames: customerFolderExactEditMethod ? ["/customers"] : [],',
  'allowServerSessionRoleMethodsWithoutRequestToken: ["POST", "PATCH"],',
  "function adminBookingReferenceFromRequest(request: Request)",
  'searchParams.get("booking_reference")',
  "const bookingReference = adminBookingReferenceFromRequest(request);",
  "const result = await loadAdminBookingByReference(actor, bookingReference);",
  "booking: result.data,",
  "const result = await listAdminBookings(actor, {",
]) {
  assertIncludes(adminBookingsRoute, fragment, `admin booking exact reference route ${fragment}`);
}

assert.equal(
  adminBookingsGetRoute.indexOf("loadAdminBookingByReference(actor, bookingReference)") <
    adminBookingsGetRoute.indexOf("listAdminBookings(actor"),
  true,
  "Exact booking_reference read must run before list read.",
);
assertExcludes(
  adminBookingsGetRoute,
  /method:\s*["'](?:POST|PATCH|DELETE)["']/,
  "admin bookings exact reference GET mutation boundary",
);

for (const fragment of [
  "loadAdminBookingByReferenceThroughSupabaseAdapter,",
  "export async function loadAdminBookingByReference(",
  "validTargetBookingReference(bookingReference)",
  "return loadAdminBookingByReferenceThroughSupabaseAdapter(actor, safeBookingReference);",
]) {
  assertIncludes(persistence, fragment, `admin booking persistence exact reference ${fragment}`);
}

for (const fragment of [
  "export async function loadAdminBookingByReferenceThroughSupabaseAdapter(",
  "const result = await fetchAdminBookingByReference(clientResult.data, bookingReference);",
  "const reloadedBookingId = dbIdentifierOrNull(asRecord(data).id);",
  "id: reloadedBookingId,",
  "function bookingCustomerIdentityChanged(",
  "const existingCustomerId = dbIdentifierOrNull(existing.customer_id);",
  "if (!customerId || bookingCustomerIdentityChanged(existing, input.booking))",
]) {
  assertIncludes(adapter, fragment, `admin booking adapter exact reference ${fragment}`);
}

for (const fragment of [
  "const customerFolderSavedBookingSourceReadLimit = 200;",
  "listAdminBookings(actor, {",
  "limit: customerFolderSavedBookingSourceReadLimit,",
]) {
  assertIncludes(
    adminCustomerSavedBookingsRead,
    fragment,
    `customer folder saved booking read depth ${fragment}`,
  );
}

for (const phrase of [
  "Customer folder pages expose one safe `Edit` Dispatch handoff for each saved booking row with an exact booking reference.",
  "The handoff uses `/?tab=dispatch&booking_reference=...`, performs one exact guarded admin GET read through `/api/admin-bookings?booking_reference=...`, and then calls the existing Dispatch `loadSelectedBooking` editor/review path.",
  "It does not rely on the recent bookings list window, so older customer-folder jobs can still open by exact reference.",
  "Customer Folder `View/Edit` now loads the exact booking by reference before showing compact operational edit controls for passenger, pickup time, pickup, drop-off, service, vehicle, driver, driver contact, and plate.",
  "`/api/admin-bookings` accepts `/customers` and `/customers/*` as additional same-origin internal admin referers only for this exact customer-folder `GET` read and `PATCH` save path; create `POST` and other admin routes keep their existing referer boundaries.",
  "Customer Folder save uses the existing guarded `/api/admin-bookings` PATCH path with the loaded booking as the base payload, so account/contact/status fields are preserved and missing required operational fields are reported instead of guessed.",
  "Admin booking update reloads preserve the exact booking id so Customer Folder `Delete job` remains correctly enabled for completed/cancelled jobs immediately after `Save changes`.",
  "Customer Folder delete is visible but locked until that exact loaded booking is completed or cancelled; it uses the exact returned booking id through the existing guarded `/api/admin-saved-bookings` DELETE path and removes the row from the selected customer list only after the API confirms the same id and a completed/cancelled status.",
  "`/api/admin-saved-bookings` accepts `/customers` and `/customers/*` as additional same-origin internal admin referers only for Customer Folder `DELETE`; list/create reads keep their existing admin boundaries.",
  "Customer Folder still does not expose invoice, payment, payout, provider send, GPS/live-location, parser/debug, mock archive, raw finance, or public/customer/driver auth actions in this row.",
  "Active/upcoming customer-folder jobs must be completed or cancelled through the normal operational lane before delete becomes available; this avoids broad deletion or blind row deletion from the list.",
  "Guard coverage lives in `scripts/test-customer-folder-dispatch-handoff-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `customer folder dispatch handoff ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation customer folder dispatch handoff guard registration");

console.log("Customer folder dispatch handoff guard passed");
