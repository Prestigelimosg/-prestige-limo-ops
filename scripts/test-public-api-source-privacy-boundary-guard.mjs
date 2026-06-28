import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-api-source-privacy-boundary-guard.mjs";

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

const helperDenyListChecks = [
  {
    arrayStart: "const forbiddenCustomerBookingRequestFragments = [",
    path: "lib/customer-booking-request-adapter.ts",
    requiredFragments: customerBoundaryRequiredFragments(),
  },
  {
    arrayStart: "const forbiddenCustomerStatusFragments = [",
    path: "lib/customer-booking-status-read.ts",
    requiredFragments: customerBoundaryRequiredFragments(),
  },
  {
    arrayStart: "const forbiddenCustomerSessionFragments = [",
    path: "lib/customer-portal-session-issue.ts",
    requiredFragments: customerBoundaryRequiredFragments(),
  },
  {
    arrayStart: "const forbiddenCustomerSavedBookingsFragments = [",
    path: "lib/customer-saved-bookings-read.ts",
    requiredFragments: customerBoundaryRequiredFragments(),
  },
  {
    arrayStart: "const forbiddenCustomerBookingMemoryFragments = [",
    path: "lib/customer-booking-memory-read.ts",
    requiredFragments: customerBoundaryRequiredFragments(),
  },
  {
    arrayStart: "const forbiddenCustomerBookingMemoryFragments = [",
    path: "lib/customer-booking-memory-adapter.ts",
    requiredFragments: customerBoundaryRequiredFragments(),
  },
  {
    arrayStart: "const forbiddenCustomerSavedBookingsFragments = [",
    path: "lib/customer-portal-saved-bookings-adapter.ts",
    requiredFragments: customerBoundaryRequiredFragments(),
  },
  {
    arrayStart: "const forbiddenNotificationFragments = [",
    path: "lib/customer-driver-app-notification-persistence.ts",
    requiredFragments: notificationRequiredFragments(),
  },
  {
    arrayStart: "const unsafeStatusHistoryFragments = [",
    path: "lib/driver-job-link.ts",
    requiredFragments: driverJobRequiredFragments(),
  },
  {
    arrayStart: "const safeOutputFragments = [",
    path: "lib/driver-job-status-persistence.ts",
    requiredFragments: driverStatusRequiredFragments(),
  },
];

const allowedAdminImports = new Set([
  "../../../lib/admin-device-push-notification",
  "../../../lib/admin-new-booking-email-alert",
  "../../../lib/admin-booking-persistence",
  "../../../lib/admin-booking-supabase-adapter",
  "../../../../../lib/admin-app-notification-persistence.ts",
  "../../../../../lib/admin-flight-api-setup-foundation",
]);

const blockedImportPattern =
  /monthly|billing|invoice|payment|pdf|pricing|customer-rates|customer_rates|payout|driver-payout|driver_payout_rules|ai-parse|ai_parse|parser|live-location|live_location|ots-photo|photo-proof|storage|upload|calendar|telegram|whatsapp|sms|email.*send|provider.*send|mock-archive|mock_archive|mock-qa|mock_qa/i;

