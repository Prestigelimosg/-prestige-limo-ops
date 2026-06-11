export const adminFlightApiSetupFoundationVersion =
  "admin-flight-api-setup-foundation:v1";

export type AdminFlightApiServiceCode =
  | "MNG"
  | "ARRIVAL"
  | "DEP"
  | "DEPARTURE"
  | "TRF"
  | "TRANSFER"
  | "DSP"
  | "HOURLY"
  | string;

export type AdminFlightApiSetupInput = {
  booking_ref?: string | null;
  service_code?: AdminFlightApiServiceCode | null;
  flight_no?: string | null;
  airport_code?: string | null;
};

export type AdminFlightApiSetupResult = {
  version: typeof adminFlightApiSetupFoundationVersion;
  booking_ref: string;
  flight_no: string;
  status: "setup_only";
  flight_api_status: "disabled";
  provider_lookup_status: "disabled";
  live_eta_status: "disabled";
  admin_eta_monitoring_status: "disabled";
  driver_eta_notification_status: "disabled";
  driver_eta_acknowledgement_status: "disabled";
  customer_update_status: "disabled";
  service_eligibility: "mng_arrival_allowed_later" | "disabled_not_arrival";
  future_primary_use: "mng_arrival_eta_monitoring" | "manual_review_only";
  future_driver_eta_notification_minutes_before_pickup: 60;
  future_driver_eta_notification_scope: "admin_and_driver_only";
  notes: string[];
};

function normalizeText(value: unknown, fallback = "unknown") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeServiceCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function buildAdminFlightApiSetupFoundation(
  input: AdminFlightApiSetupInput,
): AdminFlightApiSetupResult {
  const serviceCode = normalizeServiceCode(input.service_code);
  const mngArrival = serviceCode === "MNG" || serviceCode === "ARRIVAL";

  return {
    version: adminFlightApiSetupFoundationVersion,
    booking_ref: normalizeText(input.booking_ref),
    flight_no: normalizeText(input.flight_no, ""),
    status: "setup_only",
    flight_api_status: "disabled",
    provider_lookup_status: "disabled",
    live_eta_status: "disabled",
    admin_eta_monitoring_status: "disabled",
    driver_eta_notification_status: "disabled",
    driver_eta_acknowledgement_status: "disabled",
    customer_update_status: "disabled",
    service_eligibility: mngArrival ? "mng_arrival_allowed_later" : "disabled_not_arrival",
    future_primary_use: mngArrival ? "mng_arrival_eta_monitoring" : "manual_review_only",
    future_driver_eta_notification_minutes_before_pickup: 60,
    future_driver_eta_notification_scope: "admin_and_driver_only",
    notes: [
      "Setup foundation only.",
      "Flight ETA monitoring is for MNG/Arrival jobs only.",
      "Future purpose is to notify the driver of the latest flight ETA 1 hour before pickup so the driver does not miss the arrival flight.",
      "No real flight provider lookup is active.",
      "No live ETA is shown.",
      "No admin ETA monitoring is active.",
      "No driver ETA notification is active.",
      "No driver ETA acknowledgement is active.",
      "No customer flight update is active by default.",
      "No external request is performed.",
    ],
  };
}
