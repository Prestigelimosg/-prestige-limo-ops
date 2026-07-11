import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const agents = await readFile("AGENTS.md", "utf8");
const packageJson = JSON.parse(await readFile("package.json", "utf8"));

for (const requiredRule of [
  "Before proposing, testing, or editing a feature",
  "docs/current-implementation-ledger.md",
  "git status --short --branch",
  "git log --oneline -10",
  "Search the existing app, routes, docs, and focused guard scripts for the requested workflow",
  "Run the existing focused guard before changing the workflow",
  "Treat documented behavior with a passing guard as already implemented unless the exact workflow is reproduced as broken in the approved runtime surface",
  "Do not add a second lane, panel, route, helper, button, or write path for an existing workflow",
  "Record every approved fix in the implementation ledger and protect it with a focused regression guard",
  "npm run guard:staged-app-change",
  "Until the owner explicitly declares that real operations have started",
  "existing booking, driver, and customer records may be reused as test data",
  "Prefer reusing an existing test record over creating a duplicate",
  "This test-data permission does not authorize external sends",
  "payment, payout, PayNow, invoice, billing, GPS, provider, authentication, environment, or Supabase configuration changes",
]) {
  assert.ok(agents.includes(requiredRule), `AGENTS.md missing startup workflow rule: ${requiredRule}`);
}

assert.equal(
  packageJson.scripts?.["guard:staged-app-change"],
  "node scripts/test-staged-app-change-ledger-guard.mjs",
  "package.json must expose the staged app-change ledger guard",
);

const stagedGuard = await readFile("scripts/test-staged-app-change-ledger-guard.mjs", "utf8");
for (const requiredFragment of [
  "git diff --cached --name-only --diff-filter=ACMR",
  "docs/current-implementation-ledger.md",
  "scripts/test-",
  "Application changes require the implementation ledger",
]) {
  assert.ok(stagedGuard.includes(requiredFragment), `staged app-change guard missing: ${requiredFragment}`);
}

console.log("Agent startup workflow guard passed.");
