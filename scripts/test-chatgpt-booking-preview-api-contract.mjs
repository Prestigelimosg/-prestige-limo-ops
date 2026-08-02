import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/chatgpt-booking-preview.ts";
const routePath = "app/api/admin-booking-preview/route.ts";
const persistencePath = "lib/admin-booking-persistence.ts";
const authBoundaryPath = "lib/admin-dispatcher-auth-boundary.ts";
const previewPurpose = "admin-booking-preview";
const originalEnv = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE:
    process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function transpileTypescript(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

async function writeTranspiledFile(tempDir, relativePath) {
  const sourcePath = path.join(process.cwd(), relativePath);
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
  const source = await readFile(sourcePath, "utf8");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, sourcePath));
}

async function createHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-chatgpt-booking-preview-"));

  await mkdir(path.join(tempDir, "node_modules/server-only"), { recursive: true });
  await writeFile(path.join(tempDir, "node_modules/server-only/index.js"), "module.exports = {};\n");
  await Promise.all(
    [helperPath, routePath, persistencePath, authBoundaryPath].map((relativePath) =>
      writeTranspiledFile(tempDir, relativePath),
    ),
  );
  await writeFile(
    path.join(tempDir, "lib/admin-booking-supabase-adapter.js"),
    `
function forbiddenWrite() {
  throw new Error("Preview contract attempted a forbidden persistence call.");
}
module.exports = {
  createAdminBookingThroughSupabaseAdapter: forbiddenWrite,
  loadAdminBookingByReferenceThroughSupabaseAdapter: forbiddenWrite,
  listAdminBookingsThroughSupabaseAdapter: forbiddenWrite,
  updateAdminBookingThroughSupabaseAdapter: forbiddenWrite,
};
`,
  );

  const requireFromHarness = createRequire(path.join(tempDir, "entry.js"));

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: requireFromHarness(path.join(tempDir, "lib/chatgpt-booking-preview.js")),
    route: requireFromHarness(path.join(tempDir, "app/api/admin-booking-preview/route.js")),
  };
}

function validInput(overrides = {}) {
  return {
    bag_count: 3,
    contact_email: "sabaraih@sg.pepperl-fuchs.com",
    contact_name: "Sabariah Yusof",
    contact_phone: "+65 6777 4760",
    customer_or_company_name: "Pepperl+Fuchs Asia Pte Ltd",
    customer_price: 120,
    dropoff_location: "202 Kim Seng Road, Singapore 239496",
    flight_number: "TK54",
    notes: "Five passengers; luggage count to be confirmed.",
    passenger_count: 5,
    passenger_name: "Denis Leonardo",
    pickup_date: "2030-08-04",
    pickup_location: "Changi Airport",
    pickup_time: "17:55hrs",
    service_type: "mng",
    source_message: "Original booking request supplied to ChatGPT.",
    vehicle_type: "vvv",
    ...overrides,
  };
}

function request(body, headers = {}) {
  return new Request("http://localhost/api/admin-booking-preview", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      origin: "http://localhost",
      referer: "http://localhost/",
      "x-prestige-admin-purpose": previewPurpose,
      ...headers,
    },
    method: "POST",
  });
}

function responseKeys(body) {
  return Object.keys(body).sort();
}

const [helperSource, routeSource] = await Promise.all([
  readFile(helperPath, "utf8"),
  readFile(routePath, "utf8"),
]);

