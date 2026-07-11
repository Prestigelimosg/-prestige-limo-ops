import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [config, adminPage, customerPage, driverPage, ledger] = await Promise.all([
  readFile("next.config.ts", "utf8"),
  readFile("app/page.tsx", "utf8"),
  readFile("app/my-bookings/page.tsx", "utf8"),
  readFile("app/driver-job/[token]/page.tsx", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
]);

for (const fragment of [
  "VERCEL_GIT_COMMIT_SHA",
  'execFileSync("git", ["rev-parse", "HEAD"]',
  "PRESTIGE_BUILD_COMMIT",
]) {
  assert.ok(config.includes(fragment), `next.config.ts missing deployment marker source: ${fragment}`);
}

for (const fragment of [
  'data-admin-deployment-commit-marker="true"',
  'data-admin-deployment-commit-sha={deployedBuildCommit}',
  "Build {deployedBuildCommitShort}",
]) {
  assert.ok(adminPage.includes(fragment), `admin header missing deployment marker: ${fragment}`);
}

for (const [label, source] of [
  ["customer", customerPage],
  ["driver", driverPage],
]) {
  assert.equal(
    /PRESTIGE_BUILD_COMMIT|data-admin-deployment-commit-marker|Build \{deployedBuildCommitShort\}/.test(source),
    false,
    `${label} page must not expose the admin deployment marker`,
  );
}

assert.ok(
  ledger.includes("The existing admin header shows the deployed build commit marker"),
  "implementation ledger missing admin deployment marker lock",
);

console.log("Admin deployment commit marker guard passed.");
