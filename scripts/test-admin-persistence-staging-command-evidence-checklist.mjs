import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const checklistPath = path.join(
  process.cwd(),
  "docs/admin-persistence-staging-command-and-evidence-checklist.md",
);
const indexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertMatches(text, pattern, message = `Missing required pattern: ${pattern}`) {
  assert.match(text, pattern, message);
}

const checklist = await readFile(checklistPath, "utf8");
const docsIndex = await readFile(indexPath, "utf8");

const approvalBoundary = [
  "This checklist is not approval to run the proposed staging command group.",
  "This checklist is not approval to run Supabase commands.",
  "This checklist is not approval to perform live database writes.",
  "This checklist is not approval to create migrations.",
  "William must explicitly approve each exact command line in the proposed future command group before any command is run.",
  "No Supabase command may be run from Stage 4A-387.",
  "No migration may be created from Stage 4A-387.",
  "No live DB write may be performed from Stage 4A-387.",
  "The first live staging verification, if William approves it later, must be limited to one controlled admin booking/customer save-load test.",
];

for (const statement of approvalBoundary) {
  assertIncludes(checklist, statement);
}

const proposedCommands = [
  "## B. Exact Proposed Future Command Group",
  "stage-4a-388-one-controlled-admin-booking-customer-save-load",
  "No Supabase CLI command is proposed for the first controlled live staging verification.",
  "`supabase db reset` must never be used.",
  "STAGE4A388_STAGING_BASE_URL",
  "STAGE4A388_ADMIN_SESSION_TOKEN",
  "STAGE4A388_BOOKING_REFERENCE",
  "STAGE4A388_SAFE_PAYLOAD",
  "curl --fail-with-body --show-error --silent",
  "--request POST \"${STAGE4A388_STAGING_BASE_URL}/api/admin-bookings\"",
  "--request GET \"${STAGE4A388_STAGING_BASE_URL}/api/admin-bookings\"",
  "--header \"x-prestige-admin-purpose: admin-booking-persistence\"",
  "--header \"x-prestige-admin-session-token: ${STAGE4A388_ADMIN_SESSION_TOKEN}\"",
  "stage-4a-388-controlled-save-redacted.json",
  "stage-4a-388-controlled-load-redacted.json",
  "stage-4a-388-rollback-off-redacted.json",
];

for (const commandText of proposedCommands) {
  assertIncludes(checklist, commandText);
}

const envConfigChecks = [
  "Confirm `STAGE4A388_STAGING_BASE_URL` points only at the approved staging admin host.",
  "Confirm no production host, production project, production database, or unknown target is present.",
  "Confirm `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` defaults OFF.",
  "Confirm `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED=true` is used only for the one William-approved controlled staging save window.",
  "Confirm the kill-switch is turning `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` OFF.",
  "Confirm `PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE=server-session-token`.",
  "Confirm `PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE` is `admin` or `dispatcher`.",
  "Confirm `PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN` is a staging-only server-session token and is redacted from evidence.",
  "Confirm `SUPABASE_URL` is the approved staging server database URL.",
  "Confirm `SUPABASE_SERVICE_ROLE_KEY` is the approved staging server-only credential.",
  "Confirm no `NEXT_PUBLIC_` value, public anon key, placeholder, local URL, example URL, or copied docs value is used for server-only persistence.",
  "Confirm browser/client bundles cannot import server-only persistence modules.",
];

for (const check of envConfigChecks) {
  assertIncludes(checklist, check);
}

const preflightChecks = [
  "Confirm William reviewed this checklist.",
  "Confirm William explicitly approved `stage-4a-388-one-controlled-admin-booking-customer-save-load`.",
  "Confirm William explicitly approved each exact command line in Section B.",
  "Confirm no Supabase command is approved or needed for the first controlled save-load command group.",
  "Confirm no migration is approved or needed.",
  "Confirm the feature flag starts OFF.",
  "Confirm the kill-switch OFF probe returns the disabled safe response before enabling.",
  "Confirm the admin/dispatcher server-session gate is required.",
  "Confirm local-dev admin fallback cannot write while persistence is enabled.",
  "Confirm customer, public, driver, and anonymous paths remain blocked.",
  "Confirm customer booking request paths cannot become hidden admin persistence write paths.",
  "Confirm unsafe fields are rejected before adapter use.",
  "Confirm API responses do not expose secrets, env values, stack traces, SQL, Supabase internals, tokens, keys, credential names, or server-only module details.",
];

