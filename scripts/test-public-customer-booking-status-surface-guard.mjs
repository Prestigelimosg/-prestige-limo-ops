import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-customer-booking-status-surface-guard.mjs";

const bookPagePath = "app/book/page.tsx";
const portalPagePath = "app/my-bookings/page.tsx";
const portalAdapterPath = "lib/customer-portal-saved-bookings-adapter.ts";
const statusReadPath = "lib/customer-booking-status-read.ts";
const statusRoutePath = "app/api/customer-booking-statuses/route.ts";

const allowedStatusQueryParams = ["booking_reference", "limit", "page"];
const expectedRouteMethods = ["GET", "PATCH", "POST"];
const allowedStatusRecordFields = [
  "booking_reference",
  "cancellation_review_status",
  "change_review_status",
  "created_at",
  "customer_facing_status",
  "dropoff_location",
  "passenger_name",
  "pickup_at",
  "pickup_location",
  "request_review_status",
  "service_type",
  "short_notice_review_status",
  "updated_at",
];

const unsafeCustomerStatusSurfacePattern =
  /admin_internal_status|admin_status|billing|contact_phone|contact_email|passenger_phone|customer_price|quoted_price|rate_amount|driver_payout|paynow|pay_now|invoice|payment|pdf|payout|finance|parser_debug|parser_learning|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|internal_finance_note|internal_note|admin_note|server_secret|session_token|raw_token|token_hash|driver_token/i;

