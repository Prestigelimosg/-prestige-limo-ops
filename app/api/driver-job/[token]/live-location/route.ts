import {
  buildDriverLiveLocationCaptureScaffoldResponse,
  driverLiveLocationScaffoldVersion,
} from "../../../../../lib/driver-live-location-scaffold";

export const dynamic = "force-dynamic";

type DriverLiveLocationRouteContext = {
  params: Promise<{
    token: string;
  }>;
};

function safeFailureResponse() {
  return Response.json(
    {
      error: "Driver live-location scaffold request failed safely.",
      ok: false,
      version: driverLiveLocationScaffoldVersion,
    },
    { status: 500 },
  );
}

async function tokenPresent(context: DriverLiveLocationRouteContext) {
  const { token } = await context.params;

  return Boolean(token?.trim());
}

export async function POST(
  _request: Request,
  context: DriverLiveLocationRouteContext,
) {
  try {
    return Response.json(
      {
        ok: false,
        result: buildDriverLiveLocationCaptureScaffoldResponse({
          action: "share",
          tokenPresent: await tokenPresent(context),
        }),
      },
      { status: 503 },
    );
  } catch {
    return safeFailureResponse();
  }
}

export async function DELETE(
  _request: Request,
  context: DriverLiveLocationRouteContext,
) {
  try {
    return Response.json(
      {
        ok: false,
        result: buildDriverLiveLocationCaptureScaffoldResponse({
          action: "stop",
          tokenPresent: await tokenPresent(context),
        }),
      },
      { status: 503 },
    );
  } catch {
    return safeFailureResponse();
  }
}
