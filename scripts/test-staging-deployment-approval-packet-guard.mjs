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
assertIncludes("Before that separate approval it did not deploy Production", "historical no-Production-deploy boundary");
assertIncludes("without exposing secret values", "no-env-value exposure boundary");
assertIncludes("enable writes", "no-write boundary");
assertIncludes("enable providers", "no-provider boundary");
assertIncludes("activate any live feature", "no-live-feature boundary");

const checkpointsSection = sectionBetween("## Checkpoints");
assertSectionIncludes(
  checkpointsSection,
  "Latest repo commit deployed to isolated Preview: `f6806723 Harden driver details email sending`.",
);
assertSectionIncludes(
  checkpointsSection,
  "Latest verified runtime checkpoint in the ledger: `e8cfd8ea Repair multi-segment booking status updates`.",
);
assertSectionIncludes(
  checkpointsSection,
  "Latest Production deployment checkpoint: `5ba9432e Repair multi-segment booking status updates`.",
);
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
  "Exact local commit `2acaa3a5` to one refreshed isolated `staging` Preview deployment only; no Git push and no Production deploy",
  "Preview isolation approval: Approved on 2026-07-14 for Preview environment targeting only",
  "Production recovery approval: Approved on 2026-07-14 for exact existing credential recovery and safe prior-state verification only",
  "Resend replacement-key approval: Owner gave separate action-time approval on 2026-07-14",
  "Isolated Preview deployment approval: Approved on 2026-07-14",
  "Isolated Preview refresh approval: Owner later explicitly approved the suggested next step on 2026-07-14",
  "Codex correction Preview approval: Owner then explicitly approved proceeding carefully with the next suggested step on 2026-07-14",
  "Dashboard consolidation Preview approval: Owner explicitly approved proceeding with the suggested next step on 2026-07-14",
  "Automatic preparation Preview approval: Owner explicitly approved proceeding with the suggested next safe step on 2026-07-14",
  "Calendar conflict Preview approval: Owner explicitly approved proceeding with the suggested next safe step on 2026-07-14",
  "Repository Git identity repair approval: Owner explicitly approved proceeding with the next safe step on 2026-07-14",
  "Verified-author source Preview approval: Owner explicitly approved proceeding with the next safe step on 2026-07-14",
  "Combined automation Preview approval: Owner explicitly approved proceeding with the suggested next safe step on 2026-07-14",
  "Booking Requests layout Preview approval: Owner explicitly approved proceeding with the suggested next safe step on 2026-07-14",
  "Dashboard Production deployment approval: After approving the protected Preview, the owner separately approved the next stated step on 2026-07-14",
  "Main branch alignment approval: After the exact branch drift and safest non-force sequence were reported, the owner explicitly approved proceeding on 2026-07-14",
  "Driver Details Email hardened Preview approval: Owner explicitly approved proceeding with the stated next step on 2026-07-15",
]) {
  assertSectionIncludes(approvalSection, fragment, `Approval scope missing ${fragment}`);
}

const driverDetailsEmailPreviewSection = sectionBetween(
  "## Driver Details Email Hardened Protected Preview Evidence",
);
for (const fragment of [
  "`origin/staging` from `c7ca0aa5` to exact runtime commit `f6806723166d19d4147f4e4f37fda64d4c4e0d6b`",
  "Remote `main` remained at `d7f6aff9df27a0e8499d2a78e2926a5c37ebe338`",
  "READY Preview deployment `dpl_DUKTCzvYFtzHrkT955cMDbgwrXsV`",
  "target `preview`",
  "exact page build marker `f6806723`",
  "only the inert `PRESTIGE_GOOGLE_MAPS_BROWSER_ALLOWED_ORIGINS` assignment",
  "exactly one disabled `Email gate off` control",
  "document/body width equal to viewport width",
  "19 GET and one OPTIONS request",
  "zero POST/PATCH/PUT/DELETE requests",
  "no request to `/api/admin-customer-driver-details-email-send-action`",
  "unexpectedly auto-generated one automation protection-bypass token",
  "`driverDetailsEmailSendGateOpen: false`",
  "final automation-bypass count returned to zero",
  "SSO protection remained `all_except_custom_domains`",
  "HTTP 302 to Vercel SSO",
  "Production remained unchanged on remote main `d7f6aff9df27a0e8499d2a78e2926a5c37ebe338`",
  "`https://app.prestigelimo.sg` returned HTTP 200",
  "one low and three moderate, with no high or critical finding",
]) {
  assertSectionIncludes(
    driverDetailsEmailPreviewSection,
    fragment,
    `Driver Details Email Preview evidence missing ${fragment}`,
  );
}

