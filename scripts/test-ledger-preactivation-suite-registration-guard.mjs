import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-ledger-preactivation-suite-registration-guard.mjs";
const ledgerSectionHeading = "### Ledger Pre-Activation Suite Registration Guard Lock";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

const [ledger, preactivationSuite] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const registrationLines = ledger
  .split(/\r?\n/)
  .filter(
    (line) =>
      /\bregister(?:s|ed)?\b/i.test(line) &&
      /preactivation (?:verification )?suite|test-preactivation-verification-suite\.mjs/i.test(
        line,
      ),
  );

const promisedScripts = [
  ...new Set(
    registrationLines
      .flatMap((line) => [...line.matchAll(/scripts\/[A-Za-z0-9_.\/-]+\.mjs/g)])
      .map((match) => match[0])
      .filter((script) => script !== preactivationSuitePath),
  ),
].sort();

assert.equal(
  promisedScripts.length >= 60,
  true,
  `Expected at least 60 ledger preactivation suite registration promises; found ${promisedScripts.length}.`,
);

const missingScripts = promisedScripts.filter((script) => !preactivationSuite.includes(script));

assert.deepEqual(
  missingScripts,
  [],
  `Ledger promises preactivation suite registrations that are missing from the suite: ${missingScripts.join(", ")}`,
);

assertIncludes(ledger, ledgerSectionHeading, "ledger registration guard section");
assertIncludes(
  ledger,
  "This lock adds `scripts/test-ledger-preactivation-suite-registration-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
  "ledger registration guard script registration wording",
);
assertIncludes(preactivationSuite, guardScript, "preactivation suite registration guard entry");

console.log("ledger preactivation suite registration guard passed");
