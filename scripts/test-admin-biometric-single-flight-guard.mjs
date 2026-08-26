import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const appPath = "admin-companion/App.tsx";
const lifecyclePath = "admin-companion/src/admin-biometric-lifecycle.ts";
const appSource = await readFile(appPath, "utf8");
const lifecycleSource = await readFile(lifecyclePath, "utf8");

for (const fragment of [
  "createAdminBiometricLifecycle(AppState.currentState)",
  "beginAdminBiometricAttempt(biometricLifecycleRef.current)",
  "finishAdminBiometricAttempt( biometricLifecycleRef.current, attemptId",
  "transitionAdminBiometricAppState( biometricLifecycleRef.current, nextState",
  "biometricEnabledRef.current",
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

const compiledLifecycle = stripTypeScriptTypes(lifecycleSource, {
  mode: "transform",
}).replace(/export\s+/g, "");
const lifecycleModule = new Function(
  `${compiledLifecycle}\nreturn { beginAdminBiometricAttempt, createAdminBiometricLifecycle, finishAdminBiometricAttempt, transitionAdminBiometricAppState };`,
)();
const {
  beginAdminBiometricAttempt,
  createAdminBiometricLifecycle,
  finishAdminBiometricAttempt,
  transitionAdminBiometricAppState,
} = lifecycleModule;

function beginSingleAttempt(state, label) {
  const attempt = beginAdminBiometricAttempt(state);
  assert.equal(typeof attempt, "number", `${label}: first prompt must start`);
  assert.equal(beginAdminBiometricAttempt(state), null, `${label}: concurrent prompt must be rejected`);
  return attempt;
}

for (const promptResolutionOrder of ["before-active", "after-active"]) {
  const state = createAdminBiometricLifecycle("active");
  const attempt = beginSingleAttempt(state, promptResolutionOrder);
  assert.equal(transitionAdminBiometricAppState(state, "inactive", true), "ignore");
  if (promptResolutionOrder === "before-active") {
    assert.equal(finishAdminBiometricAttempt(state, attempt), true);
    assert.equal(transitionAdminBiometricAppState(state, "active", true), "ignore");
  } else {
    assert.equal(transitionAdminBiometricAppState(state, "active", true), "ignore");
    assert.equal(finishAdminBiometricAttempt(state, attempt), true);
  }
}

{
  const state = createAdminBiometricLifecycle("active");
  assert.equal(transitionAdminBiometricAppState(state, "inactive", true), "lock");
  assert.equal(transitionAdminBiometricAppState(state, "background", true), "lock");
  assert.equal(transitionAdminBiometricAppState(state, "active", true), "unlock");
  const attempt = beginSingleAttempt(state, "real leave and return");
  assert.equal(finishAdminBiometricAttempt(state, attempt), true);
}

{
  const state = createAdminBiometricLifecycle("active");
  assert.equal(transitionAdminBiometricAppState(state, "background", false), "ignore");
  assert.equal(transitionAdminBiometricAppState(state, "active", false), "ignore");
}

{
  const state = createAdminBiometricLifecycle("active");
  const attempt = beginSingleAttempt(state, "stale completion");
  assert.equal(finishAdminBiometricAttempt(state, attempt + 1), false);
  assert.equal(beginAdminBiometricAttempt(state), null);
  assert.equal(finishAdminBiometricAttempt(state, attempt), true);
}

console.log("Admin biometric single-flight guard passed.");
