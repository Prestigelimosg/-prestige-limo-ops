import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const adminLiveLocationRuntimeControlVersion =
  "admin-live-location-runtime-control:v1";

type RuntimeControlClient = Pick<SupabaseClient, "from">;
type UnknownRecord = Record<string, unknown>;

export type AdminLiveLocationRuntimeControlActor = {
  actorLabel: string;
  role: "admin" | "dispatcher" | "local-dev-admin";
};

type AdminLiveLocationRuntimeControlResult = {
  action: "close" | "open" | "read";
  allowed_booking_references: string[];
  customerVisible: false;
  external_send: false;
  liveMapEnabled: boolean;
  locationStorageEnabled: boolean;
  no_op: boolean;
  ok: boolean;
  reason: string;
  runtime_status: "active" | "closed" | "error";
  stale_after_seconds: number;
  version: typeof adminLiveLocationRuntimeControlVersion;
};

const runtimeSettingsTable = "driver_live_location_runtime_settings";
const runtimeSettingName = "driver_live_location_runtime";
const safeReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

let runtimeControlClientForTests: RuntimeControlClient | null = null;

export function setAdminLiveLocationRuntimeControlClientForTests(
  client: RuntimeControlClient | null,
) {
  runtimeControlClientForTests = client;
}

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function cleanText(value: unknown, maxLength = 160) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  return cleaned.length <= maxLength ? cleaned : "";
}

function cleanBookingReference(value: unknown) {
  const cleaned = cleanText(value, 120);

  return safeReferencePattern.test(cleaned) ? cleaned : "";
}

function runtimeControlClient(env: Record<string, string | undefined>) {
  if (runtimeControlClientForTests) {
    return {
      client: runtimeControlClientForTests,
      ok: true,
    } as const;
  }

  const supabaseUrl = cleanText(env.SUPABASE_URL, 500);
  const serviceRoleKey = cleanText(env.SUPABASE_SERVICE_ROLE_KEY, 2000);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      reason: "config_not_ready",
    } as const;
  }

  try {
    return {
      client: createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }),
      ok: true,
    } as const;
  } catch {
    return {
      ok: false,
      reason: "config_not_ready",
    } as const;
  }
}

function result(
  overrides: Partial<AdminLiveLocationRuntimeControlResult>,
): AdminLiveLocationRuntimeControlResult {
  return {
    action: "read",
    allowed_booking_references: [],
    customerVisible: false,
    external_send: false,
    liveMapEnabled: false,
    locationStorageEnabled: false,
    no_op: true,
    ok: false,
    reason: "runtime_closed",
    runtime_status: "closed",
    stale_after_seconds: 300,
    version: adminLiveLocationRuntimeControlVersion,
    ...overrides,
  };
}

function normalizeRuntimeSetting(row: UnknownRecord) {
  const status = cleanText(row.setting_status, 40);
  const mode = cleanText(row.driver_live_location_mode, 40);
  const captureEnabled = row.driver_live_location_capture_enabled === true;
  const adminMapEnabled = row.admin_active_jobs_map_enabled === true;
  const allowedReferences = Array.isArray(row.driver_live_location_allowed_job_references)
    ? row.driver_live_location_allowed_job_references
        .map(cleanBookingReference)
        .filter(Boolean)
        .slice(0, 50)
    : [];
  const staleAfter = Number(row.driver_live_location_stale_after_seconds);
  const staleAfterSeconds =
    Number.isInteger(staleAfter) && staleAfter >= 30 && staleAfter <= 3600
      ? staleAfter
      : 300;
  const active =
    status === "active" &&
    mode === "runtime" &&
    captureEnabled &&
    adminMapEnabled &&
    allowedReferences.length > 0;

  return result({
    allowed_booking_references: allowedReferences,
    liveMapEnabled: active,
    locationStorageEnabled: active,
    no_op: !active,
    ok: true,
    reason: active ? "runtime_active" : "runtime_closed",
    runtime_status: active ? "active" : "closed",
    stale_after_seconds: staleAfterSeconds,
  });
}

async function readRuntimeSetting(client: RuntimeControlClient) {
  const { data, error } = await client
    .from(runtimeSettingsTable)
    .select(
      "setting_name, setting_status, driver_live_location_capture_enabled, admin_active_jobs_map_enabled, driver_live_location_mode, driver_live_location_allowed_job_references, driver_live_location_stale_after_seconds, driver_live_location_retention_minutes",
    )
    .eq("setting_name", runtimeSettingName)
    .maybeSingle();

  if (error) {
    return result({
      ok: false,
      reason: "read_failed",
      runtime_status: "error",
    });
  }

  return normalizeRuntimeSetting(asRecord(data));
}

