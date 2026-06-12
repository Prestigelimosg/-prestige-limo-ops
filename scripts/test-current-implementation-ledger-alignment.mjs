import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const ledgerPath = "docs/current-implementation-ledger.md";

assert.equal(fs.existsSync(ledgerPath), true, "Current implementation ledger must exist.");

const ledger = fs.readFileSync(ledgerPath, "utf8");
const lines = ledger.split(/\r?\n/);
const checkpointMarker = "Latest known clean checkpoint:";
const checkpointMarkerIndex = lines.findIndex((line) => line.trim() === checkpointMarker);

assert.notEqual(checkpointMarkerIndex, -1, "Ledger must contain latest checkpoint marker.");

const checkpointLine = lines[checkpointMarkerIndex + 1]?.trim() || "";
const checkpointMatch = checkpointLine.match(/^([0-9a-f]{7,12})\s+(.+)$/i);

assert.ok(
  checkpointMatch,
  "Ledger checkpoint line must look like a short git hash plus commit title.",
);

const [, checkpointHash, checkpointTitle] = checkpointMatch;

assert.ok(checkpointTitle.trim().length > 0, "Ledger checkpoint title must be present.");
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
    .some((line) => line.startsWith(`${checkpointHash} `)),
  "Ledger checkpoint hash must exist in git log --oneline.",
);

console.log("current implementation ledger alignment guard passed");
