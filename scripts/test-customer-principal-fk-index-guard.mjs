import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const ledger = read("docs/current-implementation-ledger.md");
const preactivation = read("scripts/test-preactivation-verification-suite.mjs");

const migrationName = readdirSync(join(root, "supabase/migrations"))
  .filter((name) => name.endsWith("_customer_principal_fk_indexes.sql"))
  .sort()
  .at(-1);

assert.ok(migrationName, "Customer principal FK index migration must be created by Supabase CLI.");

const migration = read(`supabase/migrations/${migrationName}`);
const executableStatements = migration
  .replace(/^\s*--.*$/gm, "")
  .split(";")
  .map((statement) => statement.replace(/\s+/g, " ").trim())
  .filter(Boolean);

assert.deepEqual(executableStatements, [
  "create index if not exists customer_access_devices_principal_status_idx on public.customer_access_devices (principal_id, device_status)",
  "create index if not exists customer_access_email_challenges_principal_purpose_created_idx on public.customer_access_email_challenges (principal_id, challenge_purpose, created_at desc)",
  "create index if not exists customer_device_push_subscriptions_device_principal_idx on public.customer_device_push_subscriptions (device_id, principal_id)",
]);

assert.doesNotMatch(
  executableStatements.join(";"),
  /\b(?:alter|create\s+table|drop|grant|revoke|policy|insert|update|delete|truncate)\b/i,
);
assert.match(
  preactivation,
  /scripts\/test-customer-principal-fk-index-guard\.mjs/,
);
assert.match(
  ledger,
  /Customer Principal Production Schema And Workload Index Protection/,
);
assert.match(ledger, /eleven new unindexed-foreign-key informational notices/i);
assert.match(ledger, /three workload-driven indexes/i);

const access = read("lib/customer-principal-access.ts");
const push = read("lib/customer-device-push-notification.ts");

assert.match(
  access,
  /\.from\(challengeTable\)[\s\S]*?\.eq\("principal_id", principalId\)[\s\S]*?\.eq\("challenge_purpose", purpose\)[\s\S]*?\.gte\("created_at", challengeWindowStartedAt\)/,
);
assert.match(
  access,
  /customer_device_push_subscriptions"\)\.update[\s\S]*?\.eq\("device_id", session\.device_id\)\.eq\("principal_id", session\.principal_id\)/,
);
assert.match(
  push,
  /\.from\("customer_access_devices"\)[\s\S]*?\.in\("principal_id", activePrincipalIds\)\.eq\("device_status", "active"\)/,
);

console.log("Customer principal workload FK index guard passed.");
