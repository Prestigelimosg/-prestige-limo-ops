import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const packetPath = path.join(
  process.cwd(),
  "docs/admin-persistence-staging-verification-packet.md",
);
const indexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertMatches(text, pattern, message = `Missing required pattern: ${pattern}`) {
  assert.match(text, pattern, message);
}

const packet = await readFile(packetPath, "utf8");
const docsIndex = await readFile(indexPath, "utf8");

const approvalBoundary = [
  "This packet is not approval to run Supabase commands.",
  "This packet is not approval to perform live writes.",
  "This packet is not approval to create migrations.",
  "William must explicitly approve any future live staging write evidence collection.",
  "Supabase commands require explicit William approval.",
  "Migrations require explicit William approval.",
  "Live staging writes require explicit William approval in a separate future stage.",
];

for (const statement of approvalBoundary) {
  assertIncludes(packet, statement);
}

const currentState = [
  "The controlled admin persistence write path exists.",
  "The controlled write path remains server-only.",
  "`PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` must default OFF.",
  "The kill-switch is the persistence feature flag; turning `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` off must close write paths immediately.",
  "The admin/dispatcher gate is required before any write can reach the server-only adapter.",
  "Ready staging configuration must not bypass the admin/dispatcher gate.",
  "Customer, public, driver, and anonymous paths must remain blocked from admin booking persistence writes.",
  "Customer booking request paths must not become a hidden admin persistence write enablement path.",
  "Browser/client bundles must not import server-only persistence modules.",
];

for (const statement of currentState) {
  assertIncludes(packet, statement);
}

for (const table of [
  "`customers`",
  "`customer_contacts`",
  "`bookings`",
  "`booking_route_points`",
  "`booking_service_items`",
  "`audit_logs`",
]) {
  assertIncludes(packet, table);
}

const forbiddenFeatureScope = [
  "Customer auth.",
  "Driver auth.",
  "Notifications.",
  "Billing.",
  "Payment.",
  "Invoice.",
  "PDF.",
  "Stripe.",
  "PayNow payout.",
  "Driver payout.",
  "Live-location.",
  "Proof/photo.",
  "Parser-learning.",
  "Parser file changes.",
  "Package script changes.",
  "`test:safe` membership changes.",
  "Public/customer/driver UI behavior changes.",
];

for (const feature of forbiddenFeatureScope) {
  assertIncludes(packet, feature);
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
  assertIncludes(packet, fieldFamily);
}

const requiredPreflightStatements = [
  "Confirm this packet has been reviewed by William.",
  "Confirm William explicitly approves the exact future live staging write evidence collection stage.",
  "Confirm William explicitly approves any Supabase command needed for that future stage.",
  "Confirm William explicitly approves any migration if a migration is proposed; otherwise confirm no migration is allowed.",
  "Confirm the exact staging environment and staging project target are named without exposing secrets.",
  "Confirm no production project or production database is targeted.",
  "Confirm `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` defaults OFF before the live check begins.",
  "Confirm the kill-switch has been tested with the feature flag OFF.",
  "Confirm admin/dispatcher server-session mode is required.",
  "Confirm local-dev admin fallback is not accepted for enabled writes.",
  "Confirm customer, public, driver, and anonymous paths remain blocked.",
  "Confirm unsafe fields are rejected before adapter use.",
  "Confirm browser/client bundles cannot import server-only write enablement code.",
  "Confirm failure responses do not expose secrets, env values, stack traces, SQL, Supabase internals, tokens, keys, or server-only details.",
];

for (const statement of requiredPreflightStatements) {
  assertIncludes(packet, statement);
}

const requiredPreflightCommands = [
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

for (const command of requiredPreflightCommands) {
  assertIncludes(packet, command);
}

const requiredEvidence = [
  "The William approval note for that exact future stage.",
  "The exact staging environment and staging project target, redacted so no service-role/server-only secret is exposed.",
  "Confirmation that the feature flag started OFF.",
  "Confirmation that the kill-switch OFF state blocked admin writes before enabling.",
  "Confirmation that customer, public, driver, and anonymous requests were blocked before enabling.",
  "Confirmation that only an admin or dispatcher server-session gate was used.",
  "Confirmation that the safe payload contained only approved operational fields.",
  "Confirmation that unsafe-field probes were rejected before adapter use.",
  "One controlled staging create or update result, using a staging-only booking reference chosen for this verification.",
  "Redacted API response evidence that contains no secret, token, stack trace, SQL, Supabase internals, or server-only detail.",
  "Confirmation that turning the feature flag OFF after the evidence collection closed write paths again.",
  "Confirmation that `npm run test:safe` passed after the feature flag was turned OFF.",
];

for (const evidence of requiredEvidence) {
  assertIncludes(packet, evidence);
}

const rollbackRequirements = [
  "Turn `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` OFF.",
  "Confirm admin create/update write attempts return the disabled safe response.",
  "Confirm customer, public, driver, and anonymous paths remain blocked.",
  "Confirm unsafe-field probes are still rejected before adapter use.",
  "Confirm no Supabase client is created when the kill-switch is closed in mocked tests.",
  "Confirm no browser/client bundle can import server-only persistence modules.",
  "Run `node scripts/test-admin-booking-persistence-kill-switch.mjs`.",
  "Run `node scripts/test-admin-booking-controlled-real-write-enable.mjs`.",
  "Run `npm run test:safe`.",
  "Confirm `git status --short` is clean.",
];

for (const rollback of rollbackRequirements) {
  assertIncludes(packet, rollback);
}

const stopConditions = [
  "William approval is missing, ambiguous, or does not name the exact live staging write evidence collection.",
  "Any Supabase command is needed but lacks explicit William approval.",
  "Any migration is needed but lacks explicit William approval.",
  "The target environment is not confirmed as staging.",
  "Production or an unknown database target appears.",
  "`PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` cannot be confirmed OFF before the check.",
  "The kill-switch fails to close write paths.",
  "The admin/dispatcher gate is bypassed.",
  "Local-dev admin fallback can write while persistence is enabled.",
  "Customer, public, driver, or anonymous paths can write admin persistence data.",
  "Unsafe fields reach the adapter or database layer.",
  "Any customer auth, driver auth, notification, billing, payment, invoice, PDF, payout, live-location, proof/photo, or parser-learning behavior appears.",
  "Parser files, package scripts, `test:safe` membership, public/customer/driver UI behavior, schema, or migrations change unexpectedly.",
];

for (const stopCondition of stopConditions) {
  assertIncludes(packet, stopCondition);
}

assertMatches(
  packet,
  /Service-role\/server-only secrets must never be exposed to browser code, client bundles, public JavaScript, API responses, logs, screenshots, commits, docs examples, or support notes\./,
  "Packet must include server-only secret non-exposure rule.",
);
assertMatches(
  packet,
  /Evidence must be redacted before it is shared\./,
  "Packet must require evidence redaction.",
);
assertMatches(
  packet,
  /Stage 4A-387 - William-approved staging command and evidence checklist/i,
  "Packet must recommend the next backend workflow step.",
);
assertIncludes(
  docsIndex,
  "[Admin Persistence Staging Verification Packet](admin-persistence-staging-verification-packet.md)",
  "Docs index must point at the staging verification packet.",
);

console.log("Admin persistence staging verification packet audit passed.");