for (const check of preflightChecks) {
  assertIncludes(checklist, check);
}

const requiredCommands = [
  "node scripts/test-admin-persistence-staging-command-evidence-checklist.mjs",
  "node scripts/test-admin-persistence-staging-verification-packet.mjs",
  "node scripts/test-admin-booking-controlled-real-write-enable.mjs",
  "node scripts/test-admin-persistence-real-write-approval-proposal.mjs",
  "node scripts/test-admin-persistence-enable-approval-checklist.mjs",
  "node scripts/test-admin-booking-persistence-enable-readiness.mjs",
  "node scripts/test-admin-booking-persistence-kill-switch.mjs",
  "node scripts/test-admin-booking-persistence-staging-config.mjs",
  "node scripts/test-admin-booking-persistence-api-gate.mjs",
  "node scripts/test-admin-booking-supabase-adapter-contract.mjs",
  "npm run test:booking-ui-browser",
  "npm run test:driver-job-page-browser",
  "npm run test:parser",
  "npm run lint",
  "npm run build",
  "npm run test:app-smoke-browser",
  "npm run test:mobile-usability-browser",
  "npm run test:safe",
  "git diff --check",
  "git status --short",
];

for (const command of requiredCommands) {
  assertIncludes(checklist, command);
}

const saveLoadScope = [
  "One staging-only booking reference: `STAGE-4A-388-CONTROLLED-ADMIN-SAVE-LOAD-001`.",
  "One safe admin POST to `/api/admin-bookings`.",
  "One safe admin GET from `/api/admin-bookings` to confirm the saved booking/customer can be loaded through the admin/dispatcher gate.",
  "Existing applied tables only: `customers`, `customer_contacts`, `bookings`, `booking_route_points`, `booking_service_items`, and `audit_logs`.",
  "Safe operational fields only.",
  "No second booking, bulk import, update sweep, customer request conversion, driver assignment, payment workflow, notification workflow, or public/customer/driver workflow is included.",
];

for (const item of saveLoadScope) {
  assertIncludes(checklist, item);
}

for (const table of [
  "`customers`",
  "`customer_contacts`",
  "`bookings`",
  "`booking_route_points`",
  "`booking_service_items`",
  "`audit_logs`",
]) {
  assertIncludes(checklist, table);
}

const blockedSurfaces = [
  "Persistence defaults OFF.",
  "The kill-switch must close write paths immediately.",
  "The admin/dispatcher gate is required before any write reaches the server-only adapter.",
  "Customer, public, driver, and anonymous paths must remain blocked.",
];

for (const surface of blockedSurfaces) {
  assertIncludes(checklist, surface);
}

const unsafeFieldFamilies = [
  "Pricing and quoted price fields.",
  "Driver payout fields.",
  "PayNow payout fields.",
  "Invoice, payment, and PDF fields.",
  "Billing and accounting fields.",
  "Finance notes.",
  "Parser/debug internals.",
  "Raw parser prompts, AI prompts, parser-learning, and parser rule-change fields.",
  "Live-location, proof, and photo fields.",
  "Notification-send fields and message delivery state.",
  "Mock archive fields.",
  "Mock QA fields.",
  "Mock workbench and dev workbench fields.",
  "Customer auth and driver auth fields.",
  "Service-role, server-only, server secret, and internal credential fields.",
];

for (const fieldFamily of unsafeFieldFamilies) {
  assertIncludes(checklist, fieldFamily);
}

const forbiddenScope = [
  "No customer auth.",
  "No driver auth.",
  "No notifications.",
  "No billing.",
  "No payment.",
  "No invoice.",
  "No PDF.",
  "No Stripe.",
  "No PayNow payout.",
  "No driver payout.",
  "No payout.",
  "No live-location.",
  "No proof/photo.",
  "No parser-learning.",
  "No parser file changes.",
  "No package script changes.",
  "No `test:safe` membership changes.",
  "No public/customer/driver UI behavior changes.",
];

