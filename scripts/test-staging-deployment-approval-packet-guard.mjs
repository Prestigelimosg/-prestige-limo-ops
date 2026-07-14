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
assertIncludes("does not deploy Production", "no-Production-deploy boundary");
assertIncludes("without exposing values", "no-env-value exposure boundary");
assertIncludes("enable writes", "no-write boundary");
assertIncludes("enable providers", "no-provider boundary");
assertIncludes("activate any live feature", "no-live-feature boundary");

const checkpointsSection = sectionBetween("## Checkpoints");
assert.match(
  checkpointsSection,
  /Latest repo commit (?:at packet creation|before this configuration record|deployed to isolated Preview):\s*`[0-9a-f]{7,}\s+[^`]+`/,
  "Packet must include latest repo commit field.",
);
assert.match(
  checkpointsSection,
  /Latest (?:implementation|verified runtime) checkpoint in the ledger:\s*`[0-9a-f]{7,}\s+[^`]+`/,
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
  "Change the Vercel Production Branch from `staging` to `main`, isolate Preview environment assignments from Production, then create and verify one isolated `staging` Preview without pushing or deploying Production",
  "Approved production-branch safety separation and Preview isolation only; no deployment approval at that stage",
  "Preview deployment decision: Owner later explicitly approved proceeding with the suggested next step",
  "Exact local commit `bdd91bec` to one refreshed isolated `staging` Preview deployment only; no Git push and no Production deploy",
  "Preview isolation approval: Approved on 2026-07-14 for Preview environment targeting only",
  "Production recovery approval: Approved on 2026-07-14 for exact existing credential recovery and safe prior-state verification only",
  "Resend replacement-key approval: Owner gave separate action-time approval on 2026-07-14",
  "Isolated Preview deployment approval: Approved on 2026-07-14",
  "Isolated Preview refresh approval: Owner later explicitly approved the suggested next step on 2026-07-14",
  "Codex correction Preview approval: Owner then explicitly approved proceeding carefully with the next suggested step on 2026-07-14",
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
  "Final bounded recovery established 16 Production assignments without printing values",
  "one newly approved Resend sending-access key stored as `RESEND_API_KEY`",
  "is restricted to the verified `prestigelimo.sg` domain",
  "The existing Resend key remains intact.",
  "Production's names-only audit now passes with all 22 required names and no missing names.",
  "`PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED` remains intentionally absent and fail-closed.",
  "`PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED` remains false.",
  "Preview still finds 0 of 22 required names",
  "Before the first isolated deployment, the prior Preview artifact still contained its old frozen environment",
  "Remote `main` is `adf37589`, six commits behind remote `staging` at `f7e253b3`; local `staging` is six commits ahead before this record. No merge or push occurred.",
  "Previous READY deployment `f91d0d1e Style customer invoice sectors in black and gold` remains the identified manual rollback target; no rollback is in progress or approved by this record.",
  "The public Vercel project PATCH attempt returned HTTP 400 before mutation because `productionBranch` is not a supported top-level field. The signed-in Vercel Branch Tracking control was then used and independently verified; nothing is hidden as an API success.",
  "Pre-deployment browser testing found and stopped on a real operator-feedback defect before deployment.",
  "deployment `dpl_3Y4sav9jUK4X7XiQhMuVi7PXpuzY`",
  "target `preview`, status `Ready`, and page build marker `294cd1d8`.",
  "Post-deploy names-only review still found 0 of 22 required live names",
  "Final automation-bypass count is zero",
  "unauthenticated `GET /api/admin-automation-runtime` returned safe HTTP 403",
  "The raw `/driver-job-demo` keyword scan matched only the word `billing` inside two negative local-demo safety statements",
  "Lint remained at 160 existing warnings and zero errors.",
  "The local Next server terminal printed bundled `supabaseUrl is required` diagnostics",
  "This is recorded as fail-closed server diagnostic noise, not as database-connectivity success.",
  "Production remained unchanged throughout: `app.prestigelimo.sg` still resolves to READY Production deployment `dpl_7ksuhQENRPiWNACbEM4Y6dGf6ayR` with build marker `f7e253b3`.",
  "A second approved isolated Preview refresh deployed exact local commit `f62869b7` as READY deployment `dpl_BMEEqdSwWqx26eK4Sa3zipHTaGPg`.",
  "The refreshed Preview still has 0 of 22 required live names",
  "Both GET-only admin checks returned safe HTTP 403",
  "Deployment logs show only three verification GETs",
  "final automation-bypass count returned to zero",
  "Signed-in visual acceptance remains incomplete because browser control failed before navigation with `Cannot redefine property: process`.",
  "Exact local commit `bdd91bec` was deployed with `vercel deploy --target=preview --yes` as READY Preview deployment `dpl_9kRurW7hvqjaDKQ6GbFD7a2HPsXd`",
  "authenticated GET-only root verification confirms exact page build marker `bdd91bec`.",
  "Sanitized deployment logs contain only those three GETs and no POST, PATCH, PUT, or DELETE request.",
  "Final automation-bypass count is zero; unauthenticated Preview access again returns HTTP 302 with `x-robots-tag: noindex`.",
  "Vercel's build output reported four dependency audit findings: one low and three moderate.",
  "Signed-in visual acceptance of this latest protected URL is pending; no deployed visual pass is claimed.",
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
  "Production's required names-only configuration recovery is complete",
  "do not push `staging`, push `main`, or deploy without a separate deployment approval.",
  "Keep the existing Resend key intact and the Driver Details Email send gate false.",
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
  "Final bounded recovery established 16 Production-only assignments without printing values",
  "Production project configuration now passes the names-only audit with all 22 required names and no missing names.",
  "The existing Resend key remains intact.",
  "`PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED` remains intentionally absent and fail-closed.",
  "`PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED` remains false.",
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

for (const fragment of [
  "### Isolated Vercel Preview Deployment Evidence",
  "No Git push or Production deployment was approved.",
  "committed as `294cd1d8 Preserve admin review warning after calendar sync` before deployment",
  "READY Preview deployment `dpl_3Y4sav9jUK4X7XiQhMuVi7PXpuzY`",
  "target `preview`",
  "0 of 22 required live names in Preview",
  "final automation-bypass count is zero",
  "real token-scoped driver route did not expose driver-forbidden terms",
  "Lint remains 160 existing warnings and zero errors.",
  "The local Next server terminal printed bundled `supabaseUrl is required` diagnostics",
  "this diagnostic noise is not hidden or presented as successful database connectivity.",
  "Production is unchanged: `app.prestigelimo.sg` remains READY deployment `dpl_7ksuhQENRPiWNACbEM4Y6dGf6ayR` with build marker `f7e253b3`.",
  "No Production deployment, alias move, promotion, rollback, Git push, live-data write, provider send, Automation activation, environment edit, or Preview credential addition occurred.",
  "### Isolated Vercel Preview Refresh Evidence",
  "READY Preview deployment `dpl_BMEEqdSwWqx26eK4Sa3zipHTaGPg`",
  "exact page build marker `f62869b7`",
  "Both GET-only admin checks returned safe HTTP 403",
  "Deployment logs show only three verification GETs",
  "final automation-bypass count returned to zero",
  "Signed-in visual acceptance remains incomplete because browser control failed before navigation with `Cannot redefine property: process`.",
  "### Codex Job Card Correction Preview Evidence",
  "complete pre-activation suite passed",
  "READY Preview deployment `dpl_9kRurW7hvqjaDKQ6GbFD7a2HPsXd`",
  "exact deployed commit `bdd91bec`",
  "Sanitized deployment logs list only those three GET requests",
  "final automation-bypass count is zero",
  "one low and three moderate",
  "no deployed visual pass is claimed",
  "Production is unchanged: `app.prestigelimo.sg` remains READY deployment `dpl_7ksuhQENRPiWNACbEM4Y6dGf6ayR` with build marker `f7e253b3`.",
]) {
  assert.equal(
    ledger.includes(fragment),
    true,
    `Implementation ledger missing isolated Preview evidence phrase ${fragment}.`,
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
