import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Execute the actual open callback and its JSX, with phone/storage/navigation
// effects intercepted. No private tokens, devices, database or provider calls.
const source = fs.readFileSync(new URL("../app/driver-portal/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findAll(predicate) {
  const found = [];
  const walk = node => { if (predicate(node)) found.push(node); ts.forEachChild(node, walk); };
  walk(tree);
  return found;
}
function execute(code, context) {
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, ...context });
  return mod.exports;
}
const [handler] = findAll(node => ts.isFunctionDeclaration(node) && node.name?.text === "openJob");
assert.ok(handler, "Existing openJob callback must exist");
async function invoke({ reviewer, installed, messages, pending, remembered = true, alias, production = false, hostname = "localhost" }) {
  const effects = [], feedback = [];
  const job = { job_key: "synthetic-qa-key", state: pending ? "pending_ack" : "assigned", review_job_path: alias };
  const call = execute(`exports.run = ${handler.getText(tree)}`, {
    process: { env: { NODE_ENV: production ? "production" : "development" } },
    readState: { kind: "ready", reviewSession: reviewer }, installationId: installed ? "synthetic-installation" : "",
    setOpeningJobKey: () => {}, setNotificationCentreOpen: () => {},
    setOpenFeedback: update => feedback.push(typeof update === "function" ? update({}) : update),
    clearCurrentAlerts: async key => effects.push({ action: "clear-alerts", key }),
    storedDriverJobUrl: async key => { effects.push({ action: "read-stored-token", key }); return remembered ? "https://fixture.invalid/driver-job/ordinary-token-canary" : null; },
    window: { __PRESTIGE_DRIVER_MESSAGE_OPEN_SUPPORTED__: true,
      ReactNativeWebView: { postMessage: value => effects.push({ action: "native", payload: JSON.parse(value) }) },
      location: { hostname, assign: url => effects.push({ action: "navigate", url }) } },
  }).run;
  await call(job, messages);
  return { effects, feedback, job };
}

for (const installed of [false, true]) for (const pending of [false, true]) {
  const alias = "/driver-job/review-9001";
  const result = await invoke({ reviewer: true, installed, pending, alias });
  assert.deepEqual(result.effects, [{ action: "navigate", url: alias }]);
  for (const extra of [{ messages: true }, { production: true }, { hostname: "app.prestigelimo.sg" },
    { alias: "/driver-job/ordinary-token" }, { alias: "https://foreign.invalid/driver-job/review-9001" }, { alias: alias + "?token=secret" }]) {
    assert.deepEqual((await invoke({ reviewer: true, installed, pending, alias, ...extra })).effects, []);
  }
}
for (const installed of [false, true]) for (const messages of [false, true]) for (const pending of [false, true]) {
  const result = await invoke({ reviewer: true, installed, messages, pending });
  assert.equal(result.effects.length, 0, `Reviewer open must stop before ordinary token/device/alert effects: ${JSON.stringify({ installed, messages, pending, effects: result.effects })}`);
  assert.ok(result.feedback.some(value => /QA job access is not ready/.test(value[result.job.job_key] || "")), "Reviewer must receive an honest incomplete-access explanation");
}
for (const installed of [false, true]) for (const messages of [false, true]) for (const pending of [false, true]) {
  const { effects, job } = await invoke({ reviewer: false, installed, messages, pending });
  const expected = [];
  if (installed) {
    if (messages || pending) expected.push({ action: "clear-alerts", key: job.job_key });
    expected.push({ action: "native", payload: { job_key: job.job_key, type: "native_job_open", ...(messages ? { open_target: "messages" } : {}) } });
  } else {
    expected.push({ action: "read-stored-token", key: job.job_key });
    if (messages) expected.push({ action: "clear-alerts", key: job.job_key });
    expected.push({ action: "navigate", url: "https://fixture.invalid/driver-job/ordinary-token-canary" });
  }
  assert.deepEqual(effects, expected, "Ordinary account/link opening must remain unchanged");
}
const absent = await invoke({ reviewer: false, installed: false, messages: false, pending: true, remembered: false });
assert.deepEqual(absent.effects, [{ action: "read-stored-token", key: absent.job.job_key }]);
assert.ok(absent.feedback.some(value => /latest private link/.test(value[absent.job.job_key] || "")));

const buttons = findAll(node => ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "button" &&
  node.openingElement.attributes.properties.some(prop => ["data-driver-portal-open-job", "data-driver-notification-job"].includes(prop.name?.getText(tree))));
assert.equal(buttons.length, 2, "Cover both existing entry controls");
for (const reviewer of [false, true]) for (const pending of [false, true]) for (const alias of [undefined, "/driver-job/review-9001"]) for (const button of buttons) {
  const job = { job_key: "synthetic-qa-key", state: pending ? "pending_ack" : "assigned", review_job_path: alias };
  const html = renderToStaticMarkup(execute(`exports.element = (${button.getText(tree)});`, {
    React, readState: { kind: "ready", reviewSession: reviewer }, job,
    alert: { job_key: job.job_key, title: "QA job", message: "QA update", safe_title: "QA job", safe_message: "QA update" },
    openingJobKey: "", openJob: () => {}, openFeedback: {}, notificationTime: () => "Synthetic time",
  }).element);
  assert.equal(html.includes('disabled=""'), reviewer && (!alias || button.getText(tree).includes('data-driver-notification-job')), "Reviewer controls must not invite an unavailable ordinary job action");
  if (button.getText(tree).includes("data-driver-portal-open-job")) {
    assert.ok(html.includes(reviewer ? alias ? "Open QA job" : "QA job access pending" : pending ? "Open &amp; acknowledge" : "Open Driver Job"));
  }
}
console.log("PASS: reviewer Open navigates only to the supplied local QA alias; Messages, absent/unsafe alias, production and non-loopback blocked; no ordinary token/storage/native/alert effects. Ordinary opening preserved.");
