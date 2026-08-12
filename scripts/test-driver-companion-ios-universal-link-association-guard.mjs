import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routePath = "app/.well-known/apple-app-site-association/route.ts";
const configPath = "driver-companion/app.json";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationPath = "scripts/test-preactivation-verification-suite.mjs";

const [routeSource, configSource, ledgerSource, preactivationSource] = await Promise.all([
  readFile(routePath, "utf8"),
  readFile(configPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationPath, "utf8"),
]);

const companionConfig = JSON.parse(configSource).expo;
assert.deepEqual(
  companionConfig.ios.associatedDomains,
  ["applinks:app.prestigelimo.sg"],
  "The iOS entitlement must remain limited to the established Production Driver Job host",
);

for (const expected of [
  '"U9Y2574Y7S.sg.prestigelimo.drivercompanion"',
  '"/": "/driver-job/*"',
  '"Content-Type": "application/json"',
  '"Cache-Control": "public, max-age=300, s-maxage=3600"',
  "export function GET()",
]) {
  assert.equal(routeSource.includes(expected), true, `${routePath} must include ${expected}`);
}

for (const forbidden of [
  /customer[_ -]?price|billing|invoice|payment|payout|paynow/i,
  /cookies\(|headers\(|authorization|session|token/i,
  /POST|PUT|PATCH|DELETE/,
  /redirect/i,
]) {
  assert.equal(forbidden.test(routeSource), false, `${routePath} must exclude ${forbidden}`);
}

for (const ledgerPhrase of [
  "Driver Companion iOS Universal Link Association",
  "`U9Y2574Y7S.sg.prestigelimo.drivercompanion`",
  "`/.well-known/apple-app-site-association`",
  "`/driver-job/*`",
  "physical iPhone verification remains required",
]) {
  assert.equal(
    ledgerSource.includes(ledgerPhrase),
    true,
    `${ledgerPath} must include ${ledgerPhrase}`,
  );
}

assert.equal(
  preactivationSource.includes(
    "scripts/test-driver-companion-ios-universal-link-association-guard.mjs",
  ),
  true,
  "The iOS Universal Link association guard must run in preactivation verification",
);

console.log("Driver Companion iOS Universal Link association guard passed");
