import * as SecureStore from "expo-secure-store";

const adminNativeNotificationTokenKey =
  "prestige.admin.native-notification-token.v1";
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

type AdminNativeNotificationType =
  | "admin_booking_created"
  | "admin_urgent_booking_created"
  | "new_booking_request"
  | "urgent_booking_request"
  | "customer_booking_amendment"
  | "customer_booking_cancellation"
  | "customer_driver_details_acknowledged"
  | "customer_to_driver_reply"
  | "driver_acknowledged"
  | "driver_completed"
  | "driver_issue"
  | "driver_ots"
  | "driver_ots_photo"
  | "driver_otw"
  | "driver_pob"
  | "driver_to_customer_reply"
  | "email_booking_amendment"
  | "email_booking_cancellation"
  | "email_confirmed_booking";

const adminNativeNotificationTypes = new Set<AdminNativeNotificationType>([
  "admin_booking_created",
  "admin_urgent_booking_created",
  "new_booking_request",
  "urgent_booking_request",
  "customer_booking_amendment",
  "customer_booking_cancellation",
  "customer_driver_details_acknowledged",
  "customer_to_driver_reply",
  "driver_acknowledged",
  "driver_completed",
  "driver_issue",
  "driver_ots",
  "driver_ots_photo",
  "driver_otw",
  "driver_pob",
  "driver_to_customer_reply",
  "email_booking_amendment",
  "email_booking_cancellation",
  "email_confirmed_booking",
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