export async function readAdminLiveLocationRuntimeControl(
  env: Record<string, string | undefined> = process.env,
) {
  const clientResult = runtimeControlClient(env);

  if (!clientResult.ok) {
    return result({
      ok: false,
      reason: clientResult.reason,
      runtime_status: "error",
    });
  }

  return readRuntimeSetting(clientResult.client);
}

export async function openAdminLiveLocationRuntimeControl({
  actor,
  bookingReference,
  env = process.env,
}: {
  actor: AdminLiveLocationRuntimeControlActor;
  bookingReference: unknown;
  env?: Record<string, string | undefined>;
}) {
  const safeReference = cleanBookingReference(bookingReference);

  if (!safeReference) {
    return result({
      action: "open",
      ok: false,
      reason: "invalid_booking_reference",
      runtime_status: "error",
    });
  }

  if (!["admin", "dispatcher", "local-dev-admin"].includes(actor.role)) {
    return result({
      action: "open",
      ok: false,
      reason: "admin_session_required",
      runtime_status: "error",
    });
  }

  const clientResult = runtimeControlClient(env);

  if (!clientResult.ok) {
    return result({
      action: "open",
      ok: false,
      reason: clientResult.reason,
      runtime_status: "error",
    });
  }

  const existingRuntimeSetting = await readRuntimeSetting(clientResult.client);

  if (!existingRuntimeSetting.ok) {
    return result({
      action: "open",
      ok: false,
      reason: existingRuntimeSetting.reason,
      runtime_status: "error",
    });
  }

  const existingAllowedBookingReferences =
    existingRuntimeSetting.allowed_booking_references.filter(
      (reference) => reference !== safeReference,
    );
  const mergedAllowedBookingReferences = [
    ...existingAllowedBookingReferences,
    safeReference,
  ].slice(-50);

  const { data, error } = await clientResult.client
    .from(runtimeSettingsTable)
    .upsert(
      {
        admin_active_jobs_map_enabled: true,
        driver_live_location_allowed_job_references: mergedAllowedBookingReferences,
        driver_live_location_capture_enabled: true,
        driver_live_location_mode: "runtime",
        driver_live_location_retention_minutes: 120,
        driver_live_location_stale_after_seconds: 300,
        setting_name: runtimeSettingName,
        setting_status: "active",
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "setting_name",
      },
    )
    .select(
      "setting_name, setting_status, driver_live_location_capture_enabled, admin_active_jobs_map_enabled, driver_live_location_mode, driver_live_location_allowed_job_references, driver_live_location_stale_after_seconds, driver_live_location_retention_minutes",
    )
    .maybeSingle();

  if (error) {
    return result({
      action: "open",
      ok: false,
      reason: "write_failed",
      runtime_status: "error",
    });
  }

  return {
    ...normalizeRuntimeSetting(asRecord(data)),
    action: "open" as const,
    no_op: false,
    reason: "runtime_opened",
  };
}

export async function closeAdminLiveLocationRuntimeControl({
  actor,
  env = process.env,
}: {
  actor: AdminLiveLocationRuntimeControlActor;
  env?: Record<string, string | undefined>;
}) {
  if (!["admin", "dispatcher", "local-dev-admin"].includes(actor.role)) {
    return result({
      action: "close",
      ok: false,
      reason: "admin_session_required",
      runtime_status: "error",
    });
  }

  const clientResult = runtimeControlClient(env);

  if (!clientResult.ok) {
    return result({
      action: "close",
      ok: false,
      reason: clientResult.reason,
      runtime_status: "error",
    });
  }

  const { data, error } = await clientResult.client
    .from(runtimeSettingsTable)
    .upsert(
      {
        admin_active_jobs_map_enabled: false,
        driver_live_location_allowed_job_references: [],
        driver_live_location_capture_enabled: false,
        driver_live_location_mode: "closed",
        driver_live_location_retention_minutes: 120,
        driver_live_location_stale_after_seconds: 300,
        setting_name: runtimeSettingName,
        setting_status: "closed",
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "setting_name",
      },
    )
    .select(
      "setting_name, setting_status, driver_live_location_capture_enabled, admin_active_jobs_map_enabled, driver_live_location_mode, driver_live_location_allowed_job_references, driver_live_location_stale_after_seconds, driver_live_location_retention_minutes",
    )
    .maybeSingle();

  if (error) {
    return result({
      action: "close",
      ok: false,
      reason: "write_failed",
      runtime_status: "error",
    });
  }

  return {
    ...normalizeRuntimeSetting(asRecord(data)),
    action: "close" as const,
    reason: "runtime_closed",
  };
}
