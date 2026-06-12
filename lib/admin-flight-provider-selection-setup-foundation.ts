export const adminFlightProviderSelectionSetupFoundationVersion =
  "admin-flight-provider-selection-setup-foundation:v1";

export type AdminFlightProviderSelectionSetupResult = {
  version: typeof adminFlightProviderSelectionSetupFoundationVersion;
  status: "setup_only";
  provider_selection_status: "selected_later";
  selected_provider: "flightaware_aeroapi";
  provider_lookup_status: "disabled";
  token_status: "not_configured";
  live_eta_status: "disabled";
  external_request_status: "disabled";
  customer_update_status: "disabled";
  future_scope: "mng_arrival_eta_only";
  notes: string[];
};

export function buildAdminFlightProviderSelectionSetupFoundation(): AdminFlightProviderSelectionSetupResult {
  return {
    version: adminFlightProviderSelectionSetupFoundationVersion,
    status: "setup_only",
    provider_selection_status: "selected_later",
    selected_provider: "flightaware_aeroapi",
    provider_lookup_status: "disabled",
    token_status: "not_configured",
    live_eta_status: "disabled",
    external_request_status: "disabled",
    customer_update_status: "disabled",
    future_scope: "mng_arrival_eta_only",
    notes: [
      "Setup foundation only.",
      "Future provider selected: FlightAware AeroAPI.",
      "No provider token is configured.",
      "No live ETA lookup is active.",
      "Future use is limited to MNG/Arrival driver ETA support.",
      "Customer flight updates stay disabled by default.",
    ],
  };
}
