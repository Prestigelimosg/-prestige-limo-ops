import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import ts from "typescript";

const appPath = "customer-companion/App.tsx";
const configPath = "customer-companion/app.json";
const navigationPath = "customer-companion/src/customer-navigation.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationPath = "scripts/test-preactivation-verification-suite.mjs";

const [appSource, configSource, navigationSource, ledgerSource, preactivationSource] =
  await Promise.all([
    readFile(appPath, "utf8"),
    readFile(configPath, "utf8"),
    readFile(navigationPath, "utf8"),
    readFile(ledgerPath, "utf8"),
    readFile(preactivationPath, "utf8"),
  ]);

function importTypeScriptModule(source, fileName) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

const navigation = await importTypeScriptModule(navigationSource, navigationPath);
assert.equal(
  typeof navigation.shouldAllowCustomerMapEmbedNavigation,
  "function",
  "Customer native navigation must expose one exact embedded-map subframe policy.",
);

const exactEmbed = "https://www.google.com/maps?q=1.3521,103.8198&z=16&output=embed";
assert.equal(navigation.shouldAllowCustomerMapEmbedNavigation(exactEmbed, false), true);
assert.equal(
  navigation.shouldAllowCustomerMapEmbedNavigation(exactEmbed, true),
  false,
  "The same Google Maps URL must never become a top-level Customer page.",
);
assert.equal(navigation.shouldAllowCustomerMapEmbedNavigation(exactEmbed, undefined), false);

const exactGoogleRedirect =
  "https://www.google.com/maps/embed?origin=mfe&pb=!1m3!2m1!1s1.3271117,103.855347!6i16";
assert.equal(
  navigation.shouldAllowCustomerMapEmbedNavigation(exactGoogleRedirect, false),
  true,
  "The exact same-frame Google embed redirect observed on physical Build 10 must remain in-app.",
);
assert.equal(
  navigation.shouldAllowCustomerMapEmbedNavigation(exactGoogleRedirect, true),
  false,
  "The Google embed redirect must never become a top-level Customer page.",
);

for (const rejectedUrl of [
  "http://www.google.com/maps?q=1.3521,103.8198&z=16&output=embed",
  "https://maps.google.com/maps?q=1.3521,103.8198&z=16&output=embed",
  "https://www.google.com/maps/search/?api=1&query=1.3521,103.8198",
  "https://www.google.com/maps?q=91,103.8198&z=16&output=embed",
  "https://www.google.com/maps?q=1.3521,181&z=16&output=embed",
  "https://www.google.com/maps?q=1.3521,103.8198&z=15&output=embed",
  "https://www.google.com/maps?q=1.3521,103.8198&z=16&output=embed&next=https://example.com",
  "https://www.google.com/maps?q=1.3521,103.8198&z=16&output=embed#outside",
  "https://www.google.com/maps/embed?origin=outside&pb=!1m3!2m1!1s1.3271117,103.855347!6i16",
  "https://www.google.com/maps/embed?origin=mfe&pb=!1m3!2m1!1s91,103.855347!6i16",
  "https://www.google.com/maps/embed?origin=mfe&pb=!1m3!2m1!1s1.3271117,181!6i16",
  "https://www.google.com/maps/embed?origin=mfe&pb=!1m3!2m1!1s1.3271117,103.855347!6i15",
  "https://www.google.com/maps/embed?origin=mfe&pb=!1m3!2m1!1s1.3271117,103.855347!6i16&next=https://example.com",
  "https://www.google.com/maps/embed?origin=mfe&pb=!1m3!2m1!1s1.3271117,103.855347!6i16#outside",
  "https://www.google.com.evil.example/maps?q=1.3521,103.8198&z=16&output=embed",
]) {
  assert.equal(
    navigation.shouldAllowCustomerMapEmbedNavigation(rejectedUrl, false),
    false,
    `Customer native navigation must reject non-canonical embedded-map URL ${rejectedUrl}`,
  );
}

assert.equal(
  appSource.includes(
    'originWhitelist={["https://app.prestigelimo.sg", "https://www.google.com"]}',
  ),
  true,
  "The native WebView must add only the exact Google iframe origin.",
);
assert.equal(
  appSource.includes("shouldAllowCustomerMapEmbedNavigation(request.url, request.isTopFrame)"),
  true,
  "The native navigation callback must require the exact non-top-frame map policy.",
);
for (const forbidden of ['originWhitelist={["*"]}', 'originWhitelist={["https://*"]}']) {
  assert.equal(appSource.includes(forbidden), false, `Customer WebView must reject broad origin rule ${forbidden}`);
}

const config = JSON.parse(configSource).expo;
assert.equal(config.ios.buildNumber, "11", "The redirect-repaired Customer binary must be exact Build 11.");
assert.equal(config.ios.bundleIdentifier, "sg.prestigelimo.customer");
assert.equal(config.extra?.eas?.projectId, "ce71ff91-7f71-4297-bcef-edf420f94316");

assert.equal(
  preactivationSource.includes("scripts/test-customer-companion-inapp-map-navigation-guard.mjs"),
  true,
  "The exact Customer native map navigation guard must run in preactivation.",
);
for (const phrase of [
  "### Customer Native Google Embed Redirect Repair And Build 11 Preflight (2026-08-27)",
  "Build 10 physical acceptance failed",
  "`/maps/embed?origin=mfe&pb=...`",
  "No paid Build 11 may start until every prebuild check passes",
  "### Customer Native In-App Driver Map And Build 10 Repair (2026-08-27)",
  "must remain inside the Customer app",
  "top-level Google navigation remains blocked",
  "App Store Connect app `6802691447`",
  "EAS build `a4ac3fae-4154-431a-a10d-856638e575b5`",
  "signed IPA SHA-256 is `e7e423d66aa7f39cbec5ce604ec61dc29d4a2a4bb991f71bc23f07a1c4c949c0`",
  "EAS submission, `32675b3f-7d2c-489a-8ea6-5ac1e1c27030`",
  "Build 10 ID `d3dee321-a78f-45df-a33c-4fb3ce5b7d6f`",
  "independent provider readback reports `IN_BETA_TESTING`",
]) {
  assert.equal(ledgerSource.includes(phrase), true, `Ledger must retain ${phrase}`);
}

console.log("Customer companion in-app map navigation guard passed.");
