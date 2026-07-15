import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-customer-portal-session-issue-surface-guard.mjs";

const sessionIssuePath = "lib/customer-portal-session-issue.ts";
const sessionRoutePath = "app/api/customer-portal-sessions/route.ts";
const portalPagePath = "app/my-bookings/page.tsx";
const portalAdapterPath = "lib/customer-portal-saved-bookings-adapter.ts";

const allowedSessionIssueEnvNames = [
  "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED",
  "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE",
  "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN",
];

const requiredForbiddenSessionFragments = [
  "admin_finance",
  "admin_internal_status",
  "billing",
  "customer_price",
  "driver_payout",
  "finance",
  "internal_admin_note",
  "internal_finance_note",
  "invoice",
  "jwt",
  "mock_archive",
  "mock_qa",
  "parser_debug",
  "payment",
  "paynow",
  "payout",
  "pdf",
  "raw_token",
  "refresh_token",
  "secret",
  "service_role",
  "session_secret",
  "session_token",
  "token_hash",
];

const contractChecks = [
  {
    label: "customer portal session issue API contract",
    script: "scripts/test-customer-portal-session-issue-api-contract.mjs",
    requiredFragments: [
      "Customer portal session issue path must not write or call RPC.",
      "Customer portal session issue must not touch Supabase.",
      "Customer portal UI/client must not call or expose the session issue contract.",
      "assertSecureCookie(successResponse.headers.get(\"set-cookie\"));",
      "Customer portal session issue API contract passed.",
    ],
    stripTypes: true,
  },
  {
    label: "public API session cookie/cache boundary guard",
    script: "scripts/test-public-api-session-cookie-cache-boundary-guard.mjs",
    requiredFragments: [
      "Only the customer portal session issue route may issue a live session cookie.",
      "Customer portal session cookies must stay HttpOnly, Secure, SameSite=Lax, Priority=High",
      "Public API session cookie/cache boundary guard passed",
    ],
    stripTypes: false,
  },
  {
    label: "customer saved bookings auth handoff readiness",
    script: "scripts/test-customer-saved-bookings-auth-handoff-readiness.mjs",
    requiredFragments: [
      "Unsafe, duplicate, ambiguous, wrong, missing, or placeholder values fail closed",
      "The UI fail-closes to an empty/sign-in-required booking list when the guarded read is blocked.",
      "The browser must not manually attach `Cookie`, `Authorization`, or `x-prestige-customer-session-token` headers.",
      "Customer saved bookings auth handoff readiness passed.",
    ],
    stripTypes: false,
  },
  {
    label: "public API request input boundary guard",
    script: "scripts/test-public-api-request-input-boundary-guard.mjs",
    requiredFragments: [
      "Customer portal session issue input must remain server-gated by purpose/origin/referer/token headers and must not be called from customer UI/client code.",
      "customer portal session header input contract",
      "Public API request input boundary guard passed",
    ],
    stripTypes: false,
  },
  {
    label: "public API client caller boundary guard",
    script: "scripts/test-public-api-client-caller-boundary-guard.mjs",
    requiredFragments: [
      "The customer portal client must not expose customer session-token plumbing.",
      "The customer portal saved-bookings fetch must not attach session-token, authorization, or cookie headers.",
      "Public API client caller boundary guard passed",
    ],
    stripTypes: false,
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

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
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

function extractEnvNames(source) {
  return [...source.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((item) => item[1]);
}

function extractExportedMethods(source) {
  return [...source.matchAll(/export\s+async\s+function\s+([A-Z]+)\s*\(/g)].map((item) => item[1]);
}

function clientSourceWithoutProtectiveFragments(source) {
  return source.replace(
    /const forbiddenCustomerSavedBookingsFragments = \[[\s\S]*?\];\n\nfunction asRecord/,
    "function asRecord",
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
  sessionIssuePath,
  sessionRoutePath,
  portalPagePath,
  portalAdapterPath,
  ...contractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const sessionIssue = files[sessionIssuePath];
const sessionRoute = files[sessionRoutePath];
const portalPage = files[portalPagePath];
const portalAdapter = files[portalAdapterPath];
const clientSource = `${portalPage}\n${portalAdapter}`;
const clientExposureSource = clientSourceWithoutProtectiveFragments(clientSource);
const ledgerSection = sectionBetween(
  ledger,
  "### Public Customer Portal Session Issue Surface Guard Lock",
);

for (const phrase of [
  "Public customer portal session issue surfaces are guarded across `/api/customer-portal-sessions`, `lib/customer-portal-session-issue.ts`, `/my-bookings`, and the customer portal saved-bookings adapter.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, auth activation, or new shims.",
  "The customer portal session issue helper must remain server-only, default-off, same-origin `/my-bookings` referer gated, purpose-header gated, server-token gated, and cookie-name fail-closed.",
  "Only `POST /api/customer-portal-sessions` may issue a cookie, and successful or blocked responses must stay `Cache-Control: no-store`.",
  "Successful session issue responses must expose only `{ ok: true, version }` in the body; the session token remains only in the HttpOnly Secure SameSite=Lax Priority=High cookie.",
  "GET, PUT, PATCH, and DELETE on `/api/customer-portal-sessions` must stay blocked and must not issue cookies.",
  "`/my-bookings` and the customer portal saved-bookings adapter must not call or expose `/api/customer-portal-sessions`, the session issue token header, customer session-token plumbing, Cookie, Authorization, or server env names.",
  "The customer portal saved-bookings adapter must keep using only `/api/customer-saved-bookings?limit=25&page=1` with `cache: \"no-store\"`, `credentials: \"same-origin\"`, and the customer saved-bookings purpose header.",
  "The session issue source must not touch Supabase, DB write/query clients, RPC, provider sends, admin saved-bookings, parser, payment/PDF/pricing/payout/auth activation, location/photo/calendar, or new shims.",
  "This guard coordinates the customer portal session issue API contract, public API session cookie/cache guard, customer saved-bookings auth handoff readiness, public API request input guard, and public API client caller guard in the preactivation suite.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-customer-portal-session-issue-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public customer portal session issue ledger phrase: ${phrase}`);
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation public customer portal session issue guard registration",
);

assertIncludes(sessionIssue, 'import "server-only";', "session issue server-only import");
assertIncludes(
  sessionIssue,
  'export const customerPortalSessionIssueVersion =\n  "customer-portal-session-issue-v1";',
  "session issue version",
);
assertSameList(extractEnvNames(sessionIssue), allowedSessionIssueEnvNames, "session issue env names");
for (const forbiddenSessionSourcePattern of [
  /@supabase\/supabase-js|createClient|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL/,
  /\.(?:insert|upsert|delete|update|rpc)\s*\(/,
  /\/api\/admin-saved-bookings|\/api\/ai-parse/,
  /telegram|whatsapp|sms|email|provider|send/i,
]) {
  assertExcludes(sessionIssue, forbiddenSessionSourcePattern, "session issue forbidden source dependency");
}

const forbiddenFragmentsBlock = blockBetween(
  sessionIssue,
  "const forbiddenCustomerSessionFragments = [",
  "];\n\nexport type CustomerPortalSessionIssueResult",
);
for (const fragment of requiredForbiddenSessionFragments) {
  assertIncludes(forbiddenFragmentsBlock, `"${fragment}"`, `session issue forbidden fragment ${fragment}`);
}

for (const fragment of [
  "const customerSavedBookingsSessionCookieName =\n  \"prestige_customer_saved_bookings_session\";",
  "const maxSessionCookieAgeSeconds = 60 * 60;",
  "const safeCookieNamePattern = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,79}$/;",
  "if (configuredValue && !configuredName) {\n    return null;\n  }",
  "request.method !== \"POST\" || purpose !== \"customer-portal-session-issue\"",
  "sameOriginMyBookingsRequest(request)",
  "refererUrl.origin === requestUrl.origin && refererUrl.pathname === \"/my-bookings\"",
  "process.env.PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED !== \"true\"",
  "issueMode !== \"server-session-token\"",
  "validServerCredential(expectedIssueToken)",
  "validServerCredential(savedBookingsSessionToken)",
  "safeUuid(process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID)",
  "providedIssueToken !== expectedIssueToken",
]) {
  assertIncludes(sessionIssue, fragment, `session issue gate fragment ${fragment}`);
}

const cookieSerializeBlock = blockBetween(
  sessionIssue,
  "function serializeCustomerSavedBookingsSessionCookie",
  "].join(\"; \");",
);
for (const fragment of [
  "Path=/",
  "Max-Age=${maxSessionCookieAgeSeconds}",
  "HttpOnly",
  "Secure",
  "SameSite=Lax",
  "Priority=High",
]) {
  assertIncludes(cookieSerializeBlock, fragment, `secure customer portal cookie attribute ${fragment}`);
}

assertSameList(
  extractExportedMethods(sessionRoute),
  ["DELETE", "GET", "PATCH", "POST", "PUT"],
  "customer portal session route methods",
);
assert.equal(countOccurrences(sessionRoute, '"Set-Cookie": result.data.cookie'), 1, "session route Set-Cookie count");
assert.equal(countOccurrences(sessionRoute, '"Cache-Control": "no-store"'), 3, "session route no-store count");
for (const fragment of [
  'export const dynamic = "force-dynamic";',
  "const result = resolveCustomerPortalSessionIssue(request);",
  "return Response.json(\n      {\n        ok: true,\n        version: result.data.version,\n      },",
  "customerPortalSessionIssueAuthRequiredResult()",
  "return result.ok ? safeFailureResponse() : safeErrorResponse(result);",
]) {
  assertIncludes(sessionRoute, fragment, `session route fragment ${fragment}`);
}
assertExcludes(sessionRoute, /cookie:\s|session_token|raw_token|token_hash|service_role/i, "session route response/source leak");

for (const forbiddenClientPattern of [
  /customer-portal-sessions|customer-portal-session-issue|x-prestige-customer-session-issue-token|PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE/,
  /\b(?:Authorization|authorization|Cookie|cookie|x-prestige-customer-session-token|session_token|raw_token|token_hash)\b/,
  /localStorage|sessionStorage|document\.cookie|navigator\.credentials/i,
  /Set-Cookie|HttpOnly|SameSite|Priority=High/,
  /\/api\/admin|\/api\/admin-saved-bookings|\/api\/ai-parse/i,
]) {
  assertExcludes(clientExposureSource, forbiddenClientPattern, "customer portal client session issue exposure");
}

for (const fragment of [
  "loadCustomerPortalSavedBookings({",
  'setPortalBookingsLoadState(loadedBookings === null ? "blocked" : "ready")',
  '"Sign in to view bookings."',
  "fetcher(`${customerPortalSavedBookingsApiPath}?limit=25&page=1`",
  'cache: "no-store"',
  'credentials: "same-origin"',
  '"x-prestige-customer-purpose": "customer-saved-bookings-read"',
  "if (!response.ok) {\n      return null;\n    }",
]) {
  assertIncludes(clientSource, fragment, `customer portal saved-bookings session-safe client fragment ${fragment}`);
}

for (const check of contractChecks) {
  for (const fragment of check.requiredFragments) {
    assertIncludes(files[check.script], fragment, `${check.label} source fragment ${fragment}`);
  }
  runContractCheck(check);
}

console.log("Public customer portal session issue surface guard passed");
