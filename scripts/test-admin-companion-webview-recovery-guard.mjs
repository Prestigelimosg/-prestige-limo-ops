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
  "nativeBootstrapReady && webViewStarted ? (",
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
const bootstrapGateStart = app.lastIndexOf("{nativeBootstrapReady && webViewStarted ? (", webViewStart);
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
const loadingEffectStart = app.indexOf("\n  useEffect(() => {", appStateEnd);
const loadingEffect = app.slice(
  loadingEffectStart,
  app.indexOf("\n  useEffect(() => {", loadingEffectStart + 5),
);
const biometricSource = stripTypeScriptTypes(await readFile(
  "admin-companion/src/admin-biometric-lifecycle.ts", "utf8",
), { mode: "transform" }).replace(/\bexport\s+/g, "");
const biometric = new Function(`${biometricSource}\nreturn {
  createAdminBiometricLifecycle, beginAdminBiometricAttempt,
  finishAdminBiometricAttempt, transitionAdminBiometricAppState,
};`)();
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
    biometricLifecycleRef: { current: { appState: "active", activeAttemptId: null } },
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
    renderLoadingEffect() {
      new Function("context", `with (context) { ${loadingEffect} }`)({
        ...context,
        useEffect: (effect) => effect(),
        screenMode: context.screenModeRef.current,
        webViewLoadState: state.load,
        handleAdminWebViewLoadStart: callbacks.start,
      });
    },
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

// Run the real Face ID lifecycle together with the real WebView callbacks.
// Face ID may resolve before or after iOS announces that the app is active.
for (const resolutionOrder of ["before-active", "after-active"]) {
  const prompt = createResumeFixture();
  prompt.context.biometricLifecycleRef.current = biometric.createAdminBiometricLifecycle("active");
  prompt.context.transitionAdminBiometricAppState = biometric.transitionAdminBiometricAppState;
  const lifecycle = prompt.context.biometricLifecycleRef.current;
  const attempt = biometric.beginAdminBiometricAttempt(lifecycle);
  prompt.context.setAdminScreenMode("checking");
  prompt.start();
  prompt.emit("inactive");
  assert.equal(prompt.timers.size, 0, "Face ID inactivity pauses the existing timer");
  const finishUnlock = () => {
    assert.equal(biometric.finishAdminBiometricAttempt(lifecycle, attempt), true);
    prompt.context.setAdminScreenMode("web");
    prompt.renderLoadingEffect();
  };
  if (resolutionOrder === "before-active") {
    finishUnlock();
    assert.equal(prompt.timers.size, 0, "Never recover while iOS is inactive");
    prompt.emit("active");
  } else {
    prompt.emit("active");
    assert.equal(prompt.timers.size, 0, "Never recover while Face ID is unresolved");
    finishUnlock();
  }
  assert.equal(prompt.context.screenModeRef.current, "web");
  assert.equal(prompt.timers.size, 1, `${resolutionOrder}: unlocked incomplete page must retain one recovery timer`);
  const existingTimer = prompt.context.webViewLoadTimeoutRef.current;
  prompt.emit("active");
  assert.equal(prompt.context.webViewLoadTimeoutRef.current, existingTimer, "Repeated active event must not restart the deadline");
  assert.equal(prompt.state.navigationKey, 0, "Successful Face ID must not immediately remount the page");
  prompt.expire();
  assert.equal(prompt.state.navigationKey, 1, "Existing timeout permits only one automatic retry");
  prompt.start(); // The replacement WebView starts its actual next load.
  prompt.expire();
  assert.equal(prompt.state.load, "failed", "Second failed load exposes existing Reload Admin screen");
  assert.equal(prompt.state.navigationKey, 1);
  prompt.cleanup();
}

