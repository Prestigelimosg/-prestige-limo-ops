import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customer-portal-access-link-guard.mjs";

const helperPath = "lib/customer-portal-access-link.ts";
const accountHelperPath = "lib/customer-portal-access-account.ts";
const customerBoundaryPath = "lib/customer-saved-bookings-read.ts";
const adminRoutePath = "app/api/admin-customer-portal-access-links/route.ts";
const invoicePersistencePath = "lib/customer-invoice-record-persistence.ts";
const publicAccessRoutePath = "app/api/customer-portal-access/[token]/route.ts";
const appPagePath = "app/page.tsx";
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
      accountHelperPath,
      customerBoundaryPath,
      adminRoutePath,
      invoicePersistencePath,
      publicAccessRoutePath,
      appPagePath,
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
const accountHelper = files[accountHelperPath];
const customerBoundary = files[customerBoundaryPath];
const adminRoute = files[adminRoutePath];
const invoicePersistence = files[invoicePersistencePath];
const publicAccessRoute = files[publicAccessRoutePath];
const appPage = files[appPagePath];
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
const invoicePortalAccessProofFunction = sectionBetween(
  invoicePersistence,
  "export async function verifyIssuedCustomerInvoiceAccountForPortalAccess",
  "\nexport async function updateAdminCustomerInvoiceStatus",
);
const customerPortalLinkCopyHandler = sectionBetween(
  appPage,
  "async function createCustomerDriverDetailsPortalLink()",
  "\n  async function copyManualTelegramMessage",
);
const customerFinderSection = sectionBetween(
  customersPage,
  'data-customer-folder-finder="true"',
  'data-unbilled-customers-sector="true"',
);

