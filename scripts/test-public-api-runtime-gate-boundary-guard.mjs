import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-api-runtime-gate-boundary-guard.mjs";

const publicApiRoutePaths = [
  "app/api/customer-booking-requests/route.ts",
  "app/api/customer-portal-sessions/route.ts",
  "app/api/customer-saved-bookings/route.ts",
  "app/api/customer-booking-memory/route.ts",
  "app/api/customer-booking-statuses/route.ts",
  "app/api/customer-app-notifications/route.ts",
  "app/api/customer-driver-quick-replies/route.ts",
  "app/api/driver-job/[token]/route.ts",
  "app/api/driver-job/[token]/status/route.ts",
  "app/api/driver-job/[token]/notifications/route.ts",
  "app/api/driver-job/[token]/quick-replies/route.ts",
  "app/api/driver-job/[token]/issue-alert/route.ts",
  "app/api/driver-job/[token]/flight-eta-setup/route.ts",
  "app/api/driver-job/[token]/flight-eta-acknowledgement-setup/route.ts",
  "app/api/driver-job-bids/route.ts",
];

const helperEnvAllowlist = new Map([
  [
    "lib/customer-portal-session-issue.ts",
    [
      "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED",
      "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE",
      "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN",
      "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID",
      "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME",
      "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN",
    ],
  ],
  [
    "lib/customer-saved-bookings-read.ts",
    [
      "PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST",
      "PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ENABLED",
      "PRESTIGE_CUSTOMER_PORTAL_RUNTIME_MODE",
      "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED",
      "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE",
      "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID",
      "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME",
      "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP",
      "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_URL",
    ],
  ],
  [
    "lib/customer-booking-memory-read.ts",
    [
      "PRESTIGE_CUSTOMER_BOOKING_MEMORY_AUTH_ENABLED",
      "PRESTIGE_CUSTOMER_BOOKING_MEMORY_AUTH_MODE",
      "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID",
      "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME",
      "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_URL",
    ],
  ],
  [
    "lib/customer-booking-status-read.ts",
    [
      "PRESTIGE_CUSTOMER_BOOKING_STATUS_AUTH_ENABLED",
      "PRESTIGE_CUSTOMER_BOOKING_STATUS_AUTH_MODE",
      "PRESTIGE_CUSTOMER_BOOKING_STATUS_AUTH_USER_ID",
      "PRESTIGE_CUSTOMER_BOOKING_STATUS_SESSION_TOKEN",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_URL",
    ],
  ],
  [
    "lib/customer-driver-app-notification-persistence.ts",
    [
      "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
      "PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_ENABLED",
      "PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_MODE",
      "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST",
      "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_ENABLED",
      "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_MODE",
      "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_STAGING_REFERENCE",
      "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED",
      "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE",
      "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED",
      "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE",
      "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID",
      "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME",
      "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP",
      "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_URL",
    ],
  ],
  [
    "lib/driver-job-link-mode.ts",
    [
      "DRIVER_JOB_LINK_MODE",
      "NEXT_PUBLIC_DRIVER_JOB_LINK_MODE",
      "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
      "PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_URL",
    ],
  ],
  [
    "lib/driver-job-status-persistence.ts",
    ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL"],
  ],
  [
    "lib/driver-portal-bidding-persistence.ts",
    [
      "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_URL",
    ],
  ],
  [
    "lib/admin-booking-supabase-adapter.ts",
    [
      "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
      "PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE",
      "PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE",
      "PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_URL",
    ],
  ],
]);

const noEnvHelperPaths = [
  "lib/admin-booking-persistence.ts",
  "lib/customer-booking-request-adapter.ts",
  "lib/driver-job-link-production.ts",
];

const contractChecks = [
  {
    label: "customer portal session issue runtime gate contract",
    script: "scripts/test-customer-portal-session-issue-api-contract.mjs",
    stripTypes: true,
  },
  {
    label: "customer saved bookings runtime gate contract",
    script: "scripts/test-customer-saved-bookings-api-contract.mjs",
    stripTypes: true,
  },
  {
    label: "customer booking memory runtime gate contract",
    script: "scripts/test-customer-booking-memory-api-contract.mjs",
    stripTypes: true,
  },
  {
    label: "customer booking status runtime gate contract",
    script: "scripts/test-customer-booking-status-api-contract.mjs",
    stripTypes: true,
  },
  {
    label: "driver job link mode default-off contract",
    script: "scripts/test-driver-job-link-mode.mjs",
    stripTypes: false,
  },
  {
    label: "driver job production disabled contract",
    script: "scripts/test-driver-job-link-production-guard.mjs",
    stripTypes: false,
  },
];

