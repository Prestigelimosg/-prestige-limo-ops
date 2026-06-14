import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packetPath = "docs/staging-deployment-approval-packet.md";
const packet = await readFile(packetPath, "utf8");
const normalized = packet.toLowerCase();

function assertIncludes(fragment, label = fragment) {
  assert.equal(
    normalized.includes(fragment.toLowerCase()),
    true,
    `Staging deployment approval packet missing ${label}.`,
  );
}

function assertSectionIncludes(section, fragment, label = fragment) {
  assert.equal(
    section.includes(fragment),
    true,
    `Staging deployment approval packet section missing ${label}.`,
  );
}

function sectionBetween(startHeading, nextHeadingPrefix = "\n## ") {
  const start = packet.indexOf(startHeading);

  assert.notEqual(start, -1, `Missing section: ${startHeading}`);

  const next = packet.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? packet.slice(start) : packet.slice(start, next);
}

assertIncludes("Staging Deployment Approval Packet", "packet title");
assertIncludes("approval planning only", "planning-only boundary");
assertIncludes("does not deploy the app", "no-deploy boundary");
assertIncludes("change environment values", "no-env-change boundary");
assertIncludes("enable writes", "no-write boundary");
assertIncludes("enable providers", "no-provider boundary");
assertIncludes("activate any live feature", "no-live-feature boundary");

const checkpointsSection = sectionBetween("## Checkpoints");
assert.match(
  checkpointsSection,
  /Latest repo commit at packet creation:\s*`[0-9a-f]{7,}\s+[^`]+`/,
  "Packet must include latest repo commit field.",
);
assert.match(
  checkpointsSection,
  /Latest implementation checkpoint in the ledger:\s*`[0-9a-f]{7,}\s+[^`]+`/,
  "Packet must include latest implementation checkpoint field.",
);
assertSectionIncludes(checkpointsSection, "docs/current-implementation-ledger.md");

const approvalSection = sectionBetween("## Approval Fields");
for (const fragment of [
  "Owner:",
  "Approval date:",
  "Approved scope:",
  "Approved staging target:",
]) {
  assertSectionIncludes(approvalSection, fragment, `Approval fields missing ${fragment}`);
}

const requiredChecksSection = sectionBetween("## Required Checks Before Staging");
for (const command of [
  "node scripts/test-preactivation-verification-suite.mjs",
  "npm run lint",
  "npm run build",
  "npm run test:app-smoke-browser",
  "npm run test:booking-ui-browser",
  "git diff --check",
  "git status --short",
]) {
  assertSectionIncludes(requiredChecksSection, command, `Required checks missing ${command}`);
}
assertSectionIncludes(requiredChecksSection, "Do not proceed if any check fails");

const deployStepsSection = sectionBetween("## Staging Deploy Steps");
for (const fragment of [
  "target is staging only",
  "not production",
  "Do not add live credentials",
  "provider tokens",
  "payment keys",
  "auth activation",
  "DB write flags",
  "migration commands",
  "Record sanitized evidence only",
]) {
  assertSectionIncludes(deployStepsSection, fragment, `Staging deploy steps missing ${fragment}`);
}

const envSection = sectionBetween("## Env Values That Must Remain Unset Or Disabled");
for (const fragment of [
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN",
  "DRIVER_JOB_LINK_MODE",
  "NEXT_PUBLIC_DRIVER_JOB_LINK_MODE",
  "PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED",
  "AI_PARSE_MODE",
  "must stay mock",
  "must remain unset or disabled",
]) {
  assertSectionIncludes(envSection, fragment, `Env disabled section missing ${fragment}`);
}

const noLiveSection = sectionBetween("## No-Live Gates To Verify After Deploy");
for (const fragment of [
  "Production hardening readiness still returns blocked",
  "Pre-activation verification suite still passes",
  "Setup-only APIs remain GET-only",
  "disabled/no-op",
  "sendingEnabled false",
  "external_send false",
  "Calendar lifecycle create/update/cancel remains blocked",
  "Customer amendment/cancellation never auto-updates CRM, booking, or calendar",
  "Shim cleanup guard still parks risky write paths",
]) {
  assertSectionIncludes(noLiveSection, fragment, `No-live gates missing ${fragment}`);
}

const smokeSection = sectionBetween("## Post-Deploy Smoke Checklist");
for (const fragment of [
  "Open staging admin route",
  "without horizontal overflow",
  "Customer Copy channel buttons remain setup-only/disabled",
  "Save Booking + CRM and Create Calendar Event remain separate behaviors",
  "/book",
  "/my-bookings",
  "/customers",
  "/driver-job-demo",
  "/driver-job/[token]",
  "npm run test:app-smoke-browser",
  "npm run test:booking-ui-browser",
]) {
  assertSectionIncludes(smokeSection, fragment, `Post-deploy smoke checklist missing ${fragment}`);
}

const rollbackSection = sectionBetween("## Rollback Checklist");
for (const fragment of [
  "previous clean deployment and commit",
  "Redeploy the previous artifact",
  "Keep all live gates false/unset",
  "rotate any exposed keys",
  "node scripts/test-preactivation-verification-suite.mjs",
  "git status --short",
  "sanitized failure and rollback evidence",
]) {
  assertSectionIncludes(rollbackSection, fragment, `Rollback checklist missing ${fragment}`);
}

const blockedSection = sectionBetween("## Explicit Blocked List");
assert.match(
  blockedSection,
  /remain blocked unless separately and explicitly approved/i,
  "Blocked list must state separate explicit approval is required.",
);

for (const fragment of [
  "live DB/write",
  "migrations",
  "provider/env activation",
  "external APIs",
  "live sending",
  "payment/PDF/payout",
  "auth",
  "live location",
  "photo upload",
  "CRM/calendar writes",
  "risky shim writes",
]) {
  assertSectionIncludes(blockedSection, fragment, `Explicit blocked list missing ${fragment}`);
}

const forbiddenApprovalPatterns = [
  /live DB\/write\s+(?:is\s+)?approved/i,
  /migrations?\s+(?:are|is\s+)?approved/i,
  /provider\/env activation\s+(?:is\s+)?approved/i,
  /external APIs?\s+(?:are|is\s+)?approved/i,
  /live sending\s+(?:is\s+)?approved/i,
  /payment\/PDF\/payout\s+(?:is\s+)?approved/i,
  /auth activation\s+(?:is\s+)?approved/i,
  /live location\s+(?:is\s+)?approved/i,
  /photo upload(?:\/storage)?\s+(?:is\s+)?approved/i,
  /CRM\/calendar writes?\s+(?:are|is\s+)?approved/i,
  /risky shim writes?\s+(?:are|is\s+)?approved/i,
];

for (const pattern of forbiddenApprovalPatterns) {
  assert.equal(
    pattern.test(packet),
    false,
    `Staging packet must not contain live-approval wording matching ${pattern}.`,
  );
}

console.log("staging deployment approval packet guard passed");
