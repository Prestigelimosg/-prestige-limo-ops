import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const appPath = "admin-companion/App.tsx";
const bridgePath = "admin-companion/src/admin-webview-bridge.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationPath = "scripts/test-preactivation-verification-suite.mjs";
const [app, bridgeSource, ledger, preactivation] = await Promise.all([
  readFile(appPath, "utf8"),
  readFile(bridgePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationPath, "utf8"),
]);
const normalizedApp = app.replace(/\s+/g, " ");
const normalizedBridge = bridgeSource.replace(/\s+/g, " ");

const executableBridge = stripTypeScriptTypes(bridgeSource, { mode: "transform" })
  .replace(/\bexport\s+/g, "");
const bridge = new Function(
  `${executableBridge}\nreturn { embeddedAdminBridgeBootstrap, parseAdminBridgeMessage };`,
)();
const installationId = "d43fd0cc-66ad-4ef6-8cc7-3898339ac9a4";
const exactReadyMessage = JSON.stringify({ type: "admin_native_web_ready" });

assert.deepEqual(
  bridge.parseAdminBridgeMessage(exactReadyMessage),
  { type: "admin_native_web_ready" },
  "The native bridge must accept only the exact WebView-ready message shape",
);
for (const rejectedMessage of [
  JSON.stringify({ extra: true, type: "admin_native_web_ready" }),
  JSON.stringify({ type: "admin_native_web_ready_stale" }),
  JSON.stringify({ type: "unknown" }),
  "not-json",
]) {
  assert.equal(
    bridge.parseAdminBridgeMessage(rejectedMessage),
    null,
    `The native bridge must ignore stale, extended, unknown, or invalid message ${rejectedMessage}`,
  );
}

function executeBootstrap(documentReadyState) {
  const documentListeners = [];
  const postedMessages = [];
  const window = {
    ReactNativeWebView: {
      postMessage(value) {
        postedMessages.push(value);
      },
    },
    addEventListener() {},
  };
  const document = {
    readyState: documentReadyState,
    addEventListener(type, listener, options) {
      documentListeners.push({ listener, options, type });
    },
  };
  const bootstrap = bridge.embeddedAdminBridgeBootstrap(
    installationId,
    false,
    "undetermined",
  );
  new Function("window", "document", bootstrap)(window, document);
  return { documentListeners, postedMessages };
}

const loadingBootstrap = executeBootstrap("loading");
assert.equal(loadingBootstrap.postedMessages.length, 0);
assert.equal(loadingBootstrap.documentListeners.length, 1);
assert.equal(loadingBootstrap.documentListeners[0].type, "DOMContentLoaded");
assert.deepEqual(loadingBootstrap.documentListeners[0].options, { once: true });
loadingBootstrap.documentListeners[0].listener();
assert.deepEqual(loadingBootstrap.postedMessages, [exactReadyMessage]);

const interactiveBootstrap = executeBootstrap("interactive");
assert.deepEqual(
  interactiveBootstrap.postedMessages,
  [exactReadyMessage],
  "A document already beyond loading must report native readiness immediately",
);
assert.equal(interactiveBootstrap.documentListeners.length, 0);

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
  'const [nativeBootstrapReady, setNativeBootstrapReady] = useState(false)',
  "setNativeBootstrapReady(true)",
  "nativeBootstrapReady ? (",
  'message.type === "admin_native_web_ready"',
  "markAdminWebViewReady",
]) {
  assert.ok(normalizedApp.includes(phrase), `${appPath} must include ${phrase}`);
}

for (const phrase of [
  'type: "admin_native_web_ready"',
  'document.readyState === "loading"',
  'document.addEventListener("DOMContentLoaded", notifyNativeWebReady, { once: true })',
  "window.ReactNativeWebView.postMessage",
]) {
  assert.ok(normalizedBridge.includes(phrase), `${bridgePath} must include ${phrase}`);
}

