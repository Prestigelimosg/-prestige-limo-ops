import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const adminAutomationRuntimeControlVersion =
  "admin-automation-runtime-control:v1";

type RuntimeControlClient = Pick<SupabaseClient, "from">;
type UnknownRecord = Record<string, unknown>;

export type AdminAutomationRuntimeControlActor = {
  actorLabel: string;
  role: "admin" | "dispatcher" | "local-dev-admin";
};

export type AdminAutomationRuntimeControlResult = {
  action: "disable" | "enable" | "read";
  automation_enabled: boolean;
  booking_intake_enabled: true;
  calendar_auto_write_enabled: false;
  customer_driver_email_auto_send_enabled: false;
  customerVisible: false;
  external_send: false;
  invoice_auto_issue_enabled: false;
  no_op: boolean;
  ok: boolean;
  reason: string;
  runtime_status: "active" | "closed" | "error";
  version: typeof adminAutomationRuntimeControlVersion;
};

const runtimeSettingsTable = "admin_automation_runtime_settings";
const runtimeSettingName = "admin_automation_runtime";

let runtimeControlClientForTests: RuntimeControlClient | null = null;

export function setAdminAutomationRuntimeControlClientForTests(
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
  overrides: Partial<AdminAutomationRuntimeControlResult>,
): AdminAutomationRuntimeControlResult {
  return {
    action: "read",
    automation_enabled: false,
    booking_intake_enabled: true,
    calendar_auto_write_enabled: false,
    customer_driver_email_auto_send_enabled: false,
    customerVisible: false,
    external_send: false,
    invoice_auto_issue_enabled: false,
    no_op: true,
    ok: false,
    reason: "runtime_closed",
    runtime_status: "closed",
    version: adminAutomationRuntimeControlVersion,
    ...overrides,
  };
}

function normalizeRuntimeSetting(row: UnknownRecord) {
  if (cleanText(row.setting_name, 80) !== runtimeSettingName) {
    return result({
      reason: "setting_missing",
      runtime_status: "error",
    });
  }

  const enabled =
    row.automation_enabled === true && cleanText(row.setting_status, 40) === "active";

  return result({
    automation_enabled: enabled,
    no_op: false,
    ok: true,
    reason: enabled ? "runtime_active" : "runtime_closed",
    runtime_status: enabled ? "active" : "closed",
  });
}

async function readRuntimeSetting(client: RuntimeControlClient) {
  const { data, error } = await client
    .from(runtimeSettingsTable)
    .select(
      "setting_name, setting_status, automation_enabled, updated_by_role, created_at, updated_at",
    )
    .eq("setting_name", runtimeSettingName)
    .maybeSingle();

  if (error) {
    return result({
      reason: "read_failed",
      runtime_status: "error",
    });
  }

  return normalizeRuntimeSetting(asRecord(data));
}

export async function readAdminAutomationRuntimeControl(
  env: Record<string, string | undefined> = process.env,
) {
  const clientResult = runtimeControlClient(env);

  if (!clientResult.ok) {
    return result({
      reason: clientResult.reason,
      runtime_status: "error",
    });
  }

  return readRuntimeSetting(clientResult.client);
}

export async function setAdminAutomationRuntimeControl({
  actor,
  enabled,
  env = process.env,
}: {
  actor: AdminAutomationRuntimeControlActor;
  enabled: boolean;
  env?: Record<string, string | undefined>;
}) {
  const action = enabled ? "enable" : "disable";

  if (!(["admin", "dispatcher", "local-dev-admin"] as string[]).includes(actor.role)) {
    return result({
      action,
      reason: "admin_session_required",
      runtime_status: "error",
    });
  }

  const clientResult = runtimeControlClient(env);

  if (!clientResult.ok) {
    return result({
      action,
      reason: clientResult.reason,
      runtime_status: "error",
    });
  }

  const { data, error } = await clientResult.client
    .from(runtimeSettingsTable)
    .upsert(
      {
        automation_enabled: enabled,
        setting_name: runtimeSettingName,
        setting_status: enabled ? "active" : "closed",
        updated_at: new Date().toISOString(),
        updated_by_role: actor.role,
      },
      {
        onConflict: "setting_name",
      },
    )
    .select(
      "setting_name, setting_status, automation_enabled, updated_by_role, created_at, updated_at",
    )
    .maybeSingle();

  if (error) {
    return result({
      action,
      reason: "write_failed",
      runtime_status: "error",
    });
  }

  const normalized = normalizeRuntimeSetting(asRecord(data));

  if (!normalized.ok) {
    return result({
      action,
      reason: normalized.reason,
      runtime_status: "error",
    });
  }

  return {
    ...normalized,
    action,
    no_op: false,
    reason: enabled ? "runtime_enabled" : "runtime_disabled",
  };
}