for (const mode of ["ready", "failed", "locked", "pending-biometric", "already-timed"]) {
  const preserved = createResumeFixture();
  preserved.context.biometricLifecycleRef.current = biometric.createAdminBiometricLifecycle("active");
  preserved.context.transitionAdminBiometricAppState = biometric.transitionAdminBiometricAppState;
  const lifecycle = preserved.context.biometricLifecycleRef.current;
  const attempt = biometric.beginAdminBiometricAttempt(lifecycle);
  preserved.context.setAdminScreenMode("checking");
  preserved.emit("inactive");
  if (mode !== "pending-biometric") biometric.finishAdminBiometricAttempt(lifecycle, attempt);
  preserved.context.setAdminScreenMode(mode === "locked" ? "locked" : "web");
  if (mode === "ready") {
    preserved.context.webViewHasCompletedLoadRef.current = true;
    preserved.state.load = "ready";
  }
  if (mode === "failed") {
    preserved.context.webViewLoadFailurePendingRef.current = true;
    preserved.state.load = "failed";
  }
  if (mode === "already-timed") preserved.start();
  const timer = preserved.context.webViewLoadTimeoutRef.current;
  preserved.emit("active");
  assert.equal(preserved.context.webViewLoadTimeoutRef.current, timer, `${mode}: retain existing timer or lack of timer`);
  assert.equal(preserved.state.navigationKey, 0, `${mode}: never remount`);
  preserved.cleanup();
}

console.log("Admin companion WebView recovery guard passed.");

