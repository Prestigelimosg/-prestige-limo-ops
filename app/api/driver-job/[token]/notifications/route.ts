import {
  loadDriverAppNotificationsForToken,
  parseCustomerDriverAppNotificationUpdatePayload,
  updateDriverAppNotificationStatusForToken,
} from "../../../../../lib/customer-driver-app-notification-persistence";

export const dynamic = "force-dynamic";

type DriverJobNotificationRouteContext = {
  params: Promise<{
    token: string;
  }>;
};

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Driver app notification request failed safely.",
      ok: false,
    },
    { status: 500 },
  );
}

export async function GET(request: Request, context: DriverJobNotificationRouteContext) {
  try {
    const { token } = await context.params;
    const result = await loadDriverAppNotificationsForToken(token, new URL(request.url).searchParams);

    if (!result.ok) {
      return Response.json(
        {
          error: result.error,
          ok: false,
        },
        { status: result.status },
      );
    }

    return Response.json({
      notifications: result.data.notifications,
      ok: true,
      pagination: result.data.pagination,
      version: result.data.version,
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function PATCH(request: Request, context: DriverJobNotificationRouteContext) {
  try {
    const [{ token }, body] = await Promise.all([context.params, readJsonBody(request)]);
    const parsed = parseCustomerDriverAppNotificationUpdatePayload({
      ...body,
      delivery_surface: "driver_app",
    });

    if (!parsed.ok) {
      return Response.json(
        {
          error: parsed.error,
          ok: false,
        },
        { status: parsed.status },
      );
    }

    const result = await updateDriverAppNotificationStatusForToken(token, parsed.data);

    if (!result.ok) {
      return Response.json(
        {
          error: result.error,
          ok: false,
        },
        { status: result.status },
      );
    }

    return Response.json({
      notification: result.data,
      ok: true,
    });
  } catch {
    return safeFailureResponse();
  }
}
