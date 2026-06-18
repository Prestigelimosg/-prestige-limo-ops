import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-api-client-caller-boundary-guard.mjs";

const customerPagePaths = ["app/book/page.tsx", "app/my-bookings/page.tsx"];
const customerAdapterPaths = [
  "lib/customer-booking-request-adapter.ts",
  "lib/customer-booking-memory-adapter.ts",
  "lib/customer-portal-saved-bookings-adapter.ts",
];
const driverPagePath = "app/driver-job/[token]/page.tsx";

const contractChecks = [
  {
    label: "customer booking page client API audit",
    script: "scripts/test-customer-booking-page-api-audit.mjs",
    requiredFragments: [
      "/book customer flow should only call the approved memory and request APIs.",
      "/book should delegate API calls to customer-safe client adapters instead of owning raw fetch calls.",
      "/book client code must not attach customer tokens, authorization, or cookie headers.",
      "Customer booking page API audit passed.",
    ],
    stripTypes: false,
  },
  {
    label: "customer booking memory UI contract",
    script: "scripts/test-customer-booking-memory-ui-contract.mjs",
    requiredFragments: [
      "The booking page client must not import the server-only booking memory reader.",
      "The booking page client must not expose customer session-token or server auth plumbing.",
      "The booking memory fetch must not attach session-token, authorization, or cookie headers.",
      "Customer booking memory UI contract tests passed.",
    ],
    stripTypes: true,
  },
  {
    label: "customer portal saved bookings adapter contract",
    script: "scripts/test-customer-portal-saved-bookings-adapter.mjs",
    requiredFragments: [
      "The customer portal client must not import the server-only saved-bookings reader.",
      "The customer portal client must not expose customer session-token plumbing.",
      "The customer portal saved-bookings fetch must not attach session-token, authorization, or cookie headers.",
      "Customer portal saved bookings adapter contract passed.",
    ],
    stripTypes: true,
  },
];

const forbiddenClientAuthPattern =
  /\b(?:Authorization|authorization|Cookie|cookie|x-prestige-customer-session-token|x-prestige-admin-purpose|PRESTIGE_CUSTOMER_[A-Z0-9_]*TOKEN|PRESTIGE_ADMIN_[A-Z0-9_]*)\b/;
