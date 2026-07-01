import {
  buildDriverLiveLocationCaptureScaffoldResponse,
  driverLiveLocationScaffoldVersion,
  readDriverLiveLocationScaffoldGateState,
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

async function readToken(context: DriverLiveLocationRouteContext) {
  const { token } = await context.params;

  return token?.trim() || "";
}

function runtimeGateOpen() {
  const gateState = readDriverLiveLocationScaffoldGateState();

  return (
    gateState.capture_gate_configured &&
    (gateState.mode === "runtime" || gateState.mode === "evidence")
  );
}

async function runtimeResponse({
  action,
  context,
  request,
}: {
  action: "share" | "stop";
  context: DriverLiveLocationRouteContext;
  request: Request;
}) {
  const token = await readToken(context);

  if (!runtimeGateOpen() || !token) {
    return null;
  }

  const { handleDriverLiveLocationRuntimeRequest } = await import(
    "../../../../../lib/driver-live-location-runtime"
  );
  const result = await handleDriverLiveLocationRuntimeRequest({
    action,
    request,
    token,
  });

  return Response.json(result.body, { status: result.status });
}

async function readinessResponse(context: DriverLiveLocationRouteContext) {
  const token = await readToken(context);

  if (!runtimeGateOpen() || !token) {
    return null;
  }

  const { handleDriverLiveLocationReadinessRuntimeRequest } = await import(
    "../../../../../lib/driver-live-location-runtime"
  );
  const result = await handleDriverLiveLocationReadinessRuntimeRequest({
    token,
  });

  return Response.json(result.body, { status: result.status });
}

export async function GET(
  _request: Request,
  context: DriverLiveLocationRouteContext,
) {
  try {
    const runtime = await readinessResponse(context);

    if (runtime) {
      return runtime;
    }

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

export async function POST(
  request: Request,
  context: DriverLiveLocationRouteContext,
) {
  try {
    const runtime = await runtimeResponse({
      action: "share",
      context,
      request,
    });

    if (runtime) {
      return runtime;
    }

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
  request: Request,
  context: DriverLiveLocationRouteContext,
) {
  try {
    const runtime = await runtimeResponse({
      action: "stop",
      context,
      request,
    });

    if (runtime) {
      return runtime;
    }

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
