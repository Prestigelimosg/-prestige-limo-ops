import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Execute the existing UI callbacks and route; intercept device/network effects.
// This does not contact a provider, change a phone, or simulate successful writes.
const source = fs.readFileSync(new URL("../app/driver-portal/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate) {
  let found;
  const walk = node => { if (!found && predicate(node)) found = node; if (!found) ts.forEachChild(node, walk); };
  walk(tree);
  assert.ok(found, "Existing UI element/function must exist");
  return found;
}
function execute(code, context) {
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, ...context });
  return compiledModule.exports;
}
const handler = find(node => ts.isFunctionDeclaration(node) && node.name?.text === "enableJobAlerts");
async function invokeAlerts(reviewSession, nativeBridgeReady, accountSession = false) {
  const effects = [];
  const notification = { permission: "default", requestPermission: async () => { effects.push("permission"); return "denied"; } };
  const call = execute(`exports.run = ${handler.getText(tree)}`, {
    readState: { kind: "ready", reviewSession, accountSession, jobs: [{job_key:"qa-job"}] },
    nativeBridgeReady,
    window: { Notification: notification, PushManager: {}, __PRESTIGE_DRIVER_ACCOUNT_ALERT_REGISTRATION_SUPPORTED__: true,
      ReactNativeWebView: { postMessage: value => effects.push(JSON.parse(value)) } },
    Notification: notification, navigator: {serviceWorker:{}},
    alertReadiness: {ready:true,publicKey:"synthetic-public-key"},
    nativeAlertRecoveryRef: {current:"idle"}, nativeAlertAutoRepairAttemptedRef: {current:false},
    setAlertState: () => {},
  }).run;
  await call();
  return effects;
}
const reviewNative = await invokeAlerts(true, true);
const reviewBrowser = await invokeAlerts(true, false);
assert.equal(reviewNative.length, 0, `Reviewer must not invoke native registration: ${JSON.stringify(reviewNative)}`);
assert.equal(reviewBrowser.length, 0, `Reviewer must not request browser notification permission: ${JSON.stringify(reviewBrowser)}`);
assert.deepEqual(await invokeAlerts(false, true), [{job_key:"qa-job",type:"native_notifications_register"}]);
assert.deepEqual(await invokeAlerts(false, true, true), [{type:"native_notifications_register",account_session:true}]);
assert.deepEqual(await invokeAlerts(false, false), ["permission"]);

const loadNode = find(node => ts.isVariableDeclaration(node) && node.name.getText(tree) === "loadJobs");
const loadCode = loadNode.initializer.arguments[0].getText(tree);
for (const installed of [false, true]) {
  const effects = [], states = [];
  const call = execute(`exports.run = ${loadCode}`, {
    clearingAlertsRef:{current:false}, jobsReadRevisionRef:{current:0}, nativeAlertRecoveryRef:{current:"idle"}, nativeAlertAutoRepairAttemptedRef:{current:false},
    currentNativeInstallationId: () => installed ? "fixture-installation" : "",
    window:{}, fetch:async () => ({ok:true,json:async () => ({ok:true,session:"reviewer",jobs:[],
      device_alerts:{ready:true,public_key:"synthetic-public-key",native_registration_ready:true},dismiss_notification_keys:[]})}),
    setReadState: state => states.push(state), setAlertReadiness: value => states.push(value), setAlertState: value => states.push(value),
    currentNativeNotificationsEnabled: () => { effects.push("native-read"); return true; },
    readDriverPortalAlertState: async () => {effects.push("browser-subscription-read");return "enabled";},
    reportDriverActivity: () => effects.push("activity"), dismissNativeAlerts:async () => effects.push("dismiss-native"), viewedJobKeys:[],
  }).run;
  await call();
  assert.equal(effects.length, 0, "Reviewer list must not use ordinary device-alert state or native badge operations");
  assert.ok(states.some(state => state?.ready === false && state.publicKey === ""));
  assert.ok(states.includes("unavailable"));
  assert.ok(states.some(state => state?.kind === "ready" && state.reviewSession === true));
}

const alertNode = find(node => ts.isJsxElement(node) && node.openingElement.attributes.properties.some(prop => prop.name?.getText(tree) === "data-driver-portal-alert-setup"));
const renderNode = ts.isJsxExpression(alertNode.parent?.parent) ? alertNode.parent.parent.expression : alertNode;
for (const reviewSession of [false,true]) {
  const element = execute(`exports.element = (${renderNode.getText(tree)});`, {
    React, readState:{kind:"ready",reviewSession}, alertState:"available", nativeBridgeReady:false,
    enableJobAlerts:()=>{}, window:{},
  }).element;
  const html = renderToStaticMarkup(element);
  assert.equal(html.includes("data-driver-portal-enable-alerts"), !reviewSession, "Only ordinary Driver sessions display the existing alert action");
}

const routeSource = fs.readFileSync(new URL("../app/api/driver-portal/jobs/route.ts", import.meta.url), "utf8");
for (const reviewer of [false,true]) {
  let readinessReads = 0;
  const exports = execute(routeSource, {
    Request, Response, Headers, URL, process:{env:{SUPABASE_URL:"https://fixture.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"synthetic-only"}},
    require: name => {
      if (name === "@supabase/supabase-js") return {createClient:()=>({})};
      if (name.endsWith("/store-review-access")) return {
        resolveStoreReviewSession:()=>reviewer ? {state:"valid",role:"driver",scope:{driverId:904}} : {state:"absent"},
        storeReviewReadFetch:()=>()=>{throw Error("Unexpected database fetch");},
      };
      if (name.endsWith("/driver-job-status-persistence")) return {getDriverJobStatusPersistenceClientForProduction:()=>({ok:true,client:{}})};
      if (name.endsWith("/driver-portal-session")) return {resolveDriverPortalSession:()=>({ok:true,claims:{driverId:904}})};
      if (name.endsWith("/driver-portal-jobs")) return {loadDriverPortalJobs:async()=>({ok:true,jobs:[],alerts:[],alertCount:0,alertsAvailable:false})};
      if (name.endsWith("/driver-device-push-notification")) return {getDriverDevicePushReadiness:()=>{readinessReads++;return {enabled:true,ready:true,public_key:"synthetic-public-key"};}};
      if (name.endsWith("/driver-account-device-lock")) return {};
      throw Error(`Unexpected import: ${name}`);
    },
  });
  const response = await exports.GET(new Request("https://app.test/api/driver-portal/jobs",{headers:{referer:"https://app.test/driver-portal","x-prestige-driver-purpose":"driver-portal-jobs-read"}}));
  assert.equal(response.status,200);
  const body = await response.json();
  assert.equal(body.session, reviewer ? "reviewer" : "link");
  assert.equal(body.device_alerts.ready,!reviewer);
  assert.equal(body.device_alerts.enabled,!reviewer);
  assert.equal(body.device_alerts.public_key,reviewer ? null : "synthetic-public-key");
  assert.equal(readinessReads,reviewer ? 0 : 1);
}
console.log("PASS: reviewer native/browser registration denied before device effects; reviewer alert-state reads and action hidden; route readiness disabled; ordinary link/account notification callbacks and ordinary route readiness preserved. Synthetic only.");