const preparationStart = app.indexOf("async function preparePrivacyLock()");
const preparationEnd = app.indexOf("void preparePrivacyLock();", preparationStart);
assert.ok(
  preparationStart >= 0 && preparationEnd > preparationStart,
  "Native bootstrap preparation must remain bounded",
);
const preparationSource = app.slice(preparationStart, preparationEnd);
for (const phrase of [
  "readOrCreateAdminInstallationId()",
  "isAdminBiometricUnlockEnabled()",
  "readAdminNativeNotificationToken()",
  "Notifications.getPermissionsAsync()",
  "setInstallationId(nextInstallationId)",
  "setNotificationEnabled",
  "setNotificationPermission(nextPermission)",
  "setNativeBootstrapReady(true)",
]) {
  assert.ok(
    preparationSource.includes(phrase),
    `Cold startup must finish ${phrase} before mounting Production`,
  );
}
const bootstrapReadyIndex = preparationSource.indexOf("setNativeBootstrapReady(true)");
for (const requiredEarlierState of [
  "setInstallationId(nextInstallationId)",
  "setNotificationEnabled",
  "setNotificationPermission(nextPermission)",
]) {
  assert.ok(
    preparationSource.indexOf(requiredEarlierState) < bootstrapReadyIndex,
    `${requiredEarlierState} must be queued before the WebView bootstrap gate opens`,
  );
}
assert.equal(
  (app.match(/setNativeBootstrapReady\(true\)/g) || []).length,
  1,
  "Only the completed native preparation path may open the WebView bootstrap gate",
);
assert.equal(
  preparationSource.includes("setNavigationKey"),
  false,
  "Preparation must not remount the first Production WebView",
);
const webViewStart = app.search(/^\s*<WebView\s*$/m);
const bootstrapGateStart = app.lastIndexOf("{nativeBootstrapReady ? (", webViewStart);
assert.ok(
  bootstrapGateStart >= 0 && bootstrapGateStart < webViewStart,
  "Production WebView must not mount before the final native bridge inputs are ready",
);

const readinessStart = app.indexOf("const markAdminWebViewReady = useCallback");
const readinessEnd = app.indexOf("const handleAdminWebViewLoadError", readinessStart);
assert.ok(readinessStart >= 0 && readinessEnd > readinessStart, "Readiness callback must exist");
const readinessSource = app.slice(readinessStart, readinessEnd);
for (const phrase of [
  "webViewLoadFailurePendingRef.current",
  "webViewHasCompletedLoadRef.current",
  "clearAdminWebViewLoadTimeout()",
  "webViewHasCompletedLoadRef.current = true",
  "webViewAutomaticRecoveryCountRef.current = 0",
  'setWebViewLoadState("ready")',
]) {
  assert.ok(readinessSource.includes(phrase), `Readiness must include ${phrase}`);
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
  "Admin Native Single-Start WebView Readiness Repair (source checkpoint 2026-09-01)",
  "Physical iPhone runtime remains untested",
  "Admin Native Blank Sign-In WebView Recovery Repair (2026-08-24)",
  "Physical Admin Build 2 evidence",
  "one bounded automatic recovery",
  "normal background and foreground transitions never remount",
  "new signed Admin build",
]) {
  assert.ok(ledger.includes(phrase), `${ledgerPath} must include ${phrase}`);
}

