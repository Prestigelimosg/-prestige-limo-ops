export const driverFlightEtaNotificationSetupFoundationVersion =
  "driver-flight-eta-notification-setup-foundation:v1";

export type DriverFlightEtaNotificationSetupInput = {
  booking_reference?: string | null;
  driver_job_link_id?: string | null;
  service_code?: string | null;
  flight_no?: string | null;
};

export type DriverFlightEtaNotificationSetupResult = {
  version: typeof driverFlightEtaNotificationSetupFoundationVersion;
  status: "setup_only";
  notification_send_status: "disabled";
  delivery_surface: "driver_app";
  notification_type: "trip_update";
  notification_status: "queued_later";
  priority: "high";
  workflow_area: "mng_arrival_flight_eta";
  event_key: "driver_flight_eta_60min_before_pickup";
  service_eligibility: "mng_arrival_only" | "disabled_not_arrival";
  customer_update_status: "disabled";
  future_minutes_before_pickup: 60;
  safe_title: string;
  safe_message: string;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function service(value: unknown) {
  return text(value).toUpperCase();
}

export function buildDriverFlightEtaNotificationSetupFoundation(
  input: DriverFlightEtaNotificationSetupInput,
): DriverFlightEtaNotificationSetupResult {
  const mngArrival = service(input.service_code) === "MNG" || service(input.service_code) === "ARRIVAL";
  const flightNo = text(input.flight_no, "arrival flight");

  return {
    version: driverFlightEtaNotificationSetupFoundationVersion,
    status: "setup_only",
    notification_send_status: "disabled",
    delivery_surface: "driver_app",
    notification_type: "trip_update",
    notification_status: "queued_later",
    priority: "high",
    workflow_area: "mng_arrival_flight_eta",
    event_key: "driver_flight_eta_60min_before_pickup",
    service_eligibility: mngArrival ? "mng_arrival_only" : "disabled_not_arrival",
    customer_update_status: "disabled",
    future_minutes_before_pickup: 60,
    safe_title: "Arrival flight ETA update",
    safe_message: `Latest ETA reminder for ${flightNo}. Driver notification is setup-only and not sent yet.`,
  };
}
