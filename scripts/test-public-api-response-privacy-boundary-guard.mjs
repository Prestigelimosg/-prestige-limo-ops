import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-api-response-privacy-boundary-guard.mjs";

const responseContractChecks = [
  {
    label: "customer booking request response contract",
    script: "scripts/test-customer-booking-request-api-contract.mjs",
    requiredFragments: [
      "unsafeCustomerRequestLeakPattern",
      "assertSafeCustomerBody",
      "short_notice_review_required",
      "Customer booking request API contract passed.",
    ],
    stripTypes: true,
  },
  {
    label: "customer saved bookings response contract",
    script: "scripts/test-customer-saved-bookings-api-contract.mjs",
    requiredFragments: [
      "unsafeCustomerSavedBookingsLeakPattern",
      "allowedSavedBookingFields",
      "assertSafeApiBody",
      "Customer saved bookings API contract tests passed.",
    ],
    stripTypes: true,
  },
  {
    label: "customer booking memory response contract",
    script: "scripts/test-customer-booking-memory-api-contract.mjs",
    requiredFragments: [
      "unsafeCustomerBookingMemoryLeakPattern",
      "allowedMemoryFields",
      "assertSafeApiBody",
      "Customer booking memory API contract tests passed.",
    ],
    stripTypes: true,
  },
  {
    label: "customer booking status response contract",
    script: "scripts/test-customer-booking-status-api-contract.mjs",
    requiredFragments: [
      "unsafeCustomerStatusLeakPattern",
      "assertSafeApiBody",
      "Customer booking status API contract tests passed.",
    ],
    stripTypes: true,
  },
  {
    label: "customer portal session response contract",
    script: "scripts/test-customer-portal-session-issue-api-contract.mjs",
    requiredFragments: [
      "safeBodyLeakPattern",
      "unsafeCustomerSessionPattern",
      "Set-Cookie",
      "Customer portal session issue API contract passed.",
    ],
    stripTypes: true,
  },
  {
    label: "customer/driver app notification response contract",
    script: "scripts/test-customer-driver-app-notification-api-contract.mjs",
    requiredFragments: [
      "unsafeNotificationLeakPattern",
      "driver_job_link_id",
      "source_surface",
      "Customer/driver app notification API contract tests passed.",
    ],
    stripTypes: true,
  },
  {
    label: "driver job link response contract",
    script: "scripts/test-driver-job-link-api-contract.mjs",
    requiredFragments: [
      "assertNoSensitiveData",
      "Response should not expose customer price.",
      "Response should not expose driver payout.",
      "Driver job link API contract tests passed.",
    ],
    stripTypes: true,
  },
  {
    label: "driver job route response contract",
    script: "scripts/test-driver-job-link-api-routes.mjs",
    requiredFragments: [
      "assertNoSensitiveData",
      "external_send",
      "driver_payout_needed",
      "Driver job link API route tests passed.",
    ],
    stripTypes: true,
  },
  {
    label: "driver bidding response contract",
    script: "scripts/test-driver-portal-bidding-api-contract.mjs",
    requiredFragments: [
      "unsafeBiddingLeakPattern",
      "driverBidBlockedError",
      "Driver portal bidding API contract tests passed.",
    ],
    stripTypes: true,
  },
  {
    label: "driver flight ETA setup response contract",
    script: "scripts/test-driver-flight-eta-setup-api-contract.mjs",
    requiredFragments: [
      "token_scoped",
      "customer_update_status",
      "driver flight ETA setup API contract passed",
    ],
    stripTypes: false,
  },
  {
    label: "driver flight ETA acknowledgement setup response contract",
    script: "scripts/test-driver-flight-eta-acknowledgement-setup-api-contract.mjs",
    requiredFragments: [
      "setup_only",
      "mng_arrival_only",
      "driver flight ETA acknowledgement setup API contract passed",
    ],
    stripTypes: false,
  },
];

const publicApiRoutePaths = [
  "app/api/customer-booking-requests/route.ts",
  "app/api/customer-booking-statuses/route.ts",
  "app/api/customer-portal-sessions/route.ts",
  "app/api/customer-saved-bookings/route.ts",
  "app/api/customer-booking-memory/route.ts",
  "app/api/customer-app-notifications/route.ts",
  "app/api/driver-job/[token]/route.ts",
  "app/api/driver-job/[token]/status/route.ts",
  "app/api/driver-job/[token]/notifications/route.ts",
  "app/api/driver-job/[token]/issue-alert/route.ts",
  "app/api/driver-job/[token]/flight-eta-setup/route.ts",
  "app/api/driver-job/[token]/flight-eta-acknowledgement-setup/route.ts",
  "app/api/driver-job-bids/route.ts",
];

const responseForbiddenPattern =
  /admin_internal_status|customer_price|quoted_price|driver_payout|paynow|pay_now|billing|invoice|payment|payout|pdf|internal_admin_note|internal_finance_note|parser_debug|raw_ai|raw_parser_prompt|mock_archive|mock_qa|dev_workbench|service_role|server_secret|session_token|raw_token|token_hash|driver_token/i;

