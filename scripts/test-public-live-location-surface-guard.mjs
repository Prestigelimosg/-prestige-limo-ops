import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-live-location-surface-guard.mjs";

const setupRoutePath = "app/api/admin-live-location-setup/route.ts";
const previewReadinessRoutePath =
  "app/api/admin-live-location-window-policy-preview-readiness-setup/route.ts";
const disabledAccessCaptureRoutePath =
  "app/api/admin-live-location-access-capture-disabled-setup/route.ts";
const setupHelperPath = "lib/admin-live-location-setup-foundation.ts";
const windowPolicyHelperPath = "lib/live-location-window-policy-setup-foundation.ts";
const publicClientPaths = [
  "app/book/page.tsx",
  "app/my-bookings/page.tsx",
  "app/driver-job/[token]/page.tsx",
];

const contractChecks = [
  {
    label: "admin live-location setup foundation contract",
    script: "scripts/test-admin-live-location-setup-foundation-contract.mjs",
    requiredFragments: [
      "adminLiveLocationSetupFoundationVersion",
      "future_customer_window_minutes_before_pickup: 30",
      "admin live-location setup foundation contract passed",
    ],
  },
  {
    label: "admin live-location setup API contract",
    script: "scripts/test-admin-live-location-setup-api-contract.mjs",
    requiredFragments: [
      "admin-live-location-setup",
      "resolveAdminDispatcherBoundary",
      "admin live-location setup API contract passed",
    ],
  },
  {
    label: "live-location window policy setup foundation contract",
    script: "scripts/test-live-location-window-policy-setup-foundation-contract.mjs",
    requiredFragments: [
      "live_location_window_policy_setup_only",
      "customer_window_before_pickup_minutes",
      "live-location window policy setup foundation contract passed",
    ],
  },
  {
    label: "admin live-location window policy preview readiness setup API contract",
    script: "scripts/test-admin-live-location-window-policy-preview-readiness-setup-api-contract.mjs",
    requiredFragments: [
      "admin-live-location-window-policy-preview-readiness-setup",
      "Live-location window policy API must stay admin-gated.",
      "admin live-location window policy preview readiness setup API contract passed",
    ],
  },
  {
    label: "admin live-location access capture disabled setup API contract",
    script: "scripts/test-admin-live-location-access-capture-disabled-setup-api-contract.mjs",
    requiredFragments: [
      "live_location_access_capture_disabled_setup_only",
      "Disabled live-location API must stay admin-gated.",
      "admin live-location access capture disabled setup API contract passed",
    ],
  },
  {
    label: "live-location no-live guard",
    script: "scripts/test-live-location-no-live-guard.mjs",
    requiredFragments: [
      "Live-location setup must not add provider/auth/location/payment package",
      "live-location no-live guard passed",
    ],
  },
];

const routeForbiddenRuntimeFragments = [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
  "request.json",
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "sendBeacon",
  "createClient",
  "supabase",
  ".from(",
  "insert(",
  "upsert(",
  "update(",
  "delete(",
  "process.env",
  "cookies(",
  "headers(",
  "navigator.geolocation",
  "getCurrentPosition",
  "watchPosition",
  "clearWatch",
  "mapbox",
  "google.maps",
  "maps.google",
  "FormData",
  "createObjectURL",
  "storage.from",
];

const providerLocationOrPaymentPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@auth\/core|@googlemaps\/google-maps-services-js|@mapbox\/mapbox-sdk|@supabase\/supabase-js|@turf\/turf|firebase|geolib|google-map-react|jose|jsonwebtoken|leaflet|mapbox-gl|next-auth|stripe|twilio|whatsapp-cloud-api|telegram)["']|require\(\s*["'](?:@auth\/core|@googlemaps\/google-maps-services-js|@mapbox\/mapbox-sdk|@supabase\/supabase-js|@turf\/turf|firebase|geolib|google-map-react|jose|jsonwebtoken|leaflet|mapbox-gl|next-auth|stripe|twilio|whatsapp-cloud-api|telegram)["']\s*\)|\b(?:Firebase|Leaflet|Mapbox|NextAuth|Stripe|TelegramBot|Twilio)\b|messages\.create|checkoutSession|paymentLink|paynow/i;
const liveLocationFlagPattern =
  /gpsCaptureEnabled\s*[:=]\s*true|liveMapEnabled\s*[:=]\s*true|customerVisible\s*[:=]\s*true|locationStorageEnabled\s*[:=]\s*true|liveAccessEnabled\s*[:=]\s*true|external_send\s*[:=]\s*true|auditWriteEnabled\s*[:=]\s*true/i;
