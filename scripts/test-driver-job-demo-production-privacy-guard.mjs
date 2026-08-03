import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const demoLayoutPath = "app/driver-job-demo/layout.tsx";
const demoPagePath = "app/driver-job-demo/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardPath = "scripts/test-driver-job-demo-production-privacy-guard.mjs";

const [demoLayout, demoPage, ledger, preactivationSuite] = await Promise.all([
  readFile(demoLayoutPath, "utf8"),
  readFile(demoPagePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

for (const fragment of [
  'import { notFound } from "next/navigation";',
  'export const dynamic = "force-dynamic";',
  'process.env.VERCEL_ENV === "production"',
  "notFound();",
]) {
  assert.equal(demoLayout.includes(fragment), true, `Driver demo Production boundary must include ${fragment}.`);
}

assert.equal(
  (demoLayout.match(/notFound\(\);/g) || []).length,
  1,
  "Driver demo Production boundary must contain exactly one notFound call.",
);
assert.equal(
  demoLayout.includes("process.env.NODE_ENV"),
  false,
  "Local production-build browser tests must not be hidden by NODE_ENV alone.",
);
assert.doesNotMatch(
  demoLayout,
  /fetch\s*\(|axios|XMLHttpRequest|POST|PATCH|PUT|DELETE|supabase|calendar|invoice|payment|payout|paynow/i,
  "Driver demo Production boundary must stay route-only and contain no data or wired-lane behavior.",
);

for (const fragment of [
  '"use client";',
  "Demo only — not connected to live bookings yet.",
  'data-driver-demo-warning="true"',
]) {
  assert.equal(
    demoPage.includes(fragment),
    true,
    `The existing local/Preview driver demo must remain intact: ${fragment}.`,
  );
}

for (const phrase of [
  "### Production Driver Demo Privacy Boundary",
  "The public Production `/driver-job-demo` route now terminates at the existing Next.js not-found boundary.",
  "Local development and Vercel Preview retain the existing mock page for controlled training and browser regression tests.",
  "The real token-scoped `/driver-job/[token]` operational workflow is unchanged.",
  `Focused protection: \`${guardPath}\`.`,
]) {
  assert.equal(ledger.includes(phrase), true, `Implementation ledger must include ${phrase}.`);
}

assert.equal(
  preactivationSuite.includes(guardPath),
  true,
  "Pre-activation verification must register the driver demo Production privacy guard.",
);

console.log("Driver Job demo Production privacy guard passed.");
