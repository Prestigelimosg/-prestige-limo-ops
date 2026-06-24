import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-customer-driver-app-notification-surface-guard.mjs";

const customerNotificationsRoutePath = "app/api/customer-app-notifications/route.ts";
const driverNotificationsRoutePath = "app/api/driver-job/[token]/notifications/route.ts";
const adminNotificationsRoutePath = "app/api/admin-customer-driver-app-notifications/route.ts";
const notificationPersistencePath = "lib/customer-driver-app-notification-persistence.ts";
const driverPagePath = "app/driver-job/[token]/page.tsx";
const bookPagePath = "app/book/page.tsx";
const portalPagePath = "app/my-bookings/page.tsx";

const expectedCustomerRouteMethods = ["GET", "PATCH"];
const expectedDriverRouteMethods = ["GET", "PATCH"];
const expectedAdminRouteMethods = ["GET", "PATCH", "POST"];
const expectedSurfaces = ["customer_app", "driver_app"];
const expectedTypes = ["booking_status", "driver_status", "system_notice", "trip_update"];
const expectedStatuses = ["archived", "blocked", "dismissed", "queued", "read"];
const expectedPriorities = ["high", "low", "normal", "urgent"];
const expectedCreateFields = [
  "booking_reference",
  "delivery_surface",
  "driver_job_link_id",
  "event_key",
  "notification_status",
  "notification_type",
  "priority",
  "safe_context",
  "safe_message",
  "safe_title",
  "workflow_area",
];
const expectedUpdateFields = ["delivery_surface", "notification_id", "notification_status"];
const expectedNotificationSelectColumns = [
  "actor_label",
  "actor_role",
  "booking_reference",
  "created_at",
  "delivery_surface",
  "driver_job_link_id",
  "event_key",
  "id",
  "notification_status",
  "notification_type",
  "priority",
  "safe_context",
  "safe_message",
  "safe_title",
  "source_surface",
  "updated_at",
  "workflow_area",
];
const expectedDriverJobLinkSelectColumns = [
  "booking_reference",
  "expires_at",
  "id",
  "link_status",
  "revoked_at",
];
const expectedSafeRecordKeys = [
  "booking_reference",
  "created_at",
  "delivery_surface",
  "id",
  "notification_status",
  "notification_type",
  "priority",
  "safe_context",
  "safe_message",
  "safe_title",
  "updated_at",
  "workflow_area",
];

const forbiddenNotificationSurfacePattern =
  /contact[_ -]?(?:email|phone)|customer[_ -]?(?:email|phone|price|charge)|quoted[_ -]?price|rate[_ -]?amount|fare[_ -]?amount|billing|invoice|payment|payment[_ -]?link|paynow|pay[_ -]?now|driver[_ -]?payout|payout|finance|internal[_ -]?(?:admin|finance)|admin[_ -]?note|parser[_ -]?(?:debug|learning|prompt)|raw[_ -]?ai|delivery[_ -]?payload|external[_ -]?delivery|send[_ -]?(?:log|state)|telegram|whatsapp|sms|email[_ -]?payload|live[_ -]?location|proof|photo|customer[_ -]?auth|driver[_ -]?auth|raw[_ -]?token|token[_ -]?hash|server[_ -]?secret|service[_ -]?role|mock[_ -]?(?:qa|archive)|dev[_ -]?workbench/i;
const forbiddenPublicClientPattern =
  /\/api\/customer-app-notifications|\/api\/admin-customer-driver-app-notifications|x-prestige-admin-purpose|x-prestige-admin-session-token|Authorization|Bearer|Cookie|document\.cookie|localStorage|sessionStorage|navigator\.credentials|service_role|SUPABASE_SERVICE|PRESTIGE_ADMIN_BOOKING_PERSISTENCE/i;

