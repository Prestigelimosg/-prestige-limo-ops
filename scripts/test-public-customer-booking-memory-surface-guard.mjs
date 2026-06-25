import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-customer-booking-memory-surface-guard.mjs";

const bookPagePath = "app/book/page.tsx";
const memoryAdapterPath = "lib/customer-booking-memory-adapter.ts";
const memoryFormPath = "lib/customer-booking-memory-form.ts";
const memoryReadPath = "lib/customer-booking-memory-read.ts";
const memoryRoutePath = "app/api/customer-booking-memory/route.ts";

const allowedMemoryRecordFields = [
  "dropoff_location",
  "last_used_at",
  "passenger_name",
  "pickup_location",
  "service_type",
  "vehicle_type",
];

const allowedMemoryPayloadFields = ["memories", "ok", "version"];
const allowedMemoryQueryParams = ["limit", "q"];
const expectedRouteMethods = ["DELETE", "GET", "PATCH", "POST", "PUT"];

const unsafeCustomerMemorySurfacePattern =
  /admin_internal_status|admin_status|billing|contact_phone|contact_email|passenger_phone|customer_price|quoted_price|rate_amount|driver_payout|paynow|pay_now|invoice|payment|pdf|payout|finance|parser_debug|parser_learning|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|internal_finance_note|internal_note|admin_note|server_secret|session_token|raw_token|token_hash|driver_token/i;