// Execute the real load callbacks and AppState effect with a controlled clock.
const loadCallbacks = stripTypeScriptTypes(app.slice(
  app.indexOf("const clearAdminWebViewLoadTimeout ="),
  app.indexOf("const markAdminWebViewReady ="),
), { mode: "transform" });
const lifecycleEffect = app.slice(
  app.lastIndexOf("useEffect(() => {", appStateStart),
  app.indexOf("\n  useEffect(() => {", appStateEnd),
);
function createResumeFixture() {
  const timers = new Map();
  let nextTimer = 0;
  let listener;
  let cleanup;
  const state = { load: "loading", navigationKey: 0, action: "reveal", unlocks: 0 };
  const noop = () => {};
  const context = {
    useCallback: (fn) => fn,
    useEffect: (fn) => { cleanup = fn(); },
    setTimeout: (fn) => { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout: (id) => timers.delete(id),
    webViewLoadTimeoutRef: { current: null },
    webViewHasCompletedLoadRef: { current: false },
    webViewLoadFailurePendingRef: { current: false },
    webViewAutomaticRecoveryCountRef: { current: 0 },
    adminWebViewInitialLoadTimeoutMs: 15000,
    adminWebViewAutomaticRecoveryLimit: 1,
    setWebViewLoadState: (value) => { state.load = value; },
    setNavigationKey: (fn) => { state.navigationKey = fn(state.navigationKey); },
    biometricLifecycleRef: { current: { appState: "active" } },
    biometricEnabledRef: { current: true },
    screenModeRef: { current: "web" },
    readAdminBiometricMonotonicTimeMs: () => 1000,
    transitionAdminBiometricAppState: (lifecycle, next) => {
      lifecycle.appState = next;
      return next === "active" ? state.action : "none";
    },
    setAdminScreenMode: (value) => { context.screenModeRef.current = value; },
    unlockAdminApp: () => { state.unlocks += 1; },
    Notifications: {
      setBadgeCountAsync: async () => true,
      getPermissionsAsync: async () => ({ granted: false, status: "undetermined" }),
    },
    readAdminNativeNotificationToken: async () => null,
    setBadgeResetSequence: noop,
    setNotificationPermission: noop,
    setNotificationEnabled: noop,
    adminNativeNotificationResultScript: () => "true;",
    webViewRef: { current: { injectJavaScript: noop } },
    AppState: {
      currentState: "active",
      addEventListener: (_event, fn) => { listener = fn; return { remove: () => { listener = null; } }; },
    },
  };
  const callbacks = new Function("context", `with (context) { ${loadCallbacks}\n${lifecycleEffect}\nreturn { start: handleAdminWebViewLoadStart }; }`)(context);
  return {
    context, state, timers, start: callbacks.start,
    emit(next) { context.AppState.currentState = next; listener(next); },
    expire() { const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); },
    cleanup() { cleanup(); assert.equal(listener, null); },
  };
}
const resume = createResumeFixture();
resume.start();
resume.emit("background");
assert.equal(resume.timers.size, 0, "Background pauses the existing load timeout");
resume.emit("active");
assert.equal(resume.timers.size, 1, "Quick return during an incomplete load must resume its timeout even when screenMode stays web");
assert.equal(resume.state.navigationKey, 0, "Returning must not immediately remount or reload");
resume.expire();
assert.equal(resume.state.navigationKey, 1, "Only the existing timeout may perform one automatic recovery");
resume.start();
resume.emit("background");
resume.emit("active");
resume.expire();
assert.equal(resume.state.load, "failed", "Second failed load must expose the existing Reload action instead of spinning forever");
assert.equal(resume.state.navigationKey, 1, "Automatic recovery remains capped at one");
resume.emit("background");
resume.emit("active");
assert.equal(resume.timers.size, 0, "Failed state must not silently restart after a quick return");
resume.cleanup();
const ready = createResumeFixture();
ready.context.webViewHasCompletedLoadRef.current = true;
ready.state.load = "ready";
ready.emit("background");
ready.emit("active");
assert.equal(ready.timers.size, 0, "Ready page and drafts remain mounted without a refresh timer");
assert.equal(ready.state.navigationKey, 0);
ready.cleanup();
const locked = createResumeFixture();
locked.start();
locked.emit("background");
locked.state.action = "unlock";
locked.emit("active");
assert.equal(locked.timers.size, 0, "A Face ID-required return must not start recovery before unlock");
assert.equal(locked.state.unlocks, 1);
locked.cleanup();

console.log("Admin companion WebView recovery guard passed.");