assert.match(
  helperSource,
  /parseAdminBookingPersistencePayload/,
  "The preview helper must reuse the canonical booking DTO validator.",
);
assert.doesNotMatch(
  `${helperSource}\n${routeSource}`,
  /createAdminBooking|createAdminBookingThroughSupabaseAdapter|\.from\(|SUPABASE_|service_role|serviceRole/i,
  "The preview foundation must not import or invoke any booking, customer, audit, or Supabase writer.",
);
assert.doesNotMatch(
  routeSource,
  /admin-booking-supabase-adapter|admin-bookings\/route|app\/page/,
  "The preview route must remain separate from the established Save + CRM route and UI.",
);
assert.match(routeSource, /resolveAdminDispatcherBoundary/);
assert.match(routeSource, new RegExp(previewPurpose));

process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = "false";
delete process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE;

const harness = await createHarness();

try {
  const normalized = harness.helper.normalizeChatGptBookingPreview(validInput());

  assert.equal(normalized.ok, true);
  assert.deepEqual(normalized.missing_required_fields, []);
  assert.equal(normalized.preview.service_type, "MNG");
  assert.equal(normalized.preview.vehicle_type, "VVV");
  assert.equal(normalized.preview.pickup_date, "2030-08-04");
  assert.equal(normalized.preview.pickup_time, "1755");
  assert.equal(normalized.preview.pickup_datetime_sgt, "2030-08-04T17:55:00+08:00");
  assert.equal(normalized.preview.passenger_count, 5);
  assert.equal(normalized.preview.bag_count, 3);
  assert.equal(normalized.preview.customer_price_preview_only, 120);
  assert.equal(normalized.preview.notes_preview_only, "Five passengers; luggage count to be confirmed.");
  assert.equal(normalized.preview.source_message_received, true);
  assert.equal(normalized.canonical_payload.booking.booking_reference, "PREVIEW-ONLY");
  assert.equal(normalized.canonical_payload.booking.customer_display_name, "Pepperl+Fuchs Asia Pte Ltd");
  assert.equal(normalized.canonical_payload.booking.contact_phone, "+65 6777 4760");
  assert.equal(normalized.canonical_payload.booking.driver_id, null);
  assert.equal(normalized.canonical_payload.booking.vehicle_type_or_category, "VVV");
  assert.equal(normalized.canonical_payload.route_points.length, 2);
  assert.deepEqual(normalized.canonical_payload.service_items, []);
  assert.equal(
    JSON.stringify(normalized.canonical_payload).includes("Original booking request"),
    false,
    "Raw source messages must not enter the canonical booking DTO.",
  );
  assert.equal(
    JSON.stringify(normalized.canonical_payload).includes("customer_price"),
    false,
    "Preview-only customer price must not enter the canonical booking DTO.",
  );
  assert.equal(
    normalized.validation_issues.filter((issue) => issue.severity === "warning").length,
    2,
    "Price and notes must be identified as preview-only fields.",
  );

  const fallback = harness.helper.normalizeChatGptBookingPreview(
    validInput({ vehicle_fallback: "AVF", vehicle_type: "unknown coach" }),
  );
  assert.equal(fallback.ok, true);
  assert.equal(fallback.preview.vehicle_type, "AVF");
  assert.equal(fallback.validation_issues.some((issue) => issue.code === "explicit_vehicle_fallback"), true);

  const missing = harness.helper.normalizeChatGptBookingPreview({
    passenger_name: "Missing Fields Passenger",
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.preview, null);
  assert.deepEqual(missing.missing_required_fields, [
    "service_type",
    "vehicle_type",
    "pickup_date",
    "pickup_time",
    "pickup_location",
    "dropoff_location",
    "contact_phone",
  ]);

  const unsafe = harness.helper.normalizeChatGptBookingPreview(
    validInput({ driver_payout: 80, service_type: "MNG" }),
  );
  assert.equal(unsafe.ok, false);
  assert.equal(unsafe.preview, null);
  assert.equal(unsafe.validation_issues.some((issue) => issue.code === "unknown_field"), true);

  const validResponse = await harness.route.POST(request(validInput()));
  const validBody = await validResponse.json();

  assert.equal(validResponse.status, 200);
  assert.deepEqual(responseKeys(validBody), [
    "missing_required_fields",
    "preview",
    "validation_issues",
  ]);
  assert.equal(validBody.preview.service_type, "MNG");
  assert.equal(JSON.stringify(validBody).includes("canonical_payload"), false);
  assert.equal(JSON.stringify(validBody).includes("booking_reference"), false);
  assert.equal(JSON.stringify(validBody).includes("source_message"), true);
  assert.equal(JSON.stringify(validBody).includes("Original booking request supplied"), false);

  const invalidResponse = await harness.route.POST(request({ passenger_name: "Missing Fields Passenger" }));
  const invalidBody = await invalidResponse.json();

  assert.equal(invalidResponse.status, 400);
  assert.equal(invalidBody.preview, null);
  assert.equal(invalidBody.missing_required_fields.includes("contact_phone"), true);

  const blockedResponse = await harness.route.POST(
    request(validInput(), { "x-prestige-admin-purpose": "wrong-purpose" }),
  );
  const blockedBody = await blockedResponse.json();

  assert.equal(blockedResponse.status, 403);
  assert.deepEqual(responseKeys(blockedBody), [
    "missing_required_fields",
    "preview",
    "validation_issues",
  ]);
  assert.equal(blockedBody.preview, null);
  assert.equal(blockedBody.validation_issues[0].code, "preview_access_denied");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("ChatGPT booking preview API contract guard passed.");
