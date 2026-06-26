import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";
import {
  createAdminDriverJobLink,
  loadAdminDriverJobLinks,
  parseAdminDriverJobLinkCreatePayload,
  parseAdminDriverJobLinkRevokePayload,
  revokeAdminDriverJobLink,
} from "../../../lib/admin-driver-job-link-persistence";

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
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose, {
    allowServerSessionRoleMethodsWithoutRequestToken: ["POST", "PATCH"],
  });

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
      error: "Admin driver job link request failed safely.",
      ok: false,
    },
    { status: 500 },
  );
}

function driverJobUrlFromToken(request: Request, token: string) {
  const url = new URL(request.url);

  return `${url.origin}/driver-job/${encodeURIComponent(token)}`;
}

export async function GET(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await loadAdminDriverJobLinks(new URL(request.url).searchParams, actor);

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
      links: result.data.links,
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

    const parsed = parseAdminDriverJobLinkCreatePayload(await readJsonBody(request));

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
    const result = await createAdminDriverJobLink(parsed.data, actor);

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
      driver_job_url: driverJobUrlFromToken(request, result.data.driver_job_token),
      link: result.data.link,
      ok: true,
      token_display_once: true,
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

    const parsed = parseAdminDriverJobLinkRevokePayload(await readJsonBody(request));

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
    const result = await revokeAdminDriverJobLink(parsed.data, actor);

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
      link: result.data,
      ok: true,
    });
  } catch {
    return safeFailureResponse();
  }
}
