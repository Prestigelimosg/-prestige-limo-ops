import "server-only";

export const liveLocationWindowPolicySetupFoundationVersion =
  "live-location-window-policy-setup-foundation-v1";

export type LiveLocationWindowPolicySetupInput = {
  bookingReference?: unknown;
  booking_reference?: unknown;
  pickupAt?: unknown;
  pickup_at?: unknown;
  pobAt?: unknown;
  pob_at?: unknown;
};

export type LiveLocationWindowPolicySetupResult = {
  admin_live_map_planned: true;
  auto_stop_minutes_after_pob: 5;
  booking_reference: string | null;
  customer_live_map_link_planned: true;
  customer_visible_window_minutes_before_pickup: 30;
  customerVisible: false;
  gpsCaptureEnabled: false;
  liveAccessEnabled: false;
  liveMapEnabled: false;
  locationStorageEnabled: false;
  policyReady: true;
  policy_surface: "live_location_window_policy_setup_only";
  planned_windows: {
    admin_live_map: "planned_only";
    auto_stop_after_pob_minutes: 5;
    customer_live_map_link: "planned_only";
    customer_window_before_pickup_minutes: 30;
  };
  status: "setup_only";
  version: typeof liveLocationWindowPolicySetupFoundationVersion;
};

function safeText(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  return cleaned || null;
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

export function buildLiveLocationWindowPolicySetup(
  input: LiveLocationWindowPolicySetupInput = {},
): LiveLocationWindowPolicySetupResult {
  return {
    admin_live_map_planned: true,
    auto_stop_minutes_after_pob: 5,
    booking_reference: safeText(firstValue(input.booking_reference, input.bookingReference)),
    customer_live_map_link_planned: true,
    customer_visible_window_minutes_before_pickup: 30,
    customerVisible: false,
    gpsCaptureEnabled: false,
    liveAccessEnabled: false,
    liveMapEnabled: false,
    locationStorageEnabled: false,
    policyReady: true,
    policy_surface: "live_location_window_policy_setup_only",
    planned_windows: {
      admin_live_map: "planned_only",
      auto_stop_after_pob_minutes: 5,
      customer_live_map_link: "planned_only",
      customer_window_before_pickup_minutes: 30,
    },
    status: "setup_only",
    version: liveLocationWindowPolicySetupFoundationVersion,
  };
}
