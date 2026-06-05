import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const checklistPath = path.join(
  process.cwd(),
  "docs/admin-persistence-enable-approval-checklist.md",
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

assertIncludes(
  checklist,
  "This checklist is not approval to enable real writes.",
  "Checklist must explicitly deny real-write approval.",
);
assertIncludes(
  checklist,
  "Real writes require a separate future stage and explicit William approval.",
  "Checklist must require separate William approval for real writes.",
);
assertIncludes(
  checklist,
  "Supabase commands are not allowed unless explicitly approved in a separate future stage.",
  "Checklist must block unapproved Supabase commands.",
);
assertIncludes(
  checklist,
  "No new migrations are allowed unless explicitly approved in a separate future stage.",
  "Checklist must block unapproved migrations.",
);

const requiredGateLabels = [
  "Adapter contract tests",
  "API write-enable gate tests",
  "Staging-config readiness tests",
  "Kill-switch regression tests",
  "Enable-readiness tests",
  "Parser tests",
  "Browser route-leak tests",
  "Mobile usability tests",
  "Full safe suite",
];

const requiredGateCommands = [
  "node scripts/test-admin-booking-supabase-adapter-contract.mjs",
  "node scripts/test-admin-booking-persistence-api-gate.mjs",
  "node scripts/test-admin-booking-persistence-staging-config.mjs",
  "node scripts/test-admin-booking-persistence-kill-switch.mjs",
  "node scripts/test-admin-booking-persistence-enable-readiness.mjs",
  "npm run test:parser",
  "npm run test:app-smoke-browser",
  "npm run test:mobile-usability-browser",
  "npm run test:safe",
];

for (const label of requiredGateLabels) {
  assertIncludes(checklist, label);
}

for (const command of requiredGateCommands) {
  assertIncludes(checklist, command);
}

const requiredSafetyStatements = [
  "The kill-switch must stay available.",
  "Closing the kill-switch must close write paths immediately.",
  "Ready staging configuration must not bypass the admin/dispatcher gate.",
  "Ready enablement configuration must still require a valid admin/dispatcher session.",
  "Customer, public, driver, and anonymous paths must remain blocked from admin booking persistence writes.",
  "Browser/client bundles must not import server-only persistence code.",
  "Service-role/server-only secrets must never be exposed to browser code, client bundles, public JavaScript, API responses, logs, screenshots, commits, or docs examples.",
];

for (const statement of requiredSafetyStatements) {
  assertIncludes(checklist, statement);
}

const forbiddenFieldFamilies = [
  "Pricing and quoted price fields",
  "Driver payout fields",
  "PayNow payout fields",
  "Invoice, payment, and PDF fields",
  "Billing and accounting fields",
  "Finance notes",
  "Parser/debug internals",
  "Raw parser prompts, AI prompts, parser-learning, and parser rule-change fields",
  "Live-location, proof, and photo fields",
  "Notification-send fields and message delivery state",
  "Mock archive fields",
  "Mock QA fields",
  "Mock workbench and dev workbench fields",
  "Service-role, server-only, server secret, and internal credential fields",
];

for (const fieldFamily of forbiddenFieldFamilies) {
  assertIncludes(checklist, fieldFamily);
}

assertMatches(
  checklist,
  /does not activate real database writes[\s\S]+does not approve persistence enablement/i,
  "Checklist must keep read-only and no-approval boundaries together.",
);
assertMatches(
  checklist,
  /Stage 4A-383 - Read-only checkpoint review/i,
  "Checklist must recommend a read-only checkpoint as the next backend workflow step.",
);
assertIncludes(
  docsIndex,
  "[Admin Persistence Enable Approval Checklist](admin-persistence-enable-approval-checklist.md)",
  "Docs index must point at the approval checklist.",
);

console.log("Admin persistence enable approval checklist audit passed.");
