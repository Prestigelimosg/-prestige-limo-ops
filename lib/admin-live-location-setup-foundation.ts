export const adminLiveLocationSetupFoundationVersion =
  "admin-live-location-setup-foundation:v1";

export type AdminLiveLocationServiceCode =
  | "MNG"
  | "ARRIVAL"
  | "DEP"
  | "DEPARTURE"
  | "TRF"
  | "TRANSFER"
  | "DSP"
  | "HOURLY"
  | string;

export type AdminLiveLocationSetupInput = {
  booking_ref?: string | null;
  service_code?: AdminLiveLocationServiceCode | null;
  pickup_at?: string | null;
};

export type AdminLiveLocationSetupResult = {
  version: typeof adminLiveLocationSetupFoundationVersion;
  booking_ref: string;
  status: "setup_only";
  live_location_status: "disabled";
  driver_capture_status: "disabled";
  customer_map_status: "disabled";
  admin_map_status: "disabled";
  service_eligibility: "allowed_later" | "disabled_for_customer";
  future_customer_window_minutes_before_pickup: 30;
  future_pob_auto_stop_minutes_after_pob: 5;
  future_otw_trigger: "planned_only";
  notes: string[];
};

function normalizeServiceCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function safeBookingRef(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "unknown";
}

export function buildAdminLiveLocationSetupFoundation(
  input: AdminLiveLocationSetupInput,
): AdminLiveLocationSetupResult {
  const serviceCode = normalizeServiceCode(input.service_code);
  const serviceEligibility =
    serviceCode === "MNG" ||
    serviceCode === "ARRIVAL" ||
    serviceCode === "DEP" ||
    serviceCode === "DEPARTURE" ||
    serviceCode === "TRF" ||
    serviceCode === "TRANSFER" ||
    serviceCode === "DSP" ||
    serviceCode === "HOURLY"
      ? "allowed_later"
      : "disabled_for_customer";

  return {
    version: adminLiveLocationSetupFoundationVersion,
    booking_ref: safeBookingRef(input.booking_ref),
    status: "setup_only",
    live_location_status: "disabled",
    driver_capture_status: "disabled",
    customer_map_status: "disabled",
    admin_map_status: "disabled",
    service_eligibility: serviceEligibility,
    future_customer_window_minutes_before_pickup: 30,
    future_pob_auto_stop_minutes_after_pob: 5,
    future_otw_trigger: "planned_only",
    notes: [
      "Setup foundation only.",
      "No driver browser GPS capture is active.",
      "No customer map link is active.",
      "No admin live map is active.",
      "No external map tracking is active.",
      "No database read or write is performed.",
    ],
  };
}
