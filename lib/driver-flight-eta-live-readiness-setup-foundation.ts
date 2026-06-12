export const driverFlightEtaLiveReadinessSetupFoundationVersion =
  "driver-flight-eta-live-readiness-setup-foundation:v1";

export type DriverFlightEtaLiveReadinessSetupResult = {
  version: typeof driverFlightEtaLiveReadinessSetupFoundationVersion;
  status: "setup_only";
  selected_provider: "flightaware_aeroapi";
  provider_token_status: "not_configured";
  external_lookup_status: "disabled";
  live_eta_lookup_status: "disabled";
  scheduler_status: "disabled";
  driver_notification_status: "disabled";
  resend_automation_status: "disabled";
  admin_alert_status: "disabled";
  replacement_driver_action_status: "disabled";
  service_scope: "mng_arrival_only";
  customer_update_status: "disabled";
  future_minutes_before_pickup: 60;
  future_no_ack_attempts_before_escalation: 2;
  future_admin_action: "get_replacement_driver";
};

export function buildDriverFlightEtaLiveReadinessSetupFoundation(): DriverFlightEtaLiveReadinessSetupResult {
  return {
    version: driverFlightEtaLiveReadinessSetupFoundationVersion,
    status: "setup_only",
    selected_provider: "flightaware_aeroapi",
    provider_token_status: "not_configured",
    external_lookup_status: "disabled",
    live_eta_lookup_status: "disabled",
    scheduler_status: "disabled",
    driver_notification_status: "disabled",
    resend_automation_status: "disabled",
    admin_alert_status: "disabled",
    replacement_driver_action_status: "disabled",
    service_scope: "mng_arrival_only",
    customer_update_status: "disabled",
    future_minutes_before_pickup: 60,
    future_no_ack_attempts_before_escalation: 2,
    future_admin_action: "get_replacement_driver",
  };
}
