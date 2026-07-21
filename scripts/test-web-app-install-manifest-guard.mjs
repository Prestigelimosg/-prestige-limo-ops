import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

const manifestSource = await readFile("app/manifest.ts", "utf8");
const layoutSource = await readFile("app/layout.tsx", "utf8");

const requiredManifestFragments = [
  'display: "standalone"',
  'id: "/"',
  'start_url: "/"',
  'src: "/icons/prestige-ops-icon-192.png"',
  'sizes: "192x192"',
  'src: "/icons/prestige-ops-icon-512.png"',
  'sizes: "512x512"',
  'purpose: "maskable"',
  'theme_color: "#020617"',
];

for (const fragment of requiredManifestFragments) {
  assert.ok(
    manifestSource.includes(fragment),
    `Missing install manifest fragment: ${fragment}`,
  );
}

const requiredLayoutFragments = [
  'applicationName: "Prestige Limo Ops"',
  'manifest: "/manifest.webmanifest"',
  "appleWebApp:",
  'title: "Prestige Ops"',
  'apple: "/icons/prestige-ops-apple-touch-icon.png"',
];

for (const fragment of requiredLayoutFragments) {
  assert.ok(layoutSource.includes(fragment), `Missing app metadata fragment: ${fragment}`);
}

const expectedIconAssets = [
  {
    height: 192,
    path: "public/icons/prestige-ops-icon-192.png",
    sha256: "e30a809f8fccd2c1cb061044b51396fd022ec78cf800c481752dfec8f5fccd69",
    width: 192,
  },
  {
    height: 512,
    path: "public/icons/prestige-ops-icon-512.png",
    sha256: "08e6148ce03f1f198f68dfd300fcbff6074ff408c22b4d392918890dc56e9803",
    width: 512,
  },
  {
    height: 180,
    path: "public/icons/prestige-ops-apple-touch-icon.png",
    sha256: "6392539f7fc7416020ca92cbd1d47367cb523be5c91dfb976fd707f06ab8be66",
    width: 180,
  },
];

for (const { height, path: iconPath, sha256, width } of expectedIconAssets) {
  const iconStat = await stat(iconPath);
  const icon = await readFile(iconPath);

  assert.ok(iconStat.size > 1000, `${iconPath} should be a real PNG install asset`);
  assert.equal(icon.subarray(1, 4).toString("ascii"), "PNG", `${iconPath} PNG signature`);
  assert.equal(icon.readUInt32BE(16), width, `${iconPath} width`);
  assert.equal(icon.readUInt32BE(20), height, `${iconPath} height`);
  assert.equal(createHash("sha256").update(icon).digest("hex"), sha256, `${iconPath} approved logo`);
}

const blockedInstallSideEffects = [
  /api\.telegram\.org/i,
  /sendUpdates"\s*,\s*"all/i,
  /sendUpdates"\s*,\s*"externalOnly/i,
  /attendees\s*:/i,
  /new\s+Resend|sendMail|twilio|whatsapp/i,
];

for (const pattern of blockedInstallSideEffects) {
  assert.equal(
    pattern.test(manifestSource) || pattern.test(layoutSource),
    false,
    `Install metadata must not activate provider/calendar side effects: ${pattern}`,
  );
}

console.log("Web app install manifest guard passed.");
