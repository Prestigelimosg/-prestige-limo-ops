import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contractPath = "docs/pre-edit-source-of-truth-contract.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-pre-edit-source-of-truth-contract.mjs";

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

const ledgerSection = sectionBetween(ledger, "## Pre-Edit Source Of Truth Contract Lock");

for (const fragment of [
  "# Pre-Edit Source Of Truth Contract",
  "required task-start and pre-edit inspection order",
  "It is docs/test-only.",
  "It does not approve runtime implementation, UI/API behavior change, new UI sectors, new buttons, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.",
  "Before choosing the next task, moving forward, or editing any repo file, read:",
  "recent git history, using `git log --oneline -12`",
  "current worktree state, using `git status --short`",
  "the current implementation ledger at `docs/current-implementation-ledger.md`",
  "This applies to every task, including docs-only, test-only, read-only, review, smoke, bug-fix, and commit work.",
  "The source-of-truth read must happen before selecting the forward lane",
  "Git history must be read first so the task is anchored to commit hashes and task names, not memory or checkpoint counters.",
  "The ledger must be read as the repo source of truth before choosing a task, adding docs, adding tests, changing UI/API/helper behavior, or committing.",
  "repeating completed work",
  "moving backward to old staging checkpoints",
  "treating vague forward-motion wording as approval for a new feature",
  "missing a parked risky lane",
  "moving to a next task without first checking the source-of-truth files",
  "editing over an unclean worktree without noticing",
  "using inconsistent checkpoint counters instead of commit hashes and task names",
  "Allowed without explicit new-feature approval:",
  "docs/test-only guard hardening",
  "Not allowed without explicit owner approval:",
  "new product features",
  "endpoint migration",
  "env changes or deployment",
  "parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, or new shims",
  "Final task summaries must name the commit hash and task name when a commit is made",
  "Do not report inconsistent checkpoint counters. Use commit hashes and task names as the source of truth.",
]) {
  assertIncludes(contract, fragment, `pre-edit source-of-truth contract phrase ${fragment}`);
}

for (const fragment of [
  "Pre-Edit Source Of Truth Contract",
  "`docs/pre-edit-source-of-truth-contract.md`",
  "`scripts/test-pre-edit-source-of-truth-contract.mjs`",
  "At every task start, before choosing the next task, moving forward, or editing any repo file, Codex must read recent git history first (`git log --oneline -12` or wider equivalent), current worktree state (`git status --short`), and `docs/current-implementation-ledger.md`.",
  "The ledger remains the repo source of truth before choosing a task, adding docs/tests, changing UI/API/helper behavior, or committing.",
  "This lock applies to docs-only, test-only, read-only, review, smoke, bug-fix, and commit work; it prevents moving to a next task without source-of-truth inspection",
  "This lock does not approve runtime implementation, UI/API behavior change, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.",
  "This lock adds `scripts/test-pre-edit-source-of-truth-contract.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, fragment, `ledger pre-edit source-of-truth fragment ${fragment}`);
}

for (const fragment of [
  "[Pre-Edit Source Of Truth Contract](pre-edit-source-of-truth-contract.md)",
  "task-start and pre-edit source-of-truth inspection order",
  "`git log --oneline -12`, `git status --short`, and `docs/current-implementation-ledger.md`",
  "before choosing next work or editing repo files",
]) {
  assertIncludes(docsIndex, fragment, `docs index pre-edit source-of-truth link ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation pre-edit source-of-truth guard registration");

console.log("Pre-edit source-of-truth contract guard passed");
