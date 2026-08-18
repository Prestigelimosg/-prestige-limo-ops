import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  config,
  adminPage,
  customerPage,
  customerBookingPage,
  driverPage,
  driverPortalPage,
  publicBuildMarker,
  ledger,
  preactivationSuite,
] = await Promise.all([
  readFile("next.config.ts", "utf8"),
  readFile("app/page.tsx", "utf8"),
  readFile("app/my-bookings/page.tsx", "utf8"),
  readFile("app/book/page.tsx", "utf8"),
  readFile("app/driver-job/[token]/page.tsx", "utf8"),
  readFile("app/driver-portal/page.tsx", "utf8"),
  readFile("app/public-app-build-marker.tsx", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
  readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
]);

for (const fragment of [
  "VERCEL_GIT_COMMIT_SHA",
  'execFileSync("git", ["rev-parse", "HEAD"]',
  "PRESTIGE_BUILD_COMMIT",
  "PRESTIGE_PUBLIC_BUILD_COMMIT",
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

for (const fragment of [
  "process.env.PRESTIGE_PUBLIC_BUILD_COMMIT",
  '/^[a-f0-9]{8}$/.test(configuredPublicBuildCommit)',
  'data-public-app-build-marker="true"',
  "Build {publicBuildCommit}",
]) {
  assert.ok(publicBuildMarker.includes(fragment), `shared public build marker missing: ${fragment}`);
}

assert.equal(
  publicBuildMarker.includes("process.env.PRESTIGE_BUILD_COMMIT"),
  false,
  "shared public build marker must never read the admin full commit",
);
assert.equal(
  /data-public-app-build-marker=\{publicBuildCommit\}|title=\{publicBuildCommit\}/.test(publicBuildMarker),
  false,
  "shared public build marker must not place the commit in attributes or titles",
);

for (const [label, source] of [
  ["driver job", driverPage],
  ["driver portal", driverPortalPage],
]) {
  assert.ok(
    source.includes('import { PublicAppBuildMarker } from "@/app/public-app-build-marker";'),
    `${label} must reuse the shared public build marker`,
  );
  assert.ok(
    /<PublicAppBuildMarker(?: tone="dark")? \/>/.test(source),
    `${label} must render the shared public build marker`,
  );
  assert.equal(
    /PRESTIGE_BUILD_COMMIT|data-admin-deployment-commit-marker|deployedBuildCommit/.test(source),
    false,
    `${label} must not expose the admin full deployment marker`,
  );
}

assert.equal(
  /PublicAppBuildMarker|data-public-app-build-marker/.test(customerPage),
  false,
  "compact customer My Bookings header must not render a build marker",
);

assert.equal(
  /PublicAppBuildMarker|PRESTIGE_(?:PUBLIC_)?BUILD_COMMIT|data-(?:admin-deployment-commit|public-app-build)-marker/.test(customerBookingPage),
  false,
  "public booking request page must stay outside the installed customer app build marker scope",
);

assert.ok(
  ledger.includes("The installed Driver app surfaces show only the validated eight-character public build marker"),
  "implementation ledger missing installed public app deployment marker lock",
);
assert.ok(
  preactivationSuite.includes('script: "scripts/test-admin-deployment-commit-marker-guard.mjs"'),
  "preactivation suite missing installed public app build marker guard",
);

console.log("Admin and installed public app deployment commit marker guard passed.");