for (const fragment of [
  "### Driver Details Email Hardened Protected Preview Evidence",
  "exact commit `f6806723166d19d4147f4e4f37fda64d4c4e0d6b`",
  "READY Preview deployment `dpl_DUKTCzvYFtzHrkT955cMDbgwrXsV`",
  "exactly one disabled `Email gate off` button",
  "zero POST/PATCH/PUT/DELETE requests",
  "no request to `/api/admin-customer-driver-details-email-send-action`",
  "Final project inspection returned zero automation-bypass tokens",
  "Production remained unchanged: remote `main` stayed at `d7f6aff9df27a0e8499d2a78e2926a5c37ebe338`",
  "Focused evidence remains in the established `docs/staging-deployment-approval-packet.md` and `scripts/test-staging-deployment-approval-packet-guard.mjs`",
]) {
  assert.equal(
    ledger.includes(fragment),
    true,
    `Implementation ledger missing Driver Details Email Preview evidence phrase ${fragment}.`,
  );
}

const driverDetailsEmailCandidateReconciliationSection = sectionBetween(
  "## Driver Details Email Post-Hotfix Candidate Reconciliation",
);
for (const fragment of [
  "remote `main` at Production hotfix `5ba9432e7f8dab3c63052c68a52a6bfecbc7ee17`",
  "remote `staging` at the previously verified Driver Details Email runtime `f6806723166d19d4147f4e4f37fda64d4c4e0d6b`",
  "one main-only and ten staging-only commits",
  "common ancestor `d7f6aff9df27a0e8499d2a78e2926a5c37ebe338`",
  "No merge, rebase, force push, branch push, deployment, or configuration action was performed",
  "Local runtime candidate `e8cfd8ea351f1bd5b47a7c759a43f33ccea4bbb6`",
  "subsequent local commits contain no `app` or `lib` runtime-path change",
  "same bounded booking-status source outcome under different commit identities",
  "not authorization to merge or deploy either branch",
  "exactly one external Email to `info@prestigelimo.sg`",
  "exact fixture `ADM-20260712063110` with assigned driver `TEST DRIVER CRM 20260516`",
  "does not authorize a temporary Preview database, Supabase branch, Preview environment assignment, deployment, provider access, or external Email",
  "No Email, provider request, customer/driver contact, environment value read or display, Resend key action, Supabase read/write, Automation toggle, calendar/map action, invoice/payment/payout action, Production change, or external system change occurred",
]) {
  assertSectionIncludes(
    driverDetailsEmailCandidateReconciliationSection,
    fragment,
    `Driver Details Email candidate reconciliation missing ${fragment}`,
  );
}

const mainAlignmentSection = sectionBetween(
  "## Main Branch Fast-Forward Production Alignment Evidence",
);
for (const fragment of [
  "remote `main` at `3bac3c3a`",
  "remote `staging` at `d7f6aff9`",
  "a `0 6` left/right count",
  "`main` as a direct ancestor of `staging`",
  "complete pre-activation suite and Next.js 16.2.6 Production build both exited zero",
  "known module-type warnings for `lib/codex-job-card-correction.ts` and `lib/driver-job-calendar-event.ts`",
  "first `git push origin staging:main` was rejected before mutation",
  "`gh auth setup-git` connected Git to that existing authorized keyring account",
  "same non-force push then fast-forwarded `main` from `3bac3c3a` to `d7f6aff9`",
  "without a merge commit, rebase, history rewrite, or force push",
  "remote `main` and `staging` both resolved to `d7f6aff9df27a0e8499d2a78e2926a5c37ebe338`",
  "READY Production deployment `dpl_GEsHpMkUyhSqY8XaniytrgC54pfi`",
  "alias `https://app.prestigelimo.sg`",
  "alias HTTP 200",
  "exact build marker `d7f6aff9df27a0e8499d2a78e2926a5c37ebe338`",
  "Runtime code remains exact application commit `2acaa3a5`",
  "documentation/guard-only and is pushed to `staging` only",
  "No Automation or Push control, booking/customer/driver record, notification item, calendar or Google Maps state, invoice/payment/payout record, environment or Supabase configuration, provider setting, customer/driver message, or external send changed",
]) {
  assertSectionIncludes(
    mainAlignmentSection,
    fragment,
    `Main alignment evidence missing ${fragment}`,
  );
}

