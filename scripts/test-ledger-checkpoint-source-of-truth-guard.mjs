import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-ledger-checkpoint-source-of-truth-guard.mjs";
const runtimePathspecs = [
  "app",
  "lib",
  "public",
  "supabase",
  "next.config.ts",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
];

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

function readGitCommit(ref, label) {
  const output = execFileSync("git", ["show", "-s", "--format=%H%x00%s", ref], {
    encoding: "utf8",
  }).trim();
  const [fullHash, title] = output.split("\0");

  assert.match(fullHash || "", /^[0-9a-f]{40}$/i, `${label} must resolve to a Git commit.`);
  assert.ok(title?.trim(), `${label} commit title must be present.`);

  return { fullHash, title: title.trim() };
}

function readLatestRuntimeCommit(ref, label) {
  const output = execFileSync(
    "git",
    ["log", "-1", "--format=%H%x00%s", ref, "--", ...runtimePathspecs],
    { encoding: "utf8" },
  ).trim();
  const [fullHash, title] = output.split("\0");

  assert.match(fullHash || "", /^[0-9a-f]{40}$/i, `${label} must resolve to a Git commit.`);
  assert.ok(title?.trim(), `${label} commit title must be present.`);

  return { fullHash, title: title.trim() };
}

function assertCheckpointMatchesCommit(checkpoint, commit, label) {
  assert.equal(commit.fullHash.startsWith(checkpoint.hash), true, `${label} hash must match Git.`);
  assert.equal(checkpoint.title, commit.title, `${label} title must match Git.`);
}

function assertAncestor(ancestor, descendant, label) {
  const result = spawnSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, label);
}

function trackedPushedRefForHead() {
  const candidates = ["refs/remotes/origin/main", "refs/remotes/origin/staging"]
    .map((ref) => {
      const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", ref, "HEAD"]);

      if (ancestor.status !== 0) {
        return null;
      }

      const distance = Number(
        execFileSync("git", ["rev-list", "--count", `${ref}..HEAD`], {
          encoding: "utf8",
        }).trim(),
      );

      return { distance, ref };
    })
    .filter(Boolean)
    .sort((left, right) => left.distance - right.distance || left.ref.localeCompare(right.ref));

  assert.ok(
    candidates.length > 0,
    "HEAD must descend from the local origin/main or origin/staging tracking ref.",
  );

  return candidates[0].ref;
}

function checkpointFromMatch(match, label) {
  assert.ok(match, `${label} must be a short git hash plus task name.`);
  const [, hash, title] = match;

  assert.ok(title.trim().length > 0, `${label} task name must be present.`);

  return { hash, title: title.trim() };
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

const topRuntimeCheckpoint = checkpointFromMatch(
  topRuntimeMatch,
  "Top latest verified clean runtime checkpoint",
);

const topPushedRuntimeMatch = ledger.match(
  /^Latest pushed main\/staging runtime checkpoint:\n([0-9a-f]{7,12}) (.+)$/m,
);
assert.ok(
  topPushedRuntimeMatch,
  "Top latest pushed main/staging runtime checkpoint must be a short git hash plus task name.",
);

const topPushedRuntimeCheckpoint = checkpointFromMatch(
  topPushedRuntimeMatch,
  "Top latest pushed main/staging runtime checkpoint",
);

const topRemoteDeploymentMatch = ledger.match(
  /^Latest remote main\/staging deployment checkpoint verified before this docs note:\n([0-9a-f]{7,12}) (.+)$/m,
);
assert.ok(
  topRemoteDeploymentMatch,
  "Top latest remote main/staging deployment checkpoint must be a short git hash plus task name.",
);
const topRemoteDeploymentCheckpoint = checkpointFromMatch(
  topRemoteDeploymentMatch,
  "Top latest remote main/staging deployment checkpoint",
);

const topRuntimeCommit = readLatestRuntimeCommit("HEAD", "Latest local runtime checkpoint");
const trackedPushedRef = trackedPushedRefForHead();
const trackedPushedRuntimeCommit = readLatestRuntimeCommit(
  trackedPushedRef,
  "Latest runtime commit reachable from the current origin/main or origin/staging lineage",
);
const trackedPushedCommit = readGitCommit(
  trackedPushedRef,
  "Exact local origin/main or origin/staging tracking ref",
);
const topRemoteCommit = readGitCommit(
  topRemoteDeploymentCheckpoint.hash,
  "Top remote deployment checkpoint",
);
const topRemoteRuntimeCommit = readLatestRuntimeCommit(
  topRemoteDeploymentCheckpoint.hash,
  "Latest runtime commit reachable from top remote deployment checkpoint",
);

assertCheckpointMatchesCommit(
  topRuntimeCheckpoint,
  topRuntimeCommit,
  "Top latest verified clean runtime checkpoint",
);
assertCheckpointMatchesCommit(
  topPushedRuntimeCheckpoint,
  trackedPushedRuntimeCommit,
  "Top latest pushed main/staging runtime checkpoint",
);
assertCheckpointMatchesCommit(
  topRemoteDeploymentCheckpoint,
  topRemoteCommit,
  "Top latest remote main/staging deployment checkpoint",
);
assertAncestor(
  topPushedRuntimeCheckpoint.hash,
  topRuntimeCheckpoint.hash,
  "The pushed checkpoint must be an ancestor of the verified local checkpoint.",
);
assertAncestor(
  topRemoteRuntimeCommit.fullHash,
  topPushedRuntimeCheckpoint.hash,
  "The runtime reachable from the deployed checkpoint must not be ahead of or unrelated to the pushed runtime checkpoint.",
);
assertAncestor(
  topRemoteDeploymentCheckpoint.hash,
  trackedPushedCommit.fullHash,
  "The exact deployed checkpoint must be reachable from the current pushed branch lineage.",
);

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
  "The top latest verified clean runtime checkpoint may be ahead of the latest pushed main/staging runtime checkpoint while tested application commits remain local; each line must record its own actual commit hash and task name.",
  "The verified local checkpoint is checked against the newest `HEAD` commit touching the established application, server, database, or runtime-configuration paths, so a newer local runtime change cannot remain hidden behind an older checkpoint.",
  "The latest pushed main/staging runtime checkpoint is checked against the newest runtime commit on the closest local `origin/main` or `origin/staging` tracking ref that is an ancestor of `HEAD`, and the guard fails instead of crossing unrelated branch lineages, treating a later docs-only commit as a runtime checkpoint, or accepting one hard-coded historical checkpoint.",
  "The top latest remote main/staging deployment checkpoint must remain recorded as the most recent verified deployed reference on the current pushed branch lineage by exact commit hash and task name; its newest reachable runtime commit must not be ahead of the pushed runtime checkpoint.",
  "The protected combined-automation Preview pushed docs-only evidence commit `4a318f14 Record combined automation Preview evidence` after runtime commit `5c0f6392 Automate monthly invoice draft preparation`; the guard now validates those separate facts without forcing either checkpoint to carry a false title or hash.",
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
