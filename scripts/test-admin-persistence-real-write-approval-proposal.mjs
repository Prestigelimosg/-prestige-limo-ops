import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const proposalPath = path.join(
  process.cwd(),
  "docs/admin-persistence-real-write-approval-proposal.md",
);
const indexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertMatches(text, pattern, message = `Missing required pattern: ${pattern}`) {
  assert.match(text, pattern, message);
}

const proposal = await readFile(proposalPath, "utf8");
const docsIndex = await readFile(indexPath, "utf8");

const requiredApprovalLanguage = [
  "This proposal is not approval to enable real writes.",
  "William must explicitly approve a separate future real-write stage before any real write path is enabled.",
  "Supabase commands require explicit William approval in that future stage.",
  "Migrations require explicit William approval in that future stage.",
  "First real-write enablement, if approved later, must be staging-only and controlled.",
  "The persistence feature flag must default OFF.",
  "Production real writes must remain blocked until a later production approval stage exists.",
];

for (const statement of requiredApprovalLanguage) {
  assertIncludes(proposal, statement);
}

const requiredGateLanguage = [
  "The admin/dispatcher gate must be required for every write.",
  "Ready config must not bypass the admin/dispatcher gate.",
  "Feature flag alone must not open persistence.",
  "Ready staging config alone must not open persistence.",
  "A valid admin/dispatcher session alone must not open persistence.",
  "Safe payload parsing alone must not open persistence.",
  "Customer, public, driver, and anonymous paths must remain blocked from admin booking persistence writes.",
  "Customer booking request paths must not become a hidden real-write enablement path.",
  "Browser/client bundles must not import server-only persistence modules.",
];

for (const statement of requiredGateLanguage) {
  assertIncludes(proposal, statement);
}

const requiredKillSwitchLanguage = [
  "The kill-switch must remain available.",
  "The kill-switch must stay tested before and after any future real-write stage.",
  "Closing the kill-switch must close write paths immediately.",
  "Rollback must include turning the persistence feature flag OFF.",
  "Rollback must include confirming admin write paths return the disabled safe response.",
  "Rollback must include confirming customer, public, driver, and anonymous paths remain blocked.",
  "Rollback must include confirming no Supabase client is created when the kill-switch is closed.",
  "Rollback must include confirming `npm run test:safe` passes after the flag is turned OFF.",
];

for (const statement of requiredKillSwitchLanguage) {
  assertIncludes(proposal, statement);
}

const requiredSafeFields = [
  "`booking_reference`",
  "`pickup_datetime` and `pickup_at`",
  "`pickup_location`",
  "`dropoff_location`",
  "`customer_display_name`",
  "`contact_phone`",
  "`contact_email`",
  "`passenger_name`",
  "`pax_count`",
  "`luggage_count`",
  "Route points and stops.",
  "Service items for child seat, extra stop, waiting time, and midnight charge.",
  "Narrow create/update audit records for the approved admin persistence action.",
];

for (const field of requiredSafeFields) {
  assertIncludes(proposal, field);
}

const forbiddenFieldFamilies = [
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

for (const fieldFamily of forbiddenFieldFamilies) {
  assertIncludes(proposal, fieldFamily);
}

const blockedFirstStageActions = [
  "The first real-write stage must not add customer auth, driver auth, notifications, billing, payment, PDF, payout, live-location, proof/photo, parser-learning, API expansion, auth expansion, package-script changes, `test:safe` membership changes, parser file changes, or public/customer/driver UI behavior changes.",
  "No customer auth, driver auth, notifications, billing, payment, PDF, payout, live-location, proof/photo, or parser-learning behavior was added.",
  "Parser files, package scripts, `test:safe` membership, and public/customer/driver UI behavior were not changed.",
];

for (const blockedAction of blockedFirstStageActions) {
  assertIncludes(proposal, blockedAction);
}

const requiredCommands = [
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
  assertIncludes(proposal, command);
}

assertMatches(
  proposal,
  /Service-role\/server-only secrets must never be exposed to browser code, client bundles, public JavaScript, API responses, logs, screenshots, commits, or docs examples\./,
  "Proposal must include server-only secret non-exposure rule.",
);
assertMatches(
  proposal,
  /Stage 4A-385 - Read-only William approval review checkpoint/i,
  "Proposal must recommend a read-only William approval checkpoint next.",
);
assertIncludes(
  docsIndex,
  "[Admin Persistence Real-Write Approval Proposal](admin-persistence-real-write-approval-proposal.md)",
  "Docs index must point at the real-write approval proposal.",
);

console.log("Admin persistence real-write approval proposal audit passed.");
