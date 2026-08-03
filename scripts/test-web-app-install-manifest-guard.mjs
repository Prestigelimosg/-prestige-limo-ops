import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

const manifestSource = await readFile("app/manifest.ts", "utf8");
const layoutSource = await readFile("app/layout.tsx", "utf8");
const driverJobLayoutSource = await readFile("app/driver-job/[token]/layout.tsx", "utf8");
const driverPortalLayoutSource = await readFile("app/driver-portal/layout.tsx", "utf8");
const driverPortalManifest = JSON.parse(await readFile("public/driver-portal.webmanifest", "utf8"));

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

assert.equal(driverPortalManifest.id, "/driver-portal");
assert.equal(driverPortalManifest.start_url, "/driver-portal");
assert.equal(driverPortalManifest.scope, "/");
assert.equal(driverPortalManifest.display, "standalone");
assert.equal(driverPortalManifest.name, "Prestige Driver Portal");
assert.deepEqual(
  driverPortalManifest.icons,
  [
    {
      src: "/icons/prestige-ops-icon-192.png",
      sizes: "192x192",
      type: "image/png",
    },
    {
      purpose: "maskable",
      src: "/icons/prestige-ops-icon-512.png",
      sizes: "512x512",
      type: "image/png",
    },
  ],
  "Driver Portal must reuse only the approved Prestige install icons.",
);

for (const [label, source] of [
  ["private Driver Job install metadata", driverJobLayoutSource],
  ["Driver Portal install metadata", driverPortalLayoutSource],
]) {
  for (const fragment of [
    'manifest: "/driver-portal.webmanifest"',
    'title: "Prestige Driver"',
    'applicationName: "Prestige Driver Portal"',
  ]) {
    assert.ok(source.includes(fragment), `${label} missing ${fragment}`);
  }
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

const faviconPath = "app/favicon.ico";
const favicon = await readFile(faviconPath);
const faviconStat = await stat(faviconPath);
const expectedFaviconSizes = [16, 32, 48, 256];
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

assert.ok(faviconStat.size > 1000, `${faviconPath} should be a real multi-size icon asset`);
assert.equal(favicon.readUInt16LE(0), 0, `${faviconPath} reserved header`);
assert.equal(favicon.readUInt16LE(2), 1, `${faviconPath} icon resource type`);
assert.equal(
  favicon.readUInt16LE(4),
  expectedFaviconSizes.length,
  `${faviconPath} image count`,
);

const faviconSizes = expectedFaviconSizes.map((_, index) => {
  const entryOffset = 6 + index * 16;
  const width = favicon.readUInt8(entryOffset) || 256;
  const height = favicon.readUInt8(entryOffset + 1) || 256;
  const imageLength = favicon.readUInt32LE(entryOffset + 8);
  const imageOffset = favicon.readUInt32LE(entryOffset + 12);

  assert.equal(height, width, `${faviconPath} image ${index + 1} should be square`);
  assert.ok(imageLength > 0, `${faviconPath} image ${index + 1} should not be empty`);
  assert.ok(
    imageOffset + imageLength <= favicon.length,
    `${faviconPath} image ${index + 1} should stay inside the icon file`,
  );
  assert.deepEqual(
    favicon.subarray(imageOffset, imageOffset + pngSignature.length),
    pngSignature,
    `${faviconPath} image ${index + 1} PNG signature`,
  );

  return width;
});

assert.deepEqual(faviconSizes, expectedFaviconSizes, `${faviconPath} approved desktop sizes`);
assert.equal(
  createHash("sha256").update(favicon).digest("hex"),
  "589c9e0bc114bb031701d47c2080527e377b7ac0328b2a1bb9f278874f85020e",
  `${faviconPath} approved Prestige desktop logo`,
);

const blockedInstallSideEffects = [
  /api\.telegram\.org/i,
  /sendUpdates"\s*,\s*"all/i,
  /sendUpdates"\s*,\s*"externalOnly/i,
  /attendees\s*:/i,
  /new\s+Resend|sendMail|twilio|whatsapp/i,
];

for (const pattern of blockedInstallSideEffects) {
  assert.equal(
    pattern.test(manifestSource) ||
      pattern.test(layoutSource) ||
      pattern.test(driverJobLayoutSource) ||
      pattern.test(driverPortalLayoutSource) ||
      pattern.test(JSON.stringify(driverPortalManifest)),
    false,
    `Install metadata must not activate provider/calendar side effects: ${pattern}`,
  );
}

console.log("Web app install manifest guard passed.");
