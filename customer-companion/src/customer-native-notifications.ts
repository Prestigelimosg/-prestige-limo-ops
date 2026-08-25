import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import { customerInstallationId } from "./customer-installation";
import { productionOrigin } from "./customer-navigation";

export type CustomerNativeRegistration = {
  expoPushToken: string;
  installationId: string;
};

function safeBookingReference(value: unknown) {
  const cleaned = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^(?:[0-9]{5}|[A-Z0-9]{2,12}-[0-9]{5})$/.test(cleaned) ? cleaned : null;
}

export function customerNotificationBookingUrl(data: unknown) {
  const record = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const bookingReference = safeBookingReference(record.booking_reference);
  if (!bookingReference) return null;
  const url = new URL("/my-bookings", productionOrigin);
  url.searchParams.set("booking", bookingReference);
  url.searchParams.set("tracking", "1");
  return url.toString();
}

export async function readCustomerNativeNotifications(): Promise<CustomerNativeRegistration | null> {
  if (!Device.isDevice) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== "string" || !projectId) return null;
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  if (!token.data) return null;
  return {
    expoPushToken: token.data,
    installationId: await customerInstallationId(),
  };
}

export async function registerCustomerNativeNotifications(): Promise<CustomerNativeRegistration | null> {
  if (!Device.isDevice) return null;
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return null;
  return await readCustomerNativeNotifications();
}

export function addCustomerNotificationTapListener(onOpen: (url: string) => void) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const url = customerNotificationBookingUrl(response.notification.request.content.data);
    if (url) onOpen(url);
  });
}

export function addCustomerNotificationReceivedListener(onReceive: () => void) {
  return Notifications.addNotificationReceivedListener(onReceive);
}

export async function initialCustomerNotificationUrl() {
  const response = await Notifications.getLastNotificationResponseAsync();
  return response ? customerNotificationBookingUrl(response.notification.request.content.data) : null;
}
