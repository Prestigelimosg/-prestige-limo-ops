import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | {
      context: AdminDispatcherBoundaryContext;
      ok: true;
    }
  | {
      ok: false;
      response: Response;
    };

const browserMapProvider = "google_maps_javascript";

function cleanServerValue(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : "";
}

function readAllowedOrigins() {
  return cleanServerValue(process.env.PRESTIGE_GOOGLE_MAPS_BROWSER_ALLOWED_ORIGINS)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function requestOrigin(request: Request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return "";
  }
}

function blockedResponse(error: string) {
  return Response.json(
    {
      customerVisible: false,
      enabled: false,
      error,
      external_send: false,
      ok: false,
    },
    { status: 403 },
  );
}

function closedResponse(reason: string) {
  return Response.json(
    {
      customerVisible: false,
      enabled: false,
      external_send: false,
      ok: false,
      reason,
    },
    { status: 503 },
  );
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose);

  return boundary.ok
    ? {
        context: boundary.context,
        ok: true,
      }
    : {
        ok: false,
        response: blockedResponse(boundary.error),
      };
}

function safeFailureResponse() {
  return Response.json(
    {
      customerVisible: false,
      enabled: false,
      error: "Admin active-jobs browser map config request failed safely.",
      external_send: false,
      ok: false,
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const provider = cleanServerValue(process.env.PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_BROWSER_PROVIDER);
    const apiKey = cleanServerValue(process.env.PRESTIGE_GOOGLE_MAPS_BROWSER_API_KEY);
    const allowedOrigins = readAllowedOrigins();
    const origin = requestOrigin(request);

    if (provider !== browserMapProvider || !apiKey) {
      return closedResponse("admin_active_jobs_browser_map_not_configured");
    }

    if (!origin || !allowedOrigins.includes(origin)) {
      return blockedResponse("Admin active-jobs browser map origin is not allowed.");
    }

    return Response.json(
      {
        apiKey,
        customerVisible: false,
        enabled: true,
        external_send: false,
        mapId: cleanServerValue(process.env.PRESTIGE_GOOGLE_MAPS_BROWSER_MAP_ID),
        ok: true,
        provider: browserMapProvider,
      },
      { status: 200 },
    );
  } catch {
    return safeFailureResponse();
  }
}
