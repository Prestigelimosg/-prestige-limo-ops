import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-driver-bidding-surface-guard.mjs";

const driverBidRoutePath = "app/api/driver-job-bids/route.ts";
const adminBidOfferRoutePath = "app/api/admin-driver-job-bid-offers/route.ts";
const biddingPersistencePath = "lib/driver-portal-bidding-persistence.ts";
const driverPagePath = "app/driver-job/[token]/page.tsx";
const driverDemoPagePath = "app/driver-job-demo/page.tsx";

const expectedRouteMethods = ["GET", "PATCH", "POST"];
const expectedBidOfferStatuses = ["assigned", "cancelled", "closed", "draft", "expired", "open"];
const expectedBidStatuses = ["accepted", "declined", "expired", "pending", "withdrawn"];
const expectedReadParams = [
  "bid_offer_id",
  "bid_status",
  "booking_reference",
  "driver_reference",
  "limit",
  "offer_status",
  "page",
];
const expectedSaveFields = [
  "bid_offer_id",
  "booking_reference",
  "closes_at",
  "next_action",
  "offer_status",
  "offer_summary",
  "pickup_at",
  "safe_dropoff_area",
  "safe_offer_context",
  "safe_pickup_area",
  "safe_trip_summary",
  "safe_vehicle_label",
];
const expectedStatusUpdateFields = ["bid_offer_id", "offer_status"];
const expectedSafeContextFields = ["next_action", "offer_summary"];
const expectedBidOfferSelectColumns = [
  "actor_label",
  "actor_role",
  "booking_reference",
  "closed_at",
  "closes_at",
  "created_at",
  "id",
  "offer_status",
  "opened_at",
  "pickup_at",
  "safe_dropoff_area",
  "safe_offer_context",
  "safe_pickup_area",
  "safe_trip_summary",
  "safe_vehicle_label",
  "source_surface",
  "updated_at",
];
const expectedBidSelectColumns = [
  "bid_source",
  "bid_status",
  "booking_reference",
  "created_at",
  "decided_at",
  "decision_actor_label",
  "decision_actor_role",
  "driver_job_bid_offer_id",
  "driver_reference",
  "id",
  "safe_bid_context",
  "safe_bid_note",
  "safe_driver_label",
  "submitted_at",
  "updated_at",
  "withdrawn_at",
];

const forbiddenDriverBiddingSurfacePattern =
  /customer[_ -]?price|quoted[_ -]?price|rate[_ -]?amount|fare[_ -]?amount|billing|invoice|payment|payment[_ -]?link|pdf|stripe|paynow|pay[_ -]?now|driver[_ -]?payout|payout|payout[_ -]?comparison|finance|internal[_ -]?(?:admin|finance)|admin[_ -]?note|parser[_ -]?debug|parser[_ -]?prompt|raw[_ -]?ai|notification[_ -]?delivery|send[_ -]?log|send[_ -]?state|telegram|whatsapp|sms|email[_ -]?send|live[_ -]?location|proof|photo|auth[_ -]?link|raw[_ -]?token|token[_ -]?hash|server[_ -]?secret|service[_ -]?role|mock[_ -]?(?:qa|archive)|dev[_ -]?workbench/i;

const forbiddenPublicCallerPattern =
  /\/api\/driver-job-bids|\/api\/admin-driver-job-bid-offers|bid_offer_id|driver_reference|x-prestige-admin-purpose|x-prestige-admin-session-token|Authorization|Bearer|Cookie|document\.cookie|localStorage|sessionStorage|navigator\.credentials|service_role|SUPABASE_SERVICE|PRESTIGE_ADMIN_BOOKING_PERSISTENCE/i;

