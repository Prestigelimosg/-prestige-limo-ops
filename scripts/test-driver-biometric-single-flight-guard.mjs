import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const appPath = "driver-companion/App.tsx";
const lifecyclePath = "driver-companion/src/driver-biometric-lifecycle.ts";
const [appSource, lifecycleSource] = await Promise.all([
  readFile(appPath, "utf8"),
  readFile(lifecyclePath, "utf8"),
]);

for (const fragment of [
  "createDriverBiometricLifecycle(AppState.currentState)",
  "beginDriverBiometricAttempt",
  "finishDriverBiometricAttempt",
  "transitionDriverBiometricAppState",
  "readDriverBiometricMonotonicTimeMs()",
  'unlockStateRef.current === "ready"',
  'if (action === "reveal") setDriverUnlockState("ready")',
  "accessibilityElementsHidden={webLayerLocked}",
  'importantForAccessibility={webLayerLocked ? "no-hide-descendants" : "auto"}',
  'pointerEvents={webLayerLocked ? "none" : "auto"}',
  "const [driverWebViewMounted, setDriverWebViewMounted] = useState(false)",
  'if (nextState === "ready") setDriverWebViewMounted(true)',
  'key={screen.navigationKey}',
  'setDriverUnlockState(unlocked ? "ready" : "locked")',
]) {
  assert.equal(appSource.includes(fragment), true, `Driver covered WebView lifecycle must include: ${fragment}`);
}
assert.doesNotMatch(
  appSource,
  /biometricPromptBusyRef|biometricResumePendingRef/,
  "Driver biometric lifecycle must retire race-prone Boolean prompt markers.",
);
assert.equal(
  (appSource.match(/\n\s*<WebView\s/g) || []).length,
  1,
  "Driver must preserve one established mounted WebView rather than adding a lock-screen copy.",
);

const compiledLifecycle = stripTypeScriptTypes(lifecycleSource, { mode: "transform" })
  .replace(/export\s+/g, "");
const lifecycle = new Function(
  `${compiledLifecycle}\nreturn { DRIVER_BIOMETRIC_RETURN_GRACE_MS, beginDriverBiometricAttempt, createDriverBiometricLifecycle, finishDriverBiometricAttempt, transitionDriverBiometricAppState };`,
)();
assert.equal(lifecycle.DRIVER_BIOMETRIC_RETURN_GRACE_MS, 180_000);

function beginSingleAttempt(state, label) {
  const attempt = lifecycle.beginDriverBiometricAttempt(state);
  assert.equal(typeof attempt, "number", `${label}: first prompt must start`);
  assert.equal(lifecycle.beginDriverBiometricAttempt(state), null, `${label}: concurrent prompt blocked`);
  return attempt;
}

for (const resolutionOrder of ["before-active", "after-active"]) {
  const state = lifecycle.createDriverBiometricLifecycle("active");
  const attempt = beginSingleAttempt(state, resolutionOrder);
  assert.equal(lifecycle.transitionDriverBiometricAppState(state, "inactive", true, 1_000, false), "ignore");
  if (resolutionOrder === "before-active") {
    assert.equal(lifecycle.finishDriverBiometricAttempt(state, attempt), true);
    assert.equal(lifecycle.transitionDriverBiometricAppState(state, "active", true, 2_000, false), "ignore");
  } else {
    assert.equal(lifecycle.transitionDriverBiometricAppState(state, "active", true, 2_000, false), "ignore");
    assert.equal(lifecycle.finishDriverBiometricAttempt(state, attempt), true);
  }
  assert.equal(state.backgroundedAtMs, null, "Face ID sheet must not arm grace");
}

for (const [elapsedMs, expected] of [
  [179_999, "reveal"],
  [180_000, "unlock"],
  [180_001, "unlock"],
]) {
  const state = lifecycle.createDriverBiometricLifecycle("active");
  assert.equal(lifecycle.transitionDriverBiometricAppState(state, "inactive", true, 1_000, true), "lock");
  assert.equal(lifecycle.transitionDriverBiometricAppState(state, "background", true, 2_000, false), "lock");
  assert.equal(state.backgroundedAtMs, 1_000, "Later background must not extend grace");
  assert.equal(
    lifecycle.transitionDriverBiometricAppState(state, "active", true, 1_000 + elapsedMs, false),
    expected,
  );
  assert.equal(state.backgroundedAtMs, null);
}

for (const invalidNow of [Number.NaN, 9_999]) {
  const state = lifecycle.createDriverBiometricLifecycle("active");
  assert.equal(lifecycle.transitionDriverBiometricAppState(state, "inactive", true, 10_000, true), "lock");
  assert.equal(lifecycle.transitionDriverBiometricAppState(state, "active", true, invalidNow, false), "unlock");
}

{
  const state = lifecycle.createDriverBiometricLifecycle("active");
  assert.equal(lifecycle.transitionDriverBiometricAppState(state, "inactive", true, 10_000, false), "lock");
  assert.equal(lifecycle.transitionDriverBiometricAppState(state, "active", true, 11_000, false), "unlock");
}

{
  const state = lifecycle.createDriverBiometricLifecycle("active");
  assert.equal(lifecycle.transitionDriverBiometricAppState(state, "inactive", true, 1_000, true), "lock");
  assert.equal(lifecycle.transitionDriverBiometricAppState(state, "active", true, 180_999, false), "reveal");
  assert.equal(lifecycle.transitionDriverBiometricAppState(state, "active", true, 181_000, false), "ignore");
}

{
  const state = lifecycle.createDriverBiometricLifecycle("active");
  const attempt = beginSingleAttempt(state, "stale completion");
  assert.equal(lifecycle.finishDriverBiometricAttempt(state, attempt + 1), false);
  assert.equal(lifecycle.beginDriverBiometricAttempt(state), null);
  assert.equal(lifecycle.finishDriverBiometricAttempt(state, attempt), true);
}

console.log("Driver biometric 180-second single-flight guard passed.");
