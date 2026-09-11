import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pagePath = "app/driver-job/[token]/page.tsx";
const pageSource = await readFile(pagePath, "utf8");
const betaInstall = pageSource.match(/androidBrowser && !embeddedDriverApp && pageState.kind === "ready"[\s\S]*?data-driver-beta-install="true"([\s\S]*?)<\/header>/)?.[1];
assert.ok(betaInstall, "Keep the existing Android-browser-only Beta installation section.");
assert.match(betaInstall, /Allow notifications for job alerts\. Allow location to share your location during jobs\./);
assert.match(betaInstall, /className="text-xs leading-5 text-slate-600"/);

const portalEntry = pageSource.match(/data-driver-portal-entry="enrolled"([\s\S]*?)<\/Link>/)?.[1];
assert.ok(portalEntry, "Keep the existing acknowledged Driver Portal entry.");
assert.match(portalEntry, />My Jobs<\/p>/);
assert.match(portalEntry, /View your upcoming and active jobs\./);
assert.match(portalEntry, /className="text-xs font-medium leading-5 text-violet-900"/);
assert.match(portalEntry, /href="\/driver-portal"/);
assert.match(portalEntry, /Open My Jobs/);
assert.doesNotMatch(portalEntry, /Add to Home Screen|verified driver|reusable Driver Portal/);
const portalSource = await readFile("app/driver-portal/page.tsx", "utf8");
assert.match(portalSource, /data-driver-portal-heading="true">\s*My Jobs\s*<\/h1>/);
assert.match(portalSource, /View your upcoming and active jobs\./);

const requiredFragments = [
  ["foreground refresh helper", "const refreshDriverAppUpdates = useCallback"],
  ["visible refresh interval", "const DRIVER_APP_UPDATES_VISIBLE_REFRESH_MS = 5_000"],
  ["focus refresh listener", 'window.addEventListener("focus", refreshDriverAppUpdatesOnForeground)'],
  ["visible refresh listener", 'document.addEventListener("visibilitychange", refreshDriverAppUpdatesOnForeground)'],
  ["page-show refresh listener", 'window.addEventListener("pageshow", refreshDriverAppUpdatesOnForeground)'],
  ["visible interval refresh helper", "const refreshDriverAppUpdatesWhileVisible = () =>"],
  ["visible interval setup", "window.setInterval("],
  ["visible interval cleanup", "window.clearInterval(driverAppUpdatesRefreshInterval)"],
  ["stale request protection", "driverAppUpdatesRequestSequenceRef"],
  ["overlap cancellation", "driverAppUpdatesAbortControllerRef"],
  ["background content preservation", "preserveContent"],
  ["confirmed saved button label", '"Saved & Acknowledged"'],
  ["unchanged saved-details state", "driverDetailsSavedAndUnchanged"],
  ["Safari first step", "Open the private link in Safari. Tap Save & Acknowledge Job."],
  ["acknowledged-page install step", "Add to Home Screen from this acknowledged page."],
  ["Home Screen portal step", "Open Driver Portal from your Home Screen."],
  ["already-installed recovery", "Already installed before saving? Add it again from this acknowledged page."],
  ["external-link boundary", "WhatsApp links open in Safari. Driver Portal and job alerts open the installed app."],
];

const missing = requiredFragments
  .filter(([, fragment]) => !pageSource.includes(fragment))
  .map(([label]) => label);

assert.deepEqual(
  missing,
  [],
  `Driver Job foreground-message, acknowledgement-state, and iPhone onboarding gaps remain: ${missing.join(", ")}`,
);

assert.equal(
  pageSource.match(/\/notifications\?limit=5&page=1/g)?.length,
  1,
  "Driver Job must reuse one token-scoped notification read path.",
);
assert.equal(
  /setInterval\([^)]*refreshDriverAppUpdates/.test(pageSource),
  true,
  "Driver Job must refresh app updates through the bounded visible-page interval.",
);

assert.match(
  pageSource,
  /const refreshDriverAppUpdatesWhileVisible = \(\) => \{[\s\S]*?document\.visibilityState !== "visible"[\s\S]*?refreshDriverAppUpdates\(\{ preserveContent: true \}\)[\s\S]*?const driverAppUpdatesRefreshInterval = window\.setInterval\([\s\S]*?DRIVER_APP_UPDATES_VISIBLE_REFRESH_MS[\s\S]*?window\.clearInterval\(driverAppUpdatesRefreshInterval\)/,
  "Driver Job interval must refresh only while visible, preserve loaded content, and be cleared with the effect.",
);

console.log("Driver Job foreground messages, acknowledged button state, and iPhone onboarding guard passed.");
