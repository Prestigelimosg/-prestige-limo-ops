export const driverFlightEtaAcknowledgementSetupFoundationVersion =
  "driver-flight-eta-acknowledgement-setup-foundation:v1";

export type DriverFlightEtaAcknowledgementSetupInput = {
  booking_reference?: string | null;
  driver_job_token?: string | null;
  service_code?: string | null;
  flight_no?: string | null;
};

export type DriverFlightEtaAcknowledgementSetupResult = {
  version: typeof driverFlightEtaAcknowledgementSetupFoundationVersion;
  status: "setup_only";
  acknowledgement_status: "disabled";
  driver_action_status: "disabled";
  resend_status: "disabled";
  admin_escalation_status: "disabled";
  service_eligibility: "mng_arrival_only" | "disabled_not_arrival";
  workflow_area: "mng_arrival_flight_eta";
  future_required_before_otw: true;
  future_resend_attempts_before_admin_escalation: 2;
  future_admin_action: "get_replacement_driver";
  customer_update_status: "disabled";
  notes: string[];
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function service(value: unknown) {
  return text(value).toUpperCase();
}

export function buildDriverFlightEtaAcknowledgementSetupFoundation(
  input: DriverFlightEtaAcknowledgementSetupInput,
): DriverFlightEtaAcknowledgementSetupResult {
  const mngArrival = service(input.service_code) === "MNG" || service(input.service_code) === "ARRIVAL";

  return {
    version: driverFlightEtaAcknowledgementSetupFoundationVersion,
    status: "setup_only",
    acknowledgement_status: "disabled",
    driver_action_status: "disabled",
    resend_status: "disabled",
    admin_escalation_status: "disabled",
    service_eligibility: mngArrival ? "mng_arrival_only" : "disabled_not_arrival",
    workflow_area: "mng_arrival_flight_eta",
    future_required_before_otw: true,
    future_resend_attempts_before_admin_escalation: 2,
    future_admin_action: "get_replacement_driver",
    customer_update_status: "disabled",
    notes: [
      "Setup foundation only.",
      "Future driver ETA acknowledgement applies to MNG/Arrival jobs only.",
      "Future acknowledgement is planned before OTW.",
      "Future no-ack flow: resend once, then if still no acknowledgement after 2 attempts, escalate to admin to get replacement driver.",
      "No real flight ETA is active.",
      "No driver status change is active.",
      "No real resend is active.",
      "No admin escalation is active.",
      "No customer update is active.",
    ],
  };
}
