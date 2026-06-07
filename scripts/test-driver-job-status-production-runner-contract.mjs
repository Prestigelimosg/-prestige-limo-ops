import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const runnerPath = path.join(
  process.cwd(),
  "scripts/run-driver-job-status-production-save-load-verification.mjs",
);
const runner = await readFile(runnerPath, "utf8");

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertMatches(text, pattern, message = `Missing required pattern: ${pattern}`) {
  assert.match(text, pattern, message);
}

function assertNotMatches(text, pattern, message = `Forbidden pattern present: ${pattern}`) {
  assert.doesNotMatch(text, pattern, message);
}

for (const requiredText of [
  "PRESTIGE_DRIVER_JOB_STATUS_PRODUCTION_SAVE_LOAD_APPROVED",
  "stage-driver-job-status-william-approved",
  "PROD-DRIVER-STATUS-VERIFY-20260607-SAFE-001",
  "driver_job_links",
  "driver_job_status_events",
  "hashDriverJobLinkToken(fakeRawToken)",
  "PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED",
  "DRIVER_JOB_LINK_MODE",
  "forceDriverJobPersistenceOff",
  "enableDriverJobVerificationProcessOnly",
  "one direct server-only fake driver_job_links insert",
  "one production-mode PATCH save through /api/driver-job/[token]/status",
  "one exact cleanup delete scoped to the fake driver_job_status_events row",
  "one exact cleanup delete scoped to the fake driver_job_links row",
  "rawTokenPrinted: false",
  "tokenHashPrinted: false",
  "noSecretsPrinted: true",
  "noSupabaseCli: true",
  "noRawSql: true",
  "noRealBookingsCustomersTouched: true",
]) {
  assertIncludes(runner, requiredText);
}

assertMatches(
  runner,
  /if \(process\.env\[approvalEnvName\] !== approvalValue\) \{/,
  "Runner must stop unless the exact William approval env value is present.",
);
assertMatches(
  runner,
  /\.from\("driver_job_links"\)\s*\.insert\(/,
  "Runner must insert the fake driver job link through Supabase JS only.",
);
assertMatches(
  runner,
  /\.from\("driver_job_status_events"\)\s*\.delete\(\)\s*\.eq\("booking_reference", fakeBookingReference\)\s*\.eq\("driver_job_link_id", linkId\)/s,
  "Runner must clean up only the exact fake driver status event.",
);
assertMatches(
  runner,
  /\.from\("driver_job_links"\)\s*\.delete\(\)\s*\.eq\("id", linkId\)\s*\.eq\("booking_reference", fakeBookingReference\)/s,
  "Runner must clean up only the exact fake driver job link.",
);
assertMatches(
  runner,
  /process\.env\.DRIVER_JOB_LINK_MODE = "mock";\s*process\.env\.PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED = "false";/s,
  "Runner must force driver job production persistence off after verification.",
);

for (const forbiddenText of [
  "supabase db",
  "db push",
  "db reset",
  "create policy",
  "alter policy",
  "raw SQL",
  "invoice_number",
  "payment_link",
  "driver_payout_amount",
  "paynow_payout",
  "telegram_send",
  "live_location_session",
]) {
  assertNotMatches(runner, new RegExp(forbiddenText, "i"));
}

console.log("Driver job status production runner contract tests passed.");
