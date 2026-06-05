import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const approvalValue = "stage-4a-388-william-approved";
const envFilePath = path.join(process.cwd(), ".env.stage4a388.local");
const liveAttemptMarkerPath = path.join(
  os.tmpdir(),
  "prestige-stage4a388-controlled-live-write-attempted.marker",
);
const requiredEnvKeys = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN",
];
const sourceFiles = [
  "lib/admin-booking-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
];
const unsafeFieldProbe = {
  booking: {
    booking_reference: "STAGING-VERIFY-4A388-UNSAFE-PROBE",
    contact_phone: "+6500000000",
    customer_display_name: "Stage 4A-388 Unsafe Probe",
    dropoff_location: "Stage 4A-388 Dropoff Probe",
    pickup_datetime: "2026-06-15T09:30:00+08:00",
    pickup_location: "Stage 4A-388 Pickup Probe",
    quoted_price: "1.00",
    route_type: "MNG",
  },
  route_points: [
    {
      location_text: "Stage 4A-388 Pickup Probe",
      point_type: "pickup",
      sequence_number: 1,
    },
    {
      location_text: "Stage 4A-388 Dropoff Probe",
      point_type: "dropoff",
      sequence_number: 2,
    },
  ],
  service_items: [],
};

function emitEvidence(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function failSafely(code, extra = {}) {
  emitEvidence({
    ok: false,
    error: code,
    ...extra,
  });
  process.exit(1);
}

function parseEnvFile(text) {
  const env = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);

    if (!match) {
      continue;
    }

    let value = match[2].trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[match[1]] = value;
  }

  return env;
}

function looksPlaceholder(value) {
  return /^(?:|todo|tbd|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example|YOUR_PROJECT_REF|YOUR_SERVICE_ROLE)$/i.test(
    value.trim(),
  );
}

function looksProduction(value) {
  return /(?:production|prod|live)/i.test(value.trim());
}

function validateEnv(env) {
  const missing = [];
  const placeholder = [];
  const unsafe = [];
  const invalid = [];

  for (const key of requiredEnvKeys) {
    const value = String(env[key] ?? "").trim();

    if (!value) {
      missing.push(key);
    } else if (looksPlaceholder(value)) {
      placeholder.push(key);
    } else if (looksProduction(value)) {
      unsafe.push(key);
    }
  }

  if (env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    invalid.push("PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED");
  }

  if (!["server-session-token", "server-session"].includes(env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE)) {
    invalid.push("PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE");
  }

  if (!["admin", "dispatcher"].includes(env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE)) {
    invalid.push("PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE");
  }

  return {
    invalid,
    missing,
    placeholder,
    unsafe,
  };
}

function applyLoadedEnv(env) {
  for (const key of requiredEnvKeys) {
    process.env[key] = String(env[key] ?? "").trim();
  }

  if (process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE === "server-session") {
    process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE = "server-session-token";
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

async function writeHarnessFile(tempDir, relativePath) {
  const sourcePath = path.join(process.cwd(), relativePath);
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
  const source = await readFile(sourcePath, "utf8");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, sourcePath));
}

async function writeRuntimeModules(tempDir) {
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const tempSupabaseDir = path.join(tempDir, "node_modules/@supabase");
  const workspaceSupabaseDir = path.join(process.cwd(), "node_modules/@supabase");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(tempSupabaseDir, { recursive: true });
  await writeFile(serverOnlyPath, "");

  try {
    await symlink(
      path.join(workspaceSupabaseDir, "supabase-js"),
      path.join(tempSupabaseDir, "supabase-js"),
      "dir",
    );
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }
  }
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-stage4a388-live-"));

  await writeRuntimeModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    adapter: require(path.join(tempDir, "lib/admin-booking-supabase-adapter.js")),
    persistence: require(path.join(tempDir, "lib/admin-booking-persistence.js")),
  };
}

function createReference() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).replace(/[^a-z0-9]/gi, "").slice(2, 8).toUpperCase();

  return `STAGING-VERIFY-4A388-${timestamp}-${suffix || "SAFE01"}`;
}