const contractChecks = [
  {
    label: "driver portal bidding API contract",
    requiredFragments: [
      "Driver bidding requires approved driver auth before runtime access.",
      "unsafeBiddingLeakPattern",
      "driverBlockedMock.createdClients.length, 0",
      "Driver portal bidding API contract tests passed.",
    ],
    script: "scripts/test-driver-portal-bidding-api-contract.mjs",
  },
  {
    label: "driver portal bidding schema contract",
    requiredFragments: [
      "do not apply without explicit approval",
      "without public, anonymous, broad authenticated",
      "forbidden driver bidding column",
      "Driver portal bidding schema contract remains closed, bid-only, and backend-safe.",
    ],
    script: "scripts/test-driver-portal-bidding-schema-contract.mjs",
  },
  {
    label: "public API method surface boundary guard",
    requiredFragments: [
      "driver bidding method contract",
      "Driver job methods must stay limited to safe job `GET`, status `PATCH`, notification `GET`/`PATCH`, issue-alert `POST`, setup-only flight ETA `GET`, setup-only acknowledgement `GET`, and blocked driver bidding `GET`/`POST`/`PATCH`.",
      "Public API method surface boundary guard passed",
    ],
    script: "scripts/test-public-api-method-surface-boundary-guard.mjs",
  },
  {
    label: "public API request input boundary guard",
    requiredFragments: [
      "driver bidding blocked input contract",
      "Driver bidding remains blocked for GET/POST/PATCH until approved driver auth exists.",
      "Public API request input boundary guard passed",
    ],
    script: "scripts/test-public-api-request-input-boundary-guard.mjs",
  },
  {
    label: "public API response privacy boundary guard",
    requiredFragments: [
      "driver bidding response contract",
      "driverBidBlockedError",
      "Public API response privacy boundary guard passed",
    ],
    script: "scripts/test-public-api-response-privacy-boundary-guard.mjs",
  },
  {
    label: "public API runtime gate boundary guard",
    requiredFragments: [
      "driver-portal-bidding-persistence.ts",
      "Driver bidding and customer/driver app notification runtime persistence must remain mediated by the existing admin persistence gate and auth-required boundaries.",
      "Public API runtime gate boundary guard passed",
    ],
    script: "scripts/test-public-api-runtime-gate-boundary-guard.mjs",
  },
  {
    label: "public API client caller boundary guard",
    requiredFragments: [
      "driver page fetch call count",
      "`/driver-job/[token]` must keep driver API calls no-store and limited to safe job GET, notification GET, issue-alert POST with `issue_type`, and status PATCH with `status` only.",
      "Public API client caller boundary guard passed",
    ],
    script: "scripts/test-public-api-client-caller-boundary-guard.mjs",
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

function extractExportedMethods(source) {
  return [...source.matchAll(/export\s+async\s+function\s+([A-Z]+)\s*\(/g)].map(
    (item) => item[1],
  );
}

function extractArrayLiteralItems(source, constName) {
  const match = source.match(
    new RegExp(`(?:export\\s+)?const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*(?:as const|;)`),
  );
  assert.ok(match, `Expected ${constName} array literal.`);

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractSetItems(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(match, `Expected ${constName} set literal.`);

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractConstStringColumns(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*\\n?\\s*"([^"]+)";`));
  assert.ok(match, `Expected ${constName} string literal.`);

  return match[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function stripBiddingForbiddenAllowlist(source) {
  return source.replace(
    /const forbiddenBiddingFragments = \[[\s\S]*?\];\n/,
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
  driverBidRoutePath,
  adminBidOfferRoutePath,
  biddingPersistencePath,
  driverPagePath,
  driverDemoPagePath,
  ...contractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const driverBidRoute = files[driverBidRoutePath];
const adminBidOfferRoute = files[adminBidOfferRoutePath];
const biddingPersistence = files[biddingPersistencePath];
const biddingPersistenceWithoutAllowlist = stripBiddingForbiddenAllowlist(biddingPersistence);
const ledgerSection = sectionBetween(ledger, "### Public Driver Bidding Surface Guard Lock");

for (const phrase of [
  "Public driver bidding surfaces are guarded across `/api/driver-job-bids`, `/api/admin-driver-job-bid-offers`, `lib/driver-portal-bidding-persistence.ts`, and public driver pages.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, auth activation, or new shims.",
  "`/api/driver-job-bids` must remain blocked for GET, POST, and PATCH by `driverBidRuntimeAccessBlocked` until approved driver auth exists; it must not parse request bodies, read env, create Supabase clients, or execute DB reads/writes.",
  "Public driver pages must not call `/api/driver-job-bids` or `/api/admin-driver-job-bid-offers`, expose bid offer IDs, driver references, admin purpose/session-token headers, Cookie, Authorization, browser credential storage, or service-role/Supabase env names.",
  "`/api/admin-driver-job-bid-offers` must keep GET, POST, and PATCH behind the internal admin/dispatcher boundary and safe failure response, with reads, saves, and status updates mediated by `lib/driver-portal-bidding-persistence.ts`.",
  "Driver bidding persistence safe shapes must stay limited to booking reference, offer/bid statuses, pickup time, safe pickup/drop-off areas, safe vehicle/trip/context fields, driver reference, safe driver label/bid note/context, status timestamps, and actor/source metadata.",
  "Driver bidding surfaces must exclude customer price, billing, invoice/payment/PDF, payout comparisons, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live location/photo fields, and mock QA/dev archive fields.",
  "Driver bidding persistence must stay mediated by the existing admin booking persistence gate and verified server-session admin/dispatcher actor before creating a server-only Supabase client.",
  "This guard coordinates the driver portal bidding API contract, driver portal bidding schema contract, public API method guard, public API request input guard, public API response privacy guard, public API runtime gate guard, and public API client caller guard in the preactivation suite.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-driver-bidding-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public driver bidding ledger phrase: ${phrase}`);
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation public driver bidding surface guard registration",
);

assertSameList(
  extractExportedMethods(driverBidRoute),
  expectedRouteMethods,
  "driver public bid route exported methods",
);
for (const fragment of [
  'export const dynamic = "force-dynamic";',
  "function blockedDriverBidResponse()",
  "driverBidRuntimeAccessBlocked<null>()",
  "Driver bidding requires approved driver auth before runtime access.",
  "export async function GET() {\n  return blockedDriverBidResponse();\n}",
  "export async function POST() {\n  return blockedDriverBidResponse();\n}",
  "export async function PATCH() {\n  return blockedDriverBidResponse();\n}",
]) {
  assertIncludes(driverBidRoute, fragment, `driver public bid route boundary ${fragment}`);
}
for (const forbiddenPattern of [
  /request\.json/i,
  /\bprocess\.env\b/,
  /@supabase\/supabase-js/,
  /\bcreateClient\b/,
  /\.(?:from|insert|upsert|update|delete|rpc)\s*\(/,
  /Set-Cookie|document\.cookie|Authorization|Cookie|service_role|SUPABASE/i,
]) {
  assertExcludes(driverBidRoute, forbiddenPattern, "driver public bid route closed runtime");
}

assertSameList(
  extractExportedMethods(adminBidOfferRoute),
  expectedRouteMethods,
  "admin bid offer route exported methods",
);
for (const fragment of [
  'export const dynamic = "force-dynamic";',
  "resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose)",
  "adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context)",
  "loadAdminDriverJobBidOffers(new URL(request.url).searchParams, actor)",
  "parseAdminDriverJobBidOfferSavePayload(await readJsonBody(request))",
  "saveAdminDriverJobBidOffer(parsed.data, actor)",
  "parseAdminDriverJobBidOfferStatusUpdatePayload(await readJsonBody(request))",
  "updateAdminDriverJobBidOfferStatus(parsed.data, actor)",
  "Admin driver bid offer request failed safely.",
]) {
  assertIncludes(adminBidOfferRoute, fragment, `admin bid offer route boundary ${fragment}`);
}
for (const [label, methodBlock] of [
  [
    "admin bid offer POST boundary before body parse",
    blockBetween(adminBidOfferRoute, "export async function POST", "saveAdminDriverJobBidOffer(parsed.data, actor)"),
  ],
  [
    "admin bid offer PATCH boundary before body parse",
    blockBetween(
      adminBidOfferRoute,
      "export async function PATCH",
      "updateAdminDriverJobBidOfferStatus(parsed.data, actor)",
    ),
  ],
]) {
  assert.equal(
    methodBlock.indexOf("const boundary = requireAdminDispatcherBoundary(request);") <
      methodBlock.indexOf("await readJsonBody(request)"),
    true,
    label,
  );
}
assertExcludes(
  adminBidOfferRoute,
  /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL|createClient|service_role|Set-Cookie|document\.cookie/i,
  "admin bid offer route direct secret/client exposure",
);

for (const fragment of [
  'import "server-only";',
  'export const driverPortalBiddingPersistenceVersion = "driver-portal-bidding-api-v1";',
  "export const driverPortalBidBlockedError =",
  "Driver bidding requires approved driver auth before runtime access.",
  "const allowedSourceSurfaces = new Set([\"admin_api\", \"admin_dashboard\", \"migration\", \"system\"]);",
  "const allowedBidSources = new Set([\"driver_portal_api\", \"admin_api\", \"migration\", \"system\"]);",
  "actor.source_surface !== \"admin_api\"",
  "actor.boundary_mode !== \"server-session-role-surface\"",
  "process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== \"true\"",
  "checkAdminBookingPersistenceStagingConfigReadiness()",
  "process.env.SUPABASE_URL",
  "process.env.SUPABASE_SERVICE_ROLE_KEY",
  "createClient(supabaseUrl, serviceRoleKey,",
  "persistSession: false",
  ".from(\"driver_job_bid_offers\").select(bidOfferSelect).limit(maxReadRows)",
  ".from(\"driver_job_bids\").select(bidSelect).limit(maxReadRows)",
  "Driver portal bidding details include unsupported or unsafe fields.",
  "Driver bid offer assignment must use the explicit status update path.",
]) {
  assertIncludes(biddingPersistence, fragment, `driver bidding persistence boundary ${fragment}`);
}
assertSameList(
  extractArrayLiteralItems(biddingPersistence, "driverJobBidOfferStatuses"),
  expectedBidOfferStatuses,
  "driver bid offer statuses",
);
assertSameList(
  extractArrayLiteralItems(biddingPersistence, "driverJobBidStatuses"),
  expectedBidStatuses,
  "driver bid statuses",
);
assertSameList(
  extractSetItems(biddingPersistence, "allowedReadParams"),
  expectedReadParams,
  "driver bid offer read params",
);
assertSameList(
  extractSetItems(biddingPersistence, "allowedSaveFields"),
  expectedSaveFields,
  "driver bid offer save fields",
);
assertSameList(
  extractSetItems(biddingPersistence, "allowedStatusUpdateFields"),
  expectedStatusUpdateFields,
  "driver bid offer status update fields",
);
assertSameList(
  extractSetItems(biddingPersistence, "allowedSafeContextFields"),
  expectedSafeContextFields,
  "driver bid offer safe context fields",
);
assertSameList(
  extractConstStringColumns(biddingPersistence, "bidOfferSelect"),
  expectedBidOfferSelectColumns,
  "driver bid offer selected columns",
);
assertSameList(
  extractConstStringColumns(biddingPersistence, "bidSelect"),
  expectedBidSelectColumns,
  "driver bid selected columns",
);
for (const safeSurfaceSource of [
  extractConstStringColumns(biddingPersistence, "bidOfferSelect").join(" "),
  extractConstStringColumns(biddingPersistence, "bidSelect").join(" "),
  extractSetItems(biddingPersistence, "allowedReadParams").join(" "),
  extractSetItems(biddingPersistence, "allowedSaveFields").join(" "),
  extractSetItems(biddingPersistence, "allowedStatusUpdateFields").join(" "),
]) {
  assertExcludes(
    safeSurfaceSource,
    forbiddenDriverBiddingSurfacePattern,
    "driver bidding approved field/query surface",
  );
}
assertExcludes(
  biddingPersistenceWithoutAllowlist,
  /contact_phone|contact_email|customer_price|quoted_price|driver_payout|paynow|pay_now|invoice_number|final_invoice|payment_link|pdf_link|parser_debug|raw_ai|raw_parser_prompt|mock_archive|mock_qa|dev_workbench|internal_admin_note|internal_finance_note/i,
  "driver bidding persistence outside forbidden-field allowlist",
);

for (const [label, source] of [
  ["driver job page", files[driverPagePath]],
  ["driver job demo page", files[driverDemoPagePath]],
]) {
  assertExcludes(source, forbiddenPublicCallerPattern, `${label} bidding caller/secret exposure`);
}
assert.equal(countOccurrences(files[driverPagePath], "fetch("), 4, "driver job page fetch count must not grow for bidding");
assert.equal(
  countOccurrences(files[driverPagePath], 'cache: "no-store"'),
  4,
  "driver job page no-store fetch count must match existing safe callers",
);

for (const { label, requiredFragments, script } of contractChecks) {
  const source = files[script];

  for (const fragment of requiredFragments) {
    assertIncludes(source, fragment, `${label} source fragment ${fragment}`);
  }

  runContractCheck({ label, script });
}

console.log("Public driver bidding surface guard passed");
