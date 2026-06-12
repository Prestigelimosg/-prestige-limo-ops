export const adminDriverFlightEtaEscalationSetupFoundationVersion =
  "admin-driver-flight-eta-escalation-setup-foundation:v1";

export type AdminDriverFlightEtaEscalationSetupInput = {
  booking_reference?: string | null;
  driver_job_link_id?: string | null;
  service_code?: string | null;
  flight_no?: string | null;
};

export type AdminDriverFlightEtaEscalationSetupResult = {
  version: typeof adminDriverFlightEtaEscalationSetupFoundationVersion;
  status: "setup_only";
  admin_alert_status: "disabled";
  notification_send_status: "disabled";
  delivery_surface: "admin_app";
  notification_type: "system_notice";
  workflow_area: "mng_arrival_flight_eta";
  event_key: "driver_flight_eta_no_ack_admin_escalation";
  service_eligibility: "mng_arrival_only" | "disabled_not_arrival";
  future_no_ack_attempts_before_escalation: 2;
  future_admin_action: "get_replacement_driver";
  customer_update_status: "disabled";
  safe_title: string;
  safe_message: string;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function service(value: unknown) {
  return text(value).toUpperCase();
}

export function buildAdminDriverFlightEtaEscalationSetupFoundation(
  input: AdminDriverFlightEtaEscalationSetupInput,
): AdminDriverFlightEtaEscalationSetupResult {
  const mngArrival = service(input.service_code) === "MNG" || service(input.service_code) === "ARRIVAL";
  const flightNo = text(input.flight_no, "arrival flight");

  return {
    version: adminDriverFlightEtaEscalationSetupFoundationVersion,
    status: "setup_only",
    admin_alert_status: "disabled",
    notification_send_status: "disabled",
    delivery_surface: "admin_app",
    notification_type: "system_notice",
    workflow_area: "mng_arrival_flight_eta",
    event_key: "driver_flight_eta_no_ack_admin_escalation",
    service_eligibility: mngArrival ? "mng_arrival_only" : "disabled_not_arrival",
    future_no_ack_attempts_before_escalation: 2,
    future_admin_action: "get_replacement_driver",
    customer_update_status: "disabled",
    safe_title: "Driver ETA acknowledgement missing",
    safe_message: `Setup-only admin escalation for ${flightNo}. After 2 no-ack attempts, admin should get replacement driver.`,
  };
}
