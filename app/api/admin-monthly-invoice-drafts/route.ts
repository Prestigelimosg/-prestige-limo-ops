import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import { createMonthlyBillingDraftPrepAppEvent } from "../../../lib/admin-app-notification-events";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";
import {
  createAdminMonthlyInvoiceDraftFromGroup,
  loadAdminMonthlyInvoiceDrafts,
  parseAdminMonthlyInvoiceDraftCreatePayload,
  parseAdminMonthlyInvoiceDraftLoadParams,
  parseAdminMonthlyInvoiceDraftUpdatePayload,
  updateAdminMonthlyInvoiceDraftStatus,
} from "../../../lib/admin-monthly-invoice-draft-persistence";

export const dynamic = "force-dynamic";

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function blockedResponse(error: string) {
  return Response.json(
    {
      error,
      ok: false,
    },
    { status: 403 },
  );
}

type AdminDispatcherBoundaryCheck =
  | {
      context: AdminDispatcherBoundaryContext;
      ok: true;
    }
  | {
      ok: false;
      response: Response;
    };

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
      error: "Admin monthly invoice draft request failed safely.",
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

    const parsed = parseAdminMonthlyInvoiceDraftLoadParams(
      new URL(request.url).searchParams,
    );

    if (!parsed.ok) {
      return Response.json(
        {
          error: parsed.error,
          ok: false,
        },
        { status: parsed.status },
      );
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await loadAdminMonthlyInvoiceDrafts(parsed.data, actor);

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
      invoice_drafts: result.data.invoice_drafts,
      ok: true,
      pagination: result.data.pagination,
      version: result.data.version,
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function POST(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const parsed = parseAdminMonthlyInvoiceDraftCreatePayload(await readJsonBody(request));

    if (!parsed.ok) {
      return Response.json(
        {
          error: parsed.error,
          ok: false,
        },
        { status: parsed.status },
      );
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await createAdminMonthlyInvoiceDraftFromGroup(parsed.data, actor);

    if (!result.ok) {
      return Response.json(
        {
          error: result.error,
          ok: false,
        },
        { status: result.status },
      );
    }

    const outboxEvent = await createMonthlyBillingDraftPrepAppEvent(result.data, actor);

    return Response.json({
      invoice_draft: result.data,
      ok: true,
      outbox_event: {
        delivery_surface: outboxEvent.delivery_surface,
        external_send: outboxEvent.external_send,
        status: outboxEvent.status,
      },
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function PATCH(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const parsed = parseAdminMonthlyInvoiceDraftUpdatePayload(await readJsonBody(request));

    if (!parsed.ok) {
      return Response.json(
        {
          error: parsed.error,
          ok: false,
        },
        { status: parsed.status },
      );
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await updateAdminMonthlyInvoiceDraftStatus(parsed.data, actor);

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
      invoice_draft: result.data,
      ok: true,
    });
  } catch {
    return safeFailureResponse();
  }
}
