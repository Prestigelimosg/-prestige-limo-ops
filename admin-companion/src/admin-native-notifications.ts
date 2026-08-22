import * as SecureStore from "expo-secure-store";

const adminNativeNotificationTokenKey =
  "prestige.admin.native-notification-token.v1";
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export type AdminNativeNotificationOpenRequest = {
  openTarget: "/";
  type: "driver_acknowledged";
};

export function nativeAdminNotificationOpenRequest(
  value: unknown,
): AdminNativeNotificationOpenRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const notification = value as Record<string, unknown>;
  return notification.open_target === "/" &&
    notification.type === "driver_acknowledged" &&
    Object.keys(notification).every((key) => key === "open_target" || key === "type")
    ? { openTarget: "/", type: "driver_acknowledged" }
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
