import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const dashboardPath = "app/page.tsx";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-admin-app-notification-refresh-no-blink-guard.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertBefore(source, firstFragment, secondFragment, label) {
  const first = source.indexOf(firstFragment);
  const second = source.indexOf(secondFragment);

  assert.notEqual(first, -1, `${label} missing first fragment: ${firstFragment}`);
  assert.notEqual(second, -1, `${label} missing second fragment: ${secondFragment}`);
  assert.equal(first < second, true, `${label} must keep ${firstFragment} before ${secondFragment}.`);
}

function sectionBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing section start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing section end: ${endFragment}`);

  return source.slice(start, end);
}

const [dashboardSource, preactivationSuite] = await Promise.all([
  readFile(dashboardPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const refreshEffect = sectionBetween(
  dashboardSource,
  "setAdminAppNotificationReadState((current) => {",
  "void (async () => {",
);
const intervalEffect = sectionBetween(
  dashboardSource,
  "setAdminAppNotificationReadRevision((revision) => revision + 1);",
  "return () => window.clearInterval(intervalId);",
);

for (const fragment of [
  'if (current.status === "loaded") {',
  "return current;",
  "Loading saved admin app notifications through the guarded API...",
  'status: "loading"',
]) {
  assertIncludes(refreshEffect, fragment, `admin notification no-blink refresh fragment ${fragment}`);
}

assertBefore(
  refreshEffect,
  'if (current.status === "loaded") {',
  "Loading saved admin app notifications through the guarded API...",
  "loaded notification feed stays visually stable before background refresh",
);

for (const fragment of [
  "setAdminAppNotificationReadRevision((revision) => revision + 1)",
  "10 * 1000",
]) {
  assertIncludes(intervalEffect, fragment, `admin notification auto-refresh fragment ${fragment}`);
}

for (const fragment of [
  'data-admin-app-notification-feed-state="true"',
  '"Inbox queued"',
  '"Clear"',
]) {
  assertIncludes(dashboardSource, fragment, `admin notification feed state fragment ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation admin notification no-blink guard registration");

console.log("Admin app notification refresh no-blink guard passed");
