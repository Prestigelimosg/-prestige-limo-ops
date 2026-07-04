import assert from "node:assert/strict";
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

for (const iconPath of [
  "public/icons/prestige-ops-icon-192.png",
  "public/icons/prestige-ops-icon-512.png",
  "public/icons/prestige-ops-apple-touch-icon.png",
]) {
  const iconStat = await stat(iconPath);

  assert.ok(iconStat.size > 1000, `${iconPath} should be a real PNG install asset`);
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
