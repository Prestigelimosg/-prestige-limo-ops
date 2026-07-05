import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-customer-portal-saved-booking-surface-guard.mjs";

const portalPagePath = "app/my-bookings/page.tsx";
const portalAdapterPath = "lib/customer-portal-saved-bookings-adapter.ts";
const portalChangeRequestAdapterPath = "lib/customer-portal-booking-change-request-adapter.ts";
const savedBookingsReadPath = "lib/customer-saved-bookings-read.ts";

const allowedPortalBookingFields = [
  "driverDetails",
  "dropoffLocation",
  "flightNumber",
  "id",
  "passengerName",
  "pickupDateTime",
  "pickupLocation",
  "serviceType",
  "specialRequest",
  "status",
  "vehicleType",
];

const allowedApiRecordFields = [
  "booking_month",
  "booking_reference",
  "created_at",
  "customer_driver_details",
  "customer_facing_status",
  "dropoff_location",
  "passenger_name",
  "pickup_at",
  "pickup_location",
  "service_type",
  "updated_at",
];

const allowedApiPayloadFields = ["ok", "pagination", "saved_bookings", "version"];
const allowedQueryParams = ["booking_reference", "limit", "page"];
const allowedRowActions = ["cancel", "edit", "pdf"];
const safeDetailLabels = [
  "Pickup date/time",
  "Passenger name",
  "Pickup location",
  "Drop-off location",
  "Type of service",
  "Vehicle type",
  "Flight number",
  "Special request / note",
  "Driver Details",
  "Driver name",
  "Driver contact",
  "Car plate",
  "Car type",
  "Route",
];

const unsafePortalSurfacePattern =
  /admin_internal_status|admin_status|billing|contact_phone|contact_email|passenger_phone|customer_price|quoted_price|rate_amount|driver_payout|paynow|pay_now|invoice|payment|payout|finance|parser_debug|parser_learning|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|internal_finance_note|internal_note|admin_note|server_secret|session_token|raw_token|token_hash|driver_token/i;

const contractChecks = [
  {
    label: "customer portal saved bookings adapter contract",
    script: "scripts/test-customer-portal-saved-bookings-adapter.mjs",
    requiredFragments: [
      "The customer portal client must not import the server-only saved-bookings reader.",
      "The customer portal saved-bookings client path must remain read-only.",
      "Customer portal saved bookings adapter contract passed.",
    ],
    stripTypes: false,
  },
  {
    label: "customer saved bookings API contract",
    script: "scripts/test-customer-saved-bookings-api-contract.mjs",
    requiredFragments: [
      "Customer saved bookings read path must remain read-only.",
      "Customer saved bookings select must not include private customer/admin/finance/payout/parser columns.",
      "Customer saved bookings API contract tests passed.",
    ],
    stripTypes: true,
  },
  {
    label: "public API response privacy boundary guard",
    script: "scripts/test-public-api-response-privacy-boundary-guard.mjs",
    requiredFragments: [
      "customer saved bookings response contract",
      "allowedSavedBookingFields",
      "Public API response privacy boundary guard passed",
    ],
    stripTypes: false,
  },
  {
    label: "public API client caller boundary guard",
    script: "scripts/test-public-api-client-caller-boundary-guard.mjs",
    requiredFragments: [
      "customer portal saved bookings adapter contract",
      "The customer portal saved-bookings fetch must not attach session-token, authorization, or cookie headers.",
      "Public API client caller boundary guard passed",
    ],
    stripTypes: false,
  },
  {
    label: "customer portal driver tracking adapter contract",
    script: "scripts/test-customer-portal-driver-tracking-adapter.mjs",
    requiredFragments: [
      "Customer portal driver tracking adapter contract passed.",
      "customer-live-location-map-read",
      "Live location is available only after driver OTW and admin approval.",
    ],
    stripTypes: false,
  },
];

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