const liveLocationActivationPattern =
  /\b(?:navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition|google\.maps|maps\.google|mapbox|Mapbox|createMap|renderMap|startTracking|stopTracking|publishLocation|locationStorage|storage\.from|upload\s*\(|download\s*\(|setInterval|setTimeout)\b/i;
const unsafeOutputPattern =
  /latitude|longitude|coords|watchPosition|getCurrentPosition|mapbox|google\.maps|maps\.google|raw_token|service_role|server_secret|secret|api_key|access_token|customer_price|driver_payout|payout_amount|paynow|billing|invoice|payment|internal_admin|internal_finance|parser_debug|mock_archive/i;

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.toLowerCase().includes(String(fragmentOrPattern).toLowerCase());

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function exportedMethods(source) {
  return [...source.matchAll(/\bexport\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)]
    .map((match) => match[1])
    .sort();
}

function runContractCheck({ label, script, requiredFragments }) {
  const scriptSource = files[script];

  for (const fragment of requiredFragments) {
    assertIncludes(scriptSource, fragment, `${label} contract fragment`);
  }

  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
  });

  assert.equal(
    result.status,
    0,
    [
      `${label} failed while running ${script}.`,
      result.stdout.trim(),
      result.stderr.trim(),
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

const allPaths = [
  ledgerPath,
  preactivationSuitePath,
  setupRoutePath,
  previewReadinessRoutePath,
  disabledAccessCaptureRoutePath,
  setupHelperPath,
  windowPolicyHelperPath,
  ...publicClientPaths,
  ...contractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const setupRoute = files[setupRoutePath];
const previewReadinessRoute = files[previewReadinessRoutePath];
const disabledAccessCaptureRoute = files[disabledAccessCaptureRoutePath];
const setupHelper = files[setupHelperPath];
const windowPolicyHelper = files[windowPolicyHelperPath];
const ledgerSection = sectionBetween(ledger, "### Public Live Location Surface Guard Lock");

for (const phrase of [
  "Public live-location setup surfaces are guarded across `/api/admin-live-location-setup`, `/api/admin-live-location-window-policy-preview-readiness-setup`, `/api/admin-live-location-access-capture-disabled-setup`, `lib/admin-live-location-setup-foundation.ts`, `lib/live-location-window-policy-setup-foundation.ts`, and public client pages.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, live GPS capture, admin live map, customer map link, location storage, or new shims.",
  "`/api/admin-live-location-setup` must remain behind the internal admin/dispatcher boundary, GET-only, setup-only, and limited to disabled live-location, admin-map, customer-map, and driver-capture setup payloads.",
  "`/api/admin-live-location-window-policy-preview-readiness-setup` must remain behind the internal admin/dispatcher boundary and return setup-only preview/readiness payloads with `gpsCaptureEnabled`, `liveMapEnabled`, `customerVisible`, `locationStorageEnabled`, and `liveAccessEnabled` all false.",
  "`/api/admin-live-location-access-capture-disabled-setup` must remain behind the internal admin/dispatcher boundary, GET-only, setup-only, disabled/no-op, GPS-capture-free, live-map-free, customer-map-link-free, location-storage-free, provider-send-free, cookie-free, and limited to blocked access/capture/readiness/preview payloads.",
  "The setup and window policy helpers must stay setup-only, no-live, no-op, and must not use GPS capture APIs, map provider APIs, provider/env reads, Supabase clients, DB/storage writes, auth/session activation, file APIs, or photo APIs.",
  "Public client pages must not call live-location setup, access, capture, or preview routes until separate live-location activation/UI approval exists.",
  "Live-location setup surfaces must exclude customer price, billing, invoice/payment/PDF, driver payout, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live GPS coordinates, map provider payloads, photo/file fields, and mock QA/dev archive fields.",
  "This guard coordinates the setup foundation contract, setup API contract, window policy foundation contract, window policy preview/readiness API contract, disabled access/capture API contract, and live-location no-live guard in the preactivation suite.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-live-location-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public live-location ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation live-location guard registration");

for (const check of contractChecks) {
  runContractCheck(check);
}

assert.deepEqual(exportedMethods(setupRoute), ["GET"], "admin live-location setup route exported methods");
assert.deepEqual(exportedMethods(previewReadinessRoute), ["GET"], "preview/readiness route exported methods");
assert.deepEqual(exportedMethods(disabledAccessCaptureRoute), ["GET"], "disabled access/capture route exported methods");

for (const fragment of [
  "buildAdminLiveLocationSetupFoundation",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "requireAdminDispatcherBoundary(request)",
  "if (!boundary.ok)",
  "booking_ref",
  "service_code",
  "pickup_at",
  "version: setup.version",
]) {
  assertIncludes(setupRoute, fragment, `admin live-location setup route ${fragment}`);
}

for (const fragment of [
  "buildLiveLocationWindowPolicySetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "requireAdminDispatcherBoundary(request)",
  "if (!boundary.ok)",
  "customer_window_opens_minutes_before_pickup",
  "auto_stop_minutes_after_pob",
  "customerVisible: false",
  "gpsCaptureEnabled: false",
  "liveAccessEnabled: false",
  "liveMapEnabled: false",
  "locationStorageEnabled: false",
  "policy_surface",
  "planned_windows",
]) {
  assertIncludes(previewReadinessRoute, fragment, `preview/readiness route ${fragment}`);
}

for (const fragment of [
  "buildLiveLocationWindowPolicySetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "requireAdminDispatcherBoundary(request)",
  "if (!boundary.ok)",
  "live_location_access_capture_disabled_setup_only",
  "gps_capture",
  "admin_map_access",
  "customer_map_access",
  "customerVisible: false",
  "external_send: false",
  "gpsCaptureEnabled: false",
  "liveAccessEnabled: false",
  "liveMapEnabled: false",
  "locationStorageEnabled: false",
  "no_op: true",
  "reason: \"setup_only_disabled\"",
  "result_label: \"blocked/no-op\"",
  "status: \"blocked\"",
]) {
  assertIncludes(disabledAccessCaptureRoute, fragment, `disabled access/capture route ${fragment}`);
}

for (const fragment of [
  "adminLiveLocationSetupFoundationVersion",
  "buildAdminLiveLocationSetupFoundation",
  "status: \"setup_only\"",
  "live_location_status: \"disabled\"",
  "driver_capture_status: \"disabled\"",
  "customer_map_status: \"disabled\"",
  "admin_map_status: \"disabled\"",
  "future_customer_window_minutes_before_pickup: 30",
  "future_pob_auto_stop_minutes_after_pob: 5",
  "future_otw_trigger: \"planned_only\"",
  "No driver browser GPS capture is active.",
  "No customer map link is active.",
  "No admin live map is active.",
  "No external map tracking is active.",
  "No database read or write is performed.",
]) {
  assertIncludes(setupHelper, fragment, `admin live-location setup helper ${fragment}`);
}

for (const fragment of [
  "import \"server-only\"",
  "liveLocationWindowPolicySetupFoundationVersion",
  "buildLiveLocationWindowPolicySetup",
  "policy_surface: \"live_location_window_policy_setup_only\"",
  "customer_visible_window_minutes_before_pickup: 30",
  "auto_stop_minutes_after_pob: 5",
  "admin_live_map_planned: true",
  "customer_live_map_link_planned: true",
  "customerVisible: false",
  "gpsCaptureEnabled: false",
  "liveAccessEnabled: false",
  "liveMapEnabled: false",
  "locationStorageEnabled: false",
  "planned_windows",
  "status: \"setup_only\"",
]) {
  assertIncludes(windowPolicyHelper, fragment, `window policy helper ${fragment}`);
}

for (const fragment of routeForbiddenRuntimeFragments) {
  assertExcludes(setupRoute, fragment, "admin live-location setup route forbidden runtime fragment");
  assertExcludes(previewReadinessRoute, fragment, "preview/readiness route forbidden runtime fragment");
  assertExcludes(disabledAccessCaptureRoute, fragment, "disabled access/capture route forbidden runtime fragment");
}

for (const [path, source] of [
  [setupRoutePath, setupRoute],
  [previewReadinessRoutePath, previewReadinessRoute],
  [disabledAccessCaptureRoutePath, disabledAccessCaptureRoute],
  [setupHelperPath, setupHelper],
  [windowPolicyHelperPath, windowPolicyHelper],
]) {
  assertExcludes(source, providerLocationOrPaymentPattern, `${path} provider/location/payment fragment`);
  assertExcludes(source, liveLocationFlagPattern, `${path} live-location flag`);
  assertExcludes(source, liveLocationActivationPattern, `${path} live-location activation`);
  assertExcludes(source, unsafeOutputPattern, `${path} unsafe live-location output`);
}

for (const path of publicClientPaths) {
  const source = files[path];

  for (const fragment of [
    "/api/admin-live-location-setup",
    "/api/admin-live-location-window-policy-preview-readiness-setup",
    "/api/admin-live-location-access-capture-disabled-setup",
    "admin-live-location-setup",
    "admin-live-location-window-policy-preview-readiness-setup",
    "admin-live-location-access-capture-disabled-setup",
    "gpsCaptureEnabled",
    "liveMapEnabled",
    "locationStorageEnabled",
    "liveAccessEnabled",
    "customerVisible",
    "navigator.geolocation",
    "getCurrentPosition",
    "watchPosition",
    "mapbox",
    "google.maps",
    "maps.google",
    "x-prestige-admin-purpose",
    "x-prestige-admin-session-token",
    "Authorization",
    "document.cookie",
    "localStorage",
    "sessionStorage",
    "service_role",
    "SUPABASE_SERVICE",
    "MAPBOX_",
    "GOOGLE_MAPS_",
  ]) {
    assertExcludes(source, fragment, `${path} live-location caller fragment`);
  }
}

console.log("Public live-location surface guard passed");
