import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const appPath = "customer-companion/App.tsx";
const lifecyclePath = "customer-companion/src/customer-biometric-lifecycle.ts";

const appSource = await readFile(appPath, "utf8");

assert.doesNotMatch(
  appSource,
  /async function preparePrivacyLock\(\)[\s\S]*?biometricPromptBusyRef\.current = true;[\s\S]*?authenticateCustomerAppUnlock\(\)/,
  "Customer startup must not bypass the shared biometric single-flight controller.",
);
assert.match(
  appSource,
  /beginCustomerBiometricAttempt/,
  "Customer startup, manual unlock, and foreground resume must share one attempt gate.",
);
assert.match(
  appSource,
  /transitionCustomerBiometricAppState/,
  "Customer AppState handling must use the tested biometric lifecycle transition.",
);

const lifecycleSource = await readFile(lifecyclePath, "utf8");
assert.match(lifecycleSource, /export function beginCustomerBiometricAttempt/);
const requireFromCustomerCompanion = createRequire(
  new URL("../customer-companion/package.json", import.meta.url),
);
const ts = requireFromCustomerCompanion("typescript");
const appTranspile = ts.transpileModule(appSource, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.Preserve,
    target: ts.ScriptTarget.ESNext,
  },
  fileName: appPath,
  reportDiagnostics: true,
});
assert.deepEqual(
  (appTranspile.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  ),
  [],
  "Customer App.tsx must remain syntactically valid TypeScript/TSX.",
);
const compiledLifecycle = ts.transpileModule(lifecycleSource, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: lifecyclePath,
}).outputText;
const lifecycleModule = { exports: {} };
new Function("exports", "module", compiledLifecycle)(
  lifecycleModule.exports,
  lifecycleModule,
);
const {
  beginCustomerBiometricAttempt,
  createCustomerBiometricLifecycle,
  finishCustomerBiometricAttempt,
  transitionCustomerBiometricAppState,
} = lifecycleModule.exports;

function expectSingleAttempt(state, label) {
  const first = beginCustomerBiometricAttempt(state);
  assert.equal(typeof first, "number", `${label}: first prompt should start`);
  assert.equal(
    beginCustomerBiometricAttempt(state),
    null,
    `${label}: a concurrent prompt must be rejected`,
  );
  return first;
}

{
  const state = createCustomerBiometricLifecycle("active");
  const attempt = expectSingleAttempt(state, "resolve before foreground");
  assert.equal(transitionCustomerBiometricAppState(state, "inactive", true), "ignore");
  assert.equal(finishCustomerBiometricAttempt(state, attempt), true);
  assert.equal(transitionCustomerBiometricAppState(state, "active", true), "ignore");
  assert.equal(beginCustomerBiometricAttempt(state) > attempt, true);
}

{
  const state = createCustomerBiometricLifecycle("active");
  const attempt = expectSingleAttempt(state, "foreground before resolve");
  assert.equal(transitionCustomerBiometricAppState(state, "inactive", true), "ignore");
  assert.equal(transitionCustomerBiometricAppState(state, "active", true), "ignore");
  assert.equal(beginCustomerBiometricAttempt(state), null);
  assert.equal(finishCustomerBiometricAttempt(state, attempt), true);
  assert.equal(typeof beginCustomerBiometricAttempt(state), "number");
}

{
  const state = createCustomerBiometricLifecycle("active");
  const attempt = expectSingleAttempt(state, "listener and state changes");
  assert.equal(transitionCustomerBiometricAppState(state, "inactive", true), "ignore");
  assert.equal(beginCustomerBiometricAttempt(state), null);
  assert.equal(transitionCustomerBiometricAppState(state, "active", true), "ignore");
  assert.equal(finishCustomerBiometricAttempt(state, attempt), true);
}

{
  const state = createCustomerBiometricLifecycle("active");
  const attempt = expectSingleAttempt(state, "mirroring immediate failure");
  assert.equal(finishCustomerBiometricAttempt(state, attempt), true);
  assert.equal(transitionCustomerBiometricAppState(state, "inactive", true), "lock");
  assert.equal(transitionCustomerBiometricAppState(state, "active", true), "unlock");
}

{
  const state = createCustomerBiometricLifecycle("active");
  assert.equal(transitionCustomerBiometricAppState(state, "background", true), "lock");
  assert.equal(transitionCustomerBiometricAppState(state, "active", true), "unlock");
  const attempt = expectSingleAttempt(state, "genuine later foreground");
  assert.equal(finishCustomerBiometricAttempt(state, attempt), true);
}

{
  const state = createCustomerBiometricLifecycle("active");
  const attempt = expectSingleAttempt(state, "stale completion");
  assert.equal(finishCustomerBiometricAttempt(state, attempt + 1), false);
  assert.equal(beginCustomerBiometricAttempt(state), null);
  assert.equal(finishCustomerBiometricAttempt(state, attempt), true);
}

console.log("Customer biometric single-flight guard passed.");
