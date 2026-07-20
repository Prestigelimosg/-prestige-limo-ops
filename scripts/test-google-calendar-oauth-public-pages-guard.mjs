import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  calendarPage: "app/google-calendar/page.tsx",
  driverJobPage: "app/driver-job/[token]/page.tsx",
  ledger: "docs/current-implementation-ledger.md",
  privacyPage: "app/privacy/page.tsx",
  publicShell: "app/public-information-shell.tsx",
  termsPage: "app/terms/page.tsx",
};

const [calendarPage, driverJobPage, ledger, privacyPage, publicShell, termsPage] = await Promise.all(
  Object.values(paths).map((path) => readFile(path, "utf8")),
);

function includes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function excludes(source, pattern, label) {
  assert.equal(pattern.test(source), false, `${label} must not match ${pattern}.`);
}

for (const [label, source] of [
  ["Google Calendar information page", calendarPage],
  ["Privacy Policy page", privacyPage],
  ["Terms of Service page", termsPage],
]) {
  includes(source, "export const metadata", `${label} metadata`);
  includes(source, "PublicInformationShell", `${label} shared shell`);
  excludes(source, /\bfetch\s*\(|\/api\/|process\.env|\/driver-job\//, `${label} static privacy boundary`);
}

for (const href of ["/google-calendar", "/privacy", "/terms"]) {
  includes(publicShell, `{ href: "${href}"`, `public navigation ${href}`);
  includes(driverJobPage, `href="${href}"`, `Driver Calendar policy link ${href}`);
}

includes(calendarPage, "Prestige Limo Ops Google Calendar", "public app identity");
includes(calendarPage, "calendar.events", "minimum Google scope disclosure");
includes(calendarPage, "one assigned-job event", "bounded event behavior disclosure");
includes(calendarPage, "does not import unrelated calendar events", "unrelated-event boundary");
includes(calendarPage, "willsglimo@gmail.com", "public support contact");

for (const phrase of [
  "https://www.googleapis.com/auth/calendar.events",
  "encrypted at rest",
  "does not read or import unrelated events",
  "Google Account permissions",
  "request deletion",
  "Google API Services User Data Policy",
  "Limited Use",
  "willsglimo@gmail.com",
]) {
  includes(privacyPage, phrase, `Privacy Policy disclosure: ${phrase}`);
}

for (const phrase of [
  "authorized Prestige Limo Ops drivers",
  "private Driver Job link",
  "Prestige Limo Ops remains the operational source of truth",
  "Singapore",
  "willsglimo@gmail.com",
]) {
  includes(termsPage, phrase, `Terms disclosure: ${phrase}`);
}

includes(driverJobPage, 'data-driver-job-calendar-policy-links="true"', "Driver Calendar policy link group");
assert.equal(
  (driverJobPage.match(/rel="noreferrer"/g) || []).length,
  3,
  "Each Driver Calendar public-information link must isolate the private Driver Job referrer.",
);
excludes(driverJobPage, /\btarget=/i, "Driver Calendar same-tab navigation boundary");
includes(ledger, "### Google OAuth Public Verification Information (2026-07-20)", "ledger section");
includes(ledger, "Search Console domain ownership is verified", "verified domain record");
includes(ledger, "scripts/test-google-calendar-oauth-public-pages-guard.mjs", "focused guard record");

console.log("Google Calendar OAuth public pages guard passed");
