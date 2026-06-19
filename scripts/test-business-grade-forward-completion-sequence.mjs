import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sequencePath = "docs/business-grade-forward-completion-sequence.md";
const workflowPath = "docs/business-workflow-resume-stage4a410.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-business-grade-forward-completion-sequence.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertNotMatches(source, pattern, label) {
  assert.doesNotMatch(source, pattern, `${label} must not match ${pattern}.`);
}

function assertOrdered(source, fragments) {
  let lastIndex = -1;

  for (const fragment of fragments) {
    const index = source.indexOf(fragment);
    assert.ok(index > lastIndex, `Expected ordered fragment after previous item: ${fragment}`);
    lastIndex = index;
  }
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n## ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const [sequence, workflow, docsIndex, ledger, preactivationSuite] = await Promise.all([
  readFile(sequencePath, "utf8"),
  readFile(workflowPath, "utf8"),
  readFile(docsIndexPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

for (const fragment of [
  "# Business-Grade Forward Completion Sequence",
  "This document is docs/test-only.",
  "It does not approve or activate runtime implementation, UI/API behavior change, UI sectors, buttons, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.",
  "Prestige Limo Ops should move forward from the current protected foundation toward a business-grade limo operations app by completing the business workflow in the order already proven by the repo:",
  "Do not repeat completed persistence, RLS, staging, or production verification unless a new runtime/deploy/env change creates a fresh reason.",
  "Keep production persistence default OFF outside approved verification or activation windows.",
  "The next runtime direction, if the owner explicitly approves runtime work, is the admin-only Confirmed Booking To Dispatch Release workflow described in `docs/business-workflow-resume-stage4a410.md`.",
  "Without a new explicit owner approval, allowed work remains:",
  "These activities may identify blockers, but they must not silently convert into feature implementation.",
  "The next sensible business-grade runtime task is admin-only Confirmed Booking To Dispatch Release, bounded to one existing admin workflow.",
  "Stay compact and colocated with similar admin dispatch controls.",
  "Start UI/local-state only unless the owner separately approves narrow persistence.",
  "Keep Save Booking + CRM on `POST /api/admin-bookings`.",
  "Keep `/api/admin-saved-bookings` separate and unchanged.",
  "This is not approved by this document. It is only the forward direction to ask about when runtime implementation becomes allowed.",
  "Runtime implementation needs explicit owner approval naming the feature.",
  "Customer auth/RLS is not activated.",
  "Driver auth/token persistence is not activated.",
  "Production driver job links and production driver status writes remain disabled until a later secure token/RLS gate.",
  "Notifications and provider sending remain disabled/no-live.",
  "Billing, invoice, payment, PDF, payout, PayNow payout, accounting, and finance automation remain blocked.",
  "Live location, GPS capture, OTS photo upload/storage, calendar sync, flight/map providers, parser-learning, and parser rule changes remain blocked.",
  "Testing and staging are still required.",
  "Do not run staging smoke just to move backward over already-smoked checkpoints.",
  "Do run it after a new deploy-relevant runtime change.",
  "Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive data.",
  "Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive data.",
]) {
  assertIncludes(sequence, fragment, `sequence fragment ${fragment}`);
}

assertOrdered(sequence, [
  "1. Preserve the admin-only booking persistence and production verification evidence already recorded in the existing persistence evidence docs.",
  "2. Do not repeat completed persistence, RLS, staging, or production verification unless a new runtime/deploy/env change creates a fresh reason.",
  "3. Keep production persistence default OFF outside approved verification or activation windows.",
  "4. Treat customer auth/RLS, driver auth/token persistence, notifications, billing, payment, PDF, payout, live location, OTS photo proof, calendar, provider sending, parser changes, and production launch as later separately approved gates.",
  "5. The next runtime direction, if the owner explicitly approves runtime work, is the admin-only Confirmed Booking To Dispatch Release workflow described in `docs/business-workflow-resume-stage4a410.md`.",
]);

for (const fragment of [
  "Build the next approved app/business step as an admin-only **Confirmed Booking To Dispatch Release** workflow.",
  "Keep the first implementation admin-only and UI/local-state only unless William separately approves a narrow persistence update.",
  "A later implementation stage should be explicitly approved and should stay bounded to one admin dashboard workflow.",
]) {
  assertIncludes(workflow, fragment, `workflow reference ${fragment}`);
}

for (const fragment of [
  "[Business-Grade Forward Completion Sequence](business-grade-forward-completion-sequence.md)",
  "forward-only completion order after persistence evidence",
  "next runtime direction is admin-only Confirmed Booking To Dispatch Release only after explicit owner approval",
]) {
  assertIncludes(docsIndex, fragment, `docs index fragment ${fragment}`);
}

const ledgerSection = sectionBetween(ledger, "## Business-Grade Forward Completion Sequence Lock");

for (const fragment of [
  "Business-grade forward completion sequencing is locked by `docs/business-grade-forward-completion-sequence.md`.",
  "This is a docs/test-only lock; it does not approve runtime implementation, UI/API behavior change, UI sectors/buttons/cards, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.",
  "Do not repeat completed persistence, RLS, staging, or production verification unless a new runtime/deploy/env change creates a fresh reason.",
  "The next runtime direction, only after explicit owner approval, is admin-only Confirmed Booking To Dispatch Release from `docs/business-workflow-resume-stage4a410.md`.",
  "Without new owner approval, allowed forward work remains read-only audit, local tests/smokes, docs clarification, docs/test-only guard hardening, already-approved bug fixes, review, and commit.",
  "Testing and staging remain required at the correct layer; staging smoke is required after deploy-relevant runtime change and should not be used to move backward over already-smoked checkpoints.",
  "Business workflow resume Stage 4A-410 audit is registered in `scripts/test-preactivation-verification-suite.mjs` through `scripts/test-business-workflow-resume-stage4a410.mjs`; it keeps the Confirmed Booking To Dispatch Release recommendation docs/test-only and verifies the public customer booking request route does not expose internal admin review statuses.",
  "This lock adds `scripts/test-business-grade-forward-completion-sequence.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, fragment, `ledger sequence fragment ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite sequence guard registration");

for (const [label, text] of [
  ["sequence", sequence],
  ["ledgerSection", ledgerSection],
  ["docsIndex", docsIndex],
]) {
  assertNotMatches(text, /```(?:bash|sql)/i, `${label} runnable shell or SQL block`);
  assertNotMatches(
    text,
    /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}|kvvsg[a-z0-9]+hxatm/i,
    `${label} secret leak`,
  );
}

console.log("Business-grade forward completion sequence guard passed");