for (const phrase of [
  "Admin can create a compact customer app link from Dispatch Customer Copy after assigned-driver details are ready.",
  "The Copy + App Link action creates or reactivates one server-side `customer_access_accounts` row for that saved booking customer account, then copies a signed portal-account link.",
  "The new portal-account link does not carry a link expiry; access is stopped by changing the server-side access account away from `active`.",
  "The guarded revoke route remains available at the backend, but the normal Customers finder row does not show portal invite/revoke controls.",
  "Opening the link sets the existing customer saved-bookings HttpOnly Secure SameSite=Lax Priority=High cookie and redirects to `/my-bookings`, preserving a safe booking/tracking query when the admin copied the link from a loaded booking.",
  "`/my-bookings` still calls only the existing saved-bookings and stored-invoice read adapters with same-origin credentials and purpose headers.",
  "Portal reads remain scoped to the signed customer account and require `customer_access_accounts.account_status = active` before booking, invoice, PDF, or amendment reads proceed.",
  "Customer portal booking history is read from the existing `bookings` table and filtered to the last 12 calendar months by pickup date; older rows stay admin-side and are not deleted.",
  "The public access route verifies the signed account is active before setting the cookie and does not create invoices, generate PDFs, send providers, send email, activate Stripe/payment, expose billing internals, expose customer price, expose driver payout, or expose parser/debug/mock archive data.",
  "The customer app link UI only copies the customer-safe driver details plus link for manual use in an approved channel; it does not send email, WhatsApp, SMS, Telegram, provider messages, payment links, or customer notifications.",
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
  'scope?: "portal_account" | "stored_document"',
  'access_scope: "allowlisted" | "portal_account" | "stored_document"',
  'options: { scope?: "portal_account" | "stored_document" } = {}',
  'options.scope === "portal_account"',
  'scope === "allowlisted" && !accountAllowed(account, config.data.accountAllowlist)',
  'scope === "portal_account" ? {} : { exp: expiresAtSeconds }',
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

for (const fragment of [
  'import "server-only";',
  "customerPortalAccessAccountVersion",
  "customer_access_accounts",
  "assertActiveCustomerPortalAccessAccount",
  "ensureAdminCustomerPortalAccessAccount",
  "revokeAdminCustomerPortalAccessAccount",
  ".eq(\"customer_account_reference\", customerAccountReference)",
  ".eq(\"account_status\", \"active\")",
  ".upsert(payload,",
  ".update({",
  'account_status: "revoked"',
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]) {
  assertIncludes(accountHelper, fragment, `portal access account helper ${fragment}`);
}
assertExcludes(accountHelper, /NEXT_PUBLIC_[A-Z0-9_]+|messages\.create|whatsapp|telegram|stripe|payment_intent/i, "portal access account helper unsafe provider/client path");

assertIncludes(customerBoundary, "resolveCustomerPortalAccessSession(providedToken.token, runtimeGate.data)", "customer boundary portal access handoff");
assertIncludes(customerBoundary, "isCustomerPortalAccessToken(providedToken.token)", "customer boundary portal access token guard");
assertIncludes(customerBoundary, 'mode: "server-session-cookie"', "customer boundary access-cookie mode");
assertIncludes(customerBoundary, "const signedPortalCookieSession =", "customer saved-bookings read signed portal cookie gate");
assertIncludes(customerBoundary, "!signedPortalCookieSession", "customer saved-bookings read keeps disabled gate for non-portal sessions");
assertIncludes(customerBoundary, "customer_account_reference: customerAccountReference", "customer boundary scoped account context");
assertIncludes(customerBoundary, 'portalAccessSession.data.access_scope === "allowlisted"', "customer boundary allowlisted scope branch");
assertIncludes(customerBoundary, "account_allowlist: new Set([", "customer boundary stored-document account narrowing");
assertIncludes(customerBoundary, "portalAccessSession.data.customer_account_reference", "customer boundary stored-document signed account source");
assertIncludes(customerBoundary, "customerPortalHistoryWindowStartIso", "customer boundary 12-month history window helper");
assertIncludes(customerBoundary, ".gte(pickupColumn, historyWindowStartIso)", "customer boundary 12-month pickup filter");
assertIncludes(customerBoundary, "assertActiveCustomerPortalAccessAccount", "customer boundary active account check");
assert.equal(
  customerBoundaryFunction.indexOf("isCustomerPortalAccessToken(providedToken.token)") <
    customerBoundaryFunction.indexOf('process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED !== "true"'),
  true,
  "signed portal-access cookie must be accepted before the legacy saved-bookings session-token gate.",
);

assert.deepEqual(exportedMethods(adminRoute), ["DELETE", "GET", "PATCH", "POST", "PUT"], "admin portal access route methods");
assertIncludes(adminRoute, "resolveAdminCustomerInvoiceBoundary(request)", "admin portal access route boundary");
assertIncludes(adminRoute, "ensureAdminCustomerPortalAccessAccount", "admin portal access route invite activation");
assertIncludes(adminRoute, "revokeAdminCustomerPortalAccessAccount", "admin portal access route revoke action");
assertIncludes(adminRoute, "createCustomerPortalAccessLinkToken(account.data.customer_account_reference", "admin portal access route account-scoped link creation");
assertIncludes(adminRoute, 'scope: "portal_account"', "admin portal access route portal-account scoped token");
assertIncludes(adminRoute, 'action !== "revoke"', "admin portal access route only allows revoke patch action");
assertExcludes(adminRoute, /Set-Cookie|NextResponse|@supabase\/supabase-js|\bcreateClient\b|\.(?:from|insert|upsert|update|delete|rpc)\s*\(/, "admin portal access route unsafe path");

for (const fragment of [
  "verifyIssuedCustomerInvoiceAccountForPortalAccess",
  "safeActor(actor)",
  ".select(\"invoice_number\")",
  ".eq(\"customer_id\", customerId)",
  ".eq(\"document_state\", \"issued\")",
  ".limit(1)",
  "safeFailure(safeMissingError, 404)",
]) {
  assertIncludes(invoicePortalAccessProofFunction, fragment, `invoice persistence portal access proof ${fragment}`);
}
assertExcludes(invoicePortalAccessProofFunction, /\.(?:insert|upsert|update|delete|rpc)\s*\(/, "invoice persistence portal access proof write path");
assertIncludes(invoicePersistence, "assertActiveCustomerPortalAccessAccount", "customer invoice/PDF portal active account check");
assertIncludes(invoicePersistence, "loadCustomerInvoiceRecordsForPortal", "customer invoice portal records read");
assertIncludes(invoicePersistence, "loadCustomerInvoicePdfForPortal", "customer invoice portal PDF read");

assert.deepEqual(exportedMethods(publicAccessRoute), ["DELETE", "GET", "PATCH", "POST", "PUT"], "customer portal access route methods");
assertIncludes(publicAccessRoute, "resolveCustomerPortalAccessSession(token)", "public access route token validation");
assertIncludes(publicAccessRoute, "assertActiveCustomerPortalAccessAccount", "public access route active account check");
assertIncludes(publicAccessRoute, "customerPortalAccessCookieHeader(token)", "public access route cookie creation");
assertIncludes(publicAccessRoute, "customerPortalRedirectUrl(request)", "public access route redirect");
assertIncludes(publicAccessRoute, "redirectUrl.searchParams.set(\"booking\", bookingReference)", "public access route booking deep-link");
assertIncludes(publicAccessRoute, "redirectUrl.searchParams.set(\"tracking\", \"1\")", "public access route tracking deep-link");
assertIncludes(publicAccessRoute, "response.headers.set(\"Set-Cookie\", cookie.data)", "public access route Set-Cookie");
assertIncludes(publicAccessRoute, "\"Cache-Control\": \"no-store\"", "public access route no-store blocked response");
assertExcludes(publicAccessRoute, /@supabase\/supabase-js|\bcreateClient\b|\.(?:from|insert|upsert|update|delete|rpc)\s*\(/, "public access route DB/provider path");
assertExcludes(publicAccessRoute, forbiddenCustomerPortalAccessSurfacePattern, "public access route customer-visible private fields");

for (const fragment of [
  "adminCustomerPortalAccessLinksApiPath",
  "const customerDriverDetailsPortalAccountReference =",
  "cleanReferenceText(appliedAdminBookingSnapshot?.customer_id)",
  "cleanReferenceText(dispatchReleaseLoadedBookingRecord?.customer_id)",
  "cleanReferenceText(customerDriverDetailsPortalLastSavedRecord?.customer_id)",
  "copyCustomerDriverDetailsWithCustomerAppLink",
  'data-admin-customer-driver-details-copy-with-portal-link="true"',
  'data-admin-customer-driver-details-copy-with-portal-link-external-send="false"',
  'data-admin-customer-driver-details-copy-with-portal-link-no-provider-send="true"',
  'data-admin-customer-driver-details-copy-with-portal-link-feedback="true"',
  'data-admin-customer-driver-details-copy-with-portal-link-url="true"',
  "Copy + App Link",
  "Copying link",
  "Copied + link",
]) {
  assertIncludes(appPage, fragment, `dispatch customer app link ${fragment}`);
}

for (const fragment of [
  "const customerAccountReference = customerDriverDetailsPortalAccountReference;",
  "if (!dispatchReleaseCustomerCopyReady)",
  "fetch(adminCustomerPortalAccessLinksApiPath",
  "bookingReference,",
  "customerAccountReference,",
  "safeDisplayLabel: customerDriverDetailsPortalSafeDisplayLabel || customerAccountReference",
  '"x-prestige-admin-purpose": adminLegacyDataPurpose',
  "navigator.clipboard.writeText(",
  "customerDriverDetailsWithPortalLinkText(messageText, portalUrl)",
  "portalUrl,",
  "Paste/send manually; no provider message was sent.",
  "external_send: false",
  "noProviderSend: true",
]) {
  assertIncludes(customerPortalLinkCopyHandler, fragment, `dispatch customer app link handler ${fragment}`);
}

assertExcludes(
  customerPortalLinkCopyHandler,
  /copyManualTelegramMessage\s*\(|telegram\.org|t\.me|chat_id|sendMessage|sendAdminCustomerDriverDetailsEmail\s*\(/i,
  "customer app link copy handler must not call provider/message sends",
);
assertExcludes(
  customerFinderSection,
  /data-customer-portal-access-link|data-customer-portal-access-revoke|Portal link copied for|Copy link/,
  "customers finder row must not expose portal invite/revoke controls",
);

assertExcludes(portalClientSource, "/api/customer-portal-access", "customer portal client must not call access-link route");
assertExcludes(portalClientSource, "/api/admin-customer-portal-access-links", "customer portal client must not call admin access route");
assertExcludes(portalClientSource, forbiddenClientAuthPattern, "customer portal client auth plumbing");
assertIncludes(portalClientSource, "readCustomerPortalBookingDeepLink", "customer portal booking deep-link read");
assertIncludes(portalClientSource, "setExpandedBookingId(targetBooking.id)", "customer portal booking deep-link opens detail");
assertIncludes(portalClientSource, "setActiveTrackingBookingId(targetBooking.id)", "customer portal booking deep-link opens tracking");
assertIncludes(portalClientSource, "refreshCustomerTrackingForBooking(targetBooking)", "customer portal booking deep-link loads driver reporting");

console.log("Customer portal access link guard passed");
