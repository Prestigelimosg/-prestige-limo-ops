import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pagePath = "app/driver-job/[token]/page.tsx";
const pageSource = await readFile(pagePath, "utf8");

const requiredFragments = [
  ["foreground refresh helper", "const refreshDriverAppUpdates = useCallback"],
  ["focus refresh listener", 'window.addEventListener("focus", refreshDriverAppUpdatesOnForeground)'],
  ["visible refresh listener", 'document.addEventListener("visibilitychange", refreshDriverAppUpdatesOnForeground)'],
  ["page-show refresh listener", 'window.addEventListener("pageshow", refreshDriverAppUpdatesOnForeground)'],
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
  false,
  "Driver Job message refresh must not add polling.",
);

console.log("Driver Job foreground messages, acknowledged button state, and iPhone onboarding guard passed.");
