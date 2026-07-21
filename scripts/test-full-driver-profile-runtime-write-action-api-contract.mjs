import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-full-driver-profile-runtime-write-action/route.ts";
const helperPath = "lib/admin-full-driver-profile-runtime-write-action.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const ledgerPath = "docs/current-implementation-ledger.md";

const routePathFragment = "/api/admin-full-driver-profile-runtime-write-action";
const guardScript = "scripts/test-full-driver-profile-runtime-write-action-api-contract.mjs";
const gateEnvName = "PRESTIGE_FULL_DRIVER_PROFILE_WRITE_ENABLED";
const forbiddenRuntimeWiringPattern =
  /adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const forbiddenWritePayloadPattern =
  /payout_preferences|driver_payout_rules|customer_rates|customer_rate|customer_price|pricing|price|payout|payment|billing|invoice|pdf|provider|auth|location|photo|calendar|internal|debug|secret|paynow|preferred_areas|airport_permit_notes|notes/i;
const forbiddenSafeOutputPattern =
  /payout_preferences|driver_payout_rules|customer_rates|customer_rate|customer_price|pricing_snapshot|payment|billing|invoice|pdf|provider|send_state|send_log|auth_session|live_location|photo|calendar|internal_admin|admin_notes|parser_debug|debug_payload|mock_archive|mock_qa|service_role|server_secret|secret|api_key|access_token|raw_token|paynow|pay_now|preferred_areas|airport_permit_notes|notes/i;
const originalEnv = {
  [gateEnvName]: process.env[gateEnvName],
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE:
    process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN:
    process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
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

function setEnv(overrides) {
  restoreEnv();

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);

  return source.slice(start, end);
}

function safeSaveInput(overrides = {}) {
  return {
    action_type: "full_driver_profile_save",
    availability_status: "available",
    contact_number: "+65 9000 1234",
    driver_name: "Safe Runtime Driver",
    plate_number: "SMA1234Z",
    vehicle_type: "Mercedes V-Class",
    ...overrides,
  };
}

function safeDeleteInput(overrides = {}) {
  return {
    action_type: "full_driver_profile_delete",
    id: 42,
    ...overrides,
  };
}

function forbiddenInput() {
  return {
    ...safeSaveInput(),
    airport_permit_notes: "private permit",
    driver_payout_rules: { MNG: { amount: 80 } },
    notes: "internal admin notes",
    payout_preferences: "PayNow payout",
    preferred_areas: "Airport",
  };
}

