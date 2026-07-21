import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";

const ledgerPath = "docs/current-implementation-ledger.md";
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

assert.equal(fs.existsSync(ledgerPath), true, "Current implementation ledger must exist.");

const ledger = fs.readFileSync(ledgerPath, "utf8");
const lines = ledger.split(/\r?\n/);

function lineAfterMarker(marker, label) {
  const markerIndex = lines.findIndex((line) => line.trim() === marker);

  assert.notEqual(markerIndex, -1, `Ledger must contain ${label} marker.`);

  return lines[markerIndex + 1]?.trim() || "";
}

function parseCheckpointLine(checkpointLine, label) {
  const checkpointMatch = checkpointLine.match(/^([0-9a-f]{7,12})\s+(.+)$/i);

  assert.ok(
    checkpointMatch,
    `${label} line must look like a short git hash plus commit title.`,
  );

  const [, checkpointHash, checkpointTitle] = checkpointMatch;
  assert.ok(checkpointTitle.trim().length > 0, `${label} title must be present.`);

  return { checkpointHash, checkpointTitle };
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
  assert.equal(
    commit.fullHash.startsWith(checkpoint.checkpointHash),
    true,
    `${label} hash must match its Git commit.`,
  );
  assert.equal(
    checkpoint.checkpointTitle,
    commit.title,
    `${label} title must match its Git commit title.`,
  );
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
      const runtimeCommit = readLatestRuntimeCommit(
        ref,
        `Latest runtime commit reachable from ${ref}`,
      );
      const ancestor = spawnSync("git", [
        "merge-base",
        "--is-ancestor",
        runtimeCommit.fullHash,
        "HEAD",
      ]);

      if (ancestor.status !== 0) {
        return null;
      }

      const distance = Number(
        execFileSync(
          "git",
          ["rev-list", "--count", `${runtimeCommit.fullHash}..HEAD`],
          { encoding: "utf8" },
        ).trim(),
      );

      return { distance, ref };
    })
    .filter(Boolean)
    .sort((left, right) => left.distance - right.distance || left.ref.localeCompare(right.ref));

  assert.ok(
    candidates.length > 0,
    "HEAD must descend from the latest runtime commit on local origin/main or origin/staging.",
  );

  return candidates[0].ref;
}

const verifiedLine = lines
  .map((line, index) => ({ line: line.trim(), index }))
  .find(({ line }) => line === "Latest verified clean runtime checkpoint:");

assert.ok(verifiedLine, "Ledger must contain latest verified clean runtime checkpoint marker.");

const verifiedCheckpoint = parseCheckpointLine(
  lines[verifiedLine.index + 1]?.trim() || "",
  "Latest verified clean runtime checkpoint",
);
const pushedRuntimeCheckpoint = parseCheckpointLine(
  lineAfterMarker("Latest pushed main/staging runtime checkpoint:", "latest pushed main/staging runtime checkpoint"),
  "Latest pushed main/staging runtime checkpoint",
);
const remoteDeploymentCheckpoint = parseCheckpointLine(
  lineAfterMarker(
    "Latest remote main/staging deployment checkpoint verified before this docs note:",
    "latest remote main/staging deployment checkpoint",
  ),
  "Latest remote main/staging deployment checkpoint",
);
assert.ok(
  ledger.includes("This file is the repo source of truth for Codex and future work."),
  "Ledger must clearly remain the repo source of truth.",
);

const verifiedCommit = readLatestRuntimeCommit("HEAD", "Latest local runtime checkpoint");
const trackedPushedRef = trackedPushedRefForHead();
const trackedPushedRuntimeCommit = readLatestRuntimeCommit(
  trackedPushedRef,
  "Latest runtime commit reachable from the current origin/main or origin/staging lineage",
);
const trackedPushedCommit = readGitCommit(
  trackedPushedRef,
  "Exact local origin/main or origin/staging tracking ref",
);
const deployedCommit = readGitCommit(
  remoteDeploymentCheckpoint.checkpointHash,
  "Remote deployment checkpoint",
);
const deployedRuntimeCommit = readLatestRuntimeCommit(
  remoteDeploymentCheckpoint.checkpointHash,
  "Latest runtime commit reachable from remote deployment checkpoint",
);

assertCheckpointMatchesCommit(
  verifiedCheckpoint,
  verifiedCommit,
  "Latest verified clean runtime checkpoint",
);
assertCheckpointMatchesCommit(
  pushedRuntimeCheckpoint,
  trackedPushedRuntimeCommit,
  "Latest pushed main/staging runtime checkpoint",
);
assertCheckpointMatchesCommit(
  remoteDeploymentCheckpoint,
  deployedCommit,
  "Latest remote main/staging deployment checkpoint",
);
assertAncestor(
  pushedRuntimeCheckpoint.checkpointHash,
  verifiedCheckpoint.checkpointHash,
  "The pushed checkpoint must be an ancestor of the verified local checkpoint.",
);
assertAncestor(
  deployedRuntimeCommit.fullHash,
  pushedRuntimeCheckpoint.checkpointHash,
  "The runtime reachable from the verified deployed checkpoint must not be ahead of or unrelated to the pushed runtime checkpoint.",
);
assertAncestor(
  remoteDeploymentCheckpoint.checkpointHash,
  trackedPushedCommit.fullHash,
  "The exact verified deployed checkpoint must be reachable from the current pushed branch lineage.",
);

console.log("current implementation ledger alignment guard passed");
