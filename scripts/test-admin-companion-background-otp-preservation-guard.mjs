import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPath = "admin-companion/App.tsx";
const signInPath = "app/admin-sign-in/admin-sign-in-form.tsx";
const app = await readFile(appPath, "utf8");
const signIn = await readFile(signInPath, "utf8");
const ledger = await readFile("docs/current-implementation-ledger.md", "utf8");
const preactivation = await readFile("scripts/test-preactivation-verification-suite.mjs", "utf8");
const normalizedApp = app.replace(/\s+/g, " ");

assert.equal(
  (app.match(/^\s*<WebView\s*$/gm) || []).length,
  1,
  "The Admin companion must retain one established WebView instance",
);
assert.equal(
  app.includes('if (screenMode !== "web")'),
  false,
  "The native lock must not unmount the in-progress Admin sign-in WebView",
);
assert.ok(
  normalizedApp.includes("{nativeBootstrapReady ? ( <WebView"),
  "The first WebView may wait for native bootstrap inputs but must stay mounted across privacy locks",
);
assert.equal(
  (app.match(/setNativeBootstrapReady\(false\)/g) || []).length,
  0,
  "Backgrounding and Face ID locks must never unmount the initialized WebView",
);

for (const phrase of [
  'const webLayerLocked = screenMode !== "web"',
  'pointerEvents={webLayerLocked ? "none" : "auto"}',
  "accessibilityElementsHidden={webLayerLocked}",
  'importantForAccessibility={webLayerLocked ? "no-hide-descendants" : "auto"}',
  "webLayerLocked ? styles.hiddenWebLayer : null",
  "webLayerLocked ? (",
  "styles.lockOverlay",
  'opacity: 0',
  'backgroundColor: colors.background',
  'StyleSheet.absoluteFill',
]) {
  assert.ok(normalizedApp.includes(phrase), `${appPath} must include ${phrase}`);
}

const unlockStart = app.indexOf("const unlockAdminApp = useCallback");
const enrollmentStart = app.indexOf("const completeMandatoryEnrollment", unlockStart);
assert.ok(unlockStart >= 0 && enrollmentStart > unlockStart, "Admin unlock callback must remain in place");
const unlockSource = app.slice(unlockStart, enrollmentStart);
assert.ok(
  unlockSource.includes('setAdminScreenMode(unlocked ? "web" : "locked")'),
  "A cancelled or failed Face ID check must remain locked and only success may reveal the WebView",
);
assert.equal(
  unlockSource.includes("setNavigationKey"),
  false,
  "Foreground Face ID unlock must reveal the same WebView identity rather than remount it",
);
assert.equal(
  unlockSource.includes("setCurrentUrl"),
  false,
  "Foreground Face ID unlock must preserve the current sign-in URL and page state",
);

for (const phrase of [
  "transitionAdminBiometricAppState",
  'if (biometricAction === "lock")',
  'if (biometricAction === "reveal") setAdminScreenMode("web")',
  'if (biometricAction === "unlock") void unlockAdminApp()',
  'if (isProtectedAdminUrl(request.url) && !biometricEnabled)',
  "return biometricEnabled && screenMode === \"web\"",
  'key={`prestige-admin-webview-${navigationKey}`}',
]) {
  assert.ok(normalizedApp.includes(phrase), `${appPath} must preserve ${phrase}`);
}

for (const forbidden of [
  "AsyncStorage",
  "sessionStorage",
  "localStorage",
  "prestige.admin.otp",
  "prestige.admin.email",
  "prestige.admin.pin",
]) {
  assert.equal(app.includes(forbidden), false, `Admin native source must not persist ${forbidden}`);
}

for (const phrase of [
  'const [pin, setPin] = useState("")',
  'autoComplete="current-password"',
  'type="password"',
  'pattern="[0-9]{6}"',
]) {
  assert.ok(signIn.includes(phrase), `The existing in-memory PIN form must retain ${phrase}`);
}
for (const forbidden of ["sessionStorage", "localStorage", "AsyncStorage", "SecureStore"]) {
  assert.equal(signIn.includes(forbidden), false, `The Admin PIN form must not persist through ${forbidden}`);
}

assert.ok(
  preactivation.includes("scripts/test-admin-companion-background-otp-preservation-guard.mjs"),
  "The Admin background OTP preservation guard must run in preactivation verification",
);
for (const phrase of [
  "Admin Sign-In Background OTP State Preservation Repair (2026-08-21)",
  "`b008ec758885f739b01037eb50cc4e1e75c98463`",
  "same mounted WebView",
  "No email address or one-time code is persisted",
]) {
  assert.ok(ledger.includes(phrase), `Implementation ledger must include ${phrase}`);
}

console.log("Admin companion background OTP preservation guard passed.");