function createSafePayload(reference) {
  return {
    booking: {
      admin_internal_status: "stage_verification_only",
      booking_reference: reference,
      cancellation_review_status: "not_requested",
      change_review_status: "not_requested",
      contact_display_name: "Stage 4A-388 Dispatcher Contact",
      contact_email: "stage-4a-388@example.invalid",
      contact_phone: "+6500004388",
      customer_display_name: "Stage 4A-388 Controlled Customer",
      customer_facing_status: "pending_review",
      dropoff_location: "Stage 4A-388 controlled staging dropoff",
      luggage_count: 1,
      parser_source_reference: "stage-4a-388-manual-controlled-payload",
      passenger_name: "Stage 4A-388 Passenger",
      passenger_phone: "+6500004389",
      pax_count: 1,
      pickup_at: "2026-06-15T09:30:00+08:00",
      pickup_datetime: "2026-06-15T09:30:00+08:00",
      pickup_location: "Stage 4A-388 controlled staging pickup",
      request_review_status: "pending_review",
      route_summary:
        "Stage 4A-388 controlled staging pickup > Stage 4A-388 controlled staging dropoff",
      route_type: "MNG",
      service_type: "airport_arrival",
      short_notice_review_status: "not_required",
      source_channel: "stage_4a_388_controlled_check",
      source_surface: "admin_api",
      vehicle_type_or_category: "AVF",
    },
    route_points: [
      {
        location_text: "Stage 4A-388 controlled staging pickup",
        point_type: "pickup",
        sequence_number: 1,
      },
      {
        location_text: "Stage 4A-388 controlled staging dropoff",
        point_type: "dropoff",
        sequence_number: 2,
      },
    ],
    service_items: [
      {
        notes: "Stage 4A-388 controlled safe service item",
        quantity: 1,
        service_item_type: "child_seat",
      },
    ],
  };
}

function createActor() {
  return {
    actor_label: "Stage 4A-388 William-approved staging verifier",
    actor_role: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE === "dispatcher" ? "dispatcher" : "admin",
    boundary_mode: "server-session-role-surface",
    source_surface: "admin_api",
  };
}

function safeResultName(result) {
  if (result?.ok) {
    return "passed";
  }

  return result?.status ? `blocked-${result.status}` : "blocked";
}

