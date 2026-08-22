import * as SecureStore from "expo-secure-store";

const adminNativeNotificationTokenKey =
  "prestige.admin.native-notification-token.v1";
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

type AdminNativeNotificationType =
  | "driver_acknowledged"
  | "driver_completed"
  | "driver_ots"
  | "driver_otw"
  | "driver_pob";

const adminNativeNotificationTypes = new Set<AdminNativeNotificationType>([
  "driver_acknowledged",
  "driver_completed",
  "driver_ots",
  "driver_otw",
  "driver_pob",
]);

export type AdminNativeNotificationOpenRequest = {
  openTarget: "/";
  type: AdminNativeNotificationType;
};

export function nativeAdminNotificationOpenRequest(
  value: unknown,
): AdminNativeNotificationOpenRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const notification = value as Record<string, unknown>;
  const type =
    typeof notification.type === "string" &&
    adminNativeNotificationTypes.has(
      notification.type as AdminNativeNotificationType,
    )
      ? (notification.type as AdminNativeNotificationType)
      : null;
  return notification.open_target === "/" &&
    type &&
    Object.keys(notification).every((key) => key === "open_target" || key === "type")
    ? { openTarget: "/", type }
    : null;
}

export async function readAdminNativeNotificationToken() {
  return SecureStore.getItemAsync(
    adminNativeNotificationTokenKey,
    secureStoreOptions,
  );
}

export async function rememberAdminNativeNotificationToken(value: string) {
  await SecureStore.setItemAsync(
    adminNativeNotificationTokenKey,
    value,
    secureStoreOptions,
  );
}

export async function forgetAdminNativeNotificationToken() {
  await SecureStore.deleteItemAsync(
    adminNativeNotificationTokenKey,
    secureStoreOptions,
  );
}
