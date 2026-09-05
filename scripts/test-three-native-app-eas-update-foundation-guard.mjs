import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const apps = [
  {
    directory: "admin-companion",
    projectId: "2dada379-f732-4e25-80a3-cdbbb8f52b11",
    ascAppId: "6803312296",
  },
  {
    directory: "customer-companion",
    projectId: "ce71ff91-7f71-4297-bcef-edf420f94316",
    ascAppId: "6802691447",
  },
  {
    directory: "driver-companion",
    projectId: "2a797181-d09d-4384-8d01-583456e83c3e",
    ascAppId: "6800706103",
  },
];

for (const app of apps) {
  const appConfig = readJson(`${app.directory}/app.json`).expo;
  const easConfig = readJson(`${app.directory}/eas.json`);
  const packageConfig = readJson(`${app.directory}/package.json`);
  const nativeSource = read(`${app.directory}/App.tsx`);

  assert.equal(appConfig.extra?.eas?.projectId, app.projectId);
  assert.deepEqual(appConfig.runtimeVersion, { policy: "appVersion" });
  assert.deepEqual(appConfig.updates, {
    checkAutomatically: "ON_LOAD",
    fallbackToCacheTimeout: 0,
    url: `https://u.expo.dev/${app.projectId}`,
  });
  assert.match(packageConfig.dependencies?.["expo-updates"] || "", /^~57\./);
  assert.equal(easConfig.build?.preview?.channel, "preview");
  assert.equal(easConfig.build?.production?.channel, "production");
  assert.equal(easConfig.submit?.production?.ios?.ascAppId, app.ascAppId);
  assert.ok(!nativeSource.includes('from "expo-updates"'));
  assert.ok(!nativeSource.includes("Updates.reloadAsync"));
}

const ledger = read("docs/current-implementation-ledger.md");
assert.match(ledger, /Three Native Apps EAS Update Foundation/);
assert.match(ledger, /no OTA update is published/i);

console.log("Three native apps EAS Update foundation guard passed.");
