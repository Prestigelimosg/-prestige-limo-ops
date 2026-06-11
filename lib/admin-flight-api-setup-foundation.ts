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
  driver_eta_acknowledgement_status: "disabled";
  customer_update_status: "disabled";
  service_eligibility: "allowed_later" | "not_required_by_default";
  future_primary_use: "arrival_eta_monitoring" | "manual_review_only";
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
  const arrivalLike = serviceCode === "MNG" || serviceCode === "ARRIVAL";

  return {
    version: adminFlightApiSetupFoundationVersion,
    booking_ref: normalizeText(input.booking_ref),
    flight_no: normalizeText(input.flight_no, ""),
    status: "setup_only",
    flight_api_status: "disabled",
    provider_lookup_status: "disabled",
    live_eta_status: "disabled",
    driver_eta_acknowledgement_status: "disabled",
    customer_update_status: "disabled",
    service_eligibility: arrivalLike ? "allowed_later" : "not_required_by_default",
    future_primary_use: arrivalLike ? "arrival_eta_monitoring" : "manual_review_only",
    notes: [
      "Setup foundation only.",
      "No real flight provider lookup is active.",
      "No live ETA is shown.",
      "No driver ETA acknowledgement is active.",
      "No customer flight update is active.",
      "No external request is performed.",
    ],
  };
}
