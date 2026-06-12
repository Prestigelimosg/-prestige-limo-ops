export const driverFlightEtaNotificationPayloadSetupVersion =
  "driver-flight-eta-notification-payload-setup:v1";

export type DriverFlightEtaNotificationPayloadSetupInput = {
  booking_reference?: string | null;
  driver_job_link_id?: string | null;
  service_code?: string | null;
  flight_no?: string | null;
};

export function buildDriverFlightEtaNotificationPayloadSetup(
  input: DriverFlightEtaNotificationPayloadSetupInput,
) {
  const serviceCode = typeof input.service_code === "string" ? input.service_code.trim().toUpperCase() : "";
  const mngArrival = serviceCode === "MNG" || serviceCode === "ARRIVAL";
  const flightNo = typeof input.flight_no === "string" && input.flight_no.trim() ? input.flight_no.trim() : "arrival flight";

  return {
    version: driverFlightEtaNotificationPayloadSetupVersion,
    status: "setup_only",
    delivery_surface: "driver_app",
    notification_type: "trip_update",
    event_key: "driver_flight_eta_60min_before_pickup",
    workflow_area: "mng_arrival_flight_eta",
    service_eligibility: mngArrival ? "mng_arrival_only" : "disabled_not_arrival",
    notification_send_status: "disabled",
    customer_update_status: "disabled",
    future_minutes_before_pickup: 60,
    booking_reference: input.booking_reference ?? null,
    driver_job_link_id: input.driver_job_link_id ?? null,
    safe_title: "Arrival flight ETA update",
    safe_message: `Latest ETA reminder for ${flightNo}. Driver notification is setup-only and not sent yet.`,
  };
}