const forbiddenDriverVisiblePattern =
  /\b(?:admin_internal_status|customer_price|quoted_price|driver_payout|billing|invoice|payment_link|paynow_qr|internal_admin_note|internal_finance_note|parser_debug|raw_ai|raw_parser_prompt|mock_archive|mock_qa|dev_workbench|service_role|server_secret|session_token|raw_token|token_hash|driver_token)\b/i;

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

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function sourceWithoutDriverPaymentFilter(source) {
  return source
    .split(/\r?\n/)
    .filter((line) => !line.includes("driverPaymentDetailLinePattern"))
    .join("\n");
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
  ...customerPagePaths,
  ...customerAdapterPaths,
  driverPagePath,
  ...contractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const ledgerSection = sectionBetween(ledger, "### Public API Client Caller Boundary Guard Lock");

for (const phrase of [
  "Public customer/driver browser caller boundaries are guarded across `/book`, `/my-bookings`, and `/driver-job/[token]` client surfaces plus their customer-safe adapters.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.",
  "`/book` and `/my-bookings` must delegate public API calls to customer-safe adapters instead of owning raw fetch/session plumbing.",
  "Customer client adapters must use `cache: \"no-store\"`, `credentials: \"same-origin\"`, and purpose headers while never manually attaching Cookie, Authorization, customer session-token, admin purpose, or server env-token plumbing.",
  "`/driver-job/[token]` must keep driver API calls no-store and limited to safe job GET, notification GET, issue-alert POST with `issue_type`, and status PATCH with `status` only.",
  "Driver client code must not expose customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance/admin notes, parser/debug internals, token secrets, or mock QA/dev archive fields.",
  "Public client caller contracts must continue coordinating the existing customer booking page API audit, customer booking memory UI contract, and customer portal saved-bookings adapter contract in the preactivation suite.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-api-client-caller-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public API client caller ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation public API client caller guard registration");

for (const { label, requiredFragments, script, stripTypes } of contractChecks) {
  const source = files[script];

  for (const fragment of requiredFragments) {
    assertIncludes(source, fragment, `${label} source fragment ${fragment}`);
  }

  runContractCheck({ label, script, stripTypes });
}

const bookingPage = files["app/book/page.tsx"];
assertExcludes(bookingPage, /\bfetch\s*\(/, "/book raw fetch");
for (const fragment of [
  "loadCustomerBookingMemorySuggestions",
  "submitCustomerBookingRequest",
  "data-customer-booking-memory-passenger-input",
  "data-customer-booking-memory-passenger-list",
]) {
  assertIncludes(bookingPage, fragment, `/book client caller ${fragment}`);
}

const portalPage = files["app/my-bookings/page.tsx"];
assertExcludes(portalPage, /\bfetch\s*\(/, "/my-bookings raw fetch");
for (const fragment of [
  "loadCustomerPortalSavedBookings",
  "useState<CustomerPortalBooking[]>([])",
  "setPortalBookings(loadedBookings || [])",
  'setPortalBookingsLoadState(loadedBookings === null ? "blocked" : "ready")',
  'data-customer-portal-access-state={portalBookingsLoadState}',
  '"Sign in to view bookings."',
]) {
  assertIncludes(portalPage, fragment, `/my-bookings client caller ${fragment}`);
}

const requestAdapter = files["lib/customer-booking-request-adapter.ts"];
for (const fragment of [
  "fetcher(customerBookingRequestApiPath",
  "body: JSON.stringify(toCustomerBookingRequestApiBody(input))",
  'cache: "no-store"',
  'credentials: "same-origin"',
  '"Content-Type": "application/json"',
  '"x-prestige-customer-purpose": "customer-booking-request"',
  'method: "POST"',
]) {
  assertIncludes(requestAdapter, fragment, `customer booking request adapter caller ${fragment}`);
}

const memoryAdapter = files["lib/customer-booking-memory-adapter.ts"];
for (const fragment of [
  "fetcher(`${customerBookingMemoryApiPath}?${params}`",
  'cache: "no-store"',
  'credentials: "same-origin"',
  '"x-prestige-customer-purpose": "customer-booking-memory-read"',
]) {
  assertIncludes(memoryAdapter, fragment, `customer booking memory adapter caller ${fragment}`);
}

const portalAdapter = files["lib/customer-portal-saved-bookings-adapter.ts"];
for (const fragment of [
  "fetcher(`${customerPortalSavedBookingsApiPath}?limit=25&page=1`",
  'cache: "no-store"',
  'credentials: "same-origin"',
  '"x-prestige-customer-purpose": "customer-saved-bookings-read"',
]) {
  assertIncludes(portalAdapter, fragment, `customer portal saved bookings adapter caller ${fragment}`);
}

for (const [label, source] of [
  ["/book page", bookingPage],
  ["/my-bookings page", portalPage],
  ["customer booking request adapter", requestAdapter],
  ["customer booking memory adapter", memoryAdapter],
  ["customer portal saved bookings adapter", portalAdapter],
]) {
  assertExcludes(source, forbiddenClientAuthPattern, `${label} manual auth/header/env-token plumbing`);
  assertExcludes(source, /localStorage|sessionStorage|document\.cookie|navigator\.credentials/i, `${label} browser credential storage`);
  assertExcludes(source, /\.(?:insert|upsert|delete|update|rpc)\s*\(/, `${label} direct write/query call`);
}

const driverPage = files[driverPagePath];
assert.equal(countOccurrences(driverPage, "fetch("), 4, "driver page fetch call count");
assert.equal(countOccurrences(driverPage, 'cache: "no-store"'), 4, "driver page no-store fetch count");
for (const fragment of [
  "fetch(`/api/driver-job/${encodeURIComponent(token)}`",
  "`/api/driver-job/${encodeURIComponent(token)}/notifications?limit=5&page=1`",
  "fetch(`/api/driver-job/${encodeURIComponent(token)}/issue-alert`",
  "fetch(`/api/driver-job/${encodeURIComponent(token)}/status`",
  "body: JSON.stringify({ issue_type: issueChoice.value })",
  "const requestBody: Record<string, unknown> = {\n        status: transitionGuard.status,\n      };",
  'headers: { "content-type": "application/json" }',
  'method: "POST"',
  'method: "PATCH"',
]) {
  assertIncludes(driverPage, fragment, `driver page caller ${fragment}`);
}
assert.equal(countOccurrences(driverPage, 'method: "POST"'), 1, "driver page POST count");
assert.equal(countOccurrences(driverPage, 'method: "PATCH"'), 1, "driver page PATCH count");
assertIncludes(driverPage, "const driverPaymentDetailLinePattern =", "driver page pasted payment-detail filter");
assertExcludes(driverPage, /credentials\s*:/, "driver page manual credentials");
assertExcludes(driverPage, forbiddenClientAuthPattern, "driver page manual auth/header/env-token plumbing");
assertExcludes(sourceWithoutDriverPaymentFilter(driverPage), forbiddenDriverVisiblePattern, "driver page forbidden visible/source fields");
assertExcludes(driverPage, /localStorage|sessionStorage|document\.cookie|navigator\.credentials/i, "driver page browser credential storage");
assertExcludes(driverPage, /navigator\.geolocation|navigator\.mediaDevices|getUserMedia|type=["']file["']|new FormData|URL\.createObjectURL/i, "driver page live location/photo client APIs");

console.log("Public API client caller boundary guard passed");