function assertSameList(actual, expected, label) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function blockBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing source block start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing source block end after ${startFragment}: ${endFragment}`);

  return source.slice(start, end + endFragment.length);
}

function extractTypeKeys(source, typeName) {
  const match = source.match(new RegExp(`export\\s+type\\s+${typeName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  assert.ok(match, `Expected exported type ${typeName}.`);

  return [...match[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)\??:\s/gm)].map((item) => item[1]);
}

function extractSetItems(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(match, `Expected ${constName} set literal.`);

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractRowActionValues(source) {
  return [...source.matchAll(/data-customer-portal-row-action="([^"]+)"/g)].map((item) => item[1]);
}

function runContractCheck({ label, script, stripTypes }) {
  const args = stripTypes ? ["--experimental-strip-types", script] : [script];
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
  });

  assert.equal(
    result.status,
    0,
    [
      `${label} failed while running ${script}.`,
      result.stdout.trim(),
      result.stderr.trim(),
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

const allPaths = [
  ledgerPath,
  preactivationSuitePath,
  portalPagePath,
  portalAdapterPath,
  portalChangeRequestAdapterPath,
  savedBookingsReadPath,
  ...contractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const portalPage = files[portalPagePath];
const portalAdapter = files[portalAdapterPath];
const portalChangeRequestAdapter = files[portalChangeRequestAdapterPath];
const savedBookingsRead = files[savedBookingsReadPath];
const ledgerSection = sectionBetween(
  ledger,
  "### Public Customer Portal Saved-Booking Surface Guard Lock",
);

for (const phrase of [
  "Public customer portal saved-booking display/action surfaces are guarded across `/my-bookings`, `lib/customer-portal-saved-bookings-adapter.ts`, `lib/customer-portal-booking-change-request-adapter.ts`, and `lib/customer-saved-bookings-read.ts`.",
  "This guard allows only the approved customer booking change-request review write; it does not approve env changes, deployment by CLI, live provider sends, migrations, direct customer booking mutation, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/GPS activation, UI sectors, or new shims.",
  "`/my-bookings` saved-booking rows must render only customer-safe status, passenger, pickup/drop-off, service, vehicle, date/time, flight, and optional request-note display fields; the expanded detail view may additionally render a customer-safe assigned-driver details card and gated customer map-link check only when safe driver details are present.",
  "`/my-bookings` saved-booking actions must stay limited to disabled PDF, customer-safe edit/cancel review request form, and local detail expansion.",
  "The customer PDF control must remain disabled/no-op and must not create files, links, downloads, invoices, payment records, or provider sends.",
  "Edit and cancel controls may submit only through `lib/customer-portal-booking-change-request-adapter.ts` to `/api/customer-booking-change-requests`; they must not mutate bookings, update calendar, or change `/api/customer-saved-bookings`.",
  "The customer portal saved-bookings adapter must keep using the guarded read endpoint with `cache: \"no-store\"`, `credentials: \"same-origin\"`, and the customer saved-bookings purpose header without manual Cookie, Authorization, customer session-token, or admin headers.",
  "Customer saved-booking API and adapter output must stay limited to the approved saved-booking record fields plus optional `customer_driver_details` with driver name, driver contact, car plate, and car type only; it must exclude customer price, driver payout, PayNow payout, billing, invoice/payment/PDF, internal finance/admin notes, parser/debug, secrets/tokens, provider/send, notification payloads, raw live location/photo/proof, and mock QA/dev archive fields.",
  "This guard coordinates the customer portal saved-bookings adapter contract, customer saved-bookings API contract, public API response privacy guard, and public API client caller guard in the preactivation suite.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-customer-portal-saved-booking-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public customer portal saved-booking ledger phrase: ${phrase}`);
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation public customer portal saved-booking surface guard registration",
);

assertExcludes(portalPage, /\bfetch\s*\(/, "/my-bookings raw fetch");
assertExcludes(portalPage, /submitCustomerBookingRequest/, "/my-bookings saved-booking surface submit adapter");
assertExcludes(portalPage, /\/api\/admin|\/api\/admin-saved-bookings/i, "/my-bookings admin API path");
assertExcludes(portalPage, /x-prestige-admin-purpose/i, "/my-bookings admin purpose header");
assertIncludes(portalPage, "loadCustomerPortalSavedBookings", "/my-bookings saved-bookings adapter import/use");
assertIncludes(portalPage, "useState<CustomerPortalBooking[]>([])", "/my-bookings empty saved-bookings state");
assertIncludes(
  portalPage,
  'setPortalBookingsLoadState(loadedBookings === null ? "blocked" : "ready")',
  "/my-bookings blocked saved-bookings state",
);
assertIncludes(portalPage, '"Sign in to view bookings."', "/my-bookings auth-required empty state");
assertIncludes(portalPage, "canRequestBookingReview(booking)", "/my-bookings review gate use");
assertIncludes(
  portalPage,
  'return booking.status !== "Completed" && booking.status !== "Cancelled";',
  "/my-bookings completed/cancelled local review gate",
);

assertSameList(extractRowActionValues(portalPage), allowedRowActions, "/my-bookings row action values");

const pdfRowActionIndex = portalPage.indexOf('data-customer-portal-row-action="pdf"');
assert.notEqual(pdfRowActionIndex, -1, "Missing /my-bookings booking-row disabled PDF control.");
const pdfButtonStart = portalPage.lastIndexOf("<button", pdfRowActionIndex);
const pdfButtonEnd = portalPage.indexOf("</button>", pdfRowActionIndex);
assert.notEqual(pdfButtonStart, -1, "Missing /my-bookings booking-row PDF button start.");
assert.notEqual(pdfButtonEnd, -1, "Missing /my-bookings booking-row PDF button end.");
const pdfButtonBlock = portalPage.slice(pdfButtonStart, pdfButtonEnd + "</button>".length);
for (const fragment of [
  'aria-disabled="true"',
  'data-customer-portal-row-action="pdf"',
  "disabled",
  'title="Customer PDF is not ready yet"',
  "PDF",
]) {
  assertIncludes(pdfButtonBlock, fragment, `/my-bookings disabled PDF control ${fragment}`);
}
for (const forbiddenPattern of [/onClick=/, /href=/, /download/, /formAction/, /type="submit"/]) {
  assertExcludes(pdfButtonBlock, forbiddenPattern, "/my-bookings disabled PDF control behavior");
}

const editHandlerBlock = blockBetween(
  portalPage,
  "function handleEditRequest(booking: CustomerPortalBooking)",
  "function handleCancelRequest",
);
assertIncludes(
  editHandlerBlock,
  "${companyName} staff must review and confirm before the booking or calendar changes.",
  "/my-bookings edit review feedback",
);
assertExcludes(editHandlerBlock, /\bfetch\s*\(|loadCustomerPortalSavedBookings|submitCustomerBookingRequest|new Request\(/, "/my-bookings edit handler API call");

const cancelHandlerBlock = blockBetween(
  portalPage,
  "function handleCancelRequest(booking: CustomerPortalBooking)",
  "function updateChangeRequestDraftField",
).replace("function updateChangeRequestDraftField", "");
assertIncludes(
  cancelHandlerBlock,
  "Your booking is not cancelled until ${companyName} confirms.",
  "/my-bookings cancel review feedback",
);
assertExcludes(cancelHandlerBlock, /\bfetch\s*\(|loadCustomerPortalSavedBookings|submitCustomerBookingRequest|new Request\(/, "/my-bookings cancel handler API call");

const submitChangeRequestBlock = blockBetween(
  portalPage,
  "async function submitCustomerBookingChangeRequest",
  "async function downloadPortalInvoice",
);
for (const fragment of [
  "submitCustomerPortalBookingChangeRequest",
  "bookingReference",
  "requestKind: changeRequestDraft.requestKind",
  "requestedPickupDate: changeRequestDraft.requestedPickupDate",
  "requestedPickupLocation: changeRequestDraft.requestedPickupLocation.trim()",
  "requestedDropoffLocation: changeRequestDraft.requestedDropoffLocation.trim()",
]) {
  assertIncludes(submitChangeRequestBlock, fragment, `/my-bookings change request submit ${fragment}`);
}
assertExcludes(
  submitChangeRequestBlock,
  /\bfetch\s*\(|new Request\(|\/api\/admin|\/api\/customer-saved-bookings/i,
  "/my-bookings change request direct API call",
);

for (const fragment of [
  'data-customer-portal-request-edit={booking.id}',
  'data-customer-portal-request-cancel={booking.id}',
  "disabled={!canRequestReview}",
  "onClick={() => handleEditRequest(booking)}",
  "onClick={() => handleCancelRequest(booking)}",
  "onClick={() => setExpandedBookingId(isExpanded ? \"\" : booking.id)}",
]) {
  assertIncludes(portalPage, fragment, `/my-bookings saved-booking action ${fragment}`);
}

const detailBlock = blockBetween(portalPage, 'data-customer-portal-detail={expandedBooking.id}', "</section>");
assertIncludes(
  detailBlock,
  "driverDetails ? (",
  "/my-bookings Driver Details card must render only after customer-safe driver details are present",
);
assertExcludes(
  detailBlock,
  /Driver details will appear here after staff confirms the assigned driver\./,
  "/my-bookings Driver Details card must not render an empty placeholder card",
);
for (const label of safeDetailLabels) {
  assertIncludes(detailBlock, label, `/my-bookings safe detail label ${label}`);
}
for (const fragment of [
  "expandedBooking.pickupDateTime",
  "expandedBooking.passengerName",
  "expandedBooking.pickupLocation",
  "expandedBooking.dropoffLocation",
  "expandedBooking.serviceType",
  "expandedBooking.vehicleType",
  'expandedBooking.flightNumber || "Not provided"',
  'expandedBooking.specialRequest || "None provided"',
  "driverDetails.driverName",
  "driverDetails.driverContact",
  "driverDetails.carPlate",
  "driverDetails.carType",
  "checkCustomerDriverTracking(expandedBooking)",
  "driverTracking.status === \"available\"",
]) {
  assertIncludes(detailBlock, fragment, `/my-bookings safe detail binding ${fragment}`);
}

const bookingResultsBlock = blockBetween(
  portalPage,
  'aria-labelledby="booking-search-title"',
  "{expandedBooking",
);
const savedBookingVisibleSource = [
  bookingResultsBlock.replace(pdfButtonBlock, ""),
  detailBlock,
  editHandlerBlock,
  cancelHandlerBlock,
].join("\n");
assertExcludes(
  savedBookingVisibleSource,
  unsafePortalSurfacePattern,
  "/my-bookings saved-booking visible/source surface outside invoices tab and disabled PDF no-op",
);

assertSameList(
  extractTypeKeys(portalAdapter, "CustomerPortalBooking"),
  allowedPortalBookingFields,
  "CustomerPortalBooking public fields",
);
assertSameList(
  extractSetItems(portalAdapter, "allowedApiRecordFields"),
  allowedApiRecordFields,
  "customer portal adapter API record fields",
);
assertSameList(
  extractSetItems(portalAdapter, "allowedApiPayloadFields"),
  allowedApiPayloadFields,
  "customer portal adapter API payload fields",
);
for (const fragment of [
  "fetcher(`${customerPortalSavedBookingsApiPath}?limit=25&page=1`",
  'cache: "no-store"',
  'credentials: "same-origin"',
  '"x-prestige-customer-purpose": "customer-saved-bookings-read"',
  "hasUnsafeApiRecordKeys(record)",
  "hasUnsafeApiPayloadKeys(record)",
  "safeText(record.dropoff_location) || \"Drop-off to confirm\"",
  "safeText(record.passenger_name) || \"Passenger to confirm\"",
  "safeText(record.pickup_location) || \"Pickup to confirm\"",
  "safeText(record.service_type, 120) || \"Service to confirm\"",
  "toCustomerPortalDriverDetails(record.customer_driver_details)",
]) {
  assertIncludes(portalAdapter, fragment, `customer portal adapter safe behavior ${fragment}`);
}
assertExcludes(portalAdapter, /x-prestige-customer-session-token|Authorization|authorization|Cookie|cookie|x-prestige-admin-purpose/, "customer portal adapter manual auth/admin headers");
assertExcludes(portalAdapter, /\.(?:insert|upsert|delete|update|rpc)\s*\(/, "customer portal adapter write/query methods");

for (const fragment of [
  "customerPortalBookingChangeRequestsApiPath",
  "/api/customer-booking-change-requests",
  'cache: "no-store"',
  'credentials: "same-origin"',
  '"x-prestige-customer-purpose": "customer-booking-change-request"',
  "calendarUpdate: false",
  "crmUpdate: false",
  "externalSend: false",
]) {
  assertIncludes(portalChangeRequestAdapter, fragment, `customer portal change request adapter ${fragment}`);
}
assertExcludes(
  portalChangeRequestAdapter,
  /x-prestige-customer-session-token|Authorization|authorization|Cookie|cookie|x-prestige-admin-purpose/i,
  "customer portal change request adapter manual auth/admin headers",
);
assertExcludes(
  portalChangeRequestAdapter,
  /\.(?:insert|upsert|delete|update|rpc)\s*\(/,
  "customer portal change request adapter database methods",
);

assertSameList(extractSetItems(savedBookingsRead, "allowedQueryParams"), allowedQueryParams, "customer saved bookings query params");
assertIncludes(
  savedBookingsRead,
  "booking_reference, service_type, pickup_at, pickup_location, dropoff_location, passenger_name, customer_facing_status, driver_name, driver_contact, driver_plate_number, vehicle_type_or_category, created_at, updated_at",
  "customer saved bookings current-schema safe DB select",
);
assertIncludes(
  savedBookingsRead,
  "booking_reference, route_type, pickup_datetime, pickup_location, dropoff_location, customer_display_name, customer_facing_status, driver_name, driver_contact, driver_plate_number, vehicle_type_or_category, created_at, updated_at",
  "customer saved bookings foundation-schema safe DB select",
);
assertIncludes(savedBookingsRead, 'refererUrl.pathname !== "/my-bookings"', "customer saved bookings my-bookings referer boundary");
assertIncludes(savedBookingsRead, 'bookingQuery.eq(customerFilter.column, customerFilter.value)', "customer saved bookings strict customer_id account filter");
assertExcludes(savedBookingsRead, 'bookingQuery.ilike(customerFilter.column, customerFilter.value)', "customer saved bookings must not use text/display-name account filter");
assertExcludes(savedBookingsRead, 'column: "customer_display_name"', "customer saved bookings must not isolate by display name");
assertExcludes(
  [
    savedBookingsRead.match(/customerSavedBookingsCurrentSelect\s*=\s*([^;]+)/)?.[1] || "",
    savedBookingsRead.match(/customerSavedBookingsFoundationSelect\s*=\s*([^;]+)/)?.[1] || "",
  ].join("\n"),
  unsafePortalSurfacePattern,
  "customer saved bookings selected columns",
);

for (const { label, requiredFragments, script } of contractChecks) {
  const source = files[script];

  for (const fragment of requiredFragments) {
    assertIncludes(source, fragment, `${label} source fragment ${fragment}`);
  }
}

for (const contractCheck of contractChecks) {
  runContractCheck(contractCheck);
}

console.log("Public customer portal saved-booking surface guard passed");
