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

const topRemoteStagingMatch = ledger.match(
  /^Latest remote staging branch head:\n([0-9a-f]{7,12}) (.+)$/m,
);
assert.ok(
  topRemoteStagingMatch,
  "Top latest remote staging branch head must be a short git hash plus task name.",
);
const [, topRemoteShortHash, topRemoteTaskName] = topRemoteStagingMatch;
assert.ok(topRemoteTaskName.trim().length > 0, "Top remote staging branch-head task name must be present.");

const nextGptLock = sectionBetween(
  ledger,
  "## Next GPT Lock / Uncompleted Backlog",
  /\n## /g,
);
const nextAppCheckpointMatch = nextGptLock.match(
  /- Latest (?:implementation|staging-smoked app) checkpoint to preserve: `([0-9a-f]{7,12}) ([^`]+)`\./,
);
assert.ok(
  nextAppCheckpointMatch,
  "Next GPT Lock must name the preserved app checkpoint.",
);

const nextRemoteCheckpointMatch = nextGptLock.match(
  /- Latest `origin\/staging` branch head to preserve: `([0-9a-f]{40})` \(`([0-9a-f]{7,12}) ([^`]+)`\), docs-only smoke record for `([0-9a-f]{7,12}) ([^`]+)`, verified directly with `git ls-remote`\./,
);
assert.ok(
  nextRemoteCheckpointMatch,
  "Next GPT Lock must name the current full origin/staging branch-head hash and the app checkpoint it records.",
);

const [
  ,
  originStagingHash,
  nextRemoteShortHash,
  nextRemoteTaskName,
  recordedAppShortHash,
  recordedAppTaskName,
] = nextRemoteCheckpointMatch;
const [, nextShortHash, nextTaskName] = nextAppCheckpointMatch;

assert.equal(
  `${nextShortHash} ${nextTaskName}`,
  `${topShortHash} ${topTaskName}`,
  "Top latest staging-smoked app checkpoint must match the Next GPT Lock preserved checkpoint.",
);
assert.equal(
  `${recordedAppShortHash} ${recordedAppTaskName}`,
  `${topShortHash} ${topTaskName}`,
  "Latest origin/staging branch head must identify the same staging-smoked app checkpoint it records.",
);
assert.equal(
  `${nextRemoteShortHash} ${nextRemoteTaskName}`,
  `${topRemoteShortHash} ${topRemoteTaskName}`,
  "Top remote staging branch head must match the Next GPT Lock branch-head checkpoint.",
);
assert.equal(
  originStagingHash.startsWith(nextRemoteShortHash),
  true,
  "Full origin/staging branch-head hash must start with the remote branch-head short hash.",
);

const stagingSmokeSections = sectionsForHeadings(ledger, /^### Staging[^\n]*$/m);
const latestSmokeSection = stagingSmokeSections.find(
  (section) => section.includes(`\`${originStagingHash}\``) && section.includes(`${topShortHash} ${topTaskName}`),
);

assert.ok(
  latestSmokeSection,
  "Ledger must keep a staging smoke section for the top app checkpoint and current origin/staging branch-head hash.",
);

assertIncludes(
  latestSmokeSection,
  `origin/staging\` points to \`${originStagingHash}\``,
  "Latest staging smoke current origin/staging branch-head full hash",
);
assert.equal(
  latestSmokeSection.includes(`${topShortHash} ${topTaskName}`),
  true,
  "Latest staging smoke must name the same staging-smoked app short hash and task name.",
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
  "The latest staging smoke section for the top app checkpoint must name the same app short hash and the current full 40-character `origin/staging` branch-head hash, including docs-only smoke records pushed after the app smoke.",
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
