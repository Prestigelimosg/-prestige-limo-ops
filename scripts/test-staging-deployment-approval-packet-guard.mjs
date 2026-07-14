import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packetPath = "docs/staging-deployment-approval-packet.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const [packet, ledger] = await Promise.all([
  readFile(packetPath, "utf8"),
  readFile(ledgerPath, "utf8"),
]);
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
assertIncludes("records the approved deployment-safety configuration work", "configuration record boundary");
assertIncludes("does not deploy the app", "no-deploy boundary");
assertIncludes("without exposing values", "no-env-value exposure boundary");
assertIncludes("enable writes", "no-write boundary");
assertIncludes("enable providers", "no-provider boundary");
assertIncludes("activate any live feature", "no-live-feature boundary");

const checkpointsSection = sectionBetween("## Checkpoints");
assert.match(
  checkpointsSection,
  /Latest repo commit (?:at packet creation|before this configuration record):\s*`[0-9a-f]{7,}\s+[^`]+`/,
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

for (const fragment of [
  "Change the Vercel Production Branch from `staging` to `main`, then isolate future Preview environment assignments from Production without pushing or deploying",
  "Approved production-branch safety separation and Preview isolation only; no deployment approval",
  "Future `staging` Preview deployment only after separate Preview environment drift review; no production deploy",
  "Preview isolation approval: Approved on 2026-07-14 for Preview environment targeting only",
  "Production recovery approval: Approved on 2026-07-14 for exact existing credential recovery and safe prior-state verification only",
]) {
  assertSectionIncludes(approvalSection, fragment, `Approval scope missing ${fragment}`);
}

const branchSeparationSection = sectionBetween("## Current Verified Branch Separation");
for (const fragment of [
  "Vercel Production Branch is `main`; `staging` is no longer the Production Branch.",
  "Changing Branch Tracking created no deployment and made no domain, alias, environment-variable, or Git change.",
  "`app.prestigelimo.sg` remains on READY deployment `f7e253b3 Repair mobile automation regression coverage` with the same `f7e253b3` page build marker.",
  "Live Automation remains OFF; booking intake remains ON; calendar auto-write, invoice auto-issue, Driver Details Email auto-send, and external send remain OFF.",
  "The Vercel CLI was instructed to remove 17 shared names from Preview, but it deleted the multi-target records from both Preview and Production despite the documented environment-specific command.",
  "Exact recovery restored 15 Production assignments without printing values",
  "the existing Google Maps server key revealed by the signed-in Google Cloud owner surface",
  "Production's names-only audit now finds 21 of 22 required names and reports only `RESEND_API_KEY` missing.",
  "The signed-in Resend owner surface exposes only the existing key prefix and metadata",
  "`PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED` remains intentionally absent and fail-closed.",
  "Preview finds 0 of 22 required names",
  "The existing protected Preview artifact still contains its old frozen environment and must not be treated as isolated",
  "Remote `main` is `adf37589`, six commits behind remote `staging` at `f7e253b3`; local `staging` is five commits ahead before this record. No merge or push occurred.",
  "Previous READY deployment `f91d0d1e Style customer invoice sectors in black and gold` remains the identified manual rollback target; no rollback is in progress or approved by this record.",
  "The public Vercel project PATCH attempt returned HTTP 400 before mutation because `productionBranch` is not a supported top-level field. The signed-in Vercel Branch Tracking control was then used and independently verified; nothing is hidden as an API success.",
]) {
  assertSectionIncludes(branchSeparationSection, fragment, `Branch separation evidence missing ${fragment}`);
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
  "Do not push `staging`, push `main`, or deploy while `RESEND_API_KEY` remains unresolved.",
  "The existing Resend token is not revealable from the verified owner surface.",
  "Keep the CRM gate absent and fail-closed",
  "staging Preview only with its isolated no-Supabase/no-provider configuration",
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

for (const fragment of [
  "### Vercel Production Branch Safety Separation",
  "Owner explicitly approved changing only the linked Vercel project's Production Branch from `staging` to `main`.",
  "future pushes to `main` create Production deployments, while `staging` is no longer the Production Branch.",
  "The setting change created no deployment",
  "Live Automation read-back remains safely closed",
  "The environment-specific Vercel CLI removal unexpectedly deleted 17 multi-target variable records from both Preview and Production.",
  "Exact bounded recovery restored 15 Production-only assignments without printing values",
  "Production project configuration now contains 21 of 22 required names and remains missing exactly `RESEND_API_KEY`.",
  "The signed-in Resend owner surface exposes only the existing token prefix and metadata",
  "`PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED` remains intentionally absent and fail-closed.",
  "The Preview audit finds 0 of 22 required names",
  "The existing protected Preview artifact still contains its pre-isolation frozen environment",
  "No merge, push, preview deployment, production deployment, promotion, or rollback occurred.",
  "This external configuration record does not approve a Git push",
  "Focused lock: the existing `scripts/test-staging-deployment-approval-packet-guard.mjs`",
]) {
  assert.equal(
    ledger.includes(fragment),
    true,
    `Implementation ledger missing production-branch safety phrase ${fragment}.`,
  );
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
  "Save Booking + CRM auto-syncs Google Calendar; manual ICS export controls are removed from normal admin operation",
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
