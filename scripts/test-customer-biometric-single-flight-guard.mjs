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
for (const fragment of [
  "readCustomerBiometricMonotonicTimeMs()",
  'unlockStateRef.current === "ready"',
  'if (action === "reveal") setCustomerUnlockState("ready")',
  "accessibilityElementsHidden={webLayerLocked}",
  'importantForAccessibility={webLayerLocked ? "no-hide-descendants" : "auto"}',
  'pointerEvents={webLayerLocked ? "none" : "auto"}',
  "const [customerWebViewMounted, setCustomerWebViewMounted] = useState(false)",
  'if (nextState === "ready") setCustomerWebViewMounted(true)',
  "customerWebViewMounted && nativeAlertsPreferenceReady",
]) {
  assert.equal(
    appSource.includes(fragment),
    true,
    `Customer app must preserve the 60-second covered WebView lifecycle: ${fragment}`,
  );
}

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
  CUSTOMER_BIOMETRIC_RETURN_GRACE_MS,
  beginCustomerBiometricAttempt,
  createCustomerBiometricLifecycle,
  finishCustomerBiometricAttempt,
  transitionCustomerBiometricAppState,
} = lifecycleModule.exports;
assert.equal(CUSTOMER_BIOMETRIC_RETURN_GRACE_MS, 60_000);

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
  assert.equal(transitionCustomerBiometricAppState(state, "inactive", true, 1_000, false), "ignore");
  assert.equal(finishCustomerBiometricAttempt(state, attempt), true);
  assert.equal(transitionCustomerBiometricAppState(state, "active", true, 2_000, false), "ignore");
  assert.equal(state.backgroundedAtMs, null, "Face ID's own sheet must not arm grace");
  assert.equal(beginCustomerBiometricAttempt(state) > attempt, true);
}

{
  const state = createCustomerBiometricLifecycle("active");
  const attempt = expectSingleAttempt(state, "foreground before resolve");
  assert.equal(transitionCustomerBiometricAppState(state, "inactive", true, 1_000, false), "ignore");
  assert.equal(transitionCustomerBiometricAppState(state, "active", true, 2_000, false), "ignore");
  assert.equal(beginCustomerBiometricAttempt(state), null);
  assert.equal(finishCustomerBiometricAttempt(state, attempt), true);
  assert.equal(state.backgroundedAtMs, null, "Face ID's own sheet must not arm grace");
  assert.equal(typeof beginCustomerBiometricAttempt(state), "number");
}

{
  const state = createCustomerBiometricLifecycle("active");
  const attempt = expectSingleAttempt(state, "listener and state changes");
  assert.equal(transitionCustomerBiometricAppState(state, "inactive", true, 1_000, false), "ignore");
  assert.equal(beginCustomerBiometricAttempt(state), null);
  assert.equal(transitionCustomerBiometricAppState(state, "active", true, 2_000, false), "ignore");
  assert.equal(finishCustomerBiometricAttempt(state, attempt), true);
}

for (const [elapsedMs, expected] of [
  [59_000, "reveal"],
  [60_000, "unlock"],
  [61_000, "unlock"],
]) {
  const state = createCustomerBiometricLifecycle("active");
  assert.equal(
    transitionCustomerBiometricAppState(state, "inactive", true, 1_000, true),
    "lock",
  );
  assert.equal(
    transitionCustomerBiometricAppState(state, "background", true, 2_000, false),
    "lock",
  );
  assert.equal(
    state.backgroundedAtMs,
    1_000,
    "A later background event must not extend the Customer grace window",
  );
  assert.equal(
    transitionCustomerBiometricAppState(state, "active", true, 1_000 + elapsedMs, false),
    expected,
    `${elapsedMs / 1_000}s Customer return boundary`,
  );
  assert.equal(state.backgroundedAtMs, null, "A Customer return must consume its grace window");
}

{
  const state = createCustomerBiometricLifecycle("active");
  assert.equal(
    transitionCustomerBiometricAppState(state, "inactive", true, 10_000, false),
    "lock",
  );
  assert.equal(
    transitionCustomerBiometricAppState(state, "active", true, 11_000, false),
    "unlock",
    "A Customer app already covered at leave must never receive return grace",
  );
}

for (const invalidReturnTime of [Number.NaN, 9_999]) {
  const state = createCustomerBiometricLifecycle("active");
  assert.equal(
    transitionCustomerBiometricAppState(state, "inactive", true, 10_000, true),
    "lock",
  );
  assert.equal(
    transitionCustomerBiometricAppState(state, "active", true, invalidReturnTime, false),
    "unlock",
    "Invalid or backwards Customer time must fail closed to Face ID",
  );
}

{
  const state = createCustomerBiometricLifecycle("active");
  assert.equal(
    transitionCustomerBiometricAppState(state, "background", false, 1_000, true),
    "ignore",
  );
  assert.equal(
    transitionCustomerBiometricAppState(state, "active", false, 2_000, false),
    "ignore",
  );
}

{
  const state = createCustomerBiometricLifecycle("active");
  assert.equal(
    transitionCustomerBiometricAppState(state, "inactive", true, 1_000, true),
    "lock",
  );
  assert.equal(
    transitionCustomerBiometricAppState(state, "active", true, 60_000, false),
    "reveal",
  );
  assert.equal(
    transitionCustomerBiometricAppState(state, "active", true, 60_500, false),
    "ignore",
    "Repeated active Customer events must not reveal or prompt again",
  );
}

{
  const state = createCustomerBiometricLifecycle("active");
  const attempt = expectSingleAttempt(state, "stale completion");
  assert.equal(finishCustomerBiometricAttempt(state, attempt + 1), false);
  assert.equal(beginCustomerBiometricAttempt(state), null);
  assert.equal(finishCustomerBiometricAttempt(state, attempt), true);
}

console.log("Customer biometric single-flight guard passed.");
