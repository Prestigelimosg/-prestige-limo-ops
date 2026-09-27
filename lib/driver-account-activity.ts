import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DriverPortalSessionClaims } from "./driver-portal-session";

type ActivityClient = Partial<Pick<SupabaseClient, "rpc">>;
export type DriverPoolActivity = {
  driver_id: number;
  state: "online" | "last_active" | "signed_out" | "unknown";
  label: string;
};

// Neither failure nor absence of this optional display evidence changes access.
export async function recordDriverAccountActivity(client: ActivityClient, claims: DriverPortalSessionClaims, event: "active" | "signed_out") {
  if (!client.rpc || !claims.accountId || !claims.deviceIdHash || !Number.isFinite(claims.issuedAt) || !Number.isFinite(claims.expiresAt)) return false;
  try {
    const { data, error } = await client.rpc("record_driver_account_activity", {
      p_account_id: claims.accountId, p_driver_id: claims.driverId,
      p_device_id_hash: claims.deviceIdHash,
      p_session_issued_at: new Date(claims.issuedAt).toISOString(),
      p_session_expires_at: new Date(claims.expiresAt).toISOString(), p_event: event,
    }).abortSignal(AbortSignal.timeout(1500));
    return !error && data === true;
  } catch { return false; }
}

export async function loadDriverPoolActivity(client: ActivityClient, driverIds: number[], now = Date.now()): Promise<DriverPoolActivity[]> {
  const unknown = driverIds.map(driver_id => ({ driver_id, state: "unknown" as const, label: "Unknown" }));
  if (!client.rpc || !driverIds.length || driverIds.length > 200 || new Set(driverIds).size !== driverIds.length || driverIds.some(id => !Number.isSafeInteger(id) || id <= 0)) return unknown;
  try {
    const { data, error } = await client.rpc("read_driver_pool_activity", { p_driver_ids: driverIds }).abortSignal(AbortSignal.timeout(1500));
    if (error || !Array.isArray(data) || data.length !== driverIds.length) return unknown;
    return driverIds.map(driver_id => {
      const matches = data.filter(row => row.driver_id === driver_id);
      if (matches.length !== 1) return { driver_id, state: "unknown", label: "Unknown" };
      const row = matches[0];
      if (row.state === "signed_out") return { driver_id, state: "signed_out", label: "Signed out" };
      const last = typeof row.last_active_at === "string" ? Date.parse(row.last_active_at) : NaN;
      const age = now - last;
      if (!Number.isFinite(age) || age < 0) return { driver_id, state: "unknown", label: "Unknown" };
      if (row.state === "online" && age <= 120_000) return { driver_id, state: "online", label: "Online" };
      if (row.state === "online" || row.state === "last_active") {
        const minutes = Math.max(1, Math.floor(age / 60_000));
        const elapsed = minutes < 60 ? `${minutes} min` : minutes < 1440 ? `${Math.floor(minutes / 60)} hr` : `${Math.floor(minutes / 1440)} days`;
        return { driver_id, state: "last_active", label: `Last active ${elapsed} ago` };
      }
      return { driver_id, state: "unknown", label: "Unknown" };
    });
  } catch { return unknown; }
}
