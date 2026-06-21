import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const publicAuthSurfaceGuardPath = "scripts/test-public-customer-driver-auth-surface-guard.mjs";
const authNoLiveGuardPath = "scripts/test-customer-driver-auth-no-live-guard.mjs";
const guardScript = "scripts/test-customer-driver-auth-evidence-contract-guard.mjs";

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

function sectionBetween(source, startHeading, endHeading) {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const end = source.indexOf(endHeading, start + startHeading.length);

  return end === -1 ? source.slice(start) : source.slice(start, end);
}

const [ledger, preactivationSuite, publicAuthSurfaceGuard, authNoLiveGuard] =
  await Promise.all([
    readFile(ledgerPath, "utf8"),
    readFile(preactivationSuitePath, "utf8"),
    readFile(publicAuthSurfaceGuardPath, "utf8"),
    readFile(authNoLiveGuardPath, "utf8"),
  ]);

const evidenceSection = sectionBetween(
  ledger,
  "### Customer/Driver Auth Activation Evidence Contract Guard Lock",
  "\n## Billing/Payment Pre-Activation Completion Audit Lock",
);

for (const phrase of [
  "This is a docs/test-only guard for a future separately approved Customer/Driver Auth activation evidence pass.",
  "This lock does not activate customer auth, driver auth, Supabase Auth, customer portal access, driver portal access, live sessions, session creation, cookie creation, token creation, password reset, magic-link, OTP, env changes, DB read/write, RLS/policy changes, deployment, provider sends, parser behavior, Save Booking, `/api/admin-saved-bookings`, UI expansion, shims, or production activation.",
  "Future auth evidence requires explicit owner approval for customer auth activation.",
  "Future auth evidence requires explicit owner approval for driver auth activation.",
  "Future auth evidence requires explicit owner approval for the auth provider.",
  "Future auth evidence requires explicit owner approval for live sessions.",
  "Future auth evidence requires explicit owner approval for access policies.",
  "Future Supabase Auth provider/config proof must use names only and must not print passwords, cookies, session tokens, API keys, env values, database URLs, JWT secrets, OAuth secrets, service-role keys, or credentials.",
  "Future customer access proof must include table/RLS policy proof for customer row isolation on `customer_access_accounts` and any customer-safe booking projection used by the portal.",
  "Future driver access proof must include table/RLS policy proof for driver row isolation on `driver_access_accounts` and any driver-safe job projection used by the driver portal.",
  "Future audit proof must account for `customer_driver_access_audit_events` without exposing raw tokens, cookies, secrets, provider payloads, finance, payout, parser/debug, or mock archive fields.",
  "Future session/cookie issuance proof must show HttpOnly Secure SameSite cookie behavior or equivalent server-session protection, and response bodies/logs must not expose token values, cookie values, raw JWTs, magic links, OTPs, password reset links, or session secrets.",
  "Customer-safe projection proof must block payout, PayNow payout, `driver_payout_rules`, internal/admin notes, parser/debug fields, finance, mock archive, secrets/tokens, raw provider payloads, Save Booking internals, and `/api/admin-saved-bookings` internals.",
  "Driver-safe projection proof must block customer price, `customer_rates`, billing, invoice/payment, payout comparisons, finance/admin notes, parser/debug fields, mock archive, secrets/tokens, raw provider payloads, Save Booking internals, and `/api/admin-saved-bookings` internals.",
  "Future rollback/disable proof must close the auth/session/access gates, verify setup-only/blocked/no-op behavior again, and preserve fail-closed public customer and driver surfaces.",
  "Customer/Driver Auth activation evidence must remain separate from live location, OTS photo/storage, calendar, payment/PDF/billing, pricing/rates/customer_rates, `driver_payout_rules`, payout execution, provider sends, Email/Telegram/WhatsApp/SMS sending, parser, Save Booking, `/api/admin-saved-bookings`, UI sector/card/button expansion, shims, and production activation.",
  "Existing auth setup surfaces remain GET-only, admin/dispatcher gated, blocked/no-op, token-free, cookie-free, and not live until a separate owner-approved activation evidence pass.",
  "This guard adds `scripts/test-customer-driver-auth-evidence-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(evidenceSection, phrase, `Customer/Driver Auth evidence phrase: ${phrase}`);
}

for (const forbidden of [
  "auth activation is approved now",
  "customer auth is live",
  "driver auth is live",
  "sessions may be created now",
  "cookies may be created now",
  "tokens may be issued now",
  "RLS policies may be changed now",
  "DB writes are approved now",
  "provider sends are approved now",
  "live location may be mixed with auth",
  "OTS photo may be mixed with auth",
  "payment may be mixed with auth",
  "Save Booking may be changed for auth",
  "/api/admin-saved-bookings may be changed for auth",
  "new UI sector is approved",
  "new shim is approved",
]) {
  assertExcludes(evidenceSection, forbidden, "forbidden Customer/Driver Auth evidence approval phrase");
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation Customer/Driver Auth evidence guard registration",
);
assertIncludes(
  publicAuthSurfaceGuard,
  "live customer/driver auth, session creation, token issuance",
  "public auth surface guard must keep live auth blocked",
);
assertIncludes(
  authNoLiveGuard,
  "customer/driver auth no-live guard passed",
  "auth no-live guard must remain present",
);

console.log("Customer/Driver Auth activation evidence contract guard passed");