const dashboardProductionSection = sectionBetween(
  "## Dashboard Booking Requests Production Deployment Evidence",
);
for (const fragment of [
  "Exact clean commit `b0a68cae Repair dashboard release checkpoint guards` and its three preceding local commits were pushed to `origin/staging`",
  "`origin/main` remained at `3bac3c3a`",
  "automatic READY Preview deployment `dpl_92f1KeAxJohLsu57Wk2BQkfYLoR9`",
  "`vercel deploy --prod --yes` created READY Production deployment `dpl_GbPQWNHmxoZB8HL7kKMgj9Nx2QxL`",
  "alias `https://app.prestigelimo.sg`",
  "one low and three moderate findings",
  "alias HTTP 200",
  "exact build marker `b0a68cae46c9423338a2f85e1f3696cc9aa9110b`",
  "one `Booking Requests` sector with four current new-request rows",
  "Automation remained ON and Push remained OFF; neither was changed.",
  "No request decision, notification cleanup, booking write, calendar/map action, invoice action, customer/driver message, provider send, environment or Supabase change, Automation/Push change, or external send occurred.",
  "zsh's reserved `status` variable",
  "Raw HTML text counts were not used as hydrated UI proof.",
  "optional Chrome tab-deliverable marker was unsupported",
  "Stopping the temporary local Production server exposed the established fail-closed `supabaseUrl is required` diagnostics",
  "Both browser suites had zero console errors and zero blocked Supabase requests/mutations",
  "no live Supabase connection or write occurred",
  "this is not represented as a Production error",
  "Runtime code remains exact application commit `2acaa3a5`",
]) {
  assertSectionIncludes(
    dashboardProductionSection,
    fragment,
    `Dashboard Production evidence missing ${fragment}`,
  );
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
  "Exact clean local commit `d292da05 Update Dashboard runtime checkpoint` was deployed with `vercel deploy --target=preview --yes` as READY Preview deployment `dpl_4vi4yrUxSVnrDxy5KVuFN5AchyFS`",
  "authenticated GET-only root verification returned HTTP 200 and confirmed exact page build marker `d292da05`.",
  "Sanitized deployment logs contain only the root HTTP 200 GET and those two HTTP 403 GETs; no POST, PATCH, PUT, or DELETE request reached the deployment.",
  "Preview intentionally has no Supabase or admin-session configuration",
  "Signed-in visual acceptance of the consolidated deployed interface is pending; no deployed visual pass is claimed.",
  "exact clean local commit `fd0eecd3 Update automatic preparation checkpoint` was then deployed with `vercel deploy --target=preview --yes` as READY Preview deployment `dpl_H6ELwkT3vww5uEvtgCmH73g3Pjyp`",
  "confirmed exact page build marker `fd0eecd3`",
  "It proves the exact code artifact and fail-closed boundary, but it cannot prove a live automatic preparation write",
  "A current local dependency audit reports the same four known findings: one low and three moderate, with zero high or critical findings.",
  "blocked non-runtime deployment `dpl_8PavU6nCj5LqpDKh86PQiPmHLjp4`",
  "ended with Vercel's exact `Not authorized` result",
  "The first prebuilt fallback was rejected before deployment because its artifact retained a dependency link to the main workspace.",
  "READY deployment `dpl_6qM2y5SeirbBDRGhV5283MUnmZrB`",
  "exact page build marker `565993b4`",
  "28 GET requests and one browser OPTIONS request",
  "final automation-bypass count is zero, and unauthenticated Preview access again returns HTTP 302 with `x-robots-tag: noindex`.",
  "Signed-in Mac Chrome visual acceptance passed at the normal 1021px viewport, iPhone 13 floor 390 x 844, modern Android 412 x 915, and unfolded foldable 841 x 701.",
  "Production remained unchanged and was re-read after the Preview pass",
  "GitHub CLI is authenticated as exact login `Prestigelimosg`",
  "GitHub's documented ID-based private no-reply address `283606993+Prestigelimosg@users.noreply.github.com`",
  "Global Git configuration and all existing commit history remained unchanged.",
  "does not claim the earlier Vercel authorization failure is fixed end to end",
  "READY deployment `dpl_Dk3ttLwAhsYFRjJ5Ut1RSJzZXkST`",
  "without the former `Not authorized` result",
  "27 GET requests and one browser OPTIONS request",
  "final bypass count is zero",
  "No new deployed mobile/foldable pass is claimed",
  "Exact clean local commit `2acaa3a5 Simplify dashboard booking request review` was deployed with `vercel deploy --target=preview --yes` as READY Preview deployment `dpl_85DP1MZc1oSKowUu4DEPi6Zr4Urm`",
  "signed-in Chrome confirmed exact page build marker `2acaa3a5`",
  "exactly one `Booking Requests` sector, one `Refresh Dashboard`, one Push Alerts toggle",
  "390px modern-phone, and 344px folded-phone outer-screen checks",
  "The owner explicitly approved the displayed protected Preview layout on 2026-07-14",
  "does not authorize a Git push or Production deployment",
  "The owner later gave separate approval to push the local `staging` commits and deploy Production.",
  "Preflight stopped before either action because the dynamic ledger checkpoint guards reproduced stale header records",
  "current READY Production deployment `dpl_HqiSmnf5i6yptfCwXougpujjuS2a` and exact build `3bac3c3a`",
  "No push or Production deployment is claimed by this preflight repair.",
  "Release checks passed the complete preactivation suite, Next.js 16.2.6 Production build, app smoke browser suite, and lint with the existing 160 warnings and zero errors.",
  "The first booking-browser run stopped on one stale retired-panel assertion",
  "rejects the retired heading, and passed completely with zero test errors, console errors, blocked Supabase requests, or blocked Supabase mutations.",
  "No push or deploy occurred during these checks.",
  "Preview names-only review still shows only the inert `PRESTIGE_GOOGLE_MAPS_BROWSER_ALLOWED_ORIGINS` assignment",
  "No booking decision, notification cleanup, Automation toggle, Push toggle, calendar/map action, invoice action, customer/driver message, or external send was performed.",
  "The deployment command used no Production flag and no Git push occurred.",
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
  "### Dashboard Codex Consolidation Preview Evidence",
  "READY Preview deployment `dpl_4vi4yrUxSVnrDxy5KVuFN5AchyFS`",
  "exact page build marker `d292da05`",
  "Sanitized deployment logs contain only the root HTTP 200 GET and those two HTTP 403 GETs",
  "final automation-bypass count is zero",
  "Preview intentionally has no Supabase or admin-session configuration",
  "Signed-in visual acceptance of the consolidated deployed interface remains pending.",
  "### Automatic Codex Job-Card Preparation Preview Evidence",
  "runtime commit `5a7ea651 Prepare Codex job cards when requests arrive`",
  "READY Preview deployment `dpl_H6ELwkT3vww5uEvtgCmH73g3Pjyp`",
  "exact page build marker `fd0eecd3`",
  "No POST, PATCH, PUT, or DELETE request reached the Preview.",
  "final automation-bypass count is zero",
  "it cannot prove a live automatic preparation write",
  "zero high or critical findings",
  "Production is unchanged: `app.prestigelimo.sg` remains READY deployment `dpl_7ksuhQENRPiWNACbEM4Y6dGf6ayR`",
  "### Codex Calendar Conflict Protected Preview Evidence",
  "exact runtime commit `565993b4 Add Codex saved-job conflict checks`",
  "blocked non-runtime deployment `dpl_8PavU6nCj5LqpDKh86PQiPmHLjp4`",
  "ended with Vercel's exact `Not authorized` result",
  "first prebuilt fallback was rejected before deployment because its artifact retained a dependency link to the main workspace",
  "READY deployment `dpl_6qM2y5SeirbBDRGhV5283MUnmZrB`",
  "exact page build marker `565993b4`",
  "28 GET requests and one browser OPTIONS request",
  "zero POST, PATCH, PUT, or DELETE request",
  "final automation-bypass count is zero",
  "normal 1021px viewport, iPhone 13 floor 390 x 844, modern Android 412 x 915, and unfolded foldable 841 x 701",
  "The in-memory local browser fixture remains the runtime proof for `Calendar conflict (1)` while Automation is ON",
  "Production remained unchanged and was re-read after the Preview pass",
  "### Repository Git Identity Repair",
  "authenticated GitHub CLI account is exactly `Prestigelimosg`",
  "numeric account ID `283606993`",
  "repository-local Git identity is now `Prestigelimosg`",
  "283606993+Prestigelimosg@users.noreply.github.com",
  "Global Git configuration was not changed.",
  "no source deployment was performed in this repair pass",
  "protected isolated source Preview remains required before claiming the earlier Vercel authorization failure is resolved end to end",
  "### Verified-Author Protected Source Preview Evidence",
  "exact clean commit `4cf1dc60 Record verified repository Git identity`",
  "created READY deployment `dpl_Dk3ttLwAhsYFRjJ5Ut1RSJzZXkST`",
  "This proves the future-commit author repair end to end without rewriting any existing commit.",
  "exact page marker `4cf1dc60`",
  "27 GET requests and one browser OPTIONS request",
  "final protection-bypass count is zero",
  "The initial unsupported tab-open call, incorrect button-role selector, unavailable page `resizeTo`, unavailable page `fetch`, and unavailable tab-marking call",
  "A new deployed mobile/foldable pass is not claimed",
  "Production remained unchanged: `app.prestigelimo.sg` still resolves to READY Production deployment `dpl_7ksuhQENRPiWNACbEM4Y6dGf6ayR`",
  "READY Preview deployment `dpl_Gu3ZYFz8og7R5ixzmMNQv9Dg3Xke`",
  "exact page build marker `b09b82f8a538cd6570b51501467167860e825bdf`",
  "`/api/cron/codex-monthly-invoice-drafts` returned HTTP 401",
  "94 GET and 6 OPTIONS requests",
  "zero POST/PATCH/PUT/DELETE requests",
  "normal 1021 x 931 desktop viewport, iPhone 13 floor 390 x 844, modern Android 412 x 915, and unfolded foldable 841 x 701",
  "The existing `/customers` invoice overview was also reviewed without clicking `Load Accounts`",
  "final bypass-token count is zero",
  "Production was re-read after Preview acceptance and still serves exact build marker `f7e253b3920252834dbef6a3143f6e744d2ab303`",
  "### Dashboard Booking Requests Isolated Preview Evidence",
  "deploy exact clean commit `2acaa3a5 Simplify dashboard booking request review` to one isolated protected Preview",
  "READY Preview deployment `dpl_85DP1MZc1oSKowUu4DEPi6Zr4Urm`",
  "signed-in Chrome confirms exact build marker `2acaa3a5`",
  "exactly one `Booking Requests` sector, one `Refresh Dashboard`, one Push Alerts switch",
  "Desktop, 390px modern-phone, and 344px folded-phone outer-screen checks",
  "the owner explicitly approved the displayed Booking Requests layout on 2026-07-14",
  "it is not approval to push Git or deploy Production",
  "The owner then separately approved pushing the local `staging` commits and deploying Production on 2026-07-14.",
  "Preflight stopped before either external action when both dynamic ledger checkpoint guards reproduced stale header records.",
  "READY Production deployment `dpl_HqiSmnf5i6yptfCwXougpujjuS2a` with exact build `3bac3c3a`",
  "the approved push and Production deployment remain pending until the repaired guards and release checks pass",
  "The first fresh local server start stopped with `EADDRINUSE`.",
  "one stale assertion expecting the retired `Urgent / Customer Requests` empty state",
  "require the consolidated heading and empty state and reject the retired heading",
  "zero blocked Supabase mutation requests",
  "Preview intentionally remains fail-closed",
  "The deployment command used no Production flag, no Git push occurred",
  "### Dashboard Booking Requests Production Deployment Evidence",
  "READY Production deployment `dpl_GbPQWNHmxoZB8HL7kKMgj9Nx2QxL`",
  "exact admin build marker `b0a68cae46c9423338a2f85e1f3696cc9aa9110b`",
  "The existing runtime states were observed as `Automation ON` and `Push alerts OFF`",
  "its terminal repeated the established fail-closed `supabaseUrl is required` diagnostics",
  "no live Supabase connection or write occurred",
  "This local diagnostic is not represented as a Production error",
  "The deployed runtime remains exact application commit `2acaa3a5 Simplify dashboard booking request review`",
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
