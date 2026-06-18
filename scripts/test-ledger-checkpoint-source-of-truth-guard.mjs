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

function sectionsForHeadings(source, headingPattern, nextHeadingPattern = /\n### /g) {
  const sections = [];
  const matcher = new RegExp(headingPattern.source, headingPattern.flags.includes("g") ? headingPattern.flags : `${headingPattern.flags}g`);
  let match;

  while ((match = matcher.exec(source)) !== null) {
    sections.push(sectionBetween(source.slice(match.index), match[0], nextHeadingPattern));
  }

  return sections;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

const topStagingMatch = ledger.match(
  /^Latest staging-smoked app checkpoint:\n([0-9a-f]{7,12}) (.+)$/m,
);
assert.ok(
  topStagingMatch,
  "Top latest staging-smoked app checkpoint must be a short git hash plus task name.",
);

const [, topShortHash, topTaskName] = topStagingMatch;
assert.ok(topTaskName.trim().length > 0, "Top staging-smoked checkpoint task name must be present.");

const topVerifiedMatch = ledger.match(
  /^Latest verified clean checkpoint before .+:\n([0-9a-f]{7,12}) (.+)$/m,
);
assert.ok(
  topVerifiedMatch,
  "Top latest verified clean checkpoint must be a short git hash plus task name.",
);

const nextGptLock = sectionBetween(
  ledger,
  "## Next GPT Lock / Uncompleted Backlog",
  /\n## /g,
);
const nextCheckpointMatch = nextGptLock.match(
  /- Latest (?:implementation|staging-smoked app) checkpoint to preserve: `([0-9a-f]{7,12}) ([^`]+)`; `origin\/staging` points to `([0-9a-f]{40})`\./,
);
assert.ok(
  nextCheckpointMatch,
  "Next GPT Lock must name the preserved checkpoint and the full origin/staging hash.",
);

const [, nextShortHash, nextTaskName, originStagingHash] = nextCheckpointMatch;

assert.equal(
  `${nextShortHash} ${nextTaskName}`,
  `${topShortHash} ${topTaskName}`,
  "Top latest staging-smoked app checkpoint must match the Next GPT Lock preserved checkpoint.",
);
assert.equal(
  originStagingHash.startsWith(topShortHash),
  true,
  "Full origin/staging hash must start with the top checkpoint short hash.",
);

const checkpointLabelPattern = new RegExp(
  `\\(\\\`?${escapeRegExp(topShortHash)} ${escapeRegExp(topTaskName)}\\\`?\\)`,
);
const stagingSmokeSections = sectionsForHeadings(ledger, /^### Staging[^\n]*$/m);
const latestSmokeSection = stagingSmokeSections.find(
  (section) => section.includes(`\`${originStagingHash}\``) && checkpointLabelPattern.test(section),
);

assert.ok(
  latestSmokeSection,
  "Ledger must keep a staging smoke section for the top checkpoint and origin/staging hash.",
);

assertIncludes(
  latestSmokeSection,
  `origin/staging\` points to \`${originStagingHash}\``,
  "Latest staging smoke origin/staging full hash",
);
assert.equal(
  checkpointLabelPattern.test(latestSmokeSection),
  true,
  "Latest staging smoke must name the same short hash and task name.",
);

for (const phrase of [
  "No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.",
  "0 non-GET requests",
  "0 non-200 responses",
  "0 missing responses",
  "Browser console error logs: 0.",
  "Browser runtime exceptions: 0.",
  "Browser dialogs/security prompts: 0.",
  "Screenshot captured: false.",
]) {
  assertIncludes(latestSmokeSection, phrase, `Latest staging smoke phrase: ${phrase}`);
}

const ledgerSection = sectionBetween(ledger, "### Ledger Checkpoint Source-of-Truth Guard Lock");

for (const phrase of [
  "Ledger checkpoint source-of-truth consistency is guarded.",
  "This is a docs/test-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.",
  "Checkpoint state must be recorded by commit hash and task name, not counters.",
  "The top latest staging-smoked app checkpoint must match the Next GPT Lock staging-smoked or implementation checkpoint line.",
  "The latest staging smoke section for the top checkpoint must name the same short hash and the full 40-character `origin/staging` hash.",
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
