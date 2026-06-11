import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const files = {
  adapter: "lib/customer-portal-saved-bookings-adapter.ts",
  audit: "docs/customer-portal-real-booking-data-path-audit.md",
  docsIndex: "docs/test-and-safety-docs-index.md",
  page: "app/my-bookings/page.tsx",
  readBoundary: "lib/customer-saved-bookings-read.ts",
  route: "app/api/customer-saved-bookings/route.ts",
};

const requiredEnvNames = [
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
];

const requiredCookieNames = [
  "prestige_customer_saved_bookings_session",
  "prestige_customer_session",
];

const unsafeCustomerLeakPattern =
  /admin_internal_status|admin_status|billing|contact_phone|contact_email|passenger_phone|customer_price|quoted_price|rate_amount|driver_payout|paynow|pay_now|invoice|payment|pdf|payout|finance|parser_debug|parser_learning|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|internal_finance_note|internal_note|admin_note|server_secret|raw_token|token_hash|driver_token/i;
const secretValuePattern =
  /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}/i;

function assertIncludes(text, expected, label) {
  assert.ok(text.includes(expected), `${label}: missing ${expected}`);
}

function assertNotIncludes(text, forbidden, label) {
  assert.ok(!text.includes(forbidden), `${label}: forbidden ${forbidden}`);
}

function assertMatches(text, pattern, label) {
  assert.match(text, pattern, `${label}: missing ${pattern}`);
}

function assertNotMatches(text, pattern, label) {
  assert.doesNotMatch(text, pattern, `${label}: forbidden ${pattern}`);
}

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, relativePath]) => [
      key,
      await readFile(path.join(process.cwd(), relativePath), "utf8"),
    ]),
  ),
);

const clientSource = `${source.adapter}\n${source.page}`;
const serverSource = `${source.readBoundary}\n${source.route}`;

assertIncludes(source.adapter, 'credentials: "same-origin"', "portal adapter fetch");
assertIncludes(
  source.adapter,
  '"x-prestige-customer-purpose": "customer-saved-bookings-read"',
  "portal adapter fetch",
);
assertNotMatches(
  source.adapter.match(/headers:\s*{[\s\S]*?}/)?.[0] || "",
  /x-prestige-customer-session-token|authorization|cookie/i,
  "portal adapter request headers",
);
assertNotMatches(
  clientSource,
  /PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN|PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME|x-prestige-customer-session-token/i,
  "customer portal client source",
);
assertNotIncludes(
  clientSource,
  "from \"../../lib/customer-saved-bookings-read\"",
  "customer portal client source",
);

for (const envName of requiredEnvNames) {
  assertIncludes(source.audit, envName, "customer portal audit doc");
}

for (const cookieName of requiredCookieNames) {
  assertIncludes(source.readBoundary, cookieName, "customer saved bookings boundary");
  assertIncludes(source.audit, cookieName, "customer portal audit doc");
}

for (const requiredText of [
  "configured cookie name is exclusive",
  "Unsafe, duplicate, ambiguous, wrong, missing, or placeholder values fail closed",
  "The browser must not manually attach `Cookie`, `Authorization`, or `x-prestige-customer-session-token` headers.",
  "The UI fail-closes to an empty/sign-in-required booking list when the guarded read is blocked.",
  "No Supabase CLI command, migration, live DB write, invoice/PDF/payment/payout, or notification send is included.",
  "node scripts/test-customer-saved-bookings-auth-handoff-readiness.mjs",
]) {
  assertIncludes(source.audit, requiredText, "customer portal audit doc");
}

assertIncludes(
  source.docsIndex,
  "customer-portal-real-booking-data-path-audit.md",
  "test and safety docs index",
);
assertIncludes(source.readBoundary, "readCustomerSavedBookingsSessionToken", "server boundary");
assertIncludes(source.readBoundary, "request-cookie", "server boundary");
assertIncludes(source.readBoundary, 'mode !== "server-session-token"', "server boundary");
assertIncludes(source.readBoundary, 'providedToken.source === "request-cookie"', "server boundary");
assertIncludes(source.readBoundary, 'refererUrl.pathname !== "/my-bookings"', "server boundary");
assertIncludes(source.readBoundary, 'purpose !== "customer-saved-bookings-read"', "server boundary");
assertMatches(
  source.readBoundary,
  /configuredValue\s*&&\s*!configuredName[\s\S]*?return \[\]/,
  "unsafe configured cookie name fail-closed guard",
);
assertMatches(
  source.readBoundary,
  /cookieValues\.length > 1[\s\S]*?source: "ambiguous-cookie"/,
  "ambiguous cookie fail-closed guard",
);
assertNotMatches(
  source.route,
  /\.(?:insert|upsert|delete|update|rpc)\s*\(/,
  "customer saved bookings route",
);
assertNotMatches(
  serverSource.match(/customerSavedBookingsSelect\s*=\s*([^;]+)/)?.[1] || "",
  unsafeCustomerLeakPattern,
  "customer saved bookings selected columns",
);
assertNotMatches(source.audit, secretValuePattern, "customer portal audit doc");

console.log("Customer saved bookings auth handoff readiness passed.");
