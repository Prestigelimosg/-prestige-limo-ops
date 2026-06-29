import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customer-portal-access-link-guard.mjs";

const helperPath = "lib/customer-portal-access-link.ts";
const customerBoundaryPath = "lib/customer-saved-bookings-read.ts";
const adminRoutePath = "app/api/admin-customer-portal-access-links/route.ts";
const publicAccessRoutePath = "app/api/customer-portal-access/[token]/route.ts";
const customersPagePath = "app/customers/page.tsx";
const portalPagePath = "app/my-bookings/page.tsx";
const portalSavedBookingsAdapterPath = "lib/customer-portal-saved-bookings-adapter.ts";
const portalInvoicesAdapterPath = "lib/customer-portal-invoices-adapter.ts";

const allowedHelperEnvNames = [
  "PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ACCOUNT_ALLOWLIST",
  "PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ENABLED",
  "PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_SECRET",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME",
];

const forbiddenClientAuthPattern =
  /\b(?:Authorization|authorization|Cookie|cookie|x-prestige-customer-session-token|PRESTIGE_CUSTOMER_[A-Z0-9_]*TOKEN)\b/;
const forbiddenCustomerPortalAccessSurfacePattern =
  /admin_internal_status|billing|customer_price|driver_payout|paynow|pay_now|payment|payout|finance|parser_debug|mock_archive|mock_qa|internal_admin_note|internal_finance_note|service_role|server_secret/i;

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
  return [...source.matchAll(/\bprocess\.env\.([A-Z0-9_]+)/g)].map((item) => item[1]).sort();
}

