import {
  adminJobLifecycleMonitorVersion,
  buildAdminJobLifecycleMonitor,
  type AdminJobLifecycleMonitorInput,
} from "../../../lib/admin-job-lifecycle-monitor";
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

function blockedResponse(error: string) {
  return Response.json(
    {
      error,
      ok: false,
    },
    { status: 403 },
  );
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Admin job lifecycle monitor request failed safely.",
      ok: false,
      version: adminJobLifecycleMonitorVersion,
    },
    { status: 500 },
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

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function toMonitorInput(body: unknown): AdminJobLifecycleMonitorInput | null {
  if (!isRecord(body)) {
    return null;
  }

  return {
    billing_readiness_status: safeString(body.billing_readiness_status),
    booking_ref: safeString(body.booking_ref),
    driver_acknowledged_at: safeString(body.driver_acknowledged_at),
    driver_id: safeString(body.driver_id),
    driver_name: safeString(body.driver_name),
    driver_ots_at: safeString(body.driver_ots_at),
    driver_otw_at: safeString(body.driver_otw_at),
    job_card_created_at: safeString(body.job_card_created_at),
    job_completed_at: safeString(body.job_completed_at),
    monthly_invoice_draft_id: safeString(body.monthly_invoice_draft_id),
    monthly_invoice_draft_status: safeString(body.monthly_invoice_draft_status),
    passenger_on_board_at: safeString(body.passenger_on_board_at),
  };
}

export async function POST(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const input = toMonitorInput(await readJsonBody(request));

    if (!input) {
      return Response.json(
        {
          error: "Admin job lifecycle monitor requires a safe JSON record.",
          ok: false,
          version: adminJobLifecycleMonitorVersion,
        },
        { status: 400 },
      );
    }

    const lifecycle = buildAdminJobLifecycleMonitor(input);

    return Response.json({
      lifecycle,
      ok: true,
      version: lifecycle.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
