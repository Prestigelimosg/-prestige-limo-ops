import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

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
  "\n  function adminDriverJobLinkFailureMessage",
);
const customerFinderSection = sectionBetween(
  customersPage,
  'data-selected-customer-dashboard="true"',
  'data-customer-billing-workbench-drawer="true"',
);

for (const phrase of [
  "Admin can create a compact customer app link from Dispatch Customer Copy after assigned-driver details are ready.",
  "The Copy + App Link action creates or reactivates one server-side `customer_access_accounts` row for that saved booking customer account, then copies a signed portal-account link.",
  "The new portal-account link does not carry a link expiry; access is stopped by changing the server-side access account away from `active`.",
  "The guarded revoke route remains available at the backend, but the normal Customers finder row does not show portal invite/revoke controls.",
  "Opening the link sets the existing customer saved-bookings HttpOnly Secure SameSite=Lax Priority=High cookie and redirects to `/my-bookings`, preserving a safe booking/tracking query when the admin copied the link from a loaded booking.",
  "`/my-bookings` reads still use the existing saved-bookings and stored-invoice adapters with same-origin credentials and purpose headers; its sole direct ordinary-message write caller is the separately guarded typed Customer-to-Driver shared-conversation POST using `client_message_id + message_text`.",
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
  "linkRevision?: unknown",
  "link_revision: safeLinkRevision(payload.rev)",
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
  "safeCustomerPortalPublicBookingReference",
  "/^(?:[0-9]{5}|[A-Z0-9]{2,12}-[0-9]{5})$/",
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
  "agencyCustomerAccount?: unknown",
  "verifyAgencyCustomerAccountRelationship",
  '.from("customers")',
  '.eq("customer_type", "hotel")',
  '.from("bookings")',
  "revokeAdminCustomerPortalAccessAccount",
  ".eq(\"customer_account_reference\", customerAccountReference)",
  ".eq(\"account_status\", \"active\")",
  ".upsert(payload,",
  'onConflict: "customer_account_reference"',
  ".update({",
  'account_status: "revoked"',
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]) {
  assertIncludes(accountHelper, fragment, `portal access account helper ${fragment}`);
}
assertExcludes(accountHelper, /NEXT_PUBLIC_[A-Z0-9_]+|messages\.create|whatsapp|telegram|stripe|payment_intent/i, "portal access account helper unsafe provider/client path");
assertExcludes(accountHelper, /onConflict:\s*referenceRecord\s*\?\s*["']customer_account_reference["']\s*:\s*["']booker_id["']/, "portal access account helper partial booker index conflict target");

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
assertIncludes(adminRoute, "findAdminBooker", "admin portal access route exact saved Booker lookup");
assertIncludes(adminRoute, "id: body.bookerId", "admin portal access route exact Booker id lookup");
assertIncludes(adminRoute, "company_id: body.companyId", "admin portal access route exact Company id lookup");
assertIncludes(adminRoute, "booker.data.customer_id !== Number(body.customerAccountReference)", "admin portal access route validates exact Customer account binding before the access-account write");
assertIncludes(adminRoute, "email: booker.data.email", "admin portal access route server-verified Booker email");
assertIncludes(adminRoute, "principalRole: \"pa\"", "admin portal access route Booker principal role");
assertIncludes(adminRoute, "revokeAdminCustomerPortalAccessAccount", "admin portal access route revoke action");
assertIncludes(adminRoute, "issueCustomerPrincipalInvitation", "admin portal access route one-use invitation creation");
assertIncludes(adminRoute, "travelerId: null", "admin portal access route Company and Booker root membership");
assert.equal(
  adminRoute.indexOf("const booker = await findAdminBooker(") <
    adminRoute.indexOf("const account = await ensureAdminCustomerPortalAccessAccount("),
  true,
  "The exact Booker/Company/Customer relationship must be verified before the access-account write",
);
assertExcludes(adminRoute, "body.email", "admin portal access route must not trust a browser recipient email");
assertExcludes(adminRoute, "body.principalRole", "admin portal access route must not trust a browser role");
assertExcludes(adminRoute, "body.memberships", "admin portal access route must not trust browser membership scope");
assertIncludes(adminRoute, "revokeCustomerPrincipalAccess", "admin portal access route principal revoke action");
assertIncludes(adminRoute, 'action !== "revoke" && action !== "revoke_legacy"', "admin portal access route bounded revoke actions");
assertExcludes(adminRoute, "createCustomerPortalAccessLinkToken", "admin portal access route retired permanent-link creation");
assertExcludes(adminRoute, "body.bookingReference", "admin portal access route internal booking deep-link input");
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
assertIncludes(publicAccessRoute, "safeCustomerPortalPublicBookingReference", "public access route public booking deep-link validation");
assertIncludes(publicAccessRoute, "redirectUrl.searchParams.set(\"booking\", bookingReference)", "public access route booking deep-link");
assertIncludes(publicAccessRoute, "redirectUrl.searchParams.set(\"tracking\", \"1\")", "public access route tracking deep-link");
assertIncludes(publicAccessRoute, "response.headers.set(\"Set-Cookie\", cookie.data)", "public access route Set-Cookie");
assertIncludes(publicAccessRoute, "\"Cache-Control\": \"no-store\"", "public access route no-store blocked response");
assertExcludes(publicAccessRoute, /@supabase\/supabase-js|\bcreateClient\b|\.(?:from|insert|upsert|update|delete|rpc)\s*\(/, "public access route DB/provider path");
assertExcludes(publicAccessRoute, 'searchParams.get("booking_reference")', "public access route legacy internal booking query");
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
  "Copy + App Link",
  "Preparing link",
  "Invitation copied",
]) {
  assertIncludes(appPage, fragment, `dispatch customer app link ${fragment}`);
}

for (const fragment of [
  "const customerAccountReference = customerDriverDetailsPortalAccountReference;",
  "if (!customerDriverDetailsPortalLinkCopyReady)",
  "fetch(adminCustomerPortalAccessLinksApiPath",
  "customerAccountReference,",
  "bookerId,",
  "companyId,",
  "safeDisplayLabel: customerDriverDetailsPortalSafeDisplayLabel || customerAccountReference",
  '"x-prestige-admin-purpose": adminLegacyDataPurpose',
  "navigator.clipboard.writeText(",
  "portalUrl,",
  "Paste/send manually; no provider message was sent.",
  "external_send: false",
  "noProviderSend: true",
]) {
  assertIncludes(customerPortalLinkCopyHandler, fragment, `dispatch customer app link handler ${fragment}`);
}

assertExcludes(
  customerPortalLinkCopyHandler,
  /window\.prompt|principalRole|memberships|travelerId|verifiedBossName|copyManualTelegramMessage\s*\(|telegram\.org|t\.me|chat_id|sendMessage|sendAdminCustomerDriverDetailsEmail\s*\(/i,
  "customer app link copy handler must not call provider/message sends",
);
assertExcludes(
  appPage,
  'data-admin-customer-driver-details-copy-with-portal-link-url="true"',
  "customer app link copy feedback must not visibly render the raw portal URL",
);
assertIncludes(
  appPage,
  "!customerDriverDetailsPortalBookerId ||",
  "dispatch Customer access invitation requires the verified booker",
);
assertExcludes(
  customerPortalLinkCopyHandler,
  "!adminDispatchVerifiedIdentityId(booking.travelerId)",
  "dispatch Customer access invitation must not use the booking-specific traveller as account identity",
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
assertIncludes(portalClientSource, "booking.publicBookingReference === deepLink.bookingReference", "customer portal public booking deep-link match");
assertExcludes(portalClientSource, "`saved-${deepLink.bookingReference}`", "customer portal internal booking deep-link reconstruction");
assertIncludes(portalClientSource, "setExpandedBookingId(targetBooking.id)", "customer portal booking deep-link opens detail");
assertIncludes(portalClientSource, "setActiveTrackingBookingId(targetBooking.id)", "customer portal booking deep-link opens tracking");
assertIncludes(portalClientSource, "refreshCustomerTrackingForBooking(targetBooking)", "customer portal booking deep-link loads driver reporting");

function transpile(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

const routeHarnessDir = await mkdtemp(path.join(os.tmpdir(), "prestige-booker-app-link-route-"));
try {
  const routeOutput = path.join(routeHarnessDir, "app/api/admin-customer-portal-access-links/route.js");
  await mkdir(path.dirname(routeOutput), { recursive: true });
  await mkdir(path.join(routeHarnessDir, "lib"), { recursive: true });
  await writeFile(routeOutput, transpile(adminRoute, adminRoutePath));
  await writeFile(
    path.join(routeHarnessDir, "lib/admin-customer-invoice-boundary.js"),
    "exports.resolveAdminCustomerInvoiceBoundary = () => ({ data: null, ok: true, actor: { actor_label: 'Owner Admin', actor_role: 'admin', source_surface: 'admin_api' } });",
  );
  await writeFile(
    path.join(routeHarnessDir, "lib/admin-bookers.js"),
    "exports.findAdminBooker = async (input) => { const state = globalThis.__prestigeBookerAppLinkRoute; state.calls.push('booker'); state.bookerInput = input; return { data: state.booker, ok: true }; };",
  );
  await writeFile(
    path.join(routeHarnessDir, "lib/customer-portal-access-account.js"),
    [
      "exports.ensureAdminCustomerPortalAccessAccount = async (input) => {",
      "  const state = globalThis.__prestigeBookerAppLinkRoute; state.calls.push('account'); state.accountInput = input;",
      "  return { data: { account_status: 'active', customer_account_reference: String(input.customerAccountReference) }, ok: true };",
      "};",
      "exports.revokeAdminCustomerPortalAccessAccount = async () => ({ data: { account_status: 'revoked', customer_account_reference: '194', version: 'v1' }, ok: true });",
    ].join("\n"),
  );
  await writeFile(
    path.join(routeHarnessDir, "lib/customer-principal-access.js"),
    [
      "exports.issueCustomerPrincipalInvitation = async (input) => {",
      "  const state = globalThis.__prestigeBookerAppLinkRoute; state.calls.push('invitation'); state.invitationInput = input;",
      "  return { data: { access_status: 'invitation_created', expires_at: '2026-08-29T14:00:00.000Z', invitation_url_path: '/customer-access/activate?invite=safe', principal_id: '11111111-1111-4111-8111-111111111111' }, ok: true };",
      "};",
      "exports.revokeCustomerPrincipalAccess = async () => ({ data: { principal_id: '11111111-1111-4111-8111-111111111111', revoked: true }, ok: true });",
    ].join("\n"),
  );

  const route = createRequire(import.meta.url)(routeOutput);
  const state = {
    booker: {
      booker_name: "Verified Booker",
      company_id: 53,
      customer_id: 194,
      email: "booker@example.test",
      id: 26,
      phone: null,
    },
    calls: [],
  };
  globalThis.__prestigeBookerAppLinkRoute = state;
  const response = await route.POST(new Request("http://localhost/api/admin-customer-portal-access-links", {
    body: JSON.stringify({
      bookerId: 26,
      companyId: 53,
      customerAccountReference: "194",
      email: "attacker@example.test",
      memberships: [{ travelerId: 999 }],
      principalRole: "boss",
      safeDisplayLabel: "Verified account",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  }));
  const responseBody = await response.json();
  assert.equal(response.status, 200);
  assert.equal(responseBody.accessAction, "Copy + App Link");
  assert.deepEqual(state.calls, ["booker", "account", "invitation"]);
  assert.deepEqual(state.bookerInput, { company_id: 53, id: 26 });
  assert.deepEqual(state.invitationInput, {
    email: "booker@example.test",
    memberships: [{
      bookerId: 26,
      companyId: 53,
      customerAccountReference: "194",
      travelerId: null,
      verifiedBossName: "Verified Booker",
    }],
    principalRole: "pa",
  });

  state.calls = [];
  state.booker = { ...state.booker, customer_id: 195 };
  const mismatchResponse = await route.POST(new Request("http://localhost/api/admin-customer-portal-access-links", {
    body: JSON.stringify({ bookerId: 26, companyId: 53, customerAccountReference: "194" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  }));
  assert.equal(mismatchResponse.status, 409);
  assert.deepEqual(
    state.calls,
    ["booker"],
    "A mismatched Customer/Company/Booker must stop before access-account or invitation writes.",
  );
} finally {
  delete globalThis.__prestigeBookerAppLinkRoute;
  await rm(routeHarnessDir, { force: true, recursive: true });
}

console.log("Customer portal access link guard passed");
