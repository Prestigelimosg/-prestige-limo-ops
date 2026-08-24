import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import ts from "typescript";

const routePath = "app/.well-known/apple-app-site-association/route.ts";
const configPath = "customer-companion/app.json";
const appPath = "customer-companion/App.tsx";
const navigationPath = "customer-companion/src/customer-navigation.ts";
const readmePath = "customer-companion/README.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationPath = "scripts/test-preactivation-verification-suite.mjs";

const [
  routeSource,
  configSource,
  appSource,
  navigationSource,
  readmeSource,
  ledgerSource,
  preactivationSource,
] = await Promise.all([
  readFile(routePath, "utf8"),
  readFile(configPath, "utf8"),
  readFile(appPath, "utf8"),
  readFile(navigationPath, "utf8"),
  readFile(readmePath, "utf8"),
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

const config = JSON.parse(configSource).expo;
assert.equal(config.ios.buildNumber, "6", "The approved Customer release source must be Build 6");
assert.deepEqual(
  config.ios.associatedDomains,
  ["applinks:app.prestigelimo.sg"],
  "The Customer app must claim only the exact Production Universal Link host",
);

const routeModule = await importTypeScriptModule(routeSource, routePath);
const associationResponse = routeModule.GET();
assert.equal(associationResponse.status, 200);
assert.equal(associationResponse.headers.get("content-type"), "application/json");
const association = await associationResponse.json();
assert.deepEqual(
  association.applinks.details,
  [
    {
      appIDs: ["U9Y2574Y7S.sg.prestigelimo.drivercompanion"],
      components: [
        {
          "/": "/driver-job/*",
          comment: "Open only the established private Prestige Driver Job path.",
        },
      ],
    },
    {
      appIDs: ["U9Y2574Y7S.sg.prestigelimo.customer"],
      components: [
        {
          "/": "/api/customer-portal-access/*",
          comment: "Open only the established private Prestige Customer portal access path.",
        },
        {
          "/": "/customer-access/activate",
          comment: "Open only the one-use Prestige SG account activation path.",
        },
        {
          "/": "/my-bookings",
          "?": { booking: "*", tracking: "1" },
          comment: "Open one exact authenticated Customer booking after notification tap.",
        },
      ],
    },
  ],
  "The AASA must preserve Driver and add only bounded Customer access/tap paths",
);
assert.deepEqual(
  association.webcredentials.apps,
  ["U9Y2574Y7S.sg.prestigelimo.drivercompanion"],
  "The Customer Universal Link repair must not broaden shared web credentials",
);

const navigation = await importTypeScriptModule(navigationSource, navigationPath);
const portalToken = "p".repeat(80);
const exactPortalUrl =
  `https://app.prestigelimo.sg/api/customer-portal-access/${portalToken}`;
const trackedPortalUrl = `${exactPortalUrl}?booking=10876&tracking=1`;

assert.equal(navigation.customerUniversalLinkUrl(exactPortalUrl), exactPortalUrl);
assert.equal(navigation.customerUniversalLinkUrl(trackedPortalUrl), trackedPortalUrl);
assert.equal(
  navigation.customerUniversalLinkUrl(`${exactPortalUrl}?booking=abc-10876`),
  `${exactPortalUrl}?booking=ABC-10876`,
  "A valid public booking reference must be canonicalized without changing the private path",
);
assert.equal(navigation.shouldAllowCustomerWebViewNavigation(trackedPortalUrl), true);
assert.equal(navigation.customerTabForUrl(trackedPortalUrl), "bookings");

for (const rejectedUrl of [
  `http://app.prestigelimo.sg/api/customer-portal-access/${portalToken}`,
  `https://prestigelimo.sg/api/customer-portal-access/${portalToken}`,
  "https://app.prestigelimo.sg/my-bookings",
  "https://app.prestigelimo.sg/customers",
  "https://app.prestigelimo.sg/driver-job/private",
  "https://app.prestigelimo.sg/api/customer-portal-access/short",
  `${exactPortalUrl}#private`,
  `${exactPortalUrl}?other=1`,
  `${exactPortalUrl}?tracking=1`,
  `${exactPortalUrl}?booking=10876&booking=10877`,
  `${exactPortalUrl}?booking=10876&tracking=1&tracking=1`,
  `${exactPortalUrl}?booking=NOT-A-PUBLIC-REFERENCE`,
]) {
  assert.equal(
    navigation.customerUniversalLinkUrl(rejectedUrl),
    null,
    `The native Customer link handler must reject ${rejectedUrl}`,
  );
}

for (const required of [
  "Linking.getInitialURL()",
  'Linking.addEventListener("url"',
  "customerUniversalLinkUrl",
  "pendingCustomerUniversalLink",
  'unlockState !== "ready"',
]) {
  assert.equal(appSource.includes(required), true, `${appPath} must include ${required}`);
}

for (const forbidden of [
  "SecureStore.setItem",
  "AsyncStorage",
  "localStorage",
  "/api/admin-",
  "/driver-job/",
]) {
  assert.equal(
    `${appSource}\n${navigationSource}`.includes(forbidden),
    false,
    `The Customer native handoff must not persist or broaden private navigation through ${forbidden}`,
  );
}

for (const phrase of [
  "Customer iOS Universal Link Build 2 Source Repair",
  "`U9Y2574Y7S.sg.prestigelimo.customer`",
  "`/api/customer-portal-access/*`",
  "Face ID",
  "physical iPhone verification remains required",
  "Customer iOS Build 5 Native Alert Control Release Checkpoint",
  "Customer iOS Build 6 Face ID Single-Flight Acceptance Release Checkpoint",
]) {
  assert.equal(ledgerSource.includes(phrase), true, `${ledgerPath} must include ${phrase}`);
}

assert.equal(
  readmeSource.includes("Customer Build 2"),
  true,
  `${readmePath} must describe the bounded Customer Build 2 source checkpoint`,
);
assert.equal(
  preactivationSource.includes(
    "scripts/test-customer-companion-ios-universal-link-association-guard.mjs",
  ),
  true,
  "The Customer iOS Universal Link guard must run in preactivation verification",
);

console.log("Customer Companion iOS Universal Link association guard passed");
