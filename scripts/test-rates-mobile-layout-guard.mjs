import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-rates-mobile-layout-guard.mjs";

function sectionBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing section start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing section end after ${startFragment}: ${endFragment}`);
  return source.slice(start, end);
}

const [appPage, ledger, preactivationSuite] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ratesSection = sectionBetween(
  appPage,
  '{activeTab === "rates" ? (',
  '{activeTab === "dashboard" ? (',
);

for (const fragment of [
  '<div className="grid gap-3 lg:grid-cols-2">',
  '<div className="min-w-0">\n              <h3 className="text-base font-semibold">Default Prestige Rates</h3>',
  '<div className="min-w-0">\n              <h3 className="text-base font-semibold">Default Driver Payout</h3>',
  'className="mt-3 overflow-x-auto rounded-md border border-stone-200"',
  'data-default-vehicle-customer-rates="true"',
  'data-override-vehicle-customer-rates="true"',
]) {
  assert.equal(ratesSection.includes(fragment), true, `Rates mobile layout must include ${fragment}.`);
}

assert.equal(
  ratesSection.includes('<div>\n              <h3 className="text-base font-semibold">Default Prestige Rates</h3>'),
  false,
  "Default Prestige Rates grid child must not restore the intrinsic-width mobile overflow.",
);
assert.equal(
  ratesSection.includes('<div>\n              <h3 className="text-base font-semibold">Default Driver Payout</h3>'),
  false,
  "Default Driver Payout grid child must not restore the intrinsic-width mobile overflow.",
);

for (const phrase of [
  "### Rates Mobile Layout Containment",
  "At 375px the Rates document remains viewport-width while the table retains its complete Service, E / AVF, S, VVV, and COMBI columns through internal horizontal scrolling.",
  `Focused lock: \`${guardScript}\``,
]) {
  assert.equal(ledger.includes(phrase), true, `Ledger must include ${phrase}.`);
}

assert.equal(
  preactivationSuite.includes(`script: "${guardScript}"`),
  true,
  "Rates mobile layout guard must be registered in the preactivation suite.",
);

console.log("Rates mobile layout containment guard passed");
