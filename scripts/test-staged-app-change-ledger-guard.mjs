import assert from "node:assert/strict";
import { execSync } from "node:child_process";

const explicitFilesIndex = process.argv.indexOf("--files");
const stagedDiffCommand = "git diff --cached --name-only --diff-filter=ACMR";
const stagedFiles = explicitFilesIndex === -1
  ? execSync(stagedDiffCommand, { encoding: "utf8" }).trim().split("\n").filter(Boolean)
  : process.argv.slice(explicitFilesIndex + 1);

const applicationPrefixes = ["app/", "components/", "lib/", "public/"];
const applicationFiles = new Set(["middleware.ts", "next.config.ts", "next.config.mjs"]);
const changesApplication = stagedFiles.some(
  (file) => applicationFiles.has(file) || applicationPrefixes.some((prefix) => file.startsWith(prefix)),
);

if (changesApplication) {
  assert.ok(
    stagedFiles.includes("docs/current-implementation-ledger.md"),
    "Application changes require the implementation ledger in the same staged commit.",
  );
  assert.ok(
    stagedFiles.some((file) => file.startsWith("scripts/test-") && file.endsWith(".mjs")),
    "Application changes require a focused scripts/test-*.mjs regression guard in the same staged commit.",
  );
}

console.log(
  changesApplication
    ? "Staged application change includes ledger and regression guard coverage."
    : "No staged application change requires ledger enforcement.",
);
