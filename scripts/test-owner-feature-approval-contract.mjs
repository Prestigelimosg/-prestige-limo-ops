import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contractPath = "docs/owner-feature-approval-contract.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-owner-feature-approval-contract.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n## ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const [contract, docsIndex, ledger, preactivationSuite] = await Promise.all([
  readFile(contractPath, "utf8"),
  readFile(docsIndexPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(ledger, "## Owner Feature Approval Contract Lock");

for (const fragment of [
  "# Owner Feature Approval Contract",
  "do not add a new product feature unless the owner explicitly approves that feature",
  "It is docs/test-only.",
  "It does not approve runtime implementation, UI/API behavior change, new UI sectors, new buttons, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.",
  "`proceed`",
  "`move forward`",
  "`move to next`",
  "`next task`",
  "`keep moving`",
  "`continue`",
  "Those phrases may authorize bounded read-only verification, docs clarification, test/guard hardening, bug fixing for already-approved work, staging smoke, review, or commit work.",
  "They do not authorize a new product surface, workflow, button, route, provider integration, database behavior, live send, or customer/driver-visible feature.",
  "A new feature needs explicit owner approval naming the actual feature or behavior before implementation starts.",
  "If any of those are unclear, implementation must stop and ask for clarification before editing runtime code.",
  "read-only code or docs audit",
  "test-only or docs-only guard hardening",
  "bug fix for already-approved behavior",
  "Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, mock QA/dev archive",
  "Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, mock QA/dev archive",
  "Do not add a UI sector, card, or button unless the owner explicitly approves that exact UI behavior.",
  "If a future approved UI change is needed, it must stay compact, colocated with the existing similar area, and protected by matching tests.",
  "If a task would add a new feature and the owner has not explicitly approved that feature, stop before editing runtime code.",
]) {
  assertIncludes(contract, fragment, `owner feature approval contract phrase ${fragment}`);
}

for (const fragment of [
  "Owner Feature Approval Contract",
  "`docs/owner-feature-approval-contract.md`",
  "`scripts/test-owner-feature-approval-contract.mjs`",
  "Vague forward-motion phrases such as `proceed`, `move forward`, `move to next`, `next task`, `keep moving`, or `continue` are not approval to add a new product feature.",
  "Allowed without new-feature approval: read-only audits, local tests/smokes, docs clarification, docs/test-only guard hardening, already-approved bug fixes, review, and commit.",
  "Runtime implementation, UI/API behavior change, UI sectors/buttons/cards, endpoint migration, env change, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, and new shims still require explicit owner approval.",
  "This lock adds `scripts/test-owner-feature-approval-contract.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, fragment, `ledger owner feature approval fragment ${fragment}`);
}

for (const fragment of [
  "[Owner Feature Approval Contract](owner-feature-approval-contract.md)",
  "global no-new-feature-without-explicit-owner-approval rule",
  "vague forward-motion wording is not approval for UI/API/runtime behavior",
]) {
  assertIncludes(docsIndex, fragment, `docs index owner feature approval link ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation owner feature approval guard registration");

console.log("Owner feature approval contract guard passed");