function assertNoForbiddenSafeOutput(value, label) {
  assert.equal(
    forbiddenSafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose payout, pricing, payment, billing, provider, auth, location, photo, calendar, internal, parser, mock, token, PayNow, notes, preferred-area, permit, or secret output.`,
  );
}

function assertClosedGate(value, label) {
  assert.equal(value.ok, false, `${label} must not save.`);
  assert.equal(value.status, "blocked", `${label} must report blocked status.`);
  assert.equal(value.reason, "write_gate_closed", `${label} must keep the full driver profile write gate closed.`);
  assert.equal(value.write_gate_open, false, `${label} must keep write_gate_open false.`);
  assert.equal(value.write_enabled, false, `${label} must keep write_enabled false.`);
  assert.equal(value.database_client_enabled, false, `${label} must not create a DB client.`);
  assert.equal(value.no_op, true, `${label} must remain no-op.`);
  assert.equal(value.env_gate_name, gateEnvName, `${label} must expose only the env gate name.`);
  assertNoForbiddenSafeOutput(value, label);
}

function assertRejected(value, expectedFields, label) {
  assert.equal(value.ok, false, `${label} must reject unsafe input.`);
  assert.equal(value.status, "rejected", `${label} must report rejected status.`);
  assert.equal(value.reason, "unsafe_or_unknown_fields", `${label} must report unsafe fields.`);
  assert.equal(value.no_op, true, `${label} must remain no-op.`);
  assert.equal(value.database_client_enabled, false, `${label} must not create a DB client.`);

  for (const expectedField of expectedFields) {
    assert.ok(
      value.rejected_fields.some((field) => field.includes(expectedField)),
      `${label} must reject ${expectedField}.`,
    );
  }
}

function assertServerSessionRequired(value, label) {
  assert.equal(value.ok, false, `${label} must not save with local-dev actor.`);
  assert.equal(value.status, "blocked", `${label} must remain blocked.`);
  assert.equal(value.reason, "admin_session_required", `${label} must require server-session admin.`);
  assert.equal(value.write_gate_open, true, `${label} must show only the mocked gate was open.`);
  assert.equal(value.database_client_enabled, false, `${label} must not create a DB client.`);
  assert.equal(value.no_op, true, `${label} must remain no-op.`);
  assertNoForbiddenSafeOutput(value, label);
}

function assertSaved(value, label) {
  assert.equal(value.ok, true, `${label} must save through the mocked client.`);
  assert.equal(value.status, "saved", `${label} must report saved status.`);
  assert.equal(value.reason, "saved", `${label} must report saved reason.`);
  assert.equal(value.no_op, false, `${label} must not be no-op under mocked safe write.`);
  assert.equal(value.write_gate_open, true, `${label} must have the mocked write gate open.`);
  assert.equal(value.write_enabled, true, `${label} must enable write only under mocked safe write.`);
  assert.equal(value.database_client_enabled, true, `${label} must use only the mocked DB client.`);
  assert.equal(value.record.driver_name, "Safe Runtime Driver");
  assert.equal(value.record.contact_number, "+65 9000 1234");
  assertNoForbiddenSafeOutput(value, label);
}

function assertDeleted(value, label) {
  assert.equal(value.ok, true, `${label} must delete through the mocked client.`);
  assert.equal(value.status, "deleted", `${label} must report deleted status.`);
  assert.equal(value.reason, "deleted", `${label} must report deleted reason.`);
  assert.equal(value.no_op, false, `${label} must not be no-op under mocked safe delete.`);
  assert.equal(value.write_gate_open, true, `${label} must have the mocked write gate open.`);
  assert.equal(value.write_enabled, true, `${label} must enable write only under mocked safe delete.`);
  assert.equal(value.database_client_enabled, true, `${label} must use only the mocked DB client.`);
  assert.equal(value.record.id, 42);
  assertNoForbiddenSafeOutput(value, label);
}

function transpileTypescript(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText.replace(/require\("([^"]+)\.ts"\)/g, 'require("$1.js")');
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-full-driver-profile-runtime-write-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const supabasePath = path.join(tempDir, "node_modules/@supabase/supabase-js/index.js");
  const helperOutputPath = path.join(tempDir, helperPath.replace(/\.ts$/, ".js"));
  const helperSource = await readFile(helperPath, "utf8");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await mkdir(path.dirname(helperOutputPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(
    supabasePath,
    "module.exports = { createClient() { throw new Error('createClient must not be called without explicit test clientFactory'); } };",
  );
  await writeFile(helperOutputPath, transpileTypescript(helperSource, helperPath));

  const requireFromTemp = createRequire(path.join(tempDir, "harness.cjs"));
  const helper = requireFromTemp(`./${helperPath.replace(/\.ts$/, ".js")}`);

  return {
    helper,
    async cleanup() {
      await rm(tempDir, { force: true, recursive: true });
    },
  };
}

function mockedClient(calls) {
  const recordFromPayload = (id, payload) => ({
    availability_status: payload.availability_status,
    contact_number: payload.contact_number,
    driver_name: payload.driver_name,
    id,
    plate_number: payload.plate_number,
    updated_at: payload.updated_at,
    vehicle_type: payload.vehicle_type,
  });

  return {
    from(table) {
      calls.push({ table });

      return {
        delete() {
          calls.push({ delete: true });

          return {
            eq(column, id) {
              calls.push({ column, id });

              return {
                select(select) {
                  calls.push({ select });

                  return {
                    async single() {
                      return {
                        data: {
                          availability_status: "inactive",
                          contact_number: "+65 9000 1234",
                          driver_name: "Safe Runtime Driver",
                          id,
                          plate_number: "SMA1234Z",
                          updated_at: "2026-01-01T00:00:00.000Z",
                          vehicle_type: "Mercedes V-Class",
                        },
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
        insert(payload) {
          calls.push({ payload });

          return {
            select(select) {
              calls.push({ select });

              return {
                async single() {
                  return {
                    data: recordFromPayload(77, payload),
                    error: null,
                  };
                },
              };
            },
          };
        },
        update(payload) {
          calls.push({ payload });

          return {
            eq(column, id) {
              calls.push({ column, id });

              return {
                select(select) {
                  calls.push({ select });

                  return {
                    async single() {
                      return {
                        data: recordFromPayload(id, payload),
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

const [
  routeSource,
  helperSource,
  appPage,
  aiParseRoute,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  preactivationSuite,
  ledger,
] = await Promise.all([
  readFile(routePath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(ledgerPath, "utf8"),
]);

const ledgerSection = sectionBetween(ledger, "### Full Driver Profile Runtime Write Action Gate Lock");
for (const phrase of [
  "Added gated full driver profile runtime write/delete boundary.",
  "The route remains closed by default through `PRESTIGE_FULL_DRIVER_PROFILE_WRITE_ENABLED`.",
  "It accepts safe operational driver fields only: `driver_name`, `contact_number`, `vehicle_type`, `plate_number`, and `availability_status`.",
  "Delete action accepts only a safe driver id plus the action type.",
  "It rejects `payout_preferences`, `driver_payout_rules`, pricing, payout, notes, `preferred_areas`, `airport_permit_notes`, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, secrets, PayNow, and mock/archive fields.",
  "No `app/page.tsx` runtime wiring was added.",
  "Existing `loadDrivers`, `saveDriverProfile`, and `deleteDriverProfile` legacy fallback behavior remains unchanged.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "`/api/admin-saved-bookings` remains unchanged.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No UI sector/card, env change, deployment, live DB write/delete execution, provider activation, live send, or new shim is included.",
]) {
  assertIncludes(ledgerSection, phrase, `Full driver profile runtime ledger phrase: ${phrase}`);
}

assertIncludes(routeSource, "export async function POST", "Full driver profile runtime POST route");
assertExcludes(routeSource, "export async function GET", "Full driver profile runtime GET route");
assertExcludes(routeSource, "export async function DELETE", "Full driver profile runtime DELETE route");
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "Admin dispatcher boundary");
assertIncludes(routeSource, "adminBookingPersistencePurpose", "Admin purpose boundary");
assertIncludes(
  routeSource,
  'allowServerSessionRoleMethodsWithoutRequestToken: ["POST"]',
  "Full driver profile same-origin server-session POST allowance",
);
assertIncludes(routeSource, "executeAdminFullDriverProfileRuntimeWriteAction", "Runtime helper call");
assertExcludes(routeSource, forbiddenRuntimeWiringPattern, "Full driver profile runtime route");
assertExcludes(helperSource, forbiddenRuntimeWiringPattern, "Full driver profile runtime helper");

const writePayloadSource = sliceBetween(helperSource, "function writePayload", "function toRuntimeRecord");
for (const fragment of [
  "driver_name",
  "contact_number",
  "vehicle_type",
  "plate_number",
  "availability_status",
  "updated_at",
]) {
  assertIncludes(writePayloadSource, fragment, `Full driver profile runtime write payload ${fragment}`);
}
assertExcludes(writePayloadSource, forbiddenWritePayloadPattern, "Full driver profile runtime write payload");

assertIncludes(helperSource, gateEnvName, "Full driver profile runtime env gate");
assertIncludes(helperSource, "full_driver_profile_save", "Save action type");
assertIncludes(helperSource, "full_driver_profile_delete", "Delete action type");
assertIncludes(helperSource, "forbiddenFieldPattern", "Forbidden field pattern");
assertIncludes(helperSource, "payout_preferences", "Forbidden payout preferences rejection");
assertIncludes(helperSource, "driver_payout_rules", "Forbidden driver payout rules rejection");
assertIncludes(helperSource, "airport_permit_notes", "Forbidden airport permit notes rejection");
assertIncludes(helperSource, "preferred_areas", "Forbidden preferred areas rejection");

const saveDriverProfile = sliceBetween(appPage, "async function saveDriverProfile()", "async function deactivateDriverProfile");
const deleteDriverProfile = sliceBetween(appPage, "async function deleteDriverProfile", "async function saveBooking");
assertIncludes(saveDriverProfile, ".from(adminLegacyTables.drivers)", "Existing full driver profile save fallback");
assertIncludes(deleteDriverProfile, ".from(adminLegacyTables.drivers).delete()", "Existing full driver profile delete fallback");
assertIncludes(saveDriverProfile, "payout_preferences", "Existing full driver profile payout preferences remains parked");
assertIncludes(saveDriverProfile, "driver_payout_rules", "Existing full driver profile payout rules remains parked");

const saveBooking = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBooking, 'fetch("/api/admin-bookings"', "Save Booking + CRM endpoint");
assertExcludes(saveBooking, routePathFragment, "Save Booking + CRM full driver runtime separation");
assertExcludes(saveBooking, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

assertExcludes(aiParseRoute, routePathFragment, "Parser route full driver runtime separation");
assertExcludes(adminBookingsRoute, routePathFragment, "Admin bookings full driver runtime separation");
assertExcludes(adminSavedBookingsRoute, routePathFragment, "Admin saved bookings full driver runtime separation");

assertIncludes(preactivationSuite, guardScript, "Preactivation suite full driver profile runtime guard registration");

const localDevActor = {
  actor_label: "Local dev",
  actor_role: "admin",
  boundary_mode: "local-dev",
  source_surface: "admin_api",
};
const serverAdminActor = {
  actor_label: "Runtime test admin",
  actor_role: "admin",
  boundary_mode: "server-session-role-surface",
  source_surface: "admin_api",
};

const harness = await loadHarness();

try {
  const { executeAdminFullDriverProfileRuntimeWriteAction } = harness.helper;

  setEnv({ [gateEnvName]: undefined });
  assertClosedGate(
    await executeAdminFullDriverProfileRuntimeWriteAction(safeSaveInput(), localDevActor),
    "closed gate save payload",
  );
  assertClosedGate(
    await executeAdminFullDriverProfileRuntimeWriteAction(safeDeleteInput(), localDevActor),
    "closed gate delete payload",
  );

  assertRejected(
    await executeAdminFullDriverProfileRuntimeWriteAction(forbiddenInput(), localDevActor),
    ["airport_permit_notes", "driver_payout_rules", "notes", "payout_preferences", "preferred_areas"],
    "forbidden full driver profile fields",
  );
  assertRejected(
    await executeAdminFullDriverProfileRuntimeWriteAction(
      safeSaveInput({ debug_payload: { unsafe: true } }),
      localDevActor,
    ),
    ["debug_payload"],
    "debug payload field",
  );
  assertRejected(
    await executeAdminFullDriverProfileRuntimeWriteAction(
      safeSaveInput({ availability_status: "paid" }),
      localDevActor,
    ),
    ["availability_status"],
    "invalid availability status",
  );
  assertRejected(
    await executeAdminFullDriverProfileRuntimeWriteAction(
      safeDeleteInput({ driver_name: "Extra Driver" }),
      localDevActor,
    ),
    ["driver_name"],
    "delete action extra profile field",
  );
  const missingDeleteId = await executeAdminFullDriverProfileRuntimeWriteAction(
    { action_type: "full_driver_profile_delete" },
    localDevActor,
  );
  assert.equal(missingDeleteId.ok, false, "missing delete id must not save.");
  assert.equal(
    missingDeleteId.reason,
    "missing_required_fields",
    "missing delete id must fail as missing required.",
  );
  assert.equal(
    missingDeleteId.write_gate_open,
    false,
    "missing delete id must not report the write gate open before gate validation.",
  );
  assert.equal(missingDeleteId.database_client_enabled, false, "missing delete id must not use DB.");

  setEnv({ [gateEnvName]: "true" });
  assertServerSessionRequired(
    await executeAdminFullDriverProfileRuntimeWriteAction(safeSaveInput(), localDevActor),
    "open gate local-dev actor",
  );

  setEnv({
    [gateEnvName]: "true",
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    SUPABASE_URL: undefined,
  });
  const noConfig = await executeAdminFullDriverProfileRuntimeWriteAction(
    safeSaveInput(),
    serverAdminActor,
  );
  assert.equal(noConfig.ok, false, "missing config must not save");
  assert.equal(noConfig.reason, "config_not_ready", "missing config must fail safely");
  assert.equal(noConfig.database_client_enabled, false, "missing config must not enable DB client");
  assert.equal(noConfig.no_op, true, "missing config must remain no-op");

  const insertCalls = [];
  const inserted = await executeAdminFullDriverProfileRuntimeWriteAction(
    safeSaveInput(),
    serverAdminActor,
    { clientFactory: () => mockedClient(insertCalls) },
  );
  assertSaved(inserted, "mocked insert write");
  assert.deepEqual(insertCalls[0], { table: "drivers" });
  assert.equal(insertCalls[1].payload.driver_name, "Safe Runtime Driver");
  assert.equal(insertCalls[1].payload.payout_preferences, undefined);
  assert.equal(insertCalls[1].payload.driver_payout_rules, undefined);

  const updateCalls = [];
  const updated = await executeAdminFullDriverProfileRuntimeWriteAction(
    safeSaveInput({ id: 42 }),
    serverAdminActor,
    { clientFactory: () => mockedClient(updateCalls) },
  );
  assertSaved(updated, "mocked update write");
  assert.deepEqual(updateCalls[0], { table: "drivers" });
  assert.equal(updateCalls[2].column, "id");
  assert.equal(updateCalls[2].id, 42);
  assert.equal(updateCalls[1].payload.notes, undefined);

  const deleteCalls = [];
  const deleted = await executeAdminFullDriverProfileRuntimeWriteAction(
    safeDeleteInput(),
    serverAdminActor,
    { clientFactory: () => mockedClient(deleteCalls) },
  );
  assertDeleted(deleted, "mocked delete write");
  assert.deepEqual(deleteCalls[0], { table: "drivers" });
  assert.deepEqual(deleteCalls[1], { delete: true });
  assert.equal(deleteCalls[2].column, "id");
  assert.equal(deleteCalls[2].id, 42);
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("full driver profile runtime write action API contract guard passed");