// Execute cold startup and navigation with Face ID deliberately unresolved.
// The real JSX mount gate must prevent a signed-in redirect from reaching the
// still-locked navigation callback; later locks must retain the same WebView.
const navigationSource = stripTypeScriptTypes(await readFile(
  'admin-companion/src/admin-navigation.ts', 'utf8',
), { mode: 'transform' }).replace(/\bexport\s+/g, '');
const navigation = new Function(`${navigationSource}; return {
  adminSignInUrl, isAdminSignInUrl, isProtectedAdminUrl, shouldAllowAdminWebViewNavigation,
};`)();
const modeCallback = stripTypeScriptTypes(app.slice(
  app.indexOf('const setAdminScreenMode ='),
  app.indexOf('const clearAdminWebViewLoadTimeout ='),
), { mode: 'transform' });
const unlockCallback = stripTypeScriptTypes(app.slice(
  app.indexOf('const unlockAdminApp ='),
  app.indexOf('const completeMandatoryEnrollment ='),
), { mode: 'transform' });
const navigationCallback = stripTypeScriptTypes(app.slice(
  app.indexOf('const allowNavigation ='),
  app.indexOf('const updateNavigation ='),
), { mode: 'transform' });
const mountGate = app.match(/\{([^{}\n]+)\s*\?\s*\(\s*<WebView\s/);
assert.ok(mountGate, 'The established WebView must have one explicit startup gate');
assert.ok(app.includes('const [webViewStarted, setWebViewStarted] = useState(false)'),
  'Each cold process must wait for its first successful unlock or ordinary unenrolled sign-in');
assert.equal((app.match(/setWebViewStarted\(/g) || []).length, 1,
  'Only the existing verified screen-mode callback may open the first-load gate');

async function coldStartupFixture(enabled, nativePreparationFails = false) {
  const state = { mode: 'checking', nativeReady: false, started: false, enabled: false, enrollments: 0 };
  let resolveBiometric;
  const context = {
    ...navigation,
    mounted: true,
    useCallback: (fn) => fn,
    setScreenMode: (value) => { state.mode = value; },
    setWebViewStarted: (value) => { state.started = value; },
    screenModeRef: { current: 'checking' },
    readOrCreateAdminInstallationId: async () => {
      if (nativePreparationFails) throw new Error('synthetic secure storage unavailable');
      return 'synthetic-installation';
    },
    isAdminBiometricUnlockEnabled: async () => enabled,
    readAdminNativeNotificationToken: async () => null,
    Notifications: {
      getPermissionsAsync: async () => ({ granted: false, status: 'undetermined' }),
      setBadgeCountAsync: async () => true,
    },
    setInstallationId() {},
    biometricEnabledRef: { current: false },
    setBiometricEnabled: (value) => { state.enabled = value; },
    setNotificationEnabled() {},
    setNotificationPermission() {},
    setNativeBootstrapReady: (value) => { state.nativeReady = value; },
    beginAdminBiometricAttempt: () => 1,
    finishAdminBiometricAttempt: () => true,
    biometricLifecycleRef: { current: {} },
    authenticateAdminAppUnlock: () => new Promise((resolve) => { resolveBiometric = resolve; }),
    setNotice() {},
    completeMandatoryEnrollment: () => { state.enrollments += 1; },
  };
  context.setAdminScreenMode = new Function('context', `with (context) {
    ${modeCallback}; return setAdminScreenMode;
  }`)(context);
  const prepare = new Function('context', `with (context) {
    ${stripTypeScriptTypes(preparationSource, { mode: 'transform' })}; return preparePrivacyLock;
  }`)(context);
  const pendingPreparation = prepare();
  await new Promise((resolve) => setImmediate(resolve));
  const retry = new Function('context', `with (context) {
    ${unlockCallback}; return unlockAdminApp;
  }`)(context);
  return {
    state,
    pendingPreparation,
    finishBiometric: (success) => resolveBiometric(success),
    setMode: context.setAdminScreenMode,
    retry,
    mounted: () => new Function('nativeBootstrapReady', 'webViewStarted',
      `return Boolean(${mountGate[1]});`)(state.nativeReady, state.started),
    allow: (url) => new Function('context', `with (context) {
      ${navigationCallback}; return allowNavigation({url: requestedUrl});
    }`)({ ...context, biometricEnabled: state.enabled, screenMode: state.mode, requestedUrl: url }),
  };
}

const cold = await coldStartupFixture(true);
assert.equal(cold.state.nativeReady, true, 'Native bridge preparation still finishes before first mount');
assert.equal(cold.state.mode, 'checking');
assert.equal(cold.allow(navigation.adminSignInUrl()), true);
assert.equal(cold.allow('https://app.prestigelimo.sg/'), false, 'Face ID navigation protection must not be weakened');
assert.equal(cold.mounted(), false,
  'Cold startup must not load sign-in while Face ID is pending and cancel its protected redirect');
cold.finishBiometric(true);
await cold.pendingPreparation;
assert.equal(cold.mounted(), true);
assert.equal(cold.allow('https://app.prestigelimo.sg/'), true);
for (const mode of ['locked', 'checking', 'enrollment-required', 'web']) {
  cold.setMode(mode);
  assert.equal(cold.mounted(), true, `Later ${mode} state must preserve the already-mounted page and draft`);
}
assert.equal(cold.allow('https://example.com/'), false);

const cancelledCold = await coldStartupFixture(true);
cancelledCold.finishBiometric(false);
await cancelledCold.pendingPreparation;
assert.equal(cancelledCold.mounted(), false, 'Cancelled first Face ID must not start protected navigation');
assert.equal(cancelledCold.state.mode, 'locked');
const pendingRetry = cancelledCold.retry();
assert.equal(cancelledCold.mounted(), false, 'First manual unlock still waits for actual success');
cancelledCold.finishBiometric(true);
await pendingRetry;
assert.equal(cancelledCold.mounted(), true, 'Successful existing Unlock control must start the first page');

const firstInstall = await coldStartupFixture(false);
await firstInstall.pendingPreparation;
assert.equal(firstInstall.mounted(), true, 'An unenrolled first install must still reach its ordinary sign-in page');
assert.equal(firstInstall.allow(navigation.adminSignInUrl()), true);
assert.equal(firstInstall.allow('https://app.prestigelimo.sg/'), false);
assert.equal(firstInstall.state.enrollments, 1, 'Protected first access must still require mandatory enrollment');

const unavailable = await coldStartupFixture(true, true);
await unavailable.pendingPreparation;
assert.equal(unavailable.mounted(), false, 'Failed secure native preparation must not mount a page');
assert.equal(unavailable.state.mode, 'locked');
assert.equal((app.match(/setWebViewStarted\(false\)/g) || []).length, 0,
  'Background, Face ID and OTP handoffs must never reset the first-load latch');
console.log('Admin first-unlock WebView startup execution passed.');
