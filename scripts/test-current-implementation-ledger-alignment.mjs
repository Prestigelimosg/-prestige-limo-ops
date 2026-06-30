import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const ledgerPath = "docs/current-implementation-ledger.md";

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

assert.equal(
  `${verifiedCheckpoint.checkpointHash} ${verifiedCheckpoint.checkpointTitle}`,
  `${pushedRuntimeCheckpoint.checkpointHash} ${pushedRuntimeCheckpoint.checkpointTitle}`,
  "Latest verified clean runtime checkpoint and pushed main/staging runtime checkpoint must stay aligned.",
);
assert.ok(
  ledger.includes("This file is the repo source of truth for Codex and future work."),
  "Ledger must clearly remain the repo source of truth.",
);

const gitLog = execFileSync("git", ["log", "--oneline", "--all"], {
  encoding: "utf8",
});

assert.ok(
  gitLog
    .split(/\r?\n/)
    .some((line) => line.startsWith(`${pushedRuntimeCheckpoint.checkpointHash} `)),
  "Ledger pushed runtime checkpoint hash must exist in git log --oneline.",
);

console.log("current implementation ledger alignment guard passed");