const customerRoutePaths = publicApiRoutePaths.filter((path) => path.includes("/customer-"));

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

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function assertNoLineMatches(source, pattern, label) {
  const matchingLines = source
    .split(/\r?\n/)
    .map((line, index) => ({ index: index + 1, line }))
    .filter(({ line }) => pattern.test(line))
    .filter(({ line }) => !/external_send:\s*false/.test(line));

  assert.deepEqual(
    matchingLines,
    [],
    `${label} must not have matching lines for ${pattern}.`,
  );
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
  ...responseContractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const ledgerSection = sectionBetween(ledger, "### Public API Response Privacy Boundary Guard Lock");

for (const phrase of [
  "Public customer/driver API response privacy is guarded across customer booking request, customer saved bookings, customer booking memory, customer booking status, customer portal session, customer/driver app notifications, driver job link, driver job status, driver issue-alert, driver bidding, and driver flight ETA setup response contracts.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.",
  "Customer API responses must stay limited to safe request/status/memory/saved-booking/session metadata and must not expose driver payout, PayNow payout, billing, invoice/payment/PDF, internal finance/admin notes, parser/debug internals, service-role/token/secrets, or mock QA/dev archive fields.",
  "Driver API responses must stay limited to `SafeDriverJobPayload`, safe status/issue-alert metadata, disabled bidding/auth-required errors, safe notification records, and setup-only flight ETA metadata.",
  "Public API response contracts must continue checking safe body leak patterns and allowed field lists with mocked route harnesses; this guard coordinates those scripts in the preactivation suite.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-api-response-privacy-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public API response privacy ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation public API response privacy guard registration");

for (const { label, requiredFragments, script } of responseContractChecks) {
  const source = files[script];

  for (const fragment of requiredFragments) {
    assertIncludes(source, fragment, `${label} source fragment ${fragment}`);
  }
}

for (const routePath of publicApiRoutePaths) {
  assertNoLineMatches(files[routePath], responseForbiddenPattern, `Public API route response source ${routePath}`);
}

for (const routePath of customerRoutePaths) {
  assertExcludes(
    files[routePath],
    /Response\.json\(\s*result\b/,
    `Customer API route ${routePath} raw result response`,
  );
}

const customerBookingRequestRoute = files["app/api/customer-booking-requests/route.ts"];
for (const safeRequestFragment of [
  "booking_reference: result.data.booking_reference",
  "customer_facing_status: result.data.customer_facing_status",
  "short_notice_review_required:",
  "customerSafeError",
]) {
  assertIncludes(customerBookingRequestRoute, safeRequestFragment, `customer booking request route ${safeRequestFragment}`);
}

const customerSavedBookingsRoute = files["app/api/customer-saved-bookings/route.ts"];
for (const safeSavedBookingsFragment of [
  "saved_bookings: result.data.saved_bookings",
  "pagination: result.data.pagination",
  "version: result.data.version",
]) {
  assertIncludes(customerSavedBookingsRoute, safeSavedBookingsFragment, `customer saved bookings route ${safeSavedBookingsFragment}`);
}

const customerBookingMemoryRoute = files["app/api/customer-booking-memory/route.ts"];
assertIncludes(
  customerBookingMemoryRoute,
  "memories: result.data.memories",
  "customer booking memory safe response records",
);

const customerBookingStatusRoute = files["app/api/customer-booking-statuses/route.ts"];
for (const safeStatusFragment of [
  "statuses: result.data.statuses",
  "pagination: result.data.pagination",
  "version: result.data.version",
]) {
  assertIncludes(customerBookingStatusRoute, safeStatusFragment, `customer booking status route ${safeStatusFragment}`);
}

const driverJobRoute = files["app/api/driver-job/[token]/route.ts"];
assertIncludes(driverJobRoute, "payload: result.payload", "driver job route safe payload response");

const driverJobStatusRoute = files["app/api/driver-job/[token]/status/route.ts"];
for (const safeDriverStatusFragment of [
  "status: result.status",
  "payload: result.payload",
  "safeStatusContext",
  "safeStatusNote",
]) {
  assertIncludes(driverJobStatusRoute, safeDriverStatusFragment, `driver status route ${safeDriverStatusFragment}`);
}

const driverNotificationsRoute = files["app/api/driver-job/[token]/notifications/route.ts"];
for (const safeNotificationFragment of [
  "notifications: result.data.notifications",
  "pagination: result.data.pagination",
  "version: result.data.version",
  "notification: result.data",
]) {
  assertIncludes(driverNotificationsRoute, safeNotificationFragment, `driver notifications route ${safeNotificationFragment}`);
}

const driverIssueAlertRoute = files["app/api/driver-job/[token]/issue-alert/route.ts"];
for (const safeIssueAlertFragment of [
  "external_send: false",
  "issue_label: issueChoice.label",
  "issue_type: issueChoice.value",
  "notification_status:",
]) {
  assertIncludes(driverIssueAlertRoute, safeIssueAlertFragment, `driver issue alert route ${safeIssueAlertFragment}`);
}

const driverBidsRoute = files["app/api/driver-job-bids/route.ts"];
assertIncludes(
  driverBidsRoute,
  "Driver bidding requires approved driver auth before runtime access.",
  "driver bids public blocked response",
);

for (const contractCheck of responseContractChecks) {
  runContractCheck(contractCheck);
}

console.log("Public API response privacy boundary guard passed");
