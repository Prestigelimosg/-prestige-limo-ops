import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const runnerPath = "scripts/run-vercel-env-name-drift-audit.mjs";
const guardPath = "scripts/test-vercel-env-drift-audit-guard.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, pattern, label) {
  const matched = pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern);
  assert.equal(matched, false, `${label} must not include ${pattern}.`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const [ledger, preactivationSuite, runner] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(runnerPath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Vercel Env Drift Names-Only Audit Guard Lock",
);

for (const phrase of [
  "This adds a no-value Vercel env drift audit guard for env-sensitive runtime lanes.",
  "The optional audit runner is `scripts/run-vercel-env-name-drift-audit.mjs`.",
  "The preactivation suite runs `scripts/test-vercel-env-drift-audit-guard.mjs`; it does not call Vercel.",
  "The optional runner checks Vercel project env names only and must not pull, print, compare, or store env values.",
  "The optional runner is read-only and must not add, remove, edit, sync, or deploy Vercel env.",
  "The optional runner must never use `vercel env pull`, `vercel env add`, `vercel env rm`, `vercel deploy`, `vercel --prod`, or deployment-time overrides.",
  "The required names-only set covers Supabase, admin dispatcher auth, booking persistence, typed Load Bookings, Driver Live Location stable gates, Google Maps admin map gates, and Driver Details Email/Resend gates.",
  "The audit output is normalized to counts and missing env names only; it must not print Supabase URLs, service-role keys, Resend keys, Google keys, admin session tokens, env values, cookies, DB URLs, row IDs, booking references, or private customer/driver data.",
  "A missing env name is only a configuration drift signal; the audit does not approve opening gates, DB writes, provider sends, GPS activation, production activation, billing/payment/PDF/payout, or deploys.",
  "This guard adds `scripts/test-vercel-env-drift-audit-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
  "Vercel Sensitive environment values are non-readable after creation. `vercel env pull` cannot be used to clone a Sensitive Production value into Preview; adding a pulled hidden value creates an invalid placeholder configuration and the established admin boundary must continue failing closed.",
  "The corrected bounded Preview procedure preserves each original encrypted value and changes only its Vercel target metadata without supplying a replacement value. A fresh SSO-protected deployment is required, and every temporary Preview target must be restored to Production-only after read-only evidence.",
  "Exact protected Preview build `c1912006` then loaded 9 saved bookings and showed 7 active bookings through the existing `/api/admin-saved-bookings` GET with zero browser errors. No Save, Open/Edit, Complete, Cancel, Copy + App Link, email, message, calendar action, live-record write, or Supabase mutation was performed.",
  "The temporary Supabase/admin-dispatcher Preview targets were restored to Production-only after evidence. Production values were never read, printed, replaced, decrypted, committed, or sent to the browser; the restored credential-free Preview must fail closed again.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger Vercel env drift phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardPath, "preactivation Vercel drift guard registration");

for (const envName of [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN",
  "PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL",
  "PRESTIGE_LOAD_BOOKINGS_TYPED_READ_ENABLED",
  "PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED",
  "PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED",
  "PRESTIGE_DRIVER_LIVE_LOCATION_MODE",
  "PRESTIGE_GOOGLE_MAPS_API_KEY",
  "PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED",
  "PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER",
  "PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED",
  "PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER",
  "RESEND_API_KEY",
  "PRESTIGE_EMAIL_PROVIDER",
  "PRESTIGE_DRIVER_DETAILS_EMAIL_FROM",
  "PRESTIGE_DRIVER_DETAILS_EMAIL_REPLY_TO",
  "PRESTIGE_DRIVER_DETAILS_EMAIL_STAGING_RECIPIENT_ALLOWLIST",
  "PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED",
]) {
  assertIncludes(runner, `"${envName}"`, `runner names-only env list ${envName}`);
}

for (const fragment of [
  'spawnSync("npx", ["--yes", "vercel", "env", "ls", environment]',
  'values_read: false',
  'values_printed: false',
  'env_mutated: false',
  'deploy_triggered: false',
  '"missing_required_env_names"',
  "missing",
  "required_count",
  "found_required_count",
]) {
  assertIncludes(runner, fragment, `runner safe audit fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /vercel"\s*,\s*"env"\s*,\s*"(?:pull|add|rm|remove|edit)"/i,
  /vercel"\s*,\s*"(?:deploy|--prod|--force)"/i,
  /\bVERCEL_TOKEN\b/,
  /console\.(?:log|error)\s*\(\s*result\.(?:stdout|stderr)/,
  /readFile|writeFile|appendFile|createWriteStream|createReadStream/,
  /fetch\s*\(/,
  /SUPABASE_SERVICE_ROLE_KEY\s*:\s*process\.env/,
  /PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN\s*:\s*process\.env/,
  /RESEND_API_KEY\s*:\s*process\.env/,
  /PRESTIGE_GOOGLE_MAPS_API_KEY\s*:\s*process\.env/,
]) {
  assertExcludes(runner, forbiddenPattern, "runner forbidden Vercel/env behavior");
}

console.log("Vercel env drift names-only audit guard passed");
