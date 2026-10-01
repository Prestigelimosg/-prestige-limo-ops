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
  openTarget: string;
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
  const target = notification.alert_target;
  const validTarget = target === undefined || (typeof target === "string" &&
    /^(?:message|alert):[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(target));
  return validTarget && notification.open_target === "/" &&
    type &&
    Object.keys(notification).every((key) => key === "open_target" || key === "type" || key === "alert_target")
    ? { openTarget: target ? `/?admin_alert=${encodeURIComponent(String(target).toLowerCase())}` : "/", type }
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
