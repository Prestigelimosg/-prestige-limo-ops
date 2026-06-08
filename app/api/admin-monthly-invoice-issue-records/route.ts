import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";
import {
  createAdminMonthlyInvoiceIssueRecord,
  loadAdminMonthlyInvoiceIssueRecords,
  parseAdminMonthlyInvoiceIssueRecordCreatePayload,
  parseAdminMonthlyInvoiceIssueRecordLoadParams,
  parseAdminMonthlyInvoiceIssueRecordUpdatePayload,
  updateAdminMonthlyInvoiceIssueRecord,
} from "../../../lib/admin-monthly-invoice-issue-record-persistence";

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
      error: "Admin monthly invoice issue record request failed safely.",
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

    const parsed = parseAdminMonthlyInvoiceIssueRecordLoadParams(
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
    const result = await loadAdminMonthlyInvoiceIssueRecords(parsed.data, actor);

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
      issue_records: result.data.issue_records,
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

    const parsed = parseAdminMonthlyInvoiceIssueRecordCreatePayload(await readJsonBody(request));

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
    const result = await createAdminMonthlyInvoiceIssueRecord(parsed.data, actor);

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
      issue_record: result.data,
      ok: true,
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

    const parsed = parseAdminMonthlyInvoiceIssueRecordUpdatePayload(await readJsonBody(request));

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
    const result = await updateAdminMonthlyInvoiceIssueRecord(parsed.data, actor);

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
      issue_record: result.data,
      ok: true,
    });
  } catch {
    return safeFailureResponse();
  }
}
