import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const guardPath = "scripts/test-driver-customer-native-owner-governance-lock.mjs";

const [agents, ledger, preactivation, customerConfigSource, driverConfigSource] =
  await Promise.all([
    readFile("AGENTS.md", "utf8"),
    readFile("docs/current-implementation-ledger.md", "utf8"),
    readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
    readFile("customer-companion/app.json", "utf8"),
    readFile("driver-companion/app.json", "utf8"),
  ]);

const lockHeading =
  "# Owner-locked Driver and Customer Apple native apps — fresh approval required";
const lockStart = agents.indexOf(lockHeading);
assert.notEqual(lockStart, -1, "AGENTS.md must contain the native-app owner lock");

const nextHeading = agents.indexOf("\n# ", lockStart + lockHeading.length);
const lockSection = agents.slice(
  lockStart,
  nextHeading === -1 ? agents.length : nextHeading,
);

for (const requiredFragment of [
  "`driver-companion/`",
  "`customer-companion/`",
  "Driver Build 17",
  "Customer Build 12",
  "native source, configuration, package and lockfile",
  "permissions, entitlements, native bridges",
  "EAS, TestFlight and App Store release identity",
  "All Codex agents are read-only by default",
  "must ask for and receive fresh, explicit Admin/Owner approval",
  "There is no permanent designated engineer",
  "No agent may self-appoint",
  "infer or reuse authority from a prior approval",
  "transfer authority automatically",
  "perform an automatic handoff",
  "An unapproved replacement remains read-only",
  "only the engineer whom the Admin/Owner permits may perform that exact bound",
  "exact defect is first reproduced in the approved runtime surface",
  "focused regression guard",
  "implementation-ledger evidence",
  "complete no-cost native, privacy, release and downstream-consumer checks",
  "Paid EAS builds, TestFlight or App Store mutations",
  "Production deployments and data or provider writes",
  "separate exact action-time approval",
  "does not broadly lock remote web pages, APIs, Admin, invoice or billing surfaces",
  "preserve every established remote-page and API consumer",
  "repository governance instruction and regression contract",
  "cannot technically prevent a human or tool with filesystem or repository credentials from bypassing it",
  "enforce the read-only default and fresh exact Admin/Owner approval rule itself",
]) {
  assert.ok(
    lockSection.includes(requiredFragment),
    `Native-app owner lock missing: ${requiredFragment}`,
  );
}

for (const forbiddenFragment of [
  "`admin-companion/`",
  "lock every remote web page",
  "lock every API",
  "Lorentz",
  "/root/senior_customer_map",
  "designated current engineer",
]) {
  assert.equal(
    lockSection.includes(forbiddenFragment),
    false,
    `Native-app owner lock must not widen to: ${forbiddenFragment}`,
  );
}

const customer = JSON.parse(customerConfigSource).expo;
const driver = JSON.parse(driverConfigSource).expo;
assert.deepEqual(
  [
    customer.name,
    customer.ios.bundleIdentifier,
    customer.ios.buildNumber,
    customer.extra?.eas?.projectId,
  ],
  [
    "Prestige SG",
    "sg.prestigelimo.customer",
    "12",
    "ce71ff91-7f71-4297-bcef-edf420f94316",
  ],
  "Customer Build 12 native release identity must remain exact",
);
assert.deepEqual(
  [
    driver.name,
    driver.ios.bundleIdentifier,
    driver.ios.buildNumber,
    driver.extra?.eas?.projectId,
  ],
  [
    "Prestige SG Driver",
    "sg.prestigelimo.drivercompanion",
    "19",
    "2a797181-d09d-4384-8d01-583456e83c3e",
  ],
  "Approved Driver Build 19 native release identity must remain exact",
);

for (const requiredLedgerFragment of [
  "### Driver And Customer Apple Native App Owner Governance Lock (2026-08-27)",
  "Driver Build 17",
  "Customer Build 12",
  "There is no permanent designated engineer",
  "every Codex agent remains read-only by default",
  "fresh explicit Admin/Owner approval for that exact bounded task",
  "No agent may self-appoint",
  "infer or reuse a prior approval",
  "perform an automatic handoff",
  "unapproved replacement",
  "one Admin-to-Driver in-app message appeared and the Driver app-icon badge appeared",
  "does not claim notification tap/open targeting, badge reset",
  "Driver Build 17 `Job Completed` action passed",
  "Prestige SG Driver Build 18 Release Checkpoint (source checkpoint 2026-09-04)",
  "Build 17 remains the accepted physical TestFlight baseline",
  "Build 18 is only a prepared source checkpoint",
  "Prestige SG Driver Build 19 OTA Foundation TestFlight Release Checkpoint (source checkpoint 2026-09-05)",
  "Admin Build `7` and Customer Build `12` remain parked",
  "Admin received its JC in-app alert and app-icon badge",
  "Customer received its JC in-app alert and app-icon badge",
  "did not move automatically to Completed/History",
  "no booking mutation is part of this lock",
  "This is a repository instruction and guard, not an OS or GitHub ACL",
  guardPath,
]) {
  assert.ok(
    ledger.includes(requiredLedgerFragment),
    `Implementation ledger missing native governance evidence: ${requiredLedgerFragment}`,
  );
}

assert.ok(
  preactivation.includes(`script: "${guardPath}"`),
  "Native governance lock guard must run in preactivation verification",
);

console.log("Driver and Customer native owner governance lock guard passed.");
