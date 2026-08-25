import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const nativePushBadgeMaximum = 99;

type NativePushBadgeClient = Pick<SupabaseClient, "from">;

export type NativePushBadgeReservation = {
  allocated: boolean;
  count: number;
  id: string;
  table:
    | "admin_device_push_subscriptions"
    | "customer_device_push_subscriptions"
    | "driver_device_push_subscriptions";
};

type NativePushBadgeSelector = {
  table: NativePushBadgeReservation["table"];
  token: string;
  tokenColumn: "endpoint" | "native_expo_token";
};

function badgeCount(value: unknown) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= nativePushBadgeMaximum
    ? value
    : 0;
}

function rowId(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === "string"
    ? (value as { id: string }).id
    : null;
}

export async function reserveNativePushBadgeCount(
  client: NativePushBadgeClient,
  selector: NativePushBadgeSelector,
): Promise<NativePushBadgeReservation | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: currentData, error: currentError } = await client
      .from(selector.table)
      .select("id, badge_count")
      .eq(selector.tokenColumn, selector.token)
      .eq("subscription_status", "active")
      .maybeSingle();
    const id = rowId(currentData);
    if (currentError || !id) return null;

    const currentCount = badgeCount(
      (currentData as { badge_count?: unknown }).badge_count,
    );
    if (currentCount === nativePushBadgeMaximum) {
      return {
        allocated: false,
        count: nativePushBadgeMaximum,
        id,
        table: selector.table,
      };
    }

    const nextCount = currentCount + 1;
    const { data: updatedData, error: updateError } = await client
      .from(selector.table)
      .update({ badge_count: nextCount, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("badge_count", currentCount)
      .eq("subscription_status", "active")
      .select("id")
      .maybeSingle();
    if (!updateError && rowId(updatedData) === id) {
      return {
        allocated: true,
        count: nextCount,
        id,
        table: selector.table,
      };
    }
  }

  return null;
}

export async function releaseNativePushBadgeCount(
  client: NativePushBadgeClient,
  reservation: NativePushBadgeReservation | null,
) {
  if (!reservation?.allocated || reservation.count <= 0) return false;

  const { data, error } = await client
    .from(reservation.table)
    .update({
      badge_count: reservation.count - 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reservation.id)
    .eq("badge_count", reservation.count)
    .eq("subscription_status", "active")
    .select("id")
    .maybeSingle();

  return !error && rowId(data) === reservation.id;
}

export async function resetNativePushBadgeCount(
  client: NativePushBadgeClient,
  selector: NativePushBadgeSelector,
) {
  const { error } = await client
    .from(selector.table)
    .update({ badge_count: 0, updated_at: new Date().toISOString() })
    .eq(selector.tokenColumn, selector.token)
    .eq("subscription_status", "active");

  return !error;
}

export async function resetDriverNativePushBadgeCount(
  client: NativePushBadgeClient,
  driverId: number,
) {
  if (!Number.isSafeInteger(driverId) || driverId <= 0) return false;

  const { error } = await client
    .from("driver_device_push_subscriptions")
    .update({ badge_count: 0, updated_at: new Date().toISOString() })
    .eq("driver_id", driverId)
    .eq("source_surface", "driver_native_ios")
    .eq("subscription_status", "active");

  return !error;
}
