import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customerPortalPath = "app/my-bookings/page.tsx";
const driverJobPath = "app/driver-job/[token]/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customer-driver-app-compact-surface-guard.mjs";

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

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const [customerPortalPage, driverJobPage, ledger, preactivationSuite] = await Promise.all([
  readFile(customerPortalPath, "utf8"),
  readFile(driverJobPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Customer/Driver App Compact Surface Polish Lock",
);

for (const phrase of [
  "This lane compacts the existing Customer Portal and Driver Job app surfaces only.",
  "No runtime route, helper, DB, env, provider-send, GPS/location, billing/payment/PDF/payout, or production activation behavior is changed.",
  "Customer Portal keeps the same `/my-bookings` request, search, pagination, detail expansion, and local review controls.",
  "Driver Job keeps the same job summary, driver detail acknowledgement, App Updates, Live Location disabled controls, activity log, status workflow, Report Issue, and status history controls.",
  "The customer header/guidance and section tabs are compact bands/rows rather than giant cards.",
  "The driver status, live-location, updates, and detail sections use compact spacing and shorter controls.",
  "No new sector, feature card, free-form chat surface, provider-send panel, map activation, or notification runtime is introduced.",
  "Customer and driver forbidden fields remain blocked by the existing privacy guards.",
  "This polish is guarded by `scripts/test-customer-driver-app-compact-surface-guard.mjs` and registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `compact surface ledger phrase: ${phrase}`);
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation suite compact surface guard registration",
);

for (const fragment of [
  'data-customer-portal-page="true"',
  'data-customer-portal-mobile-web-note="true"',
  'data-customer-portal-sections="true"',
  'data-customer-portal-request-form="true"',
  'data-customer-portal-request-notice="true"',
  'className="mx-auto flex w-full max-w-5xl flex-col gap-3"',
  'className="border-b border-slate-200 px-1 pb-3 pt-1"',
  'className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2"',
  '"min-h-9 rounded-md border px-2.5 py-1.5 text-sm font-semibold transition"',
  'className="rounded-md border border-slate-200 bg-white p-3 sm:p-4"',
  'className="rounded-md border border-slate-200 bg-white p-3"',
  'className="rounded-md border border-slate-200 bg-white p-2 sm:p-3"',
]) {
  assertIncludes(customerPortalPage, fragment, `/my-bookings compact UI fragment ${fragment}`);
}

for (const fragment of [
  'data-driver-primary-step="job-summary"',
  'data-driver-primary-step="confirm-details"',
  'data-driver-primary-step="live-location-consent"',
  'data-driver-primary-step="status-workflow"',
  'data-driver-job-app-updates="true"',
  'data-driver-job-report-issue="true"',
  'className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-4 sm:max-w-lg md:max-w-2xl md:py-6"',
  'className="space-y-1 border-b border-stone-200 pb-3"',
  'className="order-[82] space-y-2"',
  'className="order-[84] space-y-2"',
  'className="order-3 flex flex-col gap-2 pb-4"',
  'className="order-1 grid gap-2 md:grid-cols-4"',
  'className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 transition active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"',
  'className="h-11 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-500 disabled:cursor-not-allowed disabled:opacity-70"',
]) {
  assertIncludes(driverJobPage, fragment, `driver job compact UI fragment ${fragment}`);
}

for (const forbiddenFragment of [
  "text-4xl",
  "rounded-md border border-slate-200 bg-white px-4 py-5 shadow-sm",
  "flex flex-wrap gap-2 rounded-md border border-slate-200 bg-white p-3 shadow-sm",
  "mt-4 grid gap-2 text-sm sm:grid-cols-3",
  "rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700",
]) {
  assertExcludes(customerPortalPage, forbiddenFragment, "/my-bookings giant-card surface");
}

for (const forbiddenFragment of [
  "text-2xl font-semibold text-slate-950",
  "h-12 w-full",
  "order-1 grid gap-3 md:grid-cols-4",
  "order-3 flex flex-col gap-3 pb-6",
  "order-[82] space-y-3",
  "order-[84] space-y-3",
  "min-h-20 w-full resize-y",
]) {
  assertExcludes(driverJobPage, forbiddenFragment, "driver job giant-card surface");
}

const customerRenderedSurface = customerPortalPage.slice(customerPortalPage.indexOf("<main"));
const driverRenderedSurface = driverJobPage.slice(driverJobPage.indexOf("<main"));
const publicAppSurface = `${customerRenderedSurface}\n${driverRenderedSurface}`;

for (const forbiddenPattern of [
  /driver_payout_rules|customer_rates|PayNow|payout comparisons|mock QA|dev archive/i,
  /customer price|billing|invoice\/payment|payment\/PDF|internal finance notes/i,
  /api\.telegram\.org|whatsapp|twilio|sendMail|new\s+Resend|maps\.googleapis|onemap/i,
]) {
  assertExcludes(publicAppSurface, forbiddenPattern, "customer/driver app compact public surface");
}

console.log("Customer/Driver app compact surface guard passed");
