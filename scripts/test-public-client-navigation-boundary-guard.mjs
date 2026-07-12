import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-client-navigation-boundary-guard.mjs";

const publicPagePaths = [
  "app/book/page.tsx",
  "app/my-bookings/page.tsx",
  "app/driver-job/[token]/page.tsx",
  "app/driver-job-demo/page.tsx",
];

const contractChecks = [
  {
    label: "public route source privacy boundary guard",
    script: "scripts/test-public-route-source-privacy-boundary-guard.mjs",
  },
  {
    label: "public API client caller boundary guard",
    script: "scripts/test-public-api-client-caller-boundary-guard.mjs",
  },
  {
    label: "customer booking page API audit",
    script: "scripts/test-customer-booking-page-api-audit.mjs",
  },
];

const forbiddenNavigationPattern =
  /\b(?:window\.open|window\.location\s*=|window\.location\.href|location\.href|location\.assign|location\.replace|router\.(?:push|replace)|useRouter\s*\(|redirect\s*\()/;
const forbiddenExternalLinkPattern =
  /https?:\/\/|mailto:|tel:|sms:|whatsapp:|wa\.me|api\.whatsapp\.com|intent:\/\/|prestige:\/\//i;
const forbiddenAdminOrSessionPathPattern =
  /\/api\/admin|\/api\/customer-portal-sessions|customer-portal-session-issue|\/admin(?:\/|["'`])|admin-saved-bookings/i;
const nativeAppOnlyPattern =
  /\b(?:native\s+(?:mobile\s+)?app|ios\s+app|android\s+app|app\s+store|play\s+store)\b/i;

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

function hrefValues(source) {
  return [...source.matchAll(/\bhref=\{?["'`]([^"'`]+)["'`]\}?/g)]
    .map((match) => match[1])
    .sort();
}

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function runContractCheck({ label, script }) {
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
  });

  assert.equal(
    result.status,
    0,
    [
      `${label} failed while running ${script}.`,
      result.stdout.trim(),
      result.stderr.trim(),
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

const allPaths = [
  ledgerPath,
  preactivationSuitePath,
  ...publicPagePaths,
  ...contractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const ledgerSection = sectionBetween(ledger, "### Public Client Navigation Boundary Guard Lock");

for (const phrase of [
  "Public customer/driver client navigation is guarded across `/book`, `/my-bookings`, `/driver-job/[token]`, and the driver job demo page.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.",
  "`/book` may keep only the existing internal customer portal link to `/my-bookings`.",
  "`/my-bookings` may keep only the existing internal New Booking Request link to `/book`.",
  "`/driver-job/[token]` and the driver job demo page must not add public outbound links, deep links, app-store/native-app links, admin links, or session-issue links.",
  "Public client pages must not call `window.open`, imperative navigation helpers, `mailto:`, `tel:`, SMS/WhatsApp deep links, external HTTP URLs, `/api/admin*`, `/api/customer-portal-sessions`, or `/api/admin-saved-bookings`.",
  "`/my-bookings` may read `window.location.search` only through the bounded owned-booking/tracking deep-link parser; this read-only query inspection is not navigation and must not permit location assignment, redirect, external URL, token, or unowned booking access.",
  "Public navigation contracts must continue coordinating the public route source privacy guard, public API client caller guard, and customer booking page API audit in the preactivation suite.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-client-navigation-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public client navigation ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation public client navigation guard registration");

for (const { label, script } of contractChecks) {
  assertIncludes(files[script], "passed", `${label} success output marker`);
  runContractCheck({ label, script });
}

const bookingPage = files["app/book/page.tsx"];
assertIncludes(bookingPage, 'import Link from "next/link";', "/book Next Link import");
assertIncludes(bookingPage, 'data-customer-booking-portal-link="true"', "/book portal link data marker");
assert.deepEqual(hrefValues(bookingPage), ["/my-bookings"], "/book public href allowlist");
assert.equal(countOccurrences(bookingPage, "<Link"), 1, "/book public Link count");
assert.equal(countOccurrences(bookingPage, "</Link>"), 1, "/book public Link closing count");

const customerPortalPage = files["app/my-bookings/page.tsx"];
assertIncludes(customerPortalPage, 'import Link from "next/link";', "/my-bookings Next Link import");
assertIncludes(
  customerPortalPage,
  'data-customer-portal-book-request-link="true"',
  "/my-bookings book request link data marker",
);
assert.deepEqual(hrefValues(customerPortalPage), ["/book"], "/my-bookings public href allowlist");
assert.equal(countOccurrences(customerPortalPage, "<Link"), 1, "/my-bookings public Link count");
assert.equal(countOccurrences(customerPortalPage, "</Link>"), 1, "/my-bookings public Link closing count");
for (const fragment of [
  "function readCustomerPortalBookingDeepLink()",
  "new URLSearchParams(window.location.search)",
  'safePortalBookingReference(params.get("booking"))',
  'safePortalBookingReference(params.get("booking_reference"))',
  'openTracking: params.get("tracking") === "1"',
  "portalBookings.find((booking) => booking.id === targetBookingId)",
]) {
  assertIncludes(customerPortalPage, fragment, `/my-bookings bounded query read ${fragment}`);
}

for (const [path, source] of publicPagePaths.map((path) => [path, files[path]])) {
  assertExcludes(source, /<a\b/i, `${path} raw anchor tags`);
  assertExcludes(source, /\btarget=/i, `${path} target attribute`);
  assertExcludes(source, forbiddenNavigationPattern, `${path} imperative navigation`);
  assertExcludes(source, forbiddenExternalLinkPattern, `${path} external/deep links`);
  assertExcludes(source, forbiddenAdminOrSessionPathPattern, `${path} admin/session navigation paths`);
  assertExcludes(source, nativeAppOnlyPattern, `${path} native-app/app-store navigation copy`);
  assertExcludes(source, /(?:^|[\s<])(?:formAction|action)=/i, `${path} form action navigation`);
}

for (const path of publicPagePaths.filter(
  (path) => path !== "app/book/page.tsx" && path !== "app/my-bookings/page.tsx",
)) {
  const source = files[path];
  assert.deepEqual(hrefValues(source), [], `${path} public href allowlist`);
  assertExcludes(source, /from\s+["']next\/link["']/, `${path} Next Link import`);
  assertExcludes(source, /<Link\b/, `${path} Next Link usage`);
}

console.log("Public client navigation boundary guard passed");