const contractChecks = [
  {
    label: "customer booking memory UI contract",
    script: "scripts/test-customer-booking-memory-ui-contract.mjs",
    requiredFragments: [
      "The booking page client must not import the server-only booking memory reader.",
      "The customer booking memory client path must remain read-only.",
      "The booking memory fetch must not attach session-token, authorization, or cookie headers.",
      "Customer booking memory UI contract tests passed.",
    ],
  },
  {
    label: "customer booking memory API contract",
    script: "scripts/test-customer-booking-memory-api-contract.mjs",
    requiredFragments: [
      "Customer booking memory read path must remain read-only.",
      "Customer booking memory select must not include private customer/admin/finance/payout/parser columns.",
      "Customer booking memory API contract tests passed.",
    ],
  },
  {
    label: "public API request input boundary guard",
    script: "scripts/test-public-api-request-input-boundary-guard.mjs",
    requiredFragments: [
      "Customer saved-bookings, booking-memory, and booking-status read inputs must keep explicit query allowlists and forbidden-fragment checks on both query keys and values.",
      "customer booking memory query input contract",
      "Public API request input boundary guard passed",
    ],
  },
  {
    label: "public API response privacy boundary guard",
    script: "scripts/test-public-api-response-privacy-boundary-guard.mjs",
    requiredFragments: [
      "customer booking memory response contract",
      "allowedMemoryFields",
      "Public API response privacy boundary guard passed",
    ],
  },
  {
    label: "public API session cookie/cache boundary guard",
    script: "scripts/test-public-api-session-cookie-cache-boundary-guard.mjs",
    requiredFragments: [
      "Customer booking request, booking memory, and portal saved-bookings client adapters must use",
      "while never manually attaching Cookie, Authorization, or customer session-token headers.",
      "Customer saved-bookings and booking-memory reads may accept a server-validated same-origin session cookie",
      "Public API session cookie/cache boundary guard passed",
    ],
  },
  {
    label: "public API client caller boundary guard",
    script: "scripts/test-public-api-client-caller-boundary-guard.mjs",
    requiredFragments: [
      "customer booking memory UI contract",
      "The booking memory fetch must not attach session-token, authorization, or cookie headers.",
      "Public API client caller boundary guard passed",
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

function blockBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing source block start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing source block end after ${startFragment}: ${endFragment}`);

  return source.slice(start, end + endFragment.length);
}

function extractSetItems(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(match, `Expected ${constName} set literal.`);

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
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
  memoryAdapterPath,
  memoryFormPath,
  memoryReadPath,
  memoryRoutePath,
  ...contractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const bookPage = files[bookPagePath];
const memoryAdapter = files[memoryAdapterPath];
const memoryForm = files[memoryFormPath];
const memoryRead = files[memoryReadPath];
const memoryRoute = files[memoryRoutePath];
const publicClientSource = `${bookPage}\n${memoryAdapter}\n${memoryForm}`;
const memoryReadExposureSource = stripForbiddenFragmentAllowlist(
  memoryRead,
  "forbiddenCustomerBookingMemoryFragments",
);
const ledgerSection = sectionBetween(
  ledger,
  "### Public Customer Booking Memory Surface Guard Lock",
);

for (const phrase of [
  "Public customer booking memory suggestion surfaces are guarded across `/book`, `lib/customer-booking-memory-adapter.ts`, `lib/customer-booking-memory-form.ts`, `lib/customer-booking-memory-read.ts`, and `/api/customer-booking-memory`.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, auth activation, or new shims.",
  "`/book` booking memory must remain a quiet passenger datalist suggestion read only; it must not submit forms, show extra customer-facing memory instructions, expose auth failures, or overwrite customer date/time choices.",
  "The customer booking memory adapter must keep using only `GET /api/customer-booking-memory?limit=10` with optional safe `q`, `cache: \"no-store\"`, `credentials: \"same-origin\"`, and the customer booking-memory purpose header without manual Cookie, Authorization, customer session-token, admin headers, or browser credential storage.",
  "The customer booking memory route must keep GET read handling only, with POST, PUT, PATCH, and DELETE blocked by the auth-required result.",
  "The server reader must remain server-only, same-origin `/book` referer gated, purpose-header gated, server-session-token/server-validated cookie gated, default-off, and limited to `limit` and `q` query params.",
  "Customer booking memory API and adapter output must stay limited to passenger name, pickup/drop-off, service, vehicle, and last-used metadata and must exclude customer price, driver payout, PayNow payout, billing, invoice/payment/PDF, internal finance/admin notes, parser/debug, secrets/tokens, provider/send, notification payloads, live location/photo, and mock QA/dev archive fields.",
  "This guard coordinates the customer booking memory UI contract, customer booking memory API contract, public API request input guard, public API response privacy guard, public API session cookie/cache guard, and public API client caller guard in the preactivation suite.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-customer-booking-memory-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public customer booking memory ledger phrase: ${phrase}`);
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation public customer booking memory surface guard registration",
);

for (const fragment of [
  "loadCustomerBookingMemorySuggestions",
  "applyCustomerBookingMemoryToRequestForm",
  "findCustomerBookingMemorySuggestion",
  "bookingMemoryLoadStarted = useRef(false)",
  "bookingMemoryLoadStarted.current = true",
  "data-customer-booking-memory-passenger-input",
  "data-customer-booking-memory-passenger-list",
  "<datalist",
  'autoComplete="off"',
  "onFocus={ensureBookingMemorySuggestions}",
  "onPointerDown={ensureBookingMemorySuggestions}",
  "onChange={(event) => updatePassengerName(event.target.value)}",
]) {
  assertIncludes(bookPage, fragment, `/book memory suggestion fragment ${fragment}`);
}

const memoryLoadBlock = blockBetween(
  bookPage,
  "async function ensureBookingMemorySuggestions()",
  "function updatePassengerName",
);
assertExcludes(
  memoryLoadBlock,
  /setFeedback|bookingMemoryError|login required|please log in|sign in/i,
  "/book memory auth failure visible feedback",
);
assertIncludes(
  memoryLoadBlock,
  "const suggestions = await loadCustomerBookingMemorySuggestions();",
  "/book memory adapter delegation",
);

const passengerUpdateBlock = blockBetween(
  bookPage,
  "function updatePassengerName(value: string)",
  "function applyLocalVoiceDraftFieldFill",
);
assertIncludes(
  passengerUpdateBlock,
  "return suggestion ? applyBookingMemoryToForm(nextForm, suggestion) : nextForm;",
  "/book memory suggestion application",
);
assertExcludes(
  passengerUpdateBlock,
  /pickupDate|pickupTime/,
  "/book memory passenger update date/time preservation",
);

const memoryClientExposureSource = stripForbiddenFragmentAllowlist(
  `${memoryLoadBlock}\n${passengerUpdateBlock}\n${memoryAdapter}\n${memoryForm}`,
  "forbiddenCustomerBookingMemoryFragments",
);

for (const forbiddenPattern of [
  /\bfetch\s*\(/,
  /x-prestige-customer-session-token|Authorization|authorization|Cookie|cookie|x-prestige-admin-purpose/,
  /localStorage|sessionStorage|document\.cookie|navigator\.credentials/i,
  /\/api\/admin|\/api\/admin-saved-bookings|\/api\/ai-parse/i,
]) {
  assertExcludes(memoryClientExposureSource, forbiddenPattern, "public booking memory client exposure");
}
assertExcludes(
  memoryClientExposureSource,
  unsafeCustomerMemorySurfacePattern,
  "public booking memory customer-visible/source exposure",
);
assertExcludes(publicClientSource, /\.(?:insert|upsert|delete|update|rpc)\s*\(/, "public booking memory client write/query methods");
assertExcludes(publicClientSource, /from\s+["'].*customer-booking-memory-read["']|lib\/customer-booking-memory-read/, "public booking memory server reader import");

assertSameList(
  extractSetItems(memoryAdapter, "allowedApiRecordFields"),
  allowedMemoryRecordFields,
  "customer booking memory adapter API record fields",
);
assertSameList(
  extractSetItems(memoryAdapter, "allowedApiPayloadFields"),
  allowedMemoryPayloadFields,
  "customer booking memory adapter API payload fields",
);
for (const fragment of [
  "export const customerBookingMemoryApiPath = \"/api/customer-booking-memory\";",
  "fetcher(`${customerBookingMemoryApiPath}?${params}`",
  "params.set(\"q\", query);",
  'cache: "no-store"',
  'credentials: "same-origin"',
  '"x-prestige-customer-purpose": "customer-booking-memory-read"',
  "if (q && !query) {\n    return null;\n  }",
  "if (!response.ok) {\n      return null;\n    }",
  "return mapCustomerBookingMemoryPayload(await response.json());",
  "return null;",
]) {
  assertIncludes(memoryAdapter, fragment, `customer booking memory adapter safe behavior ${fragment}`);
}
assertExcludes(memoryAdapter, /x-prestige-customer-session-token|Authorization|authorization|Cookie|cookie|x-prestige-admin-purpose/, "customer booking memory adapter manual auth/admin headers");
assertExcludes(memoryAdapter, /\.(?:insert|upsert|delete|update|rpc)\s*\(/, "customer booking memory adapter write/query methods");

for (const fragment of [
  "const nextForm = applyCustomerBookingMemorySuggestion(form, suggestion);",
  "serviceOptions.includes(nextForm.serviceType)",
  "vehicleOptions.includes(nextForm.vehicleType)",
]) {
  assertIncludes(memoryForm, fragment, `customer booking memory form helper fragment ${fragment}`);
}

assertIncludes(memoryRead, 'import "server-only";', "customer booking memory server-only import");
assertIncludes(
  memoryRead,
  'export const customerBookingMemoryReadVersion =\n  "customer-booking-memory-read-v1";',
  "customer booking memory read version",
);
assertSameList(extractSetItems(memoryRead, "allowedQueryParams"), allowedMemoryQueryParams, "customer booking memory query params");
for (const fragment of [
  "const defaultMemoryLimit = 10;",
  "const maxMemoryLimit = 10;",
  "const maxMemoryQueryLength = 120;",
  "booking_reference, passenger_name, pickup_location, dropoff_location, service_type, route_type, vehicle_type, vehicle, pickup_at, pickup_datetime, updated_at, created_at",
  "purpose !== \"customer-booking-memory-read\"",
  "refererUrl.origin !== requestUrl.origin || refererUrl.pathname !== \"/book\"",
  "process.env.PRESTIGE_CUSTOMER_BOOKING_MEMORY_AUTH_ENABLED !== \"true\"",
  "mode !== \"server-session-token\"",
  "providedToken.token !== expectedToken",
  "providedToken.source === \"request-cookie\" ? \"server-session-cookie\" : \"server-session-token\"",
  ".from(\"customer_access_accounts\")",
  ".from(\"bookings\")",
  ".select(customerBookingMemorySelect)",
  ".eq(\"customer_id\", customerAccountReference)",
  ".order(\"updated_at\", { ascending: false })",
  ".limit(parsed.data.limit * 5)",
]) {
  assertIncludes(memoryRead, fragment, `customer booking memory read boundary ${fragment}`);
}
assertExcludes(
  memoryRead.match(/customerBookingMemorySelect\s*=\s*([^;]+)/)?.[1] || "",
  unsafeCustomerMemorySurfacePattern,
  "customer booking memory selected columns",
);
assertExcludes(
  memoryRead,
  /\.(?:insert|upsert|delete|update|rpc)\s*\(/,
  "customer booking memory server reader write/query methods",
);
assertExcludes(
  memoryReadExposureSource,
  /\/api\/admin-saved-bookings|\/api\/ai-parse|telegram|whatsapp|sms|email|provider|send/i,
  "customer booking memory server reader forbidden dependencies",
);

assertSameList(extractExportedMethods(memoryRoute), expectedRouteMethods, "customer booking memory route methods");
assertIncludes(memoryRoute, 'export const dynamic = "force-dynamic";', "customer booking memory route force-dynamic");
assertIncludes(memoryRoute, "const boundary = resolveCustomerBookingMemoryBoundary(request);", "customer booking memory route boundary");
assertIncludes(memoryRoute, "loadCustomerBookingMemory(new URL(request.url).searchParams, boundary.data)", "customer booking memory route read call");
assertIncludes(memoryRoute, "memories: result.data.memories", "customer booking memory route safe response memories");
assertIncludes(memoryRoute, "version: result.data.version", "customer booking memory route safe response version");
assert.equal(countOccurrences(memoryRoute, "customerBookingMemoryAuthRequiredResult()"), 4, "non-GET memory route auth block count");
assertExcludes(memoryRoute, /Set-Cookie|cookie:|session_token|raw_token|token_hash|service_role/i, "customer booking memory route response/source leak");
assertExcludes(memoryRoute, /\.(?:insert|upsert|delete|update|rpc)\s*\(/, "customer booking memory route write/query methods");

for (const { label, requiredFragments, script } of contractChecks) {
  const source = files[script];

  for (const fragment of requiredFragments) {
    assertIncludes(source, fragment, `${label} source fragment ${fragment}`);
  }
}

for (const contractCheck of contractChecks) {
  runContractCheck(contractCheck);
}

console.log("Public customer booking memory surface guard passed");
