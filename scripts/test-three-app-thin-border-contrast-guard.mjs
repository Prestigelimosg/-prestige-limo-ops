import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  adminApp: "admin-companion/App.tsx",
  adminConfig: "admin-companion/app.json",
  customerApp: "customer-companion/App.tsx",
  customerConfig: "customer-companion/app.json",
  customerBooking: "app/book/page.tsx",
  customerPortal: "app/my-bookings/page.tsx",
  driverApp: "driver-companion/App.tsx",
  driverConfig: "driver-companion/app.json",
  driverJob: "app/driver-job/[token]/page.tsx",
  driverPortal: "app/driver-portal/page.tsx",
  globals: "app/globals.css",
  ledger: "docs/current-implementation-ledger.md",
  preactivation: "scripts/test-preactivation-verification-suite.mjs",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

for (const configKey of ["adminConfig", "customerConfig", "driverConfig"]) {
  assert.equal(
    JSON.parse(source[configKey]).expo.userInterfaceStyle,
    "light",
    `${paths[configKey]} must remain light mode`,
  );
}

for (const [key, label] of [
  ["adminApp", "Admin"],
  ["customerApp", "Customer"],
]) {
  assert.match(source[key], /border: "#cbd5e1"/);
  assert.match(source[key], /borderBottomWidth: 1/);
  assert.doesNotMatch(source[key], /borderBottomWidth: [2-9]/);
  assert.match(source[key], /borderWidth: 1/);
  assert.doesNotMatch(source[key], /borderWidth: [2-9]/);
  assert.equal(source[key].includes('border: "#e2e8f0"'), false, `${label} neutral native border must use the darker thin token`);
}

for (const phrase of [
  'borderBottomColor: "#cbd5e1"',
  'borderBottomWidth: 1',
  'borderColor: "#cbd5e1"',
  'borderWidth: 1',
]) {
  assert.equal(source.driverApp.includes(phrase), true, `Driver native shell must retain ${phrase}`);
}
assert.equal(source.driverApp.includes('borderBottomColor: "#e2e8f0"'), false);
assert.equal(source.driverApp.includes('borderColor: "#e2e8f0"'), false);

for (const [key, marker] of [
  ["customerBooking", 'data-customer-booking-page="true"'],
  ["customerPortal", 'data-customer-portal-page="true"'],
  ["driverJob", 'data-driver-job-page="true"'],
  ["driverPortal", 'data-driver-portal-page="true"'],
]) {
  assert.equal(source[key].includes(marker), true, `${paths[key]} must keep the exact scoped app marker`);
}

const contractMatch = source.globals.match(
  /\/\* BEGIN three-app thin neutral border contrast \*\/([\s\S]*?)\/\* END three-app thin neutral border contrast \*\//,
);
assert.ok(contractMatch, "The three-app border contract must remain explicitly scoped");
const borderContract = contractMatch[1];

const customerBookingSurfaceContrastMatch = borderContract.match(
  /\[data-customer-portal-page="true"\]\s*:where\(\[data-customer-portal-row\],\s*\[data-customer-portal-detail\]\)\s*\{([\s\S]*?)\}/,
);
assert.ok(
  customerBookingSurfaceContrastMatch,
  "The Customer portal booking-row and detail-panel contrast override must remain explicitly scoped",
);
assert.equal(
  customerBookingSurfaceContrastMatch[1].trim(),
  "border-color: #94a3b8;",
  "The Customer booking surface override must change only the established border color",
);

for (const phrase of [
  ".admin-ops-shell",
  '[data-customer-booking-page="true"]',
  '[data-customer-portal-page="true"]',
  '[data-driver-job-page="true"]',
  '[data-driver-portal-page="true"]',
  ".border-slate-200",
  ".border-stone-200",
  ".border-zinc-200",
  "border-color: #cbd5e1",
  ":where(button, a).border-slate-300",
  ":where(button, a).border-stone-300",
  "border-color: #94a3b8",
]) {
  assert.equal(borderContract.includes(phrase), true, `Missing three-app border contract phrase: ${phrase}`);
}

for (const forbidden of [
  "border-width",
  "border-radius",
  "padding",
  "margin",
  "min-height",
  "height:",
  "width:",
  "box-shadow",
  "font-size",
]) {
  assert.equal(
    borderContract.includes(forbidden),
    false,
    `The contrast-only contract must not change geometry with ${forbidden}`,
  );
}

assert.match(source.ledger, /Three-App Thin Neutral Border Contrast And Overflow Check \(2026-08-20\)/);
assert.match(source.ledger, /320px, 375px, 390px, 402px, 430px, and 440px/);
assert.equal(
  source.preactivation.includes("scripts/test-three-app-thin-border-contrast-guard.mjs"),
  true,
  "The three-app contrast guard must remain in the preactivation suite",
);

console.log("Three-app thin neutral border contrast guard passed.");
