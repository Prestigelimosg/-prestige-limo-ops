import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const workflowPath = "docs/business-workflow-resume-stage4a410.md";
const sequencePath = "docs/business-grade-forward-completion-sequence.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-business-workflow-source-of-truth-after-confirmed-dispatch-release.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertNotMatches(source, pattern, label) {
  assert.doesNotMatch(source, pattern, `${label} must not match ${pattern}.`);
}

const [ledger, workflow, sequence, docsIndex, preactivationSuite] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(workflowPath, "utf8"),
  readFile(sequencePath, "utf8"),
  readFile(docsIndexPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

for (const [label, source] of [
  ["ledger", ledger],
  ["workflow", workflow],
  ["sequence", sequence],
  ["docsIndex", docsIndex],
]) {
  assertNotMatches(
    source,
    /next runtime direction(?:[^.\n]*Confirmed Booking To Dispatch Release|, only after explicit owner approval, is admin-only Confirmed Booking To Dispatch Release)/i,
    `${label} stale next-runtime direction`,
  );
  assertNotMatches(
    source,
    /next (?:approved app\/business step|sensible business-grade runtime task) (?:as|is) admin-only Confirmed Booking To Dispatch Release/i,
    `${label} stale next-task wording`,
  );
  assertNotMatches(source, /Documenting the next workflow direction\./, `${label} stale docs direction wording`);
}

for (const fragment of [
  "Confirmed Booking To Dispatch Release is complete",
  "confirmed-only eligibility is implemented and guarded",
  "staging smoke is recorded",
  "existing Dispatch Release workflow was reused without duplicate UI sector/button/card/route/helper/shim",
  "Any next runtime lane requires a fresh no-edit readiness audit plus explicit owner approval naming the lane",
  "Save Booking remains on `POST /api/admin-bookings`; `/api/admin-saved-bookings`, parser behavior, provider send, payment/PDF, pricing, payout, auth/location/photo/calendar, UI sectors/cards/buttons, and shims remain unchanged.",
]) {
  assertIncludes(ledger, fragment, `ledger source-of-truth fragment ${fragment}`);
}

for (const fragment of [
  "The previously recommended admin-only **Confirmed Booking To Dispatch Release** workflow is complete.",
  "`766f305 Guard confirmed dispatch release eligibility` implemented the confirmed-only Dispatch Release eligibility boundary.",
  "`ef080ee Record staging smoke for confirmed dispatch release` recorded and promoted the staging smoke evidence.",
  "Existing Dispatch Release checklist, mark-ready control, handoff packet, and `/api/admin-booking-workflow-statuses` integration are reused.",
  "No duplicate Dispatch Release UI sector/button/card/route/helper/shim was added.",
  "Planning a later UI-only/admin-only implementation stage only after a fresh no-edit readiness audit and explicit owner approval naming the lane.",
]) {
  assertIncludes(workflow, fragment, `workflow source-of-truth fragment ${fragment}`);
}

for (const fragment of [
  "Confirmed Booking To Dispatch Release is complete: confirmed-only eligibility is implemented, the existing Dispatch Release workflow is reused, staging smoke is recorded, and no duplicate Dispatch Release UI sector/button/card/route/helper/shim was added.",
  "The next runtime lane is not auto-selected by this sequence. It requires a fresh no-edit readiness audit and explicit owner approval naming the lane.",
  "Confirmed Booking To Dispatch Release must not be repeated as the next runtime task.",
]) {
  assertIncludes(sequence, fragment, `sequence source-of-truth fragment ${fragment}`);
}

for (const fragment of [
  "treat Confirmed Booking To Dispatch Release as complete",
  "fresh no-edit readiness audit plus explicit owner approval before any next runtime lane",
  "prevents stale source-of-truth wording from pulling future work backward into a completed Dispatch Release lane",
]) {
  assertIncludes(docsIndex, fragment, `docs index source-of-truth fragment ${fragment}`);
}

for (const [label, source] of [
  ["ledger", ledger],
  ["workflow", workflow],
  ["sequence", sequence],
  ["docsIndex", docsIndex],
]) {
  assertNotMatches(source, /opens? (?:live|production|runtime) activation/i, `${label} live activation claim`);
  assertNotMatches(source, /approved (?:live|production) (?:DB write|provider send|payment|payout|auth|location|photo|calendar)/i, `${label} live approval claim`);
  assertNotMatches(source, /```(?:bash|sql)/i, `${label} runnable shell or SQL block`);
  assertNotMatches(
    source,
    /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}|kvvsg[a-z0-9]+hxatm/i,
    `${label} secret leak`,
  );
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite source-of-truth guard registration");

console.log("Business workflow source-of-truth after confirmed Dispatch Release guard passed");
