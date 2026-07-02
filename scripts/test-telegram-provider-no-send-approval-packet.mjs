import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledger = await readFile("docs/current-implementation-ledger.md", "utf8");
const preactivationSuite = await readFile("scripts/test-preactivation-verification-suite.mjs", "utf8");
const liveSendGuardPath = "scripts/test-telegram-internal-admin-alert-live-send-guard.mjs";

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const supersessionSection = sectionBetween(
  ledger,
  "### Telegram Provider Activation Packet Supersession Lock",
);
const activationSection = sectionBetween(
  ledger,
  "## Telegram Internal Admin Alert Live Send Activation Lock",
  "\n## ",
);

for (const phrase of [
  "The previous Telegram no-send approval packet is superseded by the approved `Telegram Internal Admin Alert Live Send Activation Lock`.",
  "The only approved live provider path is `POST /api/admin-telegram-internal-admin-alert-send`.",
  "Provider env values, bot tokens, chat IDs, cookies, API keys, database URLs, and secrets must never be printed, logged, committed, screenshot, or returned to the browser.",
]) {
  assert.equal(supersessionSection.includes(phrase), true, `Missing supersession phrase: ${phrase}`);
}

assert.equal(
  activationSection.includes("Approval status: approved by William from Codex mobile"),
  true,
  "Telegram activation approval must be recorded.",
);
assert.equal(
  preactivationSuite.includes(liveSendGuardPath),
  true,
  "The live-send guard must replace the old no-send packet in the preactivation suite.",
);

console.log("Telegram provider no-send packet supersession guard passed.");
