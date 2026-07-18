import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript =
  "scripts/test-customer-portal-saved-bookings-read-evidence-contract-guard.mjs";

const portalPagePath = "app/my-bookings/page.tsx";
const savedBookingsRoutePath = "app/api/customer-saved-bookings/route.ts";
const savedBookingsReadPath = "lib/customer-saved-bookings-read.ts";
const savedBookingsAdapterPath = "lib/customer-portal-saved-bookings-adapter.ts";
const sessionRoutePath = "app/api/customer-portal-sessions/route.ts";
const sessionIssuePath = "lib/customer-portal-session-issue.ts";
const customerNotificationRoutePath = "app/api/customer-app-notifications/route.ts";
const authMigrationPath = "supabase/migrations/202606080002_customer_driver_auth_foundation.sql";
const notificationMigrationPath =
  "supabase/migrations/202606080001_customer_driver_app_notification_outbox_foundation.sql";

const allowedSavedBookingRecordFields = [
  "booking_month",
  "booking_reference",
  "created_at",
  "customer_driver_details",
  "customer_facing_status",
  "dropoff_location",
  "passenger_name",
  "pickup_at",
  "pickup_location",
  "public_booking_reference",
  "service_type",
  "updated_at",
];

const forbiddenCustomerPortalFragments = [
  "admin_finance",
  "admin_internal_status",
  "admin_note",
  "billing",
  "contact_email",
  "contact_phone",
  "customer_price",
  "debug",
  "driver_note",
  "driver_payout",
  "driver_token",
  "fare_amount",
  "finance",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
  "invoice",
  "jwt",
  "live_location",
  "mock_archive",
  "mock_qa",
  "parser_debug",
  "parser_learning",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pdf",
  "proof",
  "quoted_price",
  "rate_amount",
  "raw_ai",
  "raw_token",
  "refresh_token",
  "secret",
  "server_secret",
  "service_role",
  "session_secret",
  "session_token",
  "sms",
  "telegram",
  "token_hash",
  "whatsapp",
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

function extractTypeKeys(source, typeName) {
  const match = source.match(new RegExp(`export\\s+type\\s+${typeName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  assert.ok(match, `Expected exported type ${typeName}.`);

  return [...match[1].matchAll(/^  ([A-Za-z][A-Za-z0-9_]*)\??:\s/gm)].map((item) => item[1]);
}

function extractSetItems(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(match, `Expected ${constName} set literal.`);

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

const [
  ledger,
  preactivationSuite,
  portalPage,
  savedBookingsRoute,
  savedBookingsRead,
  savedBookingsAdapter,
  sessionRoute,
  sessionIssue,
  customerNotificationRoute,
  authMigration,
  notificationMigration,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(portalPagePath, "utf8"),
  readFile(savedBookingsRoutePath, "utf8"),
  readFile(savedBookingsReadPath, "utf8"),
  readFile(savedBookingsAdapterPath, "utf8"),
  readFile(sessionRoutePath, "utf8"),
  readFile(sessionIssuePath, "utf8"),
  readFile(customerNotificationRoutePath, "utf8"),
  readFile(authMigrationPath, "utf8"),
  readFile(notificationMigrationPath, "utf8"),
]);

const evidenceSection = sectionBetween(
  ledger,
  "### Customer Portal Saved-Bookings Authenticated Read Evidence Contract Guard Lock",
);

for (const phrase of [
  "This is a docs/test-only guard for a future separately approved bounded Customer Portal saved-bookings authenticated read evidence pass using one staging-safe customer account/reference.",
  "This lock does not activate customer auth, customer portal live read, session creation, cookie creation, token creation, env changes, DB reads/writes, notification row writes, customer in-app runtime/buttons, provider sends, Google Maps/OneMap/FlightAware calls, deploy, or production activation.",
  "`/my-bookings` remains shell/guarded until approved evidence.",
  "`/api/customer-saved-bookings` remains gated and must not become a broad read.",
  "`/api/customer-portal-sessions` remains default-off and must not expose session values.",
  "`/api/customer-app-notifications` remains fail-closed/auth-required 403.",
  "Future evidence requires exactly one staging-safe customer account/reference and one bounded authenticated read window.",
  "Future table/RLS proof must cover `customer_access_accounts`, `customer_driver_access_audit_events` or equivalent, and the customer-safe booking projection.",
  "Future row isolation proof must show customer A only sees customer A saved-booking rows and cannot see another customer account's rows.",
  "Future boundary proof must show anonymous, missing-session, wrong-session/token, wrong-customer/account, cross-origin, and wrong-referer paths blocked.",
  "Future audit proof must use `customer_driver_access_audit_events` or equivalent without recording raw tokens, cookies, JWTs, secrets, finance, payout, parser/debug, provider payloads, or real customer data.",
  "Future rollback/disable proof must close customer saved-bookings/session gates and verify blocked/no-read behavior again.",
  "Customer-safe saved-booking fields remain limited to booking reference, customer-facing status, service type, pickup date/time, pickup location, drop-off location, passenger name, and safe created/updated/month grouping fields.",
  "Passenger count and customer-facing flight number require separate contract alignment before becoming customer portal read evidence fields.",
  "Customer portal saved-bookings evidence must exclude pricing, payout, PayNow, `customer_rates`, `driver_payout_rules`, billing/payment/PDF/invoice, internal/admin notes, parser/debug, secrets/tokens/cookies/JWTs, raw provider payloads, live-location/photo/OTS data, provider sends, Save Booking internals, and `/api/admin-saved-bookings` internals.",
  "Driver in-app evidence/runtime, Google Maps evidence/runtime, and OneMap retirement do not unlock customer portal read or customer in-app notification runtime.",
  "This guard adds `scripts/test-customer-portal-saved-bookings-read-evidence-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(evidenceSection, phrase, `customer portal saved-bookings evidence phrase: ${phrase}`);
}

for (const forbidden of [
  "customer portal read evidence is complete",
  "customer auth is active",
  "customer portal sessions are active by default",
  "customer in-app button is approved now",
  "customer saved-bookings broad read is approved",
  "driver in-app unlocks customer portal",
  "Google Maps unlocks customer portal",
  "OneMap unlocks customer portal",
]) {
  assertExcludes(evidenceSection, forbidden, "forbidden customer portal evidence claim");
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation customer portal saved-bookings read evidence guard registration",
);

for (const fragment of [
  "loadCustomerPortalSavedBookings",
  '"Sign in to view bookings."',
  "useState<CustomerPortalBooking[]>([])",
  'setPortalBookingsLoadState(loadedBookings === null ? "blocked" : "ready")',
]) {
  assertIncludes(portalPage, fragment, `/my-bookings guarded shell fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /\/api\/customer-portal-sessions/i,
  /x-prestige-customer-session-issue-token/i,
  /\bfetch\s*\(\s*["']\/api\/customer-portal-sessions/i,
  /document\.cookie/i,
]) {
  assertExcludes(portalPage, forbiddenPattern, "/my-bookings must not expose session issue plumbing");
}

for (const fragment of [
  "resolveCustomerSavedBookingsBoundary",
  "loadCustomerSavedBookings",
  "customerSavedBookingsAuthRequiredResult",
  "export async function GET(request: Request)",
  "export async function POST()",
  "export async function PUT()",
  "export async function PATCH()",
  "export async function DELETE()",
]) {
  assertIncludes(savedBookingsRoute, fragment, `customer saved-bookings route fragment ${fragment}`);
}

assertExcludes(
  savedBookingsRoute,
  /\.(?:insert|upsert|update|delete|rpc)\s*\(/,
  "customer saved-bookings route DB write/RPC surface",
);

for (const fragment of [
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID",
  'expectedPurpose = "customer-saved-bookings-read"',
  "purpose !== expectedPurpose",
  "return resolveCustomerSavedBookingsBoundaryForPurpose(request);",
  'refererUrl.pathname !== "/my-bookings"',
  '.from("customer_access_accounts")',
  ".select(customerAccountSelect)",
  '.eq("auth_user_id", context.auth_user_id)',
  '.eq("account_status", "active")',
  '.from("bookings")',
  ".select(selectedColumns)",
  "selectedColumns: customerSavedBookingsCurrentSelect",
  "selectedColumns: customerSavedBookingsFoundationSelect",
  "function customerAccountBookingFilter",
  'column: "customer_id"',
  'method: "eq"',
  "for (const filter of bookingFilters)",
  "bookingQuery = bookingQuery.eq(filter.column, filter.value)",
  "parsed.data.booking_reference && rawRows.length === 0",
  "Targeted booking lookups are isolation checks: a ref outside this account must hard-block.",
]) {
  assertIncludes(savedBookingsRead, fragment, `customer saved-bookings read fragment ${fragment}`);
}

for (const fragment of [
  'column: "customer_display_name"',
  'method: "ilike"',
  "bookingQuery.ilike(customerFilter.column, customerFilter.value)",
]) {
  assertExcludes(savedBookingsRead, fragment, `customer saved-bookings read must not use display-name portal isolation ${fragment}`);
}

assertSameList(
  extractTypeKeys(savedBookingsRead, "CustomerSavedBookingRecord"),
  allowedSavedBookingRecordFields,
  "customer saved-bookings record fields",
);
assertSameList(
  extractSetItems(savedBookingsAdapter, "allowedApiRecordFields"),
  allowedSavedBookingRecordFields,
  "customer saved-bookings adapter allowed API record fields",
);

for (const fragment of forbiddenCustomerPortalFragments) {
  assertIncludes(
    savedBookingsRead,
    `"${fragment}"`,
    `customer saved-bookings read forbidden fragment ${fragment}`,
  );
  assertIncludes(
    savedBookingsAdapter,
    `"${fragment}"`,
    `customer saved-bookings adapter forbidden fragment ${fragment}`,
  );
}

for (const forbiddenPattern of [
  /passenger_count|flight_number/i,
  /customer_price|quoted_price|fare_amount|driver_payout|paynow|payout/i,
  /billing|invoice|payment|pdf/i,
  /internal_admin_note|internal_note|parser_debug|raw_ai/i,
  /driver_token|token_hash|raw_token|session_secret/i,
]) {
  assertExcludes(
    savedBookingsRead.replace(/forbiddenCustomerSavedBookingsFragments = \[[\s\S]*?\];/, ""),
    forbiddenPattern,
    "customer saved-bookings selected/output field scope",
  );
}

for (const fragment of [
  'export const customerPortalSavedBookingsApiPath = "/api/customer-saved-bookings";',
  'cache: "no-store"',
  'credentials: "same-origin"',
  '"x-prestige-customer-purpose": "customer-saved-bookings-read"',
]) {
  assertIncludes(savedBookingsAdapter, fragment, `customer saved-bookings adapter fragment ${fragment}`);
}

assertExcludes(
  savedBookingsAdapter,
  /x-prestige-customer-session-token|Authorization|Cookie/i,
  "customer portal adapter manual auth/session headers",
);

for (const fragment of [
  "resolveCustomerPortalSessionIssue",
  '"Cache-Control": "no-store"',
  '"Set-Cookie": result.data.cookie',
  "export async function POST(request: Request)",
  "export async function GET()",
  "export async function PUT()",
  "export async function PATCH()",
  "export async function DELETE()",
]) {
  assertIncludes(sessionRoute, fragment, `customer portal session route fragment ${fragment}`);
}

for (const fragment of [
  "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED",
  "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE",
  "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID",
  "HttpOnly",
  "Secure",
  "SameSite=Lax",
  "Priority=High",
]) {
  assertIncludes(sessionIssue, fragment, `customer portal session issue fragment ${fragment}`);
}

assertExcludes(
  sessionIssue,
  /@supabase\/supabase-js|createClient|\.from\(|\.(?:insert|upsert|update|delete|rpc)\s*\(/,
  "customer portal session issue DB surface",
);

for (const fragment of [
  "customerAppNotificationsRequireAuthResult",
  "readCustomerAppNotificationsForStagingEvidence",
  "safeCustomerAuthRequiredResponse",
  "export async function GET(request: Request)",
  "export async function PATCH()",
]) {
  assertIncludes(customerNotificationRoute, fragment, `customer app notifications fail-closed fragment ${fragment}`);
}

for (const fragment of [
  "process.env",
  "createClient",
  ".from(",
  "request.json",
  "cookies(",
  "Set-Cookie",
  "createCustomerDriverAppNotification",
  "updateCustomerDriverAppNotificationStatus",
]) {
  assertExcludes(customerNotificationRoute, fragment, "customer app notifications runtime/read/write/session surface");
}

for (const fragment of [
  "create table if not exists public.customer_access_accounts",
  "create table if not exists public.customer_driver_access_audit_events",
  "alter table public.customer_access_accounts enable row level security",
  "alter table public.customer_driver_access_audit_events enable row level security",
  "RLS is intentionally enabled without public, anonymous, broad authenticated",
]) {
  assertIncludes(authMigration, fragment, `customer auth/RLS foundation fragment ${fragment}`);
}

for (const fragment of [
  "create table if not exists public.customer_driver_app_notification_outbox",
  "alter table public.customer_driver_app_notification_outbox enable row level security",
  "Customer access must wait for customer auth.",
]) {
  assertIncludes(notificationMigration, fragment, `customer app notification RLS foundation fragment ${fragment}`);
}

const routeAndHelperSources = [
  savedBookingsRoute,
  savedBookingsRead,
  savedBookingsAdapter,
  sessionRoute,
  sessionIssue,
  customerNotificationRoute,
].join("\n");

for (const forbiddenPattern of [
  /from\s+["'](?:resend|nodemailer|@sendgrid\/mail|mailgun\.js|twilio)["']/i,
  /new\s+Resend|sendMail\s*\(|messages\.send|client\.messages\.create/i,
  /api\.telegram\.org|sendLocation|sendMessage|TELEGRAM_BOT_TOKEN/i,
  /maps\.googleapis\.com|routes\.googleapis\.com|places\.googleapis\.com/i,
  /www\.onemap\.gov\.sg|ONEMAP_TOKEN|FlightAware|AeroAPI|AEROAPI/i,
]) {
  assertExcludes(
    routeAndHelperSources,
    forbiddenPattern,
    "customer portal saved-bookings evidence provider/map/flight surface",
  );
}

console.log("Customer Portal saved-bookings authenticated read evidence contract guard passed");
