import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-api-request-input-boundary-guard.mjs";

const publicApiRoutePaths = [
  "app/api/customer-booking-requests/route.ts",
  "app/api/customer-portal-sessions/route.ts",
  "app/api/customer-saved-bookings/route.ts",
  "app/api/customer-booking-memory/route.ts",
  "app/api/customer-booking-statuses/route.ts",
  "app/api/customer-app-notifications/route.ts",
  "app/api/driver-job/[token]/route.ts",
  "app/api/driver-job/[token]/status/route.ts",
  "app/api/driver-job/[token]/notifications/route.ts",
  "app/api/driver-job/[token]/issue-alert/route.ts",
  "app/api/driver-job/[token]/flight-eta-setup/route.ts",
  "app/api/driver-job/[token]/flight-eta-acknowledgement-setup/route.ts",
  "app/api/driver-job-bids/route.ts",
];

const helperPaths = [
  "lib/admin-booking-persistence.ts",
  "lib/customer-booking-request-adapter.ts",
  "lib/customer-saved-bookings-read.ts",
  "lib/customer-booking-memory-read.ts",
  "lib/customer-booking-status-read.ts",
  "lib/customer-driver-app-notification-persistence.ts",
  "lib/driver-job-status-persistence.ts",
  "lib/driver-job-issue-alert.ts",
];

const contractChecks = [
  {
    label: "customer booking request adapter input contract",
    script: "scripts/test-customer-booking-request-adapter.mjs",
    requiredFragments: [
      "Adapter should submit only approved customer booking request fields.",
      "Adapter must not forward finance/internal/free-note fields.",
      "x-prestige-customer-purpose",
      "fetchCalls[0].init.credentials",
    ],
    stripTypes: false,
  },
  {
    label: "customer booking request API input contract",
    script: "scripts/test-customer-booking-request-api-contract.mjs",
    requiredFragments: [
      "Forbidden customerPrice rejected before persistence.",
      "Booking request includes fields outside the approved request scope.",
      "GET\", \"PUT\", \"PATCH\", \"DELETE\", \"HEAD\", \"OPTIONS\"",
    ],
    stripTypes: true,
  },
  {
    label: "customer saved bookings query input contract",
    script: "scripts/test-customer-saved-bookings-api-contract.mjs",
    requiredFragments: [
      "Unsafe query fields should be rejected.",
      "booking_reference=bad value",
      "Customer saved bookings API contract tests passed.",
    ],
    stripTypes: true,
  },
  {
    label: "customer booking memory query input contract",
    script: "scripts/test-customer-booking-memory-api-contract.mjs",
    requiredFragments: [
      "Unsafe memory query values should be rejected.",
      "Unsafe query fields should be rejected.",
      "Customer booking memory API contract tests passed.",
    ],
    stripTypes: true,
  },
  {
    label: "customer booking status query input contract",
    script: "scripts/test-customer-booking-status-api-contract.mjs",
    requiredFragments: [
      "booking_reference=bad value",
      "admin_internal_status=confirmed",
      "Customer booking status API contract tests passed.",
    ],
    stripTypes: true,
  },
  {
    label: "customer portal session header input contract",
    script: "scripts/test-customer-portal-session-issue-api-contract.mjs",
    requiredFragments: [
      "x-prestige-customer-session-issue-token",
      "Customer portal UI/client must not call or expose the session issue contract.",
      "Customer portal session issue API contract passed.",
    ],
    stripTypes: true,
  },
  {
    label: "customer/driver notification input contract",
    script: "scripts/test-customer-driver-app-notification-api-contract.mjs",
    requiredFragments: [
      "Unsafe driver PATCH must be rejected before Supabase",
      "notification_id",
      "notification_status",
      "Customer/driver app notification API contract tests passed.",
    ],
    stripTypes: true,
  },
  {
    label: "driver job route input contract",
    script: "scripts/test-driver-job-link-api-routes.mjs",
    requiredFragments: [
      "patchDriverJobStatus(token, status)",
      "postDriverJobIssueAlert(token, issueType)",
      "driver_payout_needed",
      "Driver job link API route tests passed.",
    ],
    stripTypes: true,
  },
  {
    label: "driver status persistence input contract",
    script: "scripts/test-driver-job-status-persistence-api-contract.mjs",
    requiredFragments: [
      "safeStatusContext",
      "safeStatusNote",
      "safe_status_context",
      "safe_status_note",
    ],
    stripTypes: true,
  },
  {
    label: "driver production status default-off input contract",
    script: "scripts/test-driver-job-link-production-adapter.mjs",
    requiredFragments: [
      "applyProductionDriverJobStatusUpdate",
      "Disabled production result should not expose customer price.",
      "Disabled production result should not expose driver payout.",
      "Driver job link production adapter tests passed.",
    ],
    stripTypes: true,
  },
  {
    label: "driver bidding blocked input contract",
    script: "scripts/test-driver-portal-bidding-api-contract.mjs",
    requiredFragments: [
      "harness.driverRoute.GET",
      "harness.driverRoute.POST",
      "harness.driverRoute.PATCH",
      "Driver portal bidding API contract tests passed.",
    ],
    stripTypes: true,
  },
];

