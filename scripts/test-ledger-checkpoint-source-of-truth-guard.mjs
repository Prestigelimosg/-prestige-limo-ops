import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-ledger-checkpoint-source-of-truth-guard.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, pattern, label) {
  assert.equal(pattern.test(source), false, `${label} must not match ${pattern}.`);
}

function sectionBetween(source, startHeading, nextHeadingPattern = /\n### /g) {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);

  nextHeadingPattern.lastIndex = start + startHeading.length;
  const next = nextHeadingPattern.exec(source);

  return next ? source.slice(start, next.index) : source.slice(start);
}

const [ledger, preactivationSuite] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

assertIncludes(
  ledger,
  "This file is the repo source of truth for Codex and future work.",
  "Ledger source-of-truth purpose",
);

const topRuntimeMatch = ledger.match(
  /^Latest verified clean runtime checkpoint:\n([0-9a-f]{7,12}) (.+)$/m,
);
assert.ok(
  topRuntimeMatch,
  "Top latest verified clean runtime checkpoint must be a short git hash plus task name.",
);

const [, topRuntimeShortHash, topRuntimeTaskName] = topRuntimeMatch;
assert.ok(topRuntimeTaskName.trim().length > 0, "Top runtime checkpoint task name must be present.");

const topPushedRuntimeMatch = ledger.match(
  /^Latest pushed main\/staging runtime checkpoint:\n([0-9a-f]{7,12}) (.+)$/m,
);
assert.ok(
  topPushedRuntimeMatch,
  "Top latest pushed main/staging runtime checkpoint must be a short git hash plus task name.",
);

const [, topPushedRuntimeShortHash, topPushedRuntimeTaskName] = topPushedRuntimeMatch;
assert.ok(topPushedRuntimeTaskName.trim().length > 0, "Top pushed runtime checkpoint task name must be present.");
assert.equal(
  `${topPushedRuntimeShortHash} ${topPushedRuntimeTaskName}`,
  `${topRuntimeShortHash} ${topRuntimeTaskName}`,
  "Top pushed runtime checkpoint must match the verified clean runtime checkpoint.",
);

const topRemoteDeploymentMatch = ledger.match(
  /^Latest remote main\/staging deployment checkpoint verified before this docs note:\n([0-9a-f]{7,12}) (.+)$/m,
);
assert.ok(
  topRemoteDeploymentMatch,
  "Top latest remote main/staging deployment checkpoint must be a short git hash plus task name.",
);
const [, topRemoteShortHash, topRemoteTaskName] = topRemoteDeploymentMatch;
assert.ok(topRemoteShortHash.trim().length > 0, "Top remote deployment checkpoint hash must be present.");
assert.ok(topRemoteTaskName.trim().length > 0, "Top remote deployment checkpoint task name must be present.");

const nextGptLock = sectionBetween(
  ledger,
  "## Next GPT Lock / Uncompleted Backlog",
  /\n## /g,
);

const ledgerSection = sectionBetween(ledger, "### Ledger Checkpoint Source-of-Truth Guard Lock");

for (const phrase of [
  "Ledger checkpoint source-of-truth consistency is guarded.",
  "This is a docs/test-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.",
  "Checkpoint state must be recorded by commit hash and task name, not counters.",
  "The top latest verified clean runtime checkpoint must match the latest pushed main/staging runtime checkpoint line.",
  "The top latest remote main/staging deployment checkpoint must remain recorded as the most recent verified deployed reference by commit hash and task name; it can differ from the runtime checkpoint when docs-only or non-deployed commits exist.",
  "No inconsistent checkpoint counters are approved.",
  "This lock adds `scripts/test-ledger-checkpoint-source-of-truth-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Ledger checkpoint guard phrase: ${phrase}`);
}

for (const forbiddenPattern of [
  /checkpoint\s*(?:#|number|counter)\s*\d+/i,
  /checkpoint\s+\d+\s*:/i,
  /checkpoint\s+counter:/i,
]) {
  assertExcludes(nextGptLock, forbiddenPattern, "Next GPT Lock checkpoint counter wording");
  assertExcludes(ledgerSection, forbiddenPattern, "Ledger checkpoint guard counter wording");
}

assertIncludes(preactivationSuite, guardScript, "preactivation ledger checkpoint guard registration");

console.log("Ledger checkpoint source-of-truth guard passed");