const routeForbiddenRuntimePatterns = [
  /\bprocess\.env\b/,
  /@supabase\/supabase-js/,
  /\bcreateClient\b/,
  /\bSUPABASE_SERVICE_ROLE_KEY\b/,
  /\bSUPABASE_URL\b/,
  /\.(?:from|insert|upsert|update|delete|rpc)\s*\(/,
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

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function envNames(source) {
  const names = new Set();
  const pattern = /\bprocess\.env\.([A-Z0-9_]+)/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    names.add(match[1]);
  }

  return [...names].sort();
}

function assertIndexBefore(source, first, second, label) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);

  assert.notEqual(firstIndex, -1, `${label} must include ${first}.`);
  assert.notEqual(secondIndex, -1, `${label} must include ${second}.`);
  assert.equal(firstIndex < secondIndex, true, `${label} must keep ${first} before ${second}.`);
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
  ...helperEnvAllowlist.keys(),
  ...noEnvHelperPaths,
  ...contractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const ledgerSection = sectionBetween(ledger, "### Public API Runtime Gate Boundary Guard Lock");

for (const phrase of [
  "Public customer/driver API runtime gate and dependency boundaries are guarded across customer booking request, customer portal session issue, customer saved bookings, customer booking memory, customer booking status, customer app notifications, customer-driver quick replies, driver job, driver job status, driver notifications, driver quick replies, driver issue-alert, driver flight ETA setup, driver flight ETA acknowledgement setup, and driver bidding routes.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.",
  "Public API route files must not directly read env, create Supabase clients, import Supabase, or execute direct database query/write methods; runtime dependencies must stay mediated through existing helpers and gates.",
  "Customer portal session issue must remain default-off and token/purpose/origin/referer gated before issuing a secure cookie.",
  "Customer saved-bookings, booking-memory, and booking-status reads must remain auth-gated by explicit env-name gates, same-origin/purpose checks, server session token or allowed cookie boundaries, and mocked contract tests.",
  "Driver job production mode must remain mock by default and production reads/status writes must remain blocked unless the driver-job production gate is explicitly true or the same server-side admin booking persistence/Supabase config that creates real driver links is available.",
  "Driver bidding and customer/driver app notification runtime persistence must remain mediated by the existing admin persistence gate and auth-required boundaries.",
  "Public helper env-name usage must stay in the bounded allowlist documented by this guard; env values, secrets, tokens, and connection strings must not be printed, committed, or surfaced.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-api-runtime-gate-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public API runtime gate ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation public API runtime gate guard registration");

for (const routePath of publicApiRoutePaths) {
  const routeSource = files[routePath];

  for (const pattern of routeForbiddenRuntimePatterns) {
    assertExcludes(routeSource, pattern, `${routePath} direct runtime dependency`);
  }
}

for (const [helperPath, allowedNames] of helperEnvAllowlist.entries()) {
  assert.deepEqual(envNames(files[helperPath]), [...allowedNames].sort(), `${helperPath} env allowlist`);
}

for (const helperPath of noEnvHelperPaths) {
  assert.deepEqual(envNames(files[helperPath]), [], `${helperPath} env allowlist`);
}

const customerBookingRequestRoute = files["app/api/customer-booking-requests/route.ts"];
for (const fragment of [
  "parseCustomerBookingRequestPayloads",
  "for (const requestPayload of parsed.data.requests)",
  "createAdminBooking(verifiedRequestPayload, customerBookingRequestPersistenceAdapterActor",
  "source_route: \"/book\"",
  "return_trip_requested: parsed.data.returnTripRequested",
  "customerSafeError",
]) {
  assertIncludes(customerBookingRequestRoute, fragment, `customer booking request runtime gate ${fragment}`);
}

const adminBookingAdapter = files["lib/admin-booking-supabase-adapter.ts"];
for (const fragment of [
  "export const customerBookingRequestPersistenceAdapterActor",
  "actor_role: \"system\"",
  "boundary_mode: \"customer-booking-request-surface\"",
  "source_surface: \"customer_booking_request\"",
  "process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED === \"true\"",
  "Admin booking persistence requires a verified admin or dispatcher server session.",
]) {
  assertIncludes(adminBookingAdapter, fragment, `admin booking adapter runtime gate ${fragment}`);
}

for (const [label, sourcePath, fragments] of [
  [
    "customer portal session issue",
    "lib/customer-portal-session-issue.ts",
    [
      "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED",
      "request.method !== \"POST\" || purpose !== \"customer-portal-session-issue\"",
      "sameOriginMyBookingsRequest(request)",
      "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN",
      "serializeCustomerSavedBookingsSessionCookie",
    ],
  ],
  [
    "customer saved bookings read",
    "lib/customer-saved-bookings-read.ts",
    [
      "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED",
      "providedToken.source === \"request-cookie\" ? \"server-session-cookie\" : \"server-session-token\"",
      "source_surface: \"customer_api\"",
      "createClient(supabaseUrl, serviceRoleKey",
    ],
  ],
  [
    "customer booking memory read",
    "lib/customer-booking-memory-read.ts",
    [
      "PRESTIGE_CUSTOMER_BOOKING_MEMORY_AUTH_ENABLED",
      "providedToken.source === \"request-cookie\" ? \"server-session-cookie\" : \"server-session-token\"",
      "source_surface: \"customer_api\"",
      "createClient(supabaseUrl, serviceRoleKey",
    ],
  ],
  [
    "customer booking status read",
    "lib/customer-booking-status-read.ts",
    [
      "PRESTIGE_CUSTOMER_BOOKING_STATUS_AUTH_ENABLED",
      "request.headers.get(\"x-prestige-customer-session-token\")?.trim()",
      "mode: \"server-session-token\"",
      "source_surface: \"customer_api\"",
      "createClient(supabaseUrl, serviceRoleKey",
    ],
  ],
]) {
  const source = files[sourcePath];

  for (const fragment of fragments) {
    assertIncludes(source, fragment, `${label} runtime gate ${fragment}`);
  }
}

const driverJobRoute = files["app/api/driver-job/[token]/route.ts"];
assertIndexBefore(
  driverJobRoute,
  "if (isProductionDriverJobLinkMode())",
  "x-prestige-driver-job-mock-reset",
  "driver job route production gate before mock reset",
);

const driverJobProduction = files["lib/driver-job-link-production.ts"];
for (const fragment of [
  "if (!productionDriverJobLinksConfigured())",
  "return productionDriverJobLinksDisabledResult();",
  "getDriverJobStatusPersistenceClientForProduction()",
  "loadDriverJobPayloadThroughStatusPersistence",
  "saveDriverJobStatusThroughStatusPersistence",
]) {
  assertIncludes(driverJobProduction, fragment, `driver production runtime gate ${fragment}`);
}

const driverJobMode = files["lib/driver-job-link-mode.ts"];
for (const fragment of [
  "return requestedMode === \"production\" ? \"production\" : \"mock\";",
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  "reason: \"not_configured\"",
  "payload: null",
]) {
  assertIncludes(driverJobMode, fragment, `driver job mode runtime gate ${fragment}`);
}

const driverBidding = files["lib/driver-portal-bidding-persistence.ts"];
for (const fragment of [
  "Driver bidding requires approved driver auth before runtime access.",
  "process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== \"true\"",
  "createClient(supabaseUrl, serviceRoleKey",
]) {
  assertIncludes(driverBidding, fragment, `driver bidding runtime gate ${fragment}`);
}

const notifications = files["lib/customer-driver-app-notification-persistence.ts"];
for (const fragment of [
  "Customer/driver app notification persistence requires a verified admin or dispatcher server session.",
  "process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== \"true\"",
  "createClient(supabaseUrl, serviceRoleKey",
  "Driver app notification token is unauthorized.",
]) {
  assertIncludes(notifications, fragment, `notification runtime gate ${fragment}`);
}

for (const contractCheck of contractChecks) {
  runContractCheck(contractCheck);
}

console.log("Public API runtime gate boundary guard passed");
