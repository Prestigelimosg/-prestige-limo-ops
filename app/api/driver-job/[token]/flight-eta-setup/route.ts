import {
  adminFlightApiSetupFoundationVersion,
  buildAdminFlightApiSetupFoundation,
} from "../../../../../lib/admin-flight-api-setup-foundation";

export const dynamic = "force-dynamic";

type DriverFlightEtaSetupRouteContext = {
  params: Promise<{
    token: string;
  }>;
};

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Driver flight ETA setup request failed safely.",
      ok: false,
      version: adminFlightApiSetupFoundationVersion,
    },
    { status: 500 },
  );
}

export async function GET(request: Request, context: DriverFlightEtaSetupRouteContext) {
  try {
    const { token } = await context.params;

    if (!hasText(token)) {
      return Response.json(
        {
          error: "Driver job token is required.",
          ok: false,
          version: adminFlightApiSetupFoundationVersion,
        },
        { status: 400 },
      );
    }

    const searchParams = new URL(request.url).searchParams;
    const setup = buildAdminFlightApiSetupFoundation({
      airport_code: searchParams.get("airport_code"),
      booking_ref: searchParams.get("booking_ref"),
      flight_no: searchParams.get("flight_no"),
      service_code: searchParams.get("service_code"),
    });

    return Response.json({
      ok: true,
      setup: {
        customer_update_status: setup.customer_update_status,
        driver_eta_acknowledgement_status: setup.driver_eta_acknowledgement_status,
        driver_eta_notification_status: setup.driver_eta_notification_status,
        driver_job_scope: "token_scoped",
        flight_eta_status: setup.live_eta_status,
        future_driver_eta_notification_minutes_before_pickup:
          setup.future_driver_eta_notification_minutes_before_pickup,
        future_driver_eta_notification_scope: setup.future_driver_eta_notification_scope,
        future_primary_use: setup.future_primary_use,
        service_eligibility: setup.service_eligibility,
        status: setup.status,
        version: setup.version,
      },
      version: setup.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
