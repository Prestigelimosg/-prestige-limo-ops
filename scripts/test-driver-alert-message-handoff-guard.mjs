import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { embeddedDriverBridgeBootstrap, parseDriverBridgeMessage } from "../driver-companion/src/driver-webview-bridge.ts";

const jobKey = "a".repeat(64);
const jobUrl = `https://app.prestigelimo.sg/driver-job/${"b".repeat(64)}`;
const installationId = "11111111-1111-4111-8111-111111111111";
const files = await Promise.all([
  "app/driver-portal/page.tsx", "driver-companion/App.tsx", "app/driver-job/[token]/page.tsx",
].map((path) => readFile(path, "utf8")));
function extract(source, predicate) {
  const ast = ts.createSourceFile("source.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result;
  function visit(node) { if (predicate(node, ast)) result = node; ts.forEachChild(node, visit); }
  visit(ast);
  assert.ok(result);
  return { node: result, ast };
}
function evaluate(source, bindings) {
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), js)(...Object.values(bindings));
}
const portal = extract(files[0], (node) => ts.isFunctionDeclaration(node) && node.name?.text === "openJob");
const native = extract(files[1], (node) => ts.isVariableDeclaration(node) && node.name.getText() === "handleBridgeMessage");
const nativeCallback = native.node.initializer.arguments[0].getText(native.ast);
const destination = extract(files[2], (node) => ts.isCallExpression(node) && node.expression.getText() === "useEffect" &&
  node.arguments[0]?.getText().includes('currentEmbeddedDriverOpenTarget() !== "messages"'));
const bootstrapWindow = {};
evaluate(embeddedDriverBridgeBootstrap(installationId, false), { window: bootstrapWindow, navigator: {} });
assert.equal(bootstrapWindow.__PRESTIGE_DRIVER_MESSAGE_OPEN_SUPPORTED__, true);

for (const [alert, supported, expectedTarget] of [[true, true, "messages"], [false, true, null], [true, false, null]]) {
  let payload;
  const open = evaluate(`${portal.node.getText(portal.ast)}\nreturn openJob;`, {
    installationId,
    window: { __PRESTIGE_DRIVER_MESSAGE_OPEN_SUPPORTED__: supported, ReactNativeWebView: { postMessage(value) { payload = value; } } },
    setOpeningJobKey() {}, setOpenFeedback() {}, setNotificationCentreOpen() {},
  });
  await open({ job_key: jobKey }, alert);
  const parsed = parseDriverBridgeMessage(payload);
  assert.ok(parsed);
  assert.equal(parsed.openTarget ?? null, expectedTarget);
  assert.equal(parsed.jobKey, jobKey);
  const opened = [];
  const failures = [];
  const bindings = {
    parseDriverBridgeMessage,
    currentWebViewUrlRef: { current: "https://app.prestigelimo.sg/driver-portal" },
    productionOrigin: "https://app.prestigelimo.sg",
    bridgeBusyRef: { current: false },
    loadNativeDriverJob: async (key) => { assert.equal(key, jobKey); return { jobUrl }; },
    receiveDriverJobUrl: async (url, target = null) => opened.push({ url, target }),
    sendNativeJobOpenResult: (value) => failures.push(value),
  };
  const handle = evaluate(`return (${nativeCallback});`, bindings);
  await handle({ nativeEvent: { data: payload } });
  assert.deepEqual(opened, [{ url: jobUrl, target: expectedTarget }]);
  assert.deepEqual(failures, []);
  assert.equal(bindings.bridgeBusyRef.current, false);
  let scrolled = false;
  const destinationEffect = evaluate(`return (${destination.node.arguments[0].getText(destination.ast)});`, {
    pageState: { kind: "ready" }, embeddedDriverApp: true,
    currentEmbeddedDriverOpenTarget: () => opened[0].target,
    driverAppUpdatesOpenTargetHandledRef: { current: false },
    document: { querySelector(selector) {
      assert.equal(selector, '[data-driver-job-app-updates="true"]');
      return { scrollIntoView() { scrolled = true; } };
    } },
    window: { requestAnimationFrame(callback) { callback(); return 1; }, cancelAnimationFrame() {} },
  });
  destinationEffect();
  assert.equal(scrolled, expectedTarget === "messages", "The existing exact private page must consume the alert destination");
  bindings.currentWebViewUrlRef.current = jobUrl;
  await handle({ nativeEvent: { data: payload } });
  assert.equal(opened.length, 1, "Only the verified portal may request an opaque job open");
  assert.equal(failures.at(-1).ok, false);
  bindings.currentWebViewUrlRef.current = "https://app.prestigelimo.sg/driver-portal";
  const missing = evaluate(`return (${nativeCallback});`, { ...bindings, loadNativeDriverJob: async () => null });
  await missing({ nativeEvent: { data: payload } });
  assert.equal(opened.length, 1, "Missing exact private mapping must not open a substitute job");
}
for (const invalid of [
  { job_key: jobKey, type: "native_job_open", open_target: "arbitrary" },
  { job_key: jobKey, type: "native_job_open", open_target: "messages", token: "untrusted" },
  { job_key: jobKey, type: "native_job_remember", open_target: "messages" },
]) assert.equal(parseDriverBridgeMessage(JSON.stringify(invalid)), null);
assert.match(files[0], /data-driver-notification-purpose="job-update"[\s\S]{0,180}openJob\(job, true\)/);
assert.match(files[2], /currentEmbeddedDriverOpenTarget\(\) !== "messages"/);
assert.match(files[2], /data-driver-job-app-updates="true"[\s\S]*?scrollIntoView/);
console.log("Driver alert message handoff guard passed");
