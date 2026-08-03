export const customerDevicePushSubscriptionsApiPath =
  "/api/customer-device-push-subscriptions";

const customerDevicePushPurpose = "customer-device-push-subscription";

export async function updateCustomerDevicePushSubscription(
  method: "GET" | "PATCH" | "POST",
  subscription?: PushSubscription,
) {
  const response = await fetch(customerDevicePushSubscriptionsApiPath, {
    ...(subscription
      ? {
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        }
      : {}),
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      ...(subscription ? { "Content-Type": "application/json" } : {}),
      "x-prestige-customer-purpose": customerDevicePushPurpose,
    },
    method,
  });
  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || "Customer alerts request failed.");
  }

  return result;
}