for (const blocked of forbiddenScope) {
  assertIncludes(checklist, blocked);
}

const evidenceRequirements = [
  "William's approval note for the exact future command group.",
  "The exact approved command lines, with secret values redacted.",
  "The exact staging environment and staging project target, with no secret values.",
  "Confirmation that the feature flag started OFF.",
  "The kill-switch OFF probe result showing writes closed before enabling.",
  "Confirmation that the temporary enabled window was staging-only.",
  "Confirmation that only an admin or dispatcher server-session gate was used.",
  "Confirmation that customer, public, driver, and anonymous requests remained blocked.",
  "Confirmation that the safe payload contained only approved operational fields.",
  "Confirmation that unsafe-field probes were rejected before adapter use.",
  "One controlled staging save result for `STAGE-4A-388-CONTROLLED-ADMIN-SAVE-LOAD-001`.",
  "One controlled staging load result proving the same booking/customer can be read back through `/api/admin-bookings`.",
  "Confirmation that turning the feature flag OFF after evidence collection closed write paths again.",
  "Confirmation that `npm run test:safe` passed after the feature flag was turned OFF.",
  "Final `git status --short` for the future approved stage.",
];

for (const evidence of evidenceRequirements) {
  assertIncludes(checklist, evidence);
}

const rollbackSteps = [
  "Turn `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` OFF.",
  "Confirm the rollback OFF probe returns the disabled safe response.",
  "Confirm admin create/update write attempts return the disabled safe response.",
  "Confirm customer, public, driver, and anonymous paths remain blocked.",
  "Confirm customer booking request paths cannot become hidden admin persistence write paths.",
  "Confirm unsafe-field probes are still rejected before adapter use.",
  "Confirm no Supabase client is created when the kill-switch is closed in mocked tests.",
  "Confirm no browser/client bundle can import server-only persistence modules.",
  "Run `node scripts/test-admin-booking-persistence-kill-switch.mjs`.",
  "Run `node scripts/test-admin-booking-controlled-real-write-enable.mjs`.",
  "Run `npm run test:safe`.",
  "Confirm `git status --short` is clean.",
];

for (const rollback of rollbackSteps) {
  assertIncludes(checklist, rollback);
}

const stopConditions = [
  "William approval is missing, ambiguous, or does not name `stage-4a-388-one-controlled-admin-booking-customer-save-load`.",
  "William approval does not include each exact command line from Section B.",
  "Any Supabase command is needed but lacks explicit William approval.",
  "Any migration is needed but lacks explicit William approval.",
  "The target environment is not confirmed as staging.",
  "Production or an unknown database target appears.",
  "`PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` cannot be confirmed OFF before the check.",
  "The kill-switch OFF probe does not return the disabled safe response.",
  "The admin/dispatcher gate is bypassed.",
  "Local-dev admin fallback can write while persistence is enabled.",
  "Customer, public, driver, or anonymous paths can write admin persistence data.",
  "A customer booking request path becomes a hidden admin persistence write path.",
  "Unsafe fields reach the adapter or database layer.",
  "More than one controlled admin booking/customer save-load test is attempted.",
  "Any customer auth, driver auth, notification, billing, payment, invoice, PDF, payout, live-location, proof/photo, or parser-learning behavior appears.",
  "Parser files, package scripts, `test:safe` membership, public/customer/driver UI behavior, schema, or migrations change unexpectedly.",
];

for (const stopCondition of stopConditions) {
  assertIncludes(checklist, stopCondition);
}

assertMatches(
  checklist,
  /Evidence must be redacted before it is shared\./,
  "Checklist must require evidence redaction.",
);
assertMatches(
  checklist,
  /Stage 4A-388 - William approval review for `stage-4a-388-one-controlled-admin-booking-customer-save-load`/i,
  "Checklist must recommend the next William approval review step.",
);
assertIncludes(
  docsIndex,
  "[Admin Persistence Staging Command And Evidence Checklist](admin-persistence-staging-command-and-evidence-checklist.md)",
  "Docs index must point at the staging command and evidence checklist.",
);

console.log("Admin persistence staging command and evidence checklist audit passed.");
