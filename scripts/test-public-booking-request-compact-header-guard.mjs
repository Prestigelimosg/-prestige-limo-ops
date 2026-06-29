import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const bookPagePath = "app/book/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-booking-request-compact-header-guard.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matched =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matched, false, `${label} must not include ${fragmentOrPattern}.`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const [bookPage, ledger, preactivationSuite] = await Promise.all([
  readFile(bookPagePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

for (const fragment of [
  "const hotlineContact =",
  'data-customer-booking-header-note="true"',
  "Thank you for your request. Admin will review it at our soonest. Hotline: {hotlineContact}.",
  "text-2xl font-bold text-slate-950 sm:text-3xl",
  'data-customer-voice-booking-helper="true"',
  'data-customer-voice-booking-speak-button="true"',
  'data-customer-booking-portal-link="true"',
]) {
  assertIncludes(bookPage, fragment, `compact /book header fragment ${fragment}`);
}

for (const fragmentOrPattern of [
  "Share the trip details you have now.",
  "Your booking is not confirmed until",
  "Mobile web request form for trip details only.",
  'data-customer-booking-mobile-web-note="true"',
  'data-customer-company-profile-contact="true"',
  'data-customer-booking-next-steps="true"',
  "data-customer-booking-next-step",
  "Booking request next steps",
  /Step\s+\{index \+ 1\}:/,
  "sm:text-4xl",
]) {
  assertExcludes(bookPage, fragmentOrPattern, "compact /book header source");
}

const ledgerSection = sectionBetween(ledger, "### Public Booking Request Compact Header Lock");

for (const phrase of [
  "The public `/book` header is compact: smaller title, one thank-you/hotline sentence, no duplicate profile contact row, and no Step 1/2/3 cards.",
  "The request form fields, submit route, booking persistence, company profile read, customer portal, billing/payment/PDF/invoice, provider-send, GPS/live location, parser, and admin routes are unchanged.",
  "Customer-visible forbidden data remains blocked from the public booking request page.",
  "Guard coverage lives in `scripts/test-public-booking-request-compact-header-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `compact /book header ledger phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation compact /book header guard registration");

console.log("Public booking request compact header guard passed");
