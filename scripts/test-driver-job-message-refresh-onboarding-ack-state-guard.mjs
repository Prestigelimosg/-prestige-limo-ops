import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const pagePath = "app/driver-job/[token]/page.tsx";
const pageSource = await readFile(pagePath, "utf8");
const betaInstall = pageSource.match(/\(androidBrowser \|\| iosBrowser\) && !embeddedDriverApp && pageState.kind === "ready"[\s\S]*?data-driver-beta-install="true"([\s\S]*?)<\/header>/)?.[1];
assert.ok(betaInstall, "Use the same valid-job installation section for both phone browsers, excluding native apps.");
assert.match(betaInstall, /href=\{iosBrowser \? driverBetaTestFlightUrl : driverBetaApkDownloadUrl\}/);
assert.match(pageSource, /const driverBetaTestFlightUrl = "https:\/\/testflight.apple.com\/join\/m3sjGfd3";/);
assert.match(betaInstall, /Install TestFlight, then Prestige Driver/);
assert.match(betaInstall, /Reopen the job link Admin sent you/);
assert.match(betaInstall, /Confirm details → Save &amp; Acknowledge Job → Create your account/);
assert.match(betaInstall, /\{androidBrowser \? <a/);
assert.match(betaInstall, /\{androidBrowser \? <p/);
assert.match(betaInstall, /referrerPolicy="no-referrer"/);
assert.match(betaInstall, /rel="noopener noreferrer"/);
assert.doesNotMatch(betaInstall, /onClick|fetch\(|window\.location|setTimeout|localStorage|sessionStorage/);
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

// Execute the existing refresh callback: definitive access loss must remove an
// already-rendered private job, whereas transient failures preserve its drafts.
const ast = ts.createSourceFile(pagePath, pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let refreshNode;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "refreshDriverAppUpdates") {
    refreshNode = node.initializer.arguments[0];
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(refreshNode);
async function refreshScenario({ status, native = false, networkError = false, stale = false, nextJobUrl }) {
  let page = { kind: "ready", job: { reference: "QA-PRIVATE", passengerName: "Synthetic passenger" } };
  let updates = { kind: "loaded", updates: [{ id: "old", safe_message: "Synthetic private message" }], feedback: null };
  let combo = { trips: [{ reference: "QA-PRIVATE" }] };
  const navigations = [];
  const sequence = { current: 0 };
  const loadedToken = { current: "qa-token" };
  const bindings = {
    token: "qa-token", isVerifiedEmbeddedDriverApp: () => native,
    currentEmbeddedDriverInstallationId: () => native ? "qa-installation" : "",
    driverAppUpdatesRequestSequenceRef: sequence,
    driverAppUpdatesAbortControllerRef: { current: null },
    loadedDriverJobTokenRef: loadedToken,
    setDriverAppUpdates(value) { updates = typeof value === "function" ? value(updates) : value; },
    setPageState(value) { page = typeof value === "function" ? value(page) : value; },
    setComboView(value) { combo = value; },
    window: { location: { replace(value) { navigations.push(value); } } },
    async fetch(url) {
      if (networkError) throw new Error("Synthetic offline");
      return { ok: status === 200, status, async json() {
        if (stale) sequence.current++;
        return status === 200 ? { ok: true, notifications: [] } : {
          ok: false, error: "Access unavailable",
          ...(!url.includes("/notifications?") && nextJobUrl ? { next_job_url: nextJobUrl } : {}),
        };
      } };
    },
  };
  const refresh = new Function(...Object.keys(bindings), ts.transpileModule(
    `return (${refreshNode.getText(ast)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText)(...Object.values(bindings));
  await refresh({ preserveContent: true });
  return { page, updates, combo, navigations, loadedToken };
}
for (const [status, reason] of [[401, "unauthorized"], [403, "revoked"], [410, "expired"]]) {
  for (const native of [false, true]) {
    const result = await refreshScenario({ status, native });
    assert.deepEqual(result.page, { kind: "blocked", reason }, `${status}: no previously visible customer details`);
    assert.deepEqual(result.updates.updates, [], `${status}: no retained private message content`);
    assert.equal(result.combo, null, `${status}: no retained combo details`);
    assert.equal(result.loadedToken.current, "", "invalidate the loaded job for late refreshes");
    assert.deepEqual(result.navigations, native ? ["/driver-portal"] : [], "native returns to existing authenticated notice reconciliation");
  }
}
for (const status of [500, 503]) {
  const result = await refreshScenario({ status, native: true });
  assert.equal(result.page.kind, "ready", "transient provider failure does not revoke valid access");
  assert.equal(result.updates.updates.length, 1);
  assert.deepEqual(result.navigations, []);
}
const offline = await refreshScenario({ networkError: true, native: true });
assert.equal(offline.page.kind, "ready");
assert.deepEqual(offline.navigations, []);
const stale = await refreshScenario({ status: 410, native: true, stale: true });
assert.equal(stale.page.kind, "ready", "late denial from a superseded request cannot close the current job");
assert.deepEqual(stale.navigations, []);
const valid = await refreshScenario({ status: 200, native: true });
assert.equal(valid.page.kind, "ready");
assert.deepEqual(valid.navigations, []);
for (const native of [false, true]) {
  const continued = await refreshScenario({ status: 410, native, nextJobUrl: "/driver-job/verified-next-combo-token" });
  assert.equal(continued.page.kind, "blocked", "old trip details are cleared before continuation");
  assert.deepEqual(continued.navigations, ["/driver-job/verified-next-combo-token"], "preserve established verified combo continuation");
}
const foreign = await refreshScenario({ status: 410, native: true, nextJobUrl: "https://foreign.example/private" });
assert.deepEqual(foreign.navigations, ["/driver-portal"]);
console.log("Driver open-page access loss: private details/messages cleared, exact native reconciliation, transient and stale-response preservation passed.");