const contractChecks = [
  {
    label: "customer booking status API contract",
    script: "scripts/test-customer-booking-status-api-contract.mjs",
    requiredFragments: [
      "Customer booking status read path must remain read-only.",
      "Customer booking status select must not include private customer/admin/parser columns.",
      "Customer booking status API contract tests passed.",
    ],
  },
  {
    label: "public API method surface boundary guard",
    script: "scripts/test-public-api-method-surface-boundary-guard.mjs",
    requiredFragments: [
      "customer booking status method contract",
      "postResponse",
      "patchResponse",
      "Public API method surface boundary guard passed",
    ],
  },
  {
    label: "public API request input boundary guard",
    script: "scripts/test-public-api-request-input-boundary-guard.mjs",
    requiredFragments: [
      "Customer saved-bookings, booking-memory, and booking-status read inputs must keep explicit query allowlists and forbidden-fragment checks on both query keys and values.",
      "customer booking status query input contract",
      "Public API request input boundary guard passed",
    ],
  },
  {
    label: "public API response privacy boundary guard",
    script: "scripts/test-public-api-response-privacy-boundary-guard.mjs",
    requiredFragments: [
      "customer booking status response contract",
      "statuses: result.data.statuses",
      "Public API response privacy boundary guard passed",
    ],
  },
  {
    label: "public API session cookie/cache boundary guard",
    script: "scripts/test-public-api-session-cookie-cache-boundary-guard.mjs",
    requiredFragments: [
      "customer booking status header-token route contract",
      "Customer booking status stays on its explicit server session-token header contract and does not set cookies.",
      "customer booking status cookie parsing",
      "Public API session cookie/cache boundary guard passed",
    ],
  },
  {
    label: "public API runtime gate boundary guard",
    script: "scripts/test-public-api-runtime-gate-boundary-guard.mjs",
    requiredFragments: [
      "customer booking status runtime gate contract",
      "PRESTIGE_CUSTOMER_BOOKING_STATUS_AUTH_ENABLED",
      "x-prestige-customer-session-token",
      "Public API runtime gate boundary guard passed",
    ],
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

function extractSetItems(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(match, `Expected ${constName} set literal.`);

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractTypeKeys(source, typeName) {
  const match = source.match(new RegExp(`export\\s+type\\s+${typeName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  assert.ok(match, `Expected exported type ${typeName}.`);

  return [...match[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)\??:\s/gm)].map((item) => item[1]);
}

function extractExportedMethods(source) {
  return [...source.matchAll(/export\s+async\s+function\s+([A-Z]+)\s*\(/g)].map((item) => item[1]);
}

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function stripForbiddenFragmentAllowlist(source, constName) {
  return source.replace(
    new RegExp(`const\\s+${constName}\\s*=\\s*\\[[\\s\\S]*?\\];\\n`),
    "",
  );
}

function runContractCheck({ label, script }) {
  const result = spawnSync(process.execPath, [script], {
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
  bookPagePath,
  portalPagePath,
  portalAdapterPath,
  statusReadPath,
  statusRoutePath,
  ...contractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const bookPage = files[bookPagePath];
const portalPage = files[portalPagePath];
const portalAdapter = files[portalAdapterPath];
const statusRead = files[statusReadPath];
const statusRoute = files[statusRoutePath];
const publicClientSource = `${bookPage}\n${portalPage}\n${portalAdapter}`;
const statusReadExposureSource = stripForbiddenFragmentAllowlist(
  statusRead,
  "forbiddenCustomerStatusFragments",
);
const ledgerSection = sectionBetween(
  ledger,
  "### Public Customer Booking Status Surface Guard Lock",
);

for (const phrase of [
  "Public customer booking status lookup surfaces are guarded across `/api/customer-booking-statuses`, `lib/customer-booking-status-read.ts`, `/my-bookings`, and public customer client code.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, auth activation, or new shims.",
  "The customer booking status route must keep GET read handling only, with POST and PATCH blocked by the auth-required result and no PUT, DELETE, HEAD, OPTIONS, TRACE, or CONNECT exports.",
  "The status reader must remain server-only, default-off, same-origin `/my-bookings` referer gated, purpose-header gated, explicit server session-token gated, cookie-free, and limited to `booking_reference`, `limit`, and `page` query params.",
  "`/book`, `/my-bookings`, and the customer portal saved-bookings adapter must not call `/api/customer-booking-statuses` or expose the status purpose header, status session-token header, booking-status env names, Cookie, Authorization, or browser credential storage.",
  "Customer booking status API output must stay limited to safe customer-facing status, review status, booking reference, pickup/drop-off, passenger, service, created, and updated metadata and must exclude customer price, driver payout, PayNow payout, billing, invoice/payment/PDF, internal finance/admin notes, parser/debug, secrets/tokens, provider/send, notification payloads, live location/photo, and mock QA/dev archive fields.",
  "This guard coordinates the customer booking status API contract, public API method surface guard, public API request input guard, public API response privacy guard, public API session cookie/cache guard, and public API runtime gate guard in the preactivation suite.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-customer-booking-status-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public customer booking status ledger phrase: ${phrase}`);
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation public customer booking status surface guard registration",
);

for (const forbiddenPattern of [
  /\/api\/customer-booking-statuses/i,
  /customer-booking-status-read/i,
  /x-prestige-customer-session-token|x-prestige-customer-purpose[^"]*customer-booking-status-read/i,
  /PRESTIGE_CUSTOMER_BOOKING_STATUS/i,
  /\b(?:Authorization|authorization|Cookie|cookie)\b/,
  /localStorage|sessionStorage|document\.cookie|navigator\.credentials/i,
]) {
  assertExcludes(publicClientSource, forbiddenPattern, "public customer client status exposure");
}

assertSameList(
  extractTypeKeys(statusRead, "CustomerBookingStatusRecord"),
  allowedStatusRecordFields,
  "customer booking status public record fields",
);
assertSameList(
  extractSetItems(statusRead, "allowedQueryParams"),
  allowedStatusQueryParams,
  "customer booking status query params",
);
for (const fragment of [
  'import "server-only";',
  'export const customerBookingStatusReadVersion =\n  "stage-customer-booking-status-read-api-v1";',
  "const defaultStatusLimit = 10;",
  "const maxStatusLimit = 25;",
  "const maxStatusPage = 1000;",
  "booking_reference, service_type, pickup_at, pickup_datetime, pickup_location, dropoff_location, route_type, passenger_name, customer_facing_status, short_notice_review_status, request_review_status, change_review_status, cancellation_review_status, created_at, updated_at",
  "purpose !== \"customer-booking-status-read\"",
  "refererUrl.origin !== requestUrl.origin || refererUrl.pathname !== \"/my-bookings\"",
  "process.env.PRESTIGE_CUSTOMER_BOOKING_STATUS_AUTH_ENABLED !== \"true\"",
  "request.headers.get(\"x-prestige-customer-session-token\")?.trim() || \"\"",
  "mode !== \"server-session-token\"",
  "providedToken !== expectedToken",
  "mode: \"server-session-token\"",
  "source_surface: \"customer_api\"",
  ".from(\"customer_access_accounts\")",
  ".from(\"bookings\")",
  ".select(customerBookingStatusSelect)",
  ".eq(\"customer_id\", customerAccountReference)",
  ".order(\"updated_at\", { ascending: false })",
  ".range(offset, rangeEnd)",
]) {
  assertIncludes(statusRead, fragment, `customer booking status read boundary ${fragment}`);
}
for (const fragment of [
  "includesForbiddenFragment(key)",
  "includesForbiddenFragment(String(value ?? \"\"))",
  "Customer booking status lookup includes fields outside the approved read scope.",
  "Malformed customer booking status booking_reference rejected.",
  "Malformed customer booking status limit rejected.",
  "Malformed customer booking status page rejected.",
]) {
  assertIncludes(statusRead, fragment, `customer booking status input guard ${fragment}`);
}
assertExcludes(statusRead, "request.headers.get(\"cookie\")", "customer booking status cookie parsing");
assertExcludes(
  statusRead.match(/customerBookingStatusSelect\s*=\s*([^;]+)/)?.[1] || "",
  unsafeCustomerStatusSurfacePattern,
  "customer booking status selected columns",
);
assertExcludes(
  statusRead,
  /\.(?:insert|upsert|delete|update|rpc)\s*\(/,
  "customer booking status server reader write/query methods",
);
assertExcludes(
  statusReadExposureSource,
  /\/api\/admin-saved-bookings|\/api\/ai-parse|telegram|whatsapp|sms|email|provider|send/i,
  "customer booking status server reader forbidden dependencies",
);

assertSameList(extractExportedMethods(statusRoute), expectedRouteMethods, "customer booking status route methods");
assertIncludes(statusRoute, 'export const dynamic = "force-dynamic";', "customer booking status route force-dynamic");
assertIncludes(statusRoute, "const boundary = resolveCustomerBookingStatusBoundary(request);", "customer booking status route boundary");
assertIncludes(statusRoute, "loadCustomerBookingStatuses(new URL(request.url).searchParams, boundary.data)", "customer booking status route read call");
for (const fragment of [
  "statuses: result.data.statuses",
  "pagination: result.data.pagination",
  "version: result.data.version",
]) {
  assertIncludes(statusRoute, fragment, `customer booking status route safe response ${fragment}`);
}
assert.equal(countOccurrences(statusRoute, "customerBookingStatusAuthRequiredResult()"), 2, "non-GET status route auth block count");
assertExcludes(statusRoute, /Set-Cookie|cookie:|session_token|raw_token|token_hash|service_role/i, "customer booking status route response/source leak");
assertExcludes(statusRoute, /\.(?:insert|upsert|delete|update|rpc)\s*\(/, "customer booking status route write/query methods");
assertExcludes(statusRoute, /\bexport\s+async\s+function\s+(?:PUT|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\b/, "customer booking status unsupported route methods");

for (const { label, requiredFragments, script } of contractChecks) {
  const source = files[script];

  for (const fragment of requiredFragments) {
    assertIncludes(source, fragment, `${label} source fragment ${fragment}`);
  }
}

for (const contractCheck of contractChecks) {
  runContractCheck(contractCheck);
}

console.log("Public customer booking status surface guard passed");