function exportedMethods(source) {
  return [...source.matchAll(/export\s+async\s+function\s+([A-Z]+)\s*\(/g)].map((item) => item[1]).sort();
}

const files = Object.fromEntries(
  await Promise.all(
    [
      ledgerPath,
      preactivationSuitePath,
      helperPath,
      customerBoundaryPath,
      adminRoutePath,
      publicAccessRoutePath,
      customersPagePath,
      portalPagePath,
      portalSavedBookingsAdapterPath,
      portalInvoicesAdapterPath,
    ].map(async (path) => [path, await readFile(path, "utf8")]),
  ),
);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const helper = files[helperPath];
const customerBoundary = files[customerBoundaryPath];
const adminRoute = files[adminRoutePath];
const publicAccessRoute = files[publicAccessRoutePath];
const customersPage = files[customersPagePath];
const portalClientSource = [
  files[portalPagePath],
  files[portalSavedBookingsAdapterPath],
  files[portalInvoicesAdapterPath],
].join("\n");
const ledgerSection = sectionBetween(ledger, "### Customer Portal Access Link Lock");
const customerBoundaryFunction = sectionBetween(
  customerBoundary,
  "export function resolveCustomerSavedBookingsBoundary",
  "\nexport async function loadCustomerSavedBookings",
);

for (const phrase of [
  "Admin can create a compact customer portal access link from the Customers finder row.",
  "The link is signed server-side, account allowlisted, expires after a bounded window, and does not require the customer browser page to know any session token.",
  "Opening the link sets the existing customer saved-bookings HttpOnly Secure SameSite=Lax Priority=High cookie and redirects to `/my-bookings`.",
  "`/my-bookings` still calls only the existing saved-bookings and stored-invoice read adapters with same-origin credentials and purpose headers.",
  "Portal reads remain scoped to the signed customer account and the controlled customer runtime allowlist.",
  "The public access route does not read or write Supabase, create invoices, generate PDFs, send providers, send email, activate Stripe/payment, expose billing internals, expose customer price, expose driver payout, or expose parser/debug/mock archive data.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
]) {
  assertIncludes(ledgerSection, phrase, `customer portal access ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation customer portal access link guard registration");

assertIncludes(helper, 'import "server-only";', "portal access helper server-only");
for (const fragment of [
  "createHmac",
  "timingSafeEqual",
  "customerPortalAccessTokenPrefix = \"portal_access_v1\"",
  "PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ENABLED",
  "PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_SECRET",
  "PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ACCOUNT_ALLOWLIST",
  "serializeCustomerPortalAccessCookie",
  "HttpOnly",
  "Secure",
  "SameSite=Lax",
  "Priority=High",
  "maxCustomerPortalAccessLinkAgeSeconds",
  "maxCustomerPortalCookieAgeSeconds",
]) {
  assertIncludes(helper, fragment, `portal access helper ${fragment}`);
}
assert.deepEqual(envNames(helper), allowedHelperEnvNames, "portal access helper env allowlist");
assertExcludes(helper, /@supabase\/supabase-js|\bcreateClient\b|\.(?:insert|upsert|delete|rpc)\s*\(/, "portal access helper DB/provider path");

assertIncludes(customerBoundary, "resolveCustomerPortalAccessSession(providedToken.token, runtimeGate.data)", "customer boundary portal access handoff");
assertIncludes(customerBoundary, "isCustomerPortalAccessToken(providedToken.token)", "customer boundary portal access token guard");
assertIncludes(customerBoundary, 'mode: "server-session-cookie"', "customer boundary access-cookie mode");
assertIncludes(customerBoundary, "const signedPortalCookieSession =", "customer saved-bookings read signed portal cookie gate");
assertIncludes(customerBoundary, "!signedPortalCookieSession", "customer saved-bookings read keeps disabled gate for non-portal sessions");
assertIncludes(customerBoundary, "customer_account_reference: customerAccountReference", "customer boundary scoped account context");
assert.equal(
  customerBoundaryFunction.indexOf("isCustomerPortalAccessToken(providedToken.token)") <
    customerBoundaryFunction.indexOf('process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED !== "true"'),
  true,
  "signed portal-access cookie must be accepted before the legacy saved-bookings session-token gate.",
);

assert.deepEqual(exportedMethods(adminRoute), ["DELETE", "GET", "PATCH", "POST", "PUT"], "admin portal access route methods");
assertIncludes(adminRoute, "resolveAdminCustomerInvoiceBoundary(request)", "admin portal access route boundary");
assertIncludes(adminRoute, "createCustomerPortalAccessLinkToken(body.customerAccountReference)", "admin portal access route link creation");
assertExcludes(adminRoute, /Set-Cookie|NextResponse|@supabase\/supabase-js|\bcreateClient\b|\.(?:from|insert|upsert|update|delete|rpc)\s*\(/, "admin portal access route unsafe path");

assert.deepEqual(exportedMethods(publicAccessRoute), ["DELETE", "GET", "PATCH", "POST", "PUT"], "customer portal access route methods");
assertIncludes(publicAccessRoute, "resolveCustomerPortalAccessSession(token)", "public access route token validation");
assertIncludes(publicAccessRoute, "customerPortalAccessCookieHeader(token)", "public access route cookie creation");
assertIncludes(publicAccessRoute, "NextResponse.redirect(new URL(\"/my-bookings\", request.url)", "public access route redirect");
assertIncludes(publicAccessRoute, "response.headers.set(\"Set-Cookie\", cookie.data)", "public access route Set-Cookie");
assertIncludes(publicAccessRoute, "\"Cache-Control\": \"no-store\"", "public access route no-store blocked response");
assertExcludes(publicAccessRoute, /@supabase\/supabase-js|\bcreateClient\b|\.(?:from|insert|upsert|update|delete|rpc)\s*\(/, "public access route DB/provider path");
assertExcludes(publicAccessRoute, forbiddenCustomerPortalAccessSurfacePattern, "public access route customer-visible private fields");

for (const fragment of [
  "adminCustomerPortalAccessLinksApiPath",
  "data-customer-portal-access-link",
  "navigator.clipboard.writeText(url)",
  "Portal link copied for",
  "\"Content-Type\": \"application/json\"",
  "\"x-prestige-admin-purpose\": \"admin-booking-persistence\"",
]) {
  assertIncludes(customersPage, fragment, `customers page portal access ${fragment}`);
}

assertExcludes(portalClientSource, "/api/customer-portal-access", "customer portal client must not call access-link route");
assertExcludes(portalClientSource, "/api/admin-customer-portal-access-links", "customer portal client must not call admin access route");
assertExcludes(portalClientSource, forbiddenClientAuthPattern, "customer portal client auth plumbing");

console.log("Customer portal access link guard passed");
