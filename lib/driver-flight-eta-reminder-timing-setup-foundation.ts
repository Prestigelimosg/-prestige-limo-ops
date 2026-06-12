export const driverFlightEtaReminderTimingSetupFoundationVersion =
  "driver-flight-eta-reminder-timing-setup-foundation:v1";

export type DriverFlightEtaReminderTimingSetupResult = {
  version: typeof driverFlightEtaReminderTimingSetupFoundationVersion;
  status: "setup_only";
  scheduler_status: "disabled";
  reminder_send_status: "disabled";
  workflow_area: "mng_arrival_flight_eta";
  service_eligibility: "mng_arrival_only";
  future_minutes_before_pickup: 60;
  future_resend_attempts_before_admin_escalation: 2;
  future_admin_action: "get_replacement_driver";
};

export function buildDriverFlightEtaReminderTimingSetupFoundation(): DriverFlightEtaReminderTimingSetupResult {
  return {
    version: driverFlightEtaReminderTimingSetupFoundationVersion,
    status: "setup_only",
    scheduler_status: "disabled",
    reminder_send_status: "disabled",
    workflow_area: "mng_arrival_flight_eta",
    service_eligibility: "mng_arrival_only",
    future_minutes_before_pickup: 60,
    future_resend_attempts_before_admin_escalation: 2,
    future_admin_action: "get_replacement_driver",
  };
}
