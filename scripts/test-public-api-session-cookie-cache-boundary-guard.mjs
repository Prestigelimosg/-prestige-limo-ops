import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-api-session-cookie-cache-boundary-guard.mjs";

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

const sourcePaths = [
  ...publicApiRoutePaths,
  "app/book/page.tsx",
  "app/my-bookings/page.tsx",
  "lib/customer-booking-memory-adapter.ts",
  "lib/customer-booking-memory-read.ts",
  "lib/customer-booking-request-adapter.ts",
  "lib/customer-booking-status-read.ts",
  "lib/customer-portal-saved-bookings-adapter.ts",
  "lib/customer-portal-session-issue.ts",
  "lib/customer-saved-bookings-read.ts",
  "scripts/test-customer-booking-page-api-audit.mjs",
  "scripts/test-customer-booking-memory-ui-contract.mjs",
  "scripts/test-customer-portal-saved-bookings-adapter.mjs",
  "scripts/test-customer-portal-session-issue-api-contract.mjs",
  "scripts/test-customer-saved-bookings-auth-handoff-readiness.mjs",
];

const contractChecks = [
  {
    label: "customer portal session issue cookie/cache contract",
    script: "scripts/test-customer-portal-session-issue-api-contract.mjs",
    requiredFragments: [
      "assertNoCookie(response, label)",
      "assertSecureCookie(setCookie, cookieName = defaultCookieName)",
      "assert.equal(successResponse.headers.get(\"cache-control\"), \"no-store\");",
      "Customer portal UI/client must not call or expose the session issue contract.",
      "Customer portal session issue API contract passed.",
    ],
    stripTypes: true,
  },
  {
    label: "customer saved bookings auth handoff cookie contract",
    script: "scripts/test-customer-saved-bookings-auth-handoff-readiness.mjs",
    requiredFragments: [
      "The browser must not manually attach `Cookie`, `Authorization`, or `x-prestige-customer-session-token` headers.",
      "configured cookie name is exclusive",
      "ambiguous cookie fail-closed guard",
      "Customer saved bookings auth handoff readiness passed.",
    ],
    stripTypes: false,
  },
  {
    label: "customer portal saved bookings adapter session contract",
    script: "scripts/test-customer-portal-saved-bookings-adapter.mjs",
    requiredFragments: [
      "fetchCalls[0].init.credentials",
      "The customer portal saved-bookings fetch must not attach session-token, authorization, or cookie headers.",
      "Blocked responses should not be parsed into customer-visible state.",
      "Customer portal saved bookings adapter contract passed.",
    ],
    stripTypes: true,
  },
  {
    label: "customer booking memory adapter session contract",
    script: "scripts/test-customer-booking-memory-ui-contract.mjs",
    requiredFragments: [
      "fetchCalls[0].init.credentials",
      "The booking memory fetch must not attach session-token, authorization, or cookie headers.",
      "Blocked customer booking memory reads should not parse body text.",
      "Customer booking memory UI contract tests passed.",
    ],
    stripTypes: true,
  },
  {
    label: "customer booking request adapter session contract",
    script: "scripts/test-customer-booking-page-api-audit.mjs",
    requiredFragments: [
      "/book client code must not attach customer tokens, authorization, or cookie headers.",
      "/book customer API calls should carry purpose headers.",
      "Customer booking page API audit passed.",
    ],
    stripTypes: false,
  },
  {
    label: "customer saved bookings cookie-backed route contract",
    script: "scripts/test-customer-saved-bookings-api-contract.mjs",
    requiredFragments: [
      "Expected route read to pass with same-origin session cookie.",
      "wrong cookie token",
      "ambiguous cookie token",
      "Unsafe configured cookie names should fail closed instead of falling back to defaults.",
      "Customer saved bookings API contract tests passed.",
    ],
    stripTypes: true,
  },
  {
    label: "customer booking memory cookie-backed route contract",
    script: "scripts/test-customer-booking-memory-api-contract.mjs",
    requiredFragments: [
      "Expected route read to pass with same-origin session cookie.",
      "wrong cookie token",
      "ambiguous cookie token",
      "Unsafe configured cookie names should fail closed instead of falling back to defaults.",
      "Customer booking memory API contract tests passed.",
    ],
    stripTypes: true,
  },
  {
    label: "customer booking status header-token route contract",
    script: "scripts/test-customer-booking-status-api-contract.mjs",
    requiredFragments: [
      "\"x-prestige-customer-session-token\": sessionToken",
      "wrong-token",
      "Customer booking status API contract tests passed.",
    ],
    stripTypes: true,
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

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function firstHeadersBlock(source) {
  return source.match(/headers:\s*\{[\s\S]*?\n\s*\}/)?.[0] || "";
}

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
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
  ...sourcePaths,
  ...contractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const ledgerSection = sectionBetween(ledger, "### Public API Session Cookie Cache Boundary Guard Lock");

for (const phrase of [
  "Public customer/driver API session, cookie, and cache boundaries are guarded across customer portal session issue, customer saved bookings, customer booking memory, customer booking status, customer booking request, customer app notifications, driver job, driver job notifications, driver issue-alert, driver flight ETA setup, and driver bidding routes.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.",
  "Only the customer portal session issue route may set `Set-Cookie`, and successful or blocked session-issue responses must stay `Cache-Control: no-store`.",
  "Customer portal session cookies must stay HttpOnly, Secure, SameSite=Lax, Priority=High, path-scoped, max-age limited, server-token backed, and fail closed for unsafe configured cookie names.",
  "Customer booking request, booking memory, and portal saved-bookings client adapters must use `credentials: \"same-origin\"`, `cache: \"no-store\"`, and purpose headers while never manually attaching Cookie, Authorization, or customer session-token headers.",
  "Customer saved-bookings and booking-memory reads may accept a server-validated same-origin session cookie; ambiguous, wrong, unsafe, placeholder, or duplicate cookie values fail closed.",
  "Customer booking status stays on its explicit server session-token header contract and does not set cookies.",
  "Driver public APIs must remain cookie-free and must not set session cookies.",
  "Public API session/cache contracts must continue checking secure cookie attributes, no-store responses, no manual client auth headers, and cookie-backed fail-closed reads through mocked route harnesses; this guard coordinates those scripts in the preactivation suite.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-api-session-cookie-cache-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public API session/cache ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation public API session/cache guard registration");

const routesWithSetCookie = publicApiRoutePaths.filter((path) => files[path].includes("Set-Cookie"));
assert.deepEqual(routesWithSetCookie, ["app/api/customer-portal-sessions/route.ts"], "public API Set-Cookie routes");

const routesWithCacheControl = publicApiRoutePaths.filter((path) => files[path].includes("Cache-Control"));
assert.deepEqual(routesWithCacheControl, ["app/api/customer-portal-sessions/route.ts"], "public API Cache-Control routes");

for (const routePath of publicApiRoutePaths) {
  assertExcludes(files[routePath], /cookies\s*\(/, `${routePath} direct Next cookies API`);
  assertExcludes(files[routePath], /headers\s*\(/, `${routePath} direct Next headers API`);
  assertExcludes(files[routePath], /request\.headers\.get\(["']cookie["']\)/i, `${routePath} raw cookie header parsing`);
}

const portalSessionRoute = files["app/api/customer-portal-sessions/route.ts"];
assert.equal(
  countOccurrences(portalSessionRoute, "\"Cache-Control\": \"no-store\""),
  3,
  "customer portal session route no-store response count",
);
for (const fragment of [
  "\"Set-Cookie\": result.data.cookie",
  "customerPortalSessionIssueAuthRequiredResult",
  "resolveCustomerPortalSessionIssue(request)",
]) {
  assertIncludes(portalSessionRoute, fragment, `customer portal session route ${fragment}`);
}

const portalSessionIssue = files["lib/customer-portal-session-issue.ts"];
for (const fragment of [
  "import \"server-only\";",
  "const maxSessionCookieAgeSeconds = 60 * 60;",
  "const safeCookieNamePattern = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,79}$/;",
  "if (configuredValue && !configuredName) {\n    return null;\n  }",
  "request.method !== \"POST\" || purpose !== \"customer-portal-session-issue\"",
  "sameOriginMyBookingsRequest(request)",
  "serializeCustomerSavedBookingsSessionCookie(cookieName, savedBookingsSessionToken)",
  "\"Path=/\"",
  "\"HttpOnly\"",
  "\"Secure\"",
  "\"SameSite=Lax\"",
  "\"Priority=High\"",
]) {
  assertIncludes(portalSessionIssue, fragment, `customer portal session issue ${fragment}`);
}
for (const unsafeFragment of [
  "\"customer_price\"",
  "\"driver_payout\"",
  "\"invoice\"",
  "\"payment\"",
  "\"paynow\"",
  "\"payout\"",
  "\"parser_debug\"",
  "\"service_role\"",
  "\"session_token\"",
  "\"token_hash\"",
]) {
  assertIncludes(portalSessionIssue, unsafeFragment, `session cookie unsafe fragment ${unsafeFragment}`);
}

const publicClientSources = [
  files["app/book/page.tsx"],
  files["app/my-bookings/page.tsx"],
  files["lib/customer-booking-memory-adapter.ts"],
  files["lib/customer-booking-request-adapter.ts"],
  files["lib/customer-portal-saved-bookings-adapter.ts"],
].join("\n");
assertExcludes(
  publicClientSources,
  /x-prestige-customer-session-token|authorization|cookie|PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN|PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME/i,
  "public customer client source manual auth/cookie/session-token plumbing",
);

for (const [label, source, purposeHeader] of [
  [
    "customer booking request adapter",
    files["lib/customer-booking-request-adapter.ts"],
    "\"x-prestige-customer-purpose\": \"customer-booking-request\"",
  ],
  [
    "customer booking memory adapter",
    files["lib/customer-booking-memory-adapter.ts"],
    "\"x-prestige-customer-purpose\": \"customer-booking-memory-read\"",
  ],
  [
    "customer portal saved bookings adapter",
    files["lib/customer-portal-saved-bookings-adapter.ts"],
    "\"x-prestige-customer-purpose\": \"customer-saved-bookings-read\"",
  ],
]) {
  assertIncludes(source, "cache: \"no-store\"", `${label} no-store fetch`);
  assertIncludes(source, "credentials: \"same-origin\"", `${label} same-origin credentials`);
  assertIncludes(source, purposeHeader, `${label} purpose header`);
  assertExcludes(firstHeadersBlock(source), /x-prestige-customer-session-token|authorization|cookie/i, `${label} headers block`);
}

const savedBookingsRead = files["lib/customer-saved-bookings-read.ts"];
const bookingMemoryRead = files["lib/customer-booking-memory-read.ts"];
for (const [label, source] of [
  ["customer saved bookings read", savedBookingsRead],
  ["customer booking memory read", bookingMemoryRead],
]) {
  for (const fragment of [
    "request.headers.get(\"x-prestige-customer-session-token\")?.trim()",
    "parseCookieHeader(request.headers.get(\"cookie\"))",
    "source: \"request-cookie\"",
    "source: \"ambiguous-cookie\"",
    "safeCookieNamePattern",
    "configuredValue && !configuredName",
    "providedToken.source === \"request-cookie\" ? \"server-session-cookie\" : \"server-session-token\"",
  ]) {
    assertIncludes(source, fragment, `${label} session boundary ${fragment}`);
  }
}

const bookingStatusRead = files["lib/customer-booking-status-read.ts"];
assertIncludes(
  bookingStatusRead,
  "request.headers.get(\"x-prestige-customer-session-token\")?.trim()",
  "customer booking status explicit session-token header",
);
assertExcludes(bookingStatusRead, "request.headers.get(\"cookie\")", "customer booking status cookie parsing");

for (const driverRoutePath of publicApiRoutePaths.filter((path) => path.includes("/driver-job"))) {
  assertExcludes(files[driverRoutePath], /Set-Cookie|Cache-Control|request\.headers\.get\(["']cookie["']\)/i, `${driverRoutePath} cookie/cache surface`);
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

console.log("Public API session cookie/cache boundary guard passed");
