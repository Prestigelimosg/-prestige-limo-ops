import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const appPath = "admin-companion/App.tsx";
const lifecyclePath = "admin-companion/src/admin-biometric-lifecycle.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const [appSource, lifecycleSource, ledgerSource] = await Promise.all([
  readFile(appPath, "utf8"),
  readFile(lifecyclePath, "utf8"),
  readFile(ledgerPath, "utf8"),
]);

for (const fragment of [
  "createAdminBiometricLifecycle(AppState.currentState)",
  "beginAdminBiometricAttempt(biometricLifecycleRef.current)",
  "finishAdminBiometricAttempt( biometricLifecycleRef.current, attemptId",
  "transitionAdminBiometricAppState( biometricLifecycleRef.current, nextState, biometricEnabledRef.current, readAdminBiometricMonotonicTimeMs(), screenModeRef.current === \"web\"",
  "biometricEnabledRef.current",
  "setAdminScreenMode",
  'if (biometricAction === "reveal") setAdminScreenMode("web")',
]) {
  assert.match(
    appSource.replace(/\s+/g, " "),
    new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `Admin app must use the shared attempt-scoped lifecycle: ${fragment}`,
  );
}
assert.doesNotMatch(
  appSource,
  /biometricPromptBusyRef|biometricResumePendingRef/,
  "The two race-prone Boolean biometric markers must be retired.",
);
assert.match(
  lifecycleSource,
  /globalThis\.performance\?\.now/,
  "The Admin return grace must use the process monotonic clock and fail closed if unavailable.",
);
assert.match(
  ledgerSource,
  /Admin Native 60-Second Face ID Return Grace Repair/,
  "The Admin 60-second return-grace repair must be recorded in the implementation ledger.",
);

const compiledLifecycle = stripTypeScriptTypes(lifecycleSource, {
  mode: "transform",
}).replace(/export\s+/g, "");
const lifecycleModule = new Function(
  `${compiledLifecycle}\nreturn { ADMIN_BIOMETRIC_RETURN_GRACE_MS, beginAdminBiometricAttempt, createAdminBiometricLifecycle, finishAdminBiometricAttempt, transitionAdminBiometricAppState };`,
)();
const {
  ADMIN_BIOMETRIC_RETURN_GRACE_MS,
  beginAdminBiometricAttempt,
  createAdminBiometricLifecycle,
  finishAdminBiometricAttempt,
  transitionAdminBiometricAppState,
} = lifecycleModule;
assert.equal(ADMIN_BIOMETRIC_RETURN_GRACE_MS, 60_000);

function beginSingleAttempt(state, label) {
  const attempt = beginAdminBiometricAttempt(state);
  assert.equal(typeof attempt, "number", `${label}: first prompt must start`);
  assert.equal(beginAdminBiometricAttempt(state), null, `${label}: concurrent prompt must be rejected`);
  return attempt;
}

for (const promptResolutionOrder of ["before-active", "after-active"]) {
  const state = createAdminBiometricLifecycle("active");
  const attempt = beginSingleAttempt(state, promptResolutionOrder);
  assert.equal(
    transitionAdminBiometricAppState(state, "inactive", true, 1_000, false),
    "ignore",
  );
  if (promptResolutionOrder === "before-active") {
    assert.equal(finishAdminBiometricAttempt(state, attempt), true);
    assert.equal(
      transitionAdminBiometricAppState(state, "active", true, 2_000, false),
      "ignore",
    );
  } else {
    assert.equal(
      transitionAdminBiometricAppState(state, "active", true, 2_000, false),
      "ignore",
    );
    assert.equal(finishAdminBiometricAttempt(state, attempt), true);
  }
  assert.equal(state.backgroundedAtMs, null, "Face ID's own sheet must not arm grace");
}

for (const [elapsedMs, expected] of [
  [59_000, "reveal"],
  [60_000, "unlock"],
  [61_000, "unlock"],
]) {
  const state = createAdminBiometricLifecycle("active");
  assert.equal(
    transitionAdminBiometricAppState(state, "inactive", true, 1_000, true),
    "lock",
  );
  assert.equal(
    transitionAdminBiometricAppState(state, "background", true, 2_000, false),
    "lock",
  );
  assert.equal(
    state.backgroundedAtMs,
    1_000,
    "The later background event must not extend the grace window",
  );
  assert.equal(
    transitionAdminBiometricAppState(state, "active", true, 1_000 + elapsedMs, false),
    expected,
    `${elapsedMs / 1_000}s return boundary`,
  );
  assert.equal(state.backgroundedAtMs, null, "A return must consume its grace window");
}

{
  const state = createAdminBiometricLifecycle("active");
  assert.equal(
    transitionAdminBiometricAppState(state, "inactive", true, 10_000, false),
    "lock",
  );
  assert.equal(
    transitionAdminBiometricAppState(state, "active", true, 11_000, false),
    "unlock",
    "An already-locked app must never receive the return grace",
  );
}

for (const invalidReturnTime of [Number.NaN, 9_999]) {
  const state = createAdminBiometricLifecycle("active");
  assert.equal(
    transitionAdminBiometricAppState(state, "inactive", true, 10_000, true),
    "lock",
  );
  assert.equal(
    transitionAdminBiometricAppState(state, "active", true, invalidReturnTime, false),
    "unlock",
    "Invalid or backwards time must fail closed to Face ID",
  );
}

{
  const state = createAdminBiometricLifecycle("active");
  assert.equal(
    transitionAdminBiometricAppState(state, "background", false, 1_000, true),
    "ignore",
  );
  assert.equal(
    transitionAdminBiometricAppState(state, "active", false, 2_000, false),
    "ignore",
  );
}

{
  const state = createAdminBiometricLifecycle("active");
  assert.equal(
    transitionAdminBiometricAppState(state, "inactive", true, 1_000, true),
    "lock",
  );
  assert.equal(
    transitionAdminBiometricAppState(state, "active", true, 59_000, false),
    "reveal",
  );
  assert.equal(
    transitionAdminBiometricAppState(state, "active", true, 59_500, false),
    "ignore",
    "Repeated active events must not loop or prompt",
  );
}

{
  const state = createAdminBiometricLifecycle("active");
  const attempt = beginSingleAttempt(state, "stale completion");
  assert.equal(finishAdminBiometricAttempt(state, attempt + 1), false);
  assert.equal(beginAdminBiometricAttempt(state), null);
  assert.equal(finishAdminBiometricAttempt(state, attempt), true);
}

console.log("Admin biometric single-flight guard passed.");
