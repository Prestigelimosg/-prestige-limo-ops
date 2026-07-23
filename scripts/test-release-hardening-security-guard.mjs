import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath =
  "supabase/migrations/20260723022145_harden_dsp_summary_and_monthly_invoice_rpc.sql";
const migration = await readFile(migrationPath, "utf8");
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const packageLock = JSON.parse(await readFile("package-lock.json", "utf8"));
const navigationGuard = await readFile(
  "scripts/test-public-client-navigation-boundary-guard.mjs",
  "utf8",
);
const driverActionSurfaceGuard = await readFile(
  "scripts/test-public-driver-job-action-surface-guard.mjs",
  "utf8",
);

function assertIncludes(source, expected, label) {
  assert.equal(source.includes(expected), true, `${label} missing: ${expected}`);
}

for (const [fragment, label] of [
  [
    "alter view public.driver_job_dsp_actual_time_summaries\n  set (security_invoker = true);",
    "DSP summary invoker boundary",
  ],
  [
    "revoke all privileges on table public.driver_job_dsp_actual_time_summaries\n  from public, anon, authenticated;",
    "DSP summary public-role revocation",
  ],
  [
    "grant select on table public.driver_job_dsp_actual_time_summaries\n  to service_role;",
    "DSP summary server-only grant",
  ],
  [
    ") from public, anon, authenticated;",
    "invoice RPC public-role revocation",
  ],
  [") to service_role;", "invoice RPC server-only grant"],
]) {
  assertIncludes(migration, fragment, label);
}

assert.equal(
  (migration.match(/public\.reserve_monthly_invoice_number_for_issue_record\(/g) ?? []).length,
  2,
  "The hardening migration must revoke and grant the exact existing invoice RPC once each.",
);

for (const forbidden of [
  /\bcreate\s+(?:or\s+replace\s+)?view\b/i,
  /\bcreate\s+(?:or\s+replace\s+)?function\b/i,
  /\bdrop\s+(?:view|function|table)\b/i,
  /\b(?:insert|update|delete|truncate)\s+(?:into|from|table)?\b/i,
  /customer_price|driver_payout|paynow|payment_link|invoice_layout|pdf_renderer/i,
]) {
  assert.doesNotMatch(migration, forbidden, `Hardening migration broadened scope: ${forbidden}`);
}

assert.equal(packageJson.dependencies.next, "16.2.11", "Next.js must use the reviewed patch version.");
assert.equal(
  packageJson.devDependencies["eslint-config-next"],
  "16.2.11",
  "eslint-config-next must stay aligned with Next.js.",
);
assert.equal(
  packageLock.packages["node_modules/next"].version,
  "16.2.11",
  "The lockfile must pin the reviewed Next.js patch.",
);
assert.deepEqual(
  packageJson.overrides.next,
  { postcss: "8.5.22", sharp: "0.35.3" },
  "Next.js must resolve the reviewed patched PostCSS and Sharp versions.",
);
assert.equal(
  packageLock.packages["node_modules/next/node_modules/postcss"]?.version ??
    packageLock.packages["node_modules/postcss"].version,
  "8.5.22",
  "The lockfile must resolve patched PostCSS for Next.js.",
);
assert.equal(
  packageLock.packages["node_modules/sharp"].version,
  "0.35.3",
  "The lockfile must resolve patched Sharp for Next.js.",
);

assertIncludes(
  navigationGuard,
  '["/driver-portal", "/google-calendar", "/privacy", "/terms"]',
  "existing Driver Portal navigation allowlist",
);
assertIncludes(
  navigationGuard,
  'countOccurrences(driverJobPage, "<Link"), 4',
  "existing Driver Portal navigation link count",
);
for (const fragment of [
  '"/google-calendar",\n  "/privacy",\n  "/terms",\n  "/driver-portal",',
  'countOccurrences(driverPage, "<Link"), 4',
  'formData.append("photo", preparedPhoto.blob, preparedPhoto.fileName);',
]) {
  assertIncludes(
    driverActionSurfaceGuard,
    fragment,
    "existing Driver Portal action-surface contract",
  );
}

console.log("Release hardening security guard passed.");
