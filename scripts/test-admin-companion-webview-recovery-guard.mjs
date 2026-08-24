import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPath = "admin-companion/App.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationPath = "scripts/test-preactivation-verification-suite.mjs";
const [app, ledger, preactivation] = await Promise.all([
  readFile(appPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationPath, "utf8"),
]);
const normalizedApp = app.replace(/\s+/g, " ");

assert.equal(
  (app.match(/^\s*<WebView\s*$/gm) || []).length,
  1,
  "Admin blank-screen recovery must stay on the one established WebView",
);

for (const phrase of [
  'type AdminWebViewLoadState = "loading" | "ready" | "failed"',
  "const adminWebViewInitialLoadTimeoutMs = 15_000",
  "const adminWebViewAutomaticRecoveryLimit = 1",
  "webViewHasCompletedLoadRef",
  "webViewLoadTimeoutRef",
  "webViewAutomaticRecoveryCountRef",
  "clearAdminWebViewLoadTimeout",
  "recoverAdminWebView",
  "handleAdminWebViewLoadStart",
  "handleAdminWebViewLoadEnd",
  "handleAdminWebViewLoadError",
  "handleAdminWebViewContentProcessTermination",
  "onContentProcessDidTerminate={handleAdminWebViewContentProcessTermination}",
  "onLoadStart={handleAdminWebViewLoadStart}",
  "onLoadEnd={handleAdminWebViewLoadEnd}",
  "onError={handleAdminWebViewLoadError}",
  'webViewLoadState === "loading"',
  'webViewLoadState === "failed"',
  "Loading secure Admin sign-in…",
  "The secure Admin screen did not load.",
  "Reload Admin screen",
  "ActivityIndicator",
  'AppState.currentState !== "active"',
]) {
  assert.ok(normalizedApp.includes(phrase), `${appPath} must include ${phrase}`);
}

const appStateStart = app.indexOf('AppState.addEventListener("change"');
const appStateEnd = app.indexOf("return () => subscription.remove();", appStateStart);
assert.ok(appStateStart >= 0 && appStateEnd > appStateStart, "Admin AppState handler must remain");
const appStateSource = app.slice(appStateStart, appStateEnd);
assert.ok(
  appStateSource.includes("clearAdminWebViewLoadTimeout"),
  "Backgrounding must pause an incomplete-load timeout without remounting the WebView",
);
for (const forbidden of [
  "recoverAdminWebView",
  "setNavigationKey",
  ".reload()",
  "webViewRef.current?.reload",
]) {
  assert.equal(
    appStateSource.includes(forbidden),
    false,
    `Ordinary background/foreground handling must not invoke ${forbidden}`,
  );
}

const recoveryStart = app.indexOf("const recoverAdminWebView = useCallback");
const recoveryEnd = app.indexOf("const handleAdminWebViewLoadStart", recoveryStart);
assert.ok(recoveryStart >= 0 && recoveryEnd > recoveryStart, "Bounded recovery callback must exist");
const recoverySource = app.slice(recoveryStart, recoveryEnd);
for (const phrase of [
  "webViewAutomaticRecoveryCountRef.current >= adminWebViewAutomaticRecoveryLimit",
  'setWebViewLoadState("failed")',
  'setWebViewLoadState("loading")',
  "setNavigationKey((current) => current + 1)",
]) {
  assert.ok(recoverySource.includes(phrase), `Recovery must include ${phrase}`);
}
assert.equal(
  recoverySource.includes("setCurrentUrl"),
  false,
  "Recovery must reload the exact approved current Admin URL rather than changing lanes",
);

for (const forbidden of [
  "clearCache(",
  "incognito",
  "thirdPartyCookiesEnabled={true}",
  "AsyncStorage",
  "sessionStorage",
  "localStorage",
]) {
  assert.equal(app.includes(forbidden), false, `Recovery must not introduce ${forbidden}`);
}

assert.ok(
  preactivation.includes("scripts/test-admin-companion-webview-recovery-guard.mjs"),
  "The Admin WebView recovery guard must run in preactivation verification",
);
for (const phrase of [
  "Admin Native Blank Sign-In WebView Recovery Repair (2026-08-24)",
  "Physical Admin Build 2 evidence",
  "one bounded automatic recovery",
  "normal background and foreground transitions never remount",
  "new signed Admin build",
]) {
  assert.ok(ledger.includes(phrase), `${ledgerPath} must include ${phrase}`);
}

console.log("Admin companion WebView recovery guard passed.");