const customerBookingRequestFields = [
  "companyName",
  "contactNo",
  "emailAddress",
  "passengerName",
  "pickupDate",
  "pickupTime",
  "flightNumber",
  "pickupLocation",
  "dropoffLocation",
  "serviceType",
  "vehicleType",
  "passengerCount",
  "luggage",
  "extraStops",
];

const customerBookingForbiddenFragments = [
  "admin_internal_status",
  "driver_payout",
  "paynow",
  "billing",
  "invoice",
  "payment",
  "pdf",
  "parser_debug",
  "mock_qa",
  "service_role",
  "internal_admin_note",
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

function assertBefore(source, first, second, label) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);

  assert.notEqual(firstIndex, -1, `${label} must include ${first}.`);
  assert.notEqual(secondIndex, -1, `${label} must include ${second}.`);
  assert.equal(firstIndex < secondIndex, true, `${label} must check ${first} before ${second}.`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function extractSetItems(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(match, `Expected ${constName} set literal.`);

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
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
  ...publicApiRoutePaths,
  ...helperPaths,
  ...contractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const ledgerSection = sectionBetween(ledger, "### Public API Request Input Boundary Guard Lock");

for (const phrase of [
  "Public customer/driver API request input boundaries are guarded across customer booking request, customer saved bookings, customer booking memory, customer booking status, customer portal session issue, customer app notifications, driver job status, driver job notifications, driver issue-alert, driver flight ETA setup, and driver bidding routes.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.",
  "Customer booking request POST input must stay limited to the approved customer form fields and must reject forbidden or unknown finance/internal/parser/token/archive fields before persistence.",
  "Customer saved-bookings, booking-memory, and booking-status read inputs must keep explicit query allowlists and forbidden-fragment checks on both query keys and values.",
  "Customer portal session issue input must remain server-gated by purpose/origin/referer/token headers and must not be called from customer UI/client code.",
  "Driver status and notification inputs must stay limited to current safe status, safe note/context, notification id/status, and driver_app delivery surface boundaries; driver issue-alert input must stay enum-only.",
  "Driver bidding remains blocked for GET/POST/PATCH until approved driver auth exists.",
  "Public API request input contracts must continue checking safe field allowlists, forbidden-field rejection, auth-required boundaries, and mocked route harnesses; this guard coordinates those scripts in the preactivation suite.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-api-request-input-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public API request input ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation public API request input guard registration");

const customerBookingRequestRoute = files["app/api/customer-booking-requests/route.ts"];
for (const fragment of [
  "const customerBookingPurposeHeader = \"customer-booking-request\";",
  "refererUrl.pathname === \"/book\"",
  "const parsed = parseCustomerBookingRequestPayload(await readJsonBody(request));",
  "customerSafeError(parsed.error)",
  "customerSafeError(result.error)",
]) {
  assertIncludes(customerBookingRequestRoute, fragment, `customer booking request route input fragment ${fragment}`);
}
assertBefore(
  customerBookingRequestRoute,
  "if (!isCustomerBookingRequest(request))",
  "parseCustomerBookingRequestPayload(await readJsonBody(request))",
  "customer booking request route",
);

const adminBookingPersistence = files["lib/admin-booking-persistence.ts"];
assert.deepEqual(
  extractSetItems(adminBookingPersistence, "customerBookingRequestFields"),
  customerBookingRequestFields,
  "Customer booking request payload field allowlist",
);
assertBefore(
  adminBookingPersistence,
  "const forbiddenFields = findForbiddenFieldNames(body);",
  "const unknownKeys = Object.keys(body).filter((key) => !customerBookingRequestFields.has(key));",
  "customer booking request parser",
);
for (const fragment of customerBookingForbiddenFragments) {
  assertIncludes(adminBookingPersistence, `"${fragment}"`, `customer booking request forbidden fragment ${fragment}`);
}

const customerBookingRequestAdapter = files["lib/customer-booking-request-adapter.ts"];
for (const fragment of customerBookingRequestFields) {
  assertIncludes(customerBookingRequestAdapter, `${fragment}: input.${fragment}`, `customer request adapter body field ${fragment}`);
}
for (const forbiddenClientFragment of ["customerPrice", "billing", "financeNotes", "internalAdminNotes", "specialRequest"]) {
  assertExcludes(
    customerBookingRequestAdapter.match(/function toCustomerBookingRequestApiBody[\s\S]+?\n}/)?.[0] || "",
    forbiddenClientFragment,
    `customer request adapter submitted body ${forbiddenClientFragment}`,
  );
}
assertIncludes(
  customerBookingRequestAdapter,
  "\"x-prestige-customer-purpose\": \"customer-booking-request\"",
  "customer request adapter purpose header",
);

const customerSavedBookingsRead = files["lib/customer-saved-bookings-read.ts"];
assert.deepEqual(extractSetItems(customerSavedBookingsRead, "allowedQueryParams"), [
  "booking_reference",
  "limit",
  "page",
]);
for (const fragment of [
  "includesForbiddenFragment(key)",
  "includesForbiddenFragment(String(value ?? \"\"))",
  "Customer saved bookings read includes fields outside the approved read scope.",
  "purpose !== \"customer-saved-bookings-read\"",
  "refererUrl.pathname !== \"/my-bookings\"",
]) {
  assertIncludes(customerSavedBookingsRead, fragment, `customer saved bookings input fragment ${fragment}`);
}

const customerBookingMemoryRead = files["lib/customer-booking-memory-read.ts"];
assert.deepEqual(extractSetItems(customerBookingMemoryRead, "allowedQueryParams"), ["limit", "q"]);
for (const fragment of [
  "includesForbiddenFragment(key)",
  "includesForbiddenFragment(String(value ?? \"\"))",
  "Customer booking memory read includes fields outside the approved read scope.",
  "purpose !== \"customer-booking-memory-read\"",
  "refererUrl.pathname !== \"/book\"",
]) {
  assertIncludes(customerBookingMemoryRead, fragment, `customer booking memory input fragment ${fragment}`);
}

const customerBookingStatusRead = files["lib/customer-booking-status-read.ts"];
assert.deepEqual(extractSetItems(customerBookingStatusRead, "allowedQueryParams"), [
  "booking_reference",
  "limit",
  "page",
]);
for (const fragment of [
  "includesForbiddenFragment(key)",
  "includesForbiddenFragment(String(value ?? \"\"))",
  "Customer booking status lookup includes fields outside the approved read scope.",
  "purpose !== \"customer-booking-status-read\"",
  "refererUrl.pathname !== \"/my-bookings\"",
]) {
  assertIncludes(customerBookingStatusRead, fragment, `customer booking status input fragment ${fragment}`);
}

const customerPortalRoute = files["app/api/customer-portal-sessions/route.ts"];
for (const fragment of [
  "const result = resolveCustomerPortalSessionIssue(request);",
  "\"Set-Cookie\": result.data.cookie",
  "customerPortalSessionIssueAuthRequiredResult",
]) {
  assertIncludes(customerPortalRoute, fragment, `customer portal session input fragment ${fragment}`);
}

const customerAppNotificationsRoute = files["app/api/customer-app-notifications/route.ts"];
assertExcludes(customerAppNotificationsRoute, "request.json", "customer app notifications public route body parsing");
assertExcludes(customerAppNotificationsRoute, "searchParams", "customer app notifications public route query parsing");
assertIncludes(
  customerAppNotificationsRoute,
  "return safeCustomerAuthRequiredResponse();",
  "customer app notifications auth-required input boundary",
);

const notificationsPersistence = files["lib/customer-driver-app-notification-persistence.ts"];
assert.deepEqual(extractSetItems(notificationsPersistence, "allowedUpdateFields"), [
  "delivery_surface",
  "notification_id",
  "notification_status",
]);
for (const fragment of [
  "unknownKeys(record, allowedUpdateFields).length > 0",
  "findForbiddenFieldNames(record).length > 0",
  "findForbiddenTextValues(record).length > 0",
  "const allowedUpdateStatuses = new Set<string>([\"archived\", \"dismissed\", \"read\"]);",
]) {
  assertIncludes(notificationsPersistence, fragment, `notification update input fragment ${fragment}`);
}

const driverNotificationsRoute = files["app/api/driver-job/[token]/notifications/route.ts"];
for (const fragment of [
  "loadDriverAppNotificationsForToken(token, new URL(request.url).searchParams)",
  "const parsed = parseCustomerDriverAppNotificationUpdatePayload({",
  "...body,",
  "delivery_surface: \"driver_app\"",
]) {
  assertIncludes(driverNotificationsRoute, fragment, `driver notification input fragment ${fragment}`);
}

const driverStatusRoute = files["app/api/driver-job/[token]/status/route.ts"];
for (const fragment of [
  "const status = typeof body.status === \"string\" ? body.status : \"\";",
  "const completionNote = body.completion_note;",
  "const exceptionReason = body.exception_reason;",
  "const safeStatusContext = body.safe_status_context;",
  "const safeStatusNote = body.safe_status_note;",
  "applyProductionDriverJobStatusUpdate({",
  "applyDriverJobStatusUpdateContract({",
]) {
  assertIncludes(driverStatusRoute, fragment, `driver status input fragment ${fragment}`);
}
assertExcludes(driverStatusRoute, /\.\.\.body/, "driver status route production forwarding");
assertExcludes(driverStatusRoute, /customer_price|driver_payout|paynow|billing|invoice|payment|pdf/i, "driver status route input source");

const driverStatusPersistence = files["lib/driver-job-status-persistence.ts"];
for (const fragment of [
  "function safeStatusNoteFromInput(value: unknown)",
  "function safeStatusContextFromInput(value: unknown)",
  "includesUnsafeFragment(cleaned)",
  "safeKey.toLowerCase().includes(\"token\")",
  "typeof rawValue === \"number\"",
  "safeStatusNoteAndContextFromInput(input)",
]) {
  assertIncludes(driverStatusPersistence, fragment, `driver status persistence safe input fragment ${fragment}`);
}

const driverIssueRoute = files["app/api/driver-job/[token]/issue-alert/route.ts"];
for (const fragment of [
  "const issueChoice = getDriverJobIssueChoice(body.issue_type);",
  "return malformedIssueResponse();",
  "external_send: false",
]) {
  assertIncludes(driverIssueRoute, fragment, `driver issue input fragment ${fragment}`);
}

const driverIssueHelper = files["lib/driver-job-issue-alert.ts"];
for (const safeIssue of [
  "cannot_find_passenger",
  "passenger_no_show",
  "flight_or_pickup_timing_changed",
  "vehicle_issue",
  "traffic_delay",
  "accident_or_safety_concern",
  "other_issue",
]) {
  assertIncludes(driverIssueHelper, safeIssue, `driver issue enum ${safeIssue}`);
}
assertExcludes(driverIssueHelper, /payout|payment|invoice|billing|customer_price|paynow/i, "driver issue enum unsafe issue types");

const driverBidsRoute = files["app/api/driver-job-bids/route.ts"];
assertExcludes(driverBidsRoute, "request.json", "blocked driver bids route body parsing");
assertIncludes(driverBidsRoute, "blockedDriverBidResponse", "blocked driver bids input boundary");

for (const setupRoutePath of [
  "app/api/driver-job/[token]/flight-eta-setup/route.ts",
  "app/api/driver-job/[token]/flight-eta-acknowledgement-setup/route.ts",
]) {
  assertExcludes(files[setupRoutePath], "request.json", `${setupRoutePath} setup-only body parsing`);
}

for (const { label, requiredFragments, script } of contractChecks) {
  const source = files[script];

  for (const fragment of requiredFragments) {
    assertIncludes(source, fragment, `${label} source fragment ${fragment}`);
  }
}

for (const contractCheck of contractChecks) {
  runContractCheck(contractCheck);
}

console.log("Public API request input boundary guard passed");
