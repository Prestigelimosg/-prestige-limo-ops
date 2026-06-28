import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-dispatch-flight-location-copy-guard.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

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

const helperBlock = sectionBetween(appPage, "function bookingTypeIsDeparture", "function hasParsedValue");
const customerCopyBlock = sectionBetween(appPage, "const customerCopyCard = useMemo", "const draftDriverDispatchCard");
const driverDispatchBlock = sectionBetween(appPage, "const draftDriverDispatchCard = useMemo", "const driverJobLinkMessage");
const driverJobLinkBlock = sectionBetween(appPage, "const driverJobLinkMessage = useMemo", "const generatedDispatchCopyMessages");
const driverJobLinkButtonBlock = sectionBetween(
  appPage,
  'data-create-driver-job-link-button="true"',
  'data-revoke-driver-job-link-button="true"',
);
const ledgerSection = sectionBetween(ledger, "### Dispatch Flight Location Copy And Link Feedback", "\n### ");

for (const fragment of [
  "function bookingTypeIsDeparture",
  "function bookingTypeIsArrival",
  "function appendFlightDetailToLocation",
  "function dispatchCopyLocationFlightParts",
  "appendFlightDetailToLocation(dropoff, flight)",
  "appendFlightDetailToLocation(pickup, flight)",
  "standaloneFlightLine: flightLine",
]) {
  assertIncludes(helperBlock, fragment, `dispatch flight-location helper fragment ${fragment}`);
}

for (const fragment of [
  "const flightLocationParts = dispatchCopyLocationFlightParts(booking);",
  "Pickup location: ${flightLocationParts.pickup}",
  "Drop-off location: ${flightLocationParts.dropoff}",
  "flightLocationParts.standaloneFlightLine",
]) {
  assertIncludes(customerCopyBlock, fragment, `Customer Copy flight-location fragment ${fragment}`);
}

assertExcludes(
  customerCopyBlock,
  "const flightLine = clean(booking.flight) ?",
  "Customer Copy must not keep flight as only a standalone line",
);

for (const fragment of [
  "const flightLocationParts = dispatchCopyLocationFlightParts(booking);",
  "const driverDispatchRoute = [",
  "flightLocationParts.pickup || \"Pickup\"",
  "flightLocationParts.dropoff || \"Drop-off\"",
  "flightLocationParts.standaloneFlightLine",
]) {
  assertIncludes(driverDispatchBlock, fragment, `Driver Dispatch flight-location fragment ${fragment}`);
}

for (const fragment of [
  "const flightLocationParts = dispatchCopyLocationFlightParts(booking);",
  "const driverJobLinkRoute = [",
  "Pickup:",
  "Drop-off:",
  "flightLocationParts.pickup || \"Pickup\"",
  "flightLocationParts.dropoff || \"Drop-off\"",
  "flightLocationParts.standaloneFlightLine",
]) {
  assertIncludes(driverJobLinkBlock, fragment, `Driver Job Link flight-location fragment ${fragment}`);
}

for (const fragment of [
  'data-copy-driver-job-link-copied=',
  'driverJobLinkCopyMessage?.tone === "success"',
  "border-emerald-400 bg-emerald-100 text-emerald-950",
  '{driverJobLinkCopyMessage?.tone === "success" ? "Copied" : "Copy Link"}',
]) {
  assertIncludes(driverJobLinkButtonBlock, fragment, `Copy Link copied-state fragment ${fragment}`);
}

for (const [section, label] of [
  [helperBlock, "flight-location helper"],
  [customerCopyBlock, "Customer Copy flight-location copy"],
  [driverJobLinkBlock, "Driver Job Link flight-location copy"],
]) {
  for (const forbiddenPattern of [
    /fetch\(|\/api\/|createClient|service_role|process\.env/i,
    /sendMail|new\s+Resend|api\.telegram\.org|twilio|whatsapp-cloud-api/i,
    /navigator\.geolocation|watchPosition|getCurrentPosition/i,
    /driver payout|PayNow payout|customer price|billing|invoice|internal admin notes|parser\/debug|mock QA|dev archive/i,
  ]) {
    assertExcludes(section, forbiddenPattern, `${label} UI-only/privacy boundary`);
  }
}

for (const phrase of [
  "Departure copies now attach the flight detail to the drop-off location line.",
  "Arrival copies now attach the flight detail to the pickup location line.",
  "Customer Copy, Driver Dispatch, and Driver Job Link copy reuse the same formatter so the airport-side location is consistent.",
  "The Driver Job Link `Copy Link` button now shades green and changes to `Copied` after a successful copy.",
  "This is copy/UI-only; it does not change parser behavior, booking saves, driver job link API payloads, DB writes, env values, provider sends, GPS/live location, billing/payment/PDF/invoice/payout, or deploy behavior.",
  "Guard coverage lives in `scripts/test-dispatch-flight-location-copy-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation dispatch flight-location copy guard registration");

console.log("Dispatch flight-location copy guard passed");
