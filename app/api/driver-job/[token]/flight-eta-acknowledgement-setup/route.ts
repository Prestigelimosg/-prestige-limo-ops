import {
  buildDriverFlightEtaAcknowledgementSetupFoundation,
  driverFlightEtaAcknowledgementSetupFoundationVersion,
} from "../../../../../lib/driver-flight-eta-acknowledgement-setup-foundation";

export const dynamic = "force-dynamic";

type DriverFlightEtaAcknowledgementSetupRouteContext = {
  params: Promise<{ token: string }>;
};

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Driver flight ETA acknowledgement setup request failed safely.",
      ok: false,
      version: driverFlightEtaAcknowledgementSetupFoundationVersion,
    },
    { status: 500 },
  );
}

export async function GET(request: Request, context: DriverFlightEtaAcknowledgementSetupRouteContext) {
  try {
    const { token } = await context.params;

    if (!hasText(token)) {
      return Response.json(
        {
          error: "Driver job token is required.",
          ok: false,
          version: driverFlightEtaAcknowledgementSetupFoundationVersion,
        },
        { status: 400 },
      );
    }

    const searchParams = new URL(request.url).searchParams;

    const setup = buildDriverFlightEtaAcknowledgementSetupFoundation({
      booking_reference: searchParams.get("booking_reference"),
      driver_job_token: token,
      flight_no: searchParams.get("flight_no"),
      service_code: searchParams.get("service_code"),
    });

    return Response.json({
      ok: true,
      setup,
      version: setup.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
