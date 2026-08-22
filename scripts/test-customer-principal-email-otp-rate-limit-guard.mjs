import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const migrationName = readdirSync(join(root, "supabase/migrations"))
  .filter((name) => name.endsWith("_customer_principal_email_otp_ip_limit.sql"))
  .sort()
  .at(-1);

assert.ok(
  migrationName,
  "customer principal email OTP IP limiter migration must be created by Supabase CLI",
);

const migration = read(`supabase/migrations/${migrationName}`);
const access = read("lib/customer-principal-access.ts");
const route = read("app/api/customer-principal-access/route.ts");
const ledger = read("docs/current-implementation-ledger.md");
const preactivation = read("scripts/test-preactivation-verification-suite.mjs");

for (const pattern of [
  /alter table public\.customer_access_email_challenges[\s\S]*?add column(?: if not exists)? request_ip_hash text/,
  /request_ip_hash ~ '\^\[0-9a-f\]\{64\}\$'/,
  /alter column request_ip_hash set not null/,
  /customer_access_email_challenges_request_ip_created_idx[\s\S]*?\(request_ip_hash, created_at desc\)/,
  /create or replace function public\.reserve_customer_principal_email_challenge\(/,
  /security invoker/,
  /set search_path = ''/,
  /pg_advisory_xact_lock/,
  /challenge\.principal_id = p_principal_id[\s\S]*?challenge\.challenge_purpose = p_challenge_purpose[\s\S]*?challenge\.created_at >= v_now - interval '15 minutes'[\s\S]*?challenge\.used_at is null/,
  /v_principal_purpose_count >= 5/,
  /challenge\.request_ip_hash = p_request_ip_hash[\s\S]*?challenge\.created_at >= v_now - interval '15 minutes'/,
  /v_ip_count >= 20/,
  /v_now \+ interval '10 minutes'/,
  /revoke all on function public\.reserve_customer_principal_email_challenge[\s\S]*?from public, anon, authenticated/,
  /grant execute on function public\.reserve_customer_principal_email_challenge[\s\S]*?to service_role/,
]) {
  assert.match(migration, pattern);
}

assert.doesNotMatch(
  migration,
  /\brequest_ip\b(?!_hash)/,
  "raw request IP must never be persisted",
);

assert.match(access, /createHmac/);
assert.match(access, /isIP/);
assert.match(access, /customer-principal-email-ip-v1:/);
assert.match(access, /PRESTIGE_CUSTOMER_PRINCIPAL_EMAIL_OTP_ENABLED\s*!==\s*"true"/);
assert.match(access, /reserve_customer_principal_email_challenge/);
assert.match(access, /requestIp/);
assert.match(access, /Too many verification requests\. Try again in 15 minutes\./);
assert.match(access, /emailChallengeLifetimeSeconds\s*=\s*10\s*\*\s*60/);
assert.match(access, /maxPinFailuresPerDeviceWindow\s*=\s*5/);
assert.doesNotMatch(access, /console\.(?:log|info|warn|error)\([^\n]*requestIp/);

const configCheck = access.indexOf("const emailConfig = emailChallengeConfig()");
const reservation = access.indexOf(
  "const reservation = await reserveCustomerPrincipalEmailChallenge",
);
assert.ok(configCheck >= 0, "email configuration must be checked explicitly");
assert.ok(
  reservation > configCheck,
  "email gate/config must be validated before the challenge reservation",
);

assert.match(
  route,
  /action === "start_activation" \|\| action === "start_new_device" \|\| action === "start_recovery"[\s\S]*?requestIp: sourceIpKey\(request\)/,
);
assert.doesNotMatch(route, /sourceIpKey\(request\)[\s\S]*?"unavailable"/);

assert.match(
  preactivation,
  /scripts\/test-customer-principal-email-otp-rate-limit-guard\.mjs/,
);
assert.match(
  ledger,
  /Customer Principal Email OTP Atomic IP Rate Limit/,
);

console.log("Customer principal email OTP IP rate-limit guard passed.");