const contractChecks = [
  {
    label: "customer/driver app notification API contract",
    requiredFragments: [
      "customerAuthRequiredMessage",
      "Expected driver GET to verify token hash before scoped notification read",
      "Expected driver PATCH to update only exact queued notifications scoped to the verified link",
      "Customer/driver app notification API contract tests passed.",
    ],
    script: "scripts/test-customer-driver-app-notification-api-contract.mjs",
  },
  {
    label: "customer/driver app notification schema contract",
    requiredFragments: [
      "customer_driver_app_notification_outbox",
      "without public, anonymous, broad authenticated",
      "driver access must go through the server-only hashed-token api",
      "Customer/driver app notification schema contract tests passed.",
    ],
    script: "scripts/test-customer-driver-app-notification-schema-contract.mjs",
  },
  {
    label: "public API method surface boundary guard",
    requiredFragments: [
      "customer/driver notification method contract",
      "customerRoute.GET",
      "driverRoute.PATCH",
      "Public API method surface boundary guard passed",
    ],
    script: "scripts/test-public-api-method-surface-boundary-guard.mjs",
  },
  {
    label: "public API request input boundary guard",
    requiredFragments: [
      "Customer/driver app notification API contract tests passed.",
      "customer/driver notification input contract",
      "Public API request input boundary guard passed",
    ],
    script: "scripts/test-public-api-request-input-boundary-guard.mjs",
  },
  {
    label: "public API response privacy boundary guard",
    requiredFragments: [
      "customer/driver app notification response contract",
      "unsafeNotificationLeakPattern",
      "Public API response privacy boundary guard passed",
    ],
    script: "scripts/test-public-api-response-privacy-boundary-guard.mjs",
  },
  {
    label: "public API runtime gate boundary guard",
    requiredFragments: [
      "Customer/driver app notification persistence requires a verified admin or dispatcher server session.",
      "Driver bidding and customer/driver app notification runtime persistence must remain mediated by the existing admin persistence gate and auth-required boundaries.",
      "Public API runtime gate boundary guard passed",
    ],
    script: "scripts/test-public-api-runtime-gate-boundary-guard.mjs",
  },
  {
    label: "public API client caller boundary guard",
    requiredFragments: [
      "`/api/driver-job/${encodeURIComponent(token)}/notifications?limit=5&page=1`",
      "`/driver-job/[token]` must keep driver API calls no-store and limited to safe job GET, notification GET, issue-alert POST with `issue_type`, and status PATCH with `status` only.",
      "Public API client caller boundary guard passed",
    ],
    script: "scripts/test-public-api-client-caller-boundary-guard.mjs",
  },
  {
    label: "public API session cookie/cache boundary guard",
    requiredFragments: [
      "customer-app-notifications",
      "driver-job/[token]/notifications",
      "Public API session cookie/cache boundary guard passed",
    ],
    script: "scripts/test-public-api-session-cookie-cache-boundary-guard.mjs",
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

function extractReturnKeysFromBlock(source, functionName, nextFunctionName) {
  const block = blockBetween(source, `function ${functionName}`, `function ${nextFunctionName}`);
  const returnMatch = block.match(/return\s*\{([\s\S]*?)\};/);
  assert.ok(returnMatch, `Expected return object in ${functionName}.`);

  return [...returnMatch[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*:/gm)].map((item) => item[1]);
}

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function stripForbiddenNotificationAllowlist(source) {
  return source.replace(
    /const forbiddenNotificationFragments = \[[\s\S]*?\];\n/,
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
  customerNotificationsRoutePath,
  driverNotificationsRoutePath,
  adminNotificationsRoutePath,
  notificationPersistencePath,
  driverPagePath,
  bookPagePath,
  portalPagePath,
  ...contractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const customerNotificationsRoute = files[customerNotificationsRoutePath];
const driverNotificationsRoute = files[driverNotificationsRoutePath];
const adminNotificationsRoute = files[adminNotificationsRoutePath];
const notificationPersistence = files[notificationPersistencePath];
const notificationPersistenceWithoutAllowlist =
  stripForbiddenNotificationAllowlist(notificationPersistence);
const ledgerSection = sectionBetween(
  ledger,
  "### Public Customer/Driver App Notification Surface Guard Lock",
);

for (const phrase of [
  "Public customer/driver app notification surfaces are guarded across `/api/customer-app-notifications`, `/api/driver-job/[token]/notifications`, `/api/admin-customer-driver-app-notifications`, `lib/customer-driver-app-notification-persistence.ts`, and public client pages.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, auth activation, or new shims.",
  "`/api/customer-app-notifications` must remain blocked for GET and PATCH by the customer auth-required result by default; the only allowed customer GET read is the disabled-by-default staging evidence path after the customer in-app read gate, staging reference, same-origin customer portal headers, and existing saved-bookings session boundary pass.",
  "`/api/customer-app-notifications` must not parse request bodies, directly read env, create Supabase clients in the route, set cookies, or execute DB writes; any future customer GET evidence DB read must stay isolated in the gated server helper after the route boundary passes.",
  "`/api/driver-job/[token]/notifications` must remain limited to token-scoped GET and PATCH, with PATCH forced to `delivery_surface: \"driver_app\"` before persistence update.",
  "Driver notification reads and updates must verify the hashed driver job token, reject revoked/expired/outside-window links, scope rows to `driver_app`, booking reference, queued status, and the matching driver job link id or booking-wide null link id, then return safe notification records only.",
  "`/api/admin-customer-driver-app-notifications` must keep GET, POST, and PATCH behind the internal admin/dispatcher boundary, with create/read/update mediated by `lib/customer-driver-app-notification-persistence.ts`.",
  "Customer/driver app notification safe records must stay limited to booking reference, delivery surface, notification type/status, priority, safe title/message/context, workflow area, id, and created/updated timestamps.",
  "Customer/driver app notification surfaces must exclude customer price, billing, invoice/payment/PDF, payout comparisons, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live location/photo fields, and mock QA/dev archive fields.",
  "Public client pages must not call `/api/customer-app-notifications` or `/api/admin-customer-driver-app-notifications`, expose admin purpose/session-token headers, Cookie, Authorization, browser credential storage, or service-role/Supabase env names.",
  "This guard coordinates the customer/driver app notification API contract, schema contract, public API method guard, request input guard, response privacy guard, runtime gate guard, client caller guard, and session cookie/cache guard in the preactivation suite.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-customer-driver-app-notification-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public app notification ledger phrase: ${phrase}`);
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation public customer/driver app notification surface guard registration",
);

assertSameList(
  extractExportedMethods(customerNotificationsRoute),
  expectedCustomerRouteMethods,
  "customer app notifications route exported methods",
);
for (const fragment of [
  'export const dynamic = "force-dynamic";',
  "function safeCustomerAuthRequiredResponse()",
  "customerAppNotificationsRequireAuthResult()",
  "readCustomerAppNotificationsForStagingEvidence",
  "Customer app notifications require secure customer account auth.",
  "export async function GET(request: Request)",
  "export async function PATCH() {\n  return safeCustomerAuthRequiredResponse();\n}",
]) {
  assertIncludes(customerNotificationsRoute, fragment, `customer notifications route boundary ${fragment}`);
}
for (const forbiddenPattern of [
  /request\.json/i,
  /\bprocess\.env\b/,
  /@supabase\/supabase-js/,
  /\bcreateClient\b/,
  /\.(?:from|insert|upsert|update|delete|rpc)\s*\(/,
  /Set-Cookie|document\.cookie|Authorization|Cookie|service_role|SUPABASE/i,
  /\bexport\s+async\s+function\s+(?:POST|PUT|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\b/,
]) {
  assertExcludes(customerNotificationsRoute, forbiddenPattern, "customer app notifications route closed runtime");
}

assertSameList(
  extractExportedMethods(driverNotificationsRoute),
  expectedDriverRouteMethods,
  "driver app notifications route exported methods",
);
for (const fragment of [
  'export const dynamic = "force-dynamic";',
  "loadDriverAppNotificationsForToken(token, new URL(request.url).searchParams)",
  "parseCustomerDriverAppNotificationUpdatePayload({",
  "...body,",
  'delivery_surface: "driver_app",',
  "updateDriverAppNotificationStatusForToken(token, parsed.data)",
  "Driver app notification request failed safely.",
  "notifications: result.data.notifications",
  "pagination: result.data.pagination",
  "version: result.data.version",
  "notification: result.data",
]) {
  assertIncludes(driverNotificationsRoute, fragment, `driver notifications route boundary ${fragment}`);
}
assertExcludes(
  driverNotificationsRoute,
  /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL|createClient|service_role|Set-Cookie|document\.cookie|Authorization|Cookie/i,
  "driver notifications route direct secret/client exposure",
);
assertExcludes(
  driverNotificationsRoute,
  /\bexport\s+async\s+function\s+(?:POST|PUT|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\b/,
  "driver notifications unsupported methods",
);

assertSameList(
  extractExportedMethods(adminNotificationsRoute),
  expectedAdminRouteMethods,
  "admin customer/driver app notifications route exported methods",
);
for (const fragment of [
  "resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose)",
  "adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context)",
  "loadCustomerDriverAppNotifications(new URL(request.url).searchParams, actor)",
  "parseCustomerDriverAppNotificationCreatePayload(await readJsonBody(request))",
  "createCustomerDriverAppNotification(parsed.data, actor)",
  "parseCustomerDriverAppNotificationUpdatePayload(await readJsonBody(request))",
  "updateCustomerDriverAppNotificationStatus(parsed.data, actor)",
  "Customer/driver app notification request failed safely.",
]) {
  assertIncludes(adminNotificationsRoute, fragment, `admin notifications route boundary ${fragment}`);
}
for (const [label, methodBlock] of [
  [
    "admin notifications POST boundary before body parse",
    blockBetween(adminNotificationsRoute, "export async function POST", "createCustomerDriverAppNotification(parsed.data, actor)"),
  ],
  [
    "admin notifications PATCH boundary before body parse",
    blockBetween(
      adminNotificationsRoute,
      "export async function PATCH",
      "updateCustomerDriverAppNotificationStatus(parsed.data, actor)",
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

for (const fragment of [
  'import "server-only";',
  'export const customerDriverAppNotificationPersistenceVersion =\n  "stage-customer-driver-app-notification-api-v1";',
  "const notificationTable = \"customer_driver_app_notification_outbox\";",
  "const driverJobLinkSelect = \"id, booking_reference, link_status, expires_at, revoked_at\";",
  "Customer app notifications require secure customer account auth before saved notifications can be read.",
  "Customer/driver app notification includes fields outside the approved safe display scope.",
  "process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== \"true\"",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_ENABLED",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_MODE",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_STAGING_REFERENCE",
  "readCustomerAppNotificationsForStagingEvidence",
  "resolveCustomerInAppNotificationReadEvidenceGate",
  "loadCustomerAppNotificationsForStagingReference",
  "checkAdminBookingPersistenceStagingConfigReadiness()",
  "process.env.SUPABASE_URL",
  "process.env.SUPABASE_SERVICE_ROLE_KEY",
  "persistSession: false",
  "if (!isProductionDriverJobLinkMode() || !productionDriverJobLinksConfigured())",
  ".from(\"driver_job_links\")",
  ".eq(\"token_hash\", tokenHash)",
  "isDriverJobLinkExpired(String(row.expires_at || \"\"))",
  "isDriverJobLinkExpiryOutsideAllowedWindow(String(row.expires_at || \"\"))",
  ".eq(\"delivery_surface\", \"driver_app\")",
  ".eq(\"booking_reference\", linkResult.data.booking_reference)",
  ".eq(\"notification_status\", \"queued\")",
  "record.delivery_surface === \"driver_app\"",
  "record.booking_reference === linkResult.data.booking_reference",
  "!record.driver_job_link_id || record.driver_job_link_id === linkResult.data.id",
  "const driverLinkNotificationScope = `driver_job_link_id.is.null,driver_job_link_id.eq.${linkResult.data.id}`;",
  "actor_label: \"verified_driver_job_link\"",
  "actor_role: \"driver\"",
  "source_surface: \"driver_api\"",
]) {
  assertIncludes(notificationPersistence, fragment, `notification persistence boundary ${fragment}`);
}
assertSameList(
  extractArrayLiteralItems(notificationPersistence, "customerDriverAppNotificationSurfaces"),
  expectedSurfaces,
  "customer/driver app notification surfaces",
);
assertSameList(
  extractArrayLiteralItems(notificationPersistence, "customerDriverAppNotificationTypes"),
  expectedTypes,
  "customer/driver app notification types",
);
assertSameList(
  extractArrayLiteralItems(notificationPersistence, "customerDriverAppNotificationStatuses"),
  expectedStatuses,
  "customer/driver app notification statuses",
);
assertSameList(
  extractArrayLiteralItems(notificationPersistence, "customerDriverAppNotificationPriorities"),
  expectedPriorities,
  "customer/driver app notification priorities",
);
assertSameList(
  extractSetItems(notificationPersistence, "allowedCreateFields"),
  expectedCreateFields,
  "customer/driver app notification create fields",
);
assertSameList(
  extractSetItems(notificationPersistence, "allowedUpdateFields"),
  expectedUpdateFields,
  "customer/driver app notification update fields",
);
assertSameList(
  extractConstStringColumns(notificationPersistence, "notificationSelect"),
  expectedNotificationSelectColumns,
  "customer/driver app notification selected columns",
);
assertSameList(
  extractConstStringColumns(notificationPersistence, "driverJobLinkSelect"),
  expectedDriverJobLinkSelectColumns,
  "driver app notification link selected columns",
);
assertSameList(
  extractReturnKeysFromBlock(notificationPersistence, "toSafeRecord", "buildPagination"),
  expectedSafeRecordKeys,
  "customer/driver app notification safe response fields",
);
for (const safeSurfaceSource of [
  extractSetItems(notificationPersistence, "allowedCreateFields").join(" "),
  extractSetItems(notificationPersistence, "allowedUpdateFields").join(" "),
  extractReturnKeysFromBlock(notificationPersistence, "toSafeRecord", "buildPagination").join(" "),
]) {
  assertExcludes(
    safeSurfaceSource,
    forbiddenNotificationSurfacePattern,
    "customer/driver app notification approved surface",
  );
}
assertExcludes(
  notificationPersistenceWithoutAllowlist,
  /contact_phone|contact_email|customer_price|quoted_price|driver_payout|paynow|pay_now|invoice_number|payment_link|pdf_link|parser_debug|raw_ai|raw_parser_prompt|mock_archive|mock_qa|dev_workbench|internal_admin_note|internal_finance_note|telegram_chat_id|whatsapp_payload|sms_payload|email_payload/i,
  "customer/driver app notification persistence outside forbidden-field allowlist",
);

for (const [label, source] of [
  ["book page", files[bookPagePath]],
  ["my-bookings page", files[portalPagePath]],
  ["driver job page", files[driverPagePath]],
]) {
  assertExcludes(source, forbiddenPublicClientPattern, `${label} app notification caller/secret exposure`);
}
assertIncludes(
  files[driverPagePath],
  "`/api/driver-job/${encodeURIComponent(token)}/notifications?limit=5&page=1`",
  "driver page safe notification GET caller",
);
assert.equal(countOccurrences(files[driverPagePath], "fetch("), 6, "driver page fetch count must not grow for app notifications");
assert.equal(
  countOccurrences(files[driverPagePath], 'cache: "no-store"'),
  6,
  "driver page no-store fetch count must match existing safe callers",
);
assertIncludes(
  files[driverPagePath],
  "fetch(driverLiveLocationRoute()",
  "driver page approved live-location caller",
);

for (const { label, requiredFragments, script } of contractChecks) {
  const source = files[script];

  for (const fragment of requiredFragments) {
    assertIncludes(source, fragment, `${label} source fragment ${fragment}`);
  }

  runContractCheck({ label, script });
}

console.log("Public customer/driver app notification surface guard passed");