async function main() {
  if (process.env.PRESTIGE_ADMIN_BOOKING_STAGING_WRITE_VERIFICATION_APPROVED !== approvalValue) {
    failSafely("missing_explicit_william_approval_env", {
      requiredApprovalEnvName: "PRESTIGE_ADMIN_BOOKING_STAGING_WRITE_VERIFICATION_APPROVED",
    });
  }

  if (!existsSync(envFilePath)) {
    failSafely("missing_ignored_stage_env_file", {
      requiredEnvFileName: ".env.stage4a388.local",
    });
  }

  const loadedEnv = parseEnvFile(await readFile(envFilePath, "utf8"));
  const envValidation = validateEnv(loadedEnv);

  if (
    envValidation.missing.length > 0 ||
    envValidation.placeholder.length > 0 ||
    envValidation.unsafe.length > 0 ||
    envValidation.invalid.length > 0
  ) {
    failSafely("env_preflight_failed", {
      invalid: envValidation.invalid,
      missing: envValidation.missing,
      placeholder: envValidation.placeholder,
      unsafeProductionLooking: envValidation.unsafe,
    });
  }

  applyLoadedEnv(loadedEnv);

  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    failSafely("runtime_environment_refused");
  }

  const { adapter, persistence } = await loadHarness();
  const actor = createActor();
  const reference = createReference();
  const safePayload = createSafePayload(reference);
  const parsed = persistence.parseAdminBookingPersistencePayload(safePayload);
  const unsafeProbe = persistence.parseAdminBookingPersistencePayload(unsafeFieldProbe);
  const stagingReadiness = adapter.checkAdminBookingPersistenceStagingConfigReadiness();
  const enableReadiness = adapter.checkAdminBookingPersistenceEnableReadiness(parsed, actor);

  if (!parsed.ok) {
    failSafely("safe_payload_rejected_before_live_write", {
      verificationReference: reference,
    });
  }

  if (unsafeProbe.ok) {
    failSafely("unsafe_field_probe_was_not_rejected", {
      verificationReference: reference,
    });
  }

  if (!stagingReadiness.ok || !enableReadiness.ok) {
    failSafely("staging_readiness_preflight_failed", {
      blocked: enableReadiness.blocked || [],
      invalid: stagingReadiness.invalid || [],
      missing: stagingReadiness.missing || [],
      verificationReference: reference,
    });
  }

  process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = "false";
  const killSwitchBefore = await persistence.createAdminBooking(parsed.data, actor, {
    action: "stage_4a_388_kill_switch_before_probe",
    actor_label: actor.actor_label,
    change_summary: "Stage 4A-388 kill-switch before probe; expected disabled response.",
    source_route: "scripts/run-admin-booking-staging-save-load-verification.mjs",
  });

  if (killSwitchBefore.ok || killSwitchBefore.status !== 503) {
    failSafely("kill_switch_before_probe_failed", {
      verificationReference: reference,
    });
  }

  process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = "true";

  try {
    await writeFile(
      liveAttemptMarkerPath,
      `Stage 4A-388 controlled live save attempted for ${reference}\n`,
      {
        flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        mode: 0o600,
      },
    );
  } catch (error) {
    if (error?.code === "EEXIST") {
      failSafely("controlled_live_write_already_attempted");
    }

    throw error;
  }

  const saveResult = await persistence.createAdminBooking(parsed.data, actor, {
    action: "stage_4a_388_controlled_save_load_verification",
    actor_label: actor.actor_label,
    change_summary: "Stage 4A-388 one controlled staging admin booking/customer save-load verification.",
    source_route: "scripts/run-admin-booking-staging-save-load-verification.mjs",
  });

  if (!saveResult.ok) {
    failSafely("controlled_save_failed_safely", {
      status: saveResult.status,
      verificationReference: reference,
    });
  }

  const loadResult = await persistence.listAdminBookings(actor);

  if (!loadResult.ok) {
    failSafely("controlled_load_failed_safely", {
      status: loadResult.status,
      verificationReference: reference,
    });
  }

  const loadedRecord = loadResult.data.find((record) => record.booking_reference === reference);

  if (!loadedRecord) {
    failSafely("controlled_reference_not_found_in_safe_load", {
      verificationReference: reference,
    });
  }

  process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = "false";
  const killSwitchAfter = await persistence.createAdminBooking(parsed.data, actor, {
    action: "stage_4a_388_kill_switch_after_probe",
    actor_label: actor.actor_label,
    change_summary: "Stage 4A-388 kill-switch after probe; expected disabled response.",
    source_route: "scripts/run-admin-booking-staging-save-load-verification.mjs",
  });

  if (killSwitchAfter.ok || killSwitchAfter.status !== 503) {
    failSafely("kill_switch_after_probe_failed", {
      verificationReference: reference,
    });
  }

  emitEvidence({
    ok: true,
    gateStatus: {
      adminDispatcherGate: "required",
      customerPublicDriverAnonymousPaths: "blocked-by-preflight-gates",
      envFile: "present-ignored",
      killSwitchAfter: safeResultName(killSwitchAfter),
      killSwitchBefore: safeResultName(killSwitchBefore),
      safePayload: "passed",
      stagingReadiness: "passed",
      unsafeFieldProbe: "rejected-before-adapter-use",
    },
    liveWriteAttemptCount: 1,
    noSecretsPrinted: true,
    noSupabaseCli: true,
    noRawSql: true,
    noMigration: true,
    noProductionWrite: true,
    result: {
      load: "passed",
      save: "passed",
    },
    tablesInApprovedScope: [
      "customers",
      "customer_contacts",
      "bookings",
      "booking_route_points",
      "booking_service_items",
      "audit_logs",
    ],
    unsafeFieldsWritten: false,
    verificationReference: reference,
  });
}

main().catch(() => {
  failSafely("unexpected_runner_failure_sanitized");
});