const directRouteRiskPatterns = [
  /\bcreateClient\b/,
  /\badminLegacyDataClient\b/,
  /\.(?:from|insert|upsert|update|delete)\s*\(/,
  /\b(?:sendEmail|sendWhatsapp|sendWhatsApp|sendSms|sendSMS|sendTelegram)\b/,
  /\b(?:twilio|stripe)\b/i,
  /\b(?:customer_price|driver_payout|paynow|pay_now)\b/i,
  /\b(?:billing|invoice|payment|payout|pdf)\b/i,
  /\b(?:ai-parse|ai_parse|parser_debug|raw_parser_prompt)\b/i,
  /\b(?:live_location|ots_photo|photo_proof|calendar_sync)\b/i,
  /\b(?:mock_archive|mock_qa)\b/i,
];

function customerBoundaryRequiredFragments() {
  return [
    "admin_finance",
    "billing",
    "customer_price",
    "debug",
    "driver_payout",
    "finance",
    "internal_admin_note",
    "internal_finance_note",
    "invoice",
    "mock_archive",
    "mock_qa",
    "parser_debug",
    "payment",
    "pay_now",
    "paynow",
    "payout",
    "pdf",
    "secret",
    "service_role",
  ];
}

function notificationRequiredFragments() {
  return [
    "billing",
    "customer_price",
    "debug",
    "driver_payout",
    "finance",
    "internal_admin_note",
    "internal_finance_note",
    "invoice",
    "mock_archive",
    "mock_qa",
    "parser_debug",
    "payment",
    "pay_now",
    "paynow",
    "payout",
    "pdf",
    "secret",
    "service_role",
    "sms",
    "telegram",
    "token",
    "whatsapp",
  ];
}

function driverJobRequiredFragments() {
  return [
    "billing",
    "customer_price",
    "debug",
    "driver_payout",
    "finance",
    "internal_admin_note",
    "internal_note",
    "invoice",
    "mock_archive",
    "payment",
    "paynow",
    "payout",
    "pdf",
    "quoted_price",
    "service_role",
    "token",
  ];
}

function driverStatusRequiredFragments() {
  return [
    "billing",
    "customer_price",
    "debug",
    "driver_payout",
    "finance",
    "internal_admin_note",
    "internal_finance_note",
    "internal_note",
    "invoice",
    "mock_archive",
    "mock_qa",
    "parser_debug",
    "payment",
    "pay_now",
    "paynow",
    "payout",
    "pdf",
    "quoted_price",
    "service_role",
    "token",
  ];
}

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

function blockBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing source block start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing source block end: ${endFragment}`);

  return source.slice(start, end);
}

function importSpecifiers(source) {
  const specifiers = new Set();
  const staticImportPattern = /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const pattern of [staticImportPattern, dynamicImportPattern]) {
    let match;

    while ((match = pattern.exec(source)) !== null) {
      specifiers.add(match[1]);
    }
  }

  return [...specifiers].sort();
}

function sourceWithoutImports(source) {
  return source
    .replace(/\bimport\s+(?:type\s+)?[\s\S]*?\s+from\s+["'][^"']+["'];?/g, "")
    .replace(/\bimport\s*\(\s*["'][^"']+["']\s*\)/g, 'import("<allowed-dynamic-import>")');
}

function assertNoRouteLineMatches(source, pattern, label) {
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

function assertFragmentArray(source, arrayStart, requiredFragments, label) {
  const block = blockBetween(source, arrayStart, "];");

  for (const fragment of requiredFragments) {
    assertIncludes(block, `"${fragment}"`, `${label} forbidden fragment ${fragment}`);
  }

  assertIncludes(
    source,
    ".some((fragment) => normalized.includes(fragment))",
    `${label} normalized fragment blocker`,
  );
}

const allPaths = [
  ledgerPath,
  preactivationSuitePath,
  "lib/driver-job-link.ts",
  "lib/driver-job-link-contract.ts",
  "lib/driver-job-status-workflow.ts",
  ...publicApiRoutePaths,
  ...helperDenyListChecks.map(({ path }) => path),
];

const uniquePaths = [...new Set(allPaths)];
const fileEntries = await Promise.all(uniquePaths.map(async (path) => [path, await readFile(path, "utf8")]));
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const ledgerSection = sectionBetween(ledger, "### Public API Source Privacy Boundary Guard Lock");

for (const phrase of [
  "Public customer/driver API source privacy is guarded across customer booking, customer portal, customer saved-booking/memory/status/notification, driver job, driver job status, driver job notifications, driver issue-alert, flight ETA setup, and driver bidding route sources.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.",
  "Intentional guarded imports from admin booking persistence, admin booking Supabase adapter, admin app notification persistence, and admin flight setup foundations remain allowed only for the existing public API setup/gated paths.",
  "Public API route files must not import monthly billing, invoice/PDF, payment, pricing/customer_rates, payout/driver_payout_rules, parser/AI parse, location/photo/calendar activation, provider-send, or mock archive modules.",
  "Public API helper deny-lists must keep blocking customer price, driver payout, PayNow payout details, billing, invoice/payment/PDF, internal finance/admin notes, parser/debug, service-role/token/secrets, and mock QA/dev archive fields.",
  "Public driver job response shape must stay `SafeDriverJobPayload` with safe status history fields only.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-api-source-privacy-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public API privacy ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation public API privacy guard registration");

for (const path of publicApiRoutePaths) {
  const routeSource = files[path];
  const routeLabel = `Public API route ${path}`;
  const specifiers = importSpecifiers(routeSource);

  for (const specifier of specifiers) {
    if (specifier.includes("/admin-")) {
      assert.equal(
        allowedAdminImports.has(specifier),
        true,
        `${routeLabel} admin import must stay in the explicit allowlist: ${specifier}`,
      );
    }

    if (!allowedAdminImports.has(specifier)) {
      assertExcludes(specifier, blockedImportPattern, `${routeLabel} import ${specifier}`);
      assertExcludes(specifier, /supabase/i, `${routeLabel} direct Supabase import ${specifier}`);
    }
  }

  const runtimeSource = sourceWithoutImports(routeSource);

  for (const pattern of directRouteRiskPatterns) {
    assertNoRouteLineMatches(runtimeSource, pattern, routeLabel);
  }
}

for (const { arrayStart, path, requiredFragments } of helperDenyListChecks) {
  assertFragmentArray(files[path], arrayStart, requiredFragments, path);
}

const driverJobRoute = files["app/api/driver-job/[token]/route.ts"];
assertIncludes(
  driverJobRoute,
  "getDriverJobPayloadForTokenContract",
  "driver job public API safe mock contract",
);
assertIncludes(
  driverJobRoute,
  "getProductionDriverJobPayloadForToken",
  "driver job public API safe production contract",
);
assertIncludes(driverJobRoute, "payload: result.payload", "driver job public API safe payload return");

const driverJobStatusRoute = files["app/api/driver-job/[token]/status/route.ts"];
for (const statusRouteFragment of [
  "applyDriverJobStatusUpdateContract",
  "applyProductionDriverJobStatusUpdate",
  "safeStatusContext",
  "safeStatusNote",
  "payload: result.payload",
]) {
  assertIncludes(driverJobStatusRoute, statusRouteFragment, `driver status route ${statusRouteFragment}`);
}

const driverJobNotificationsRoute = files["app/api/driver-job/[token]/notifications/route.ts"];
for (const safeNotificationFragment of [
  "loadDriverAppNotificationsForToken",
  "parseCustomerDriverAppNotificationUpdatePayload",
  "delivery_surface: \"driver_app\"",
  "notifications: result.data.notifications",
]) {
  assertIncludes(
    driverJobNotificationsRoute,
    safeNotificationFragment,
    `driver notifications route ${safeNotificationFragment}`,
  );
}

const driverJobLink = files["lib/driver-job-link.ts"];
const safeDriverJobPayloadBlock = blockBetween(
  driverJobLink,
  "export type SafeDriverJobPayload = {",
  "};\n\nexport type SafeDriverJobStatusHistoryItem",
);

for (const forbiddenPattern of [
  /price/i,
  /billing/i,
  /invoice/i,
  /payment/i,
  /payout/i,
  /paynow/i,
  /finance/i,
  /\btoken\b/i,
  /internal/i,
  /debug/i,
  /mock/i,
]) {
  assertExcludes(safeDriverJobPayloadBlock, forbiddenPattern, "SafeDriverJobPayload public API shape");
}

const driverJobContract = files["lib/driver-job-link-contract.ts"];
for (const contractFragment of [
  "payload: mapBookingToSafeDriverJobPayload(resolvedLink.booking)",
  "payload: mapBookingToSafeDriverJobPayload(updatedBooking)",
  "safeNote",
]) {
  assertIncludes(driverJobContract, contractFragment, `driver job contract ${contractFragment}`);
}

const driverStatusWorkflow = files["lib/driver-job-status-workflow.ts"];
assertIncludes(
  driverStatusWorkflow,
  "validateDriverJobStatusUpdate",
  "driver status workflow validator",
);
assertIncludes(
  driverStatusWorkflow,
  "guardDriverJobStatusTransition",
  "driver status workflow transition guard",
);

console.log("Public API source privacy boundary guard passed");
