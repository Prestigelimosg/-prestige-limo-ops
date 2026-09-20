import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";
import { deleteAdminDriverOtsPhotoProof, loadAdminDriverOtsPhotoProofs } from "../../../lib/driver-ots-photo-proof-persistence";

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
      error: "Admin OTS photo proof request failed safely.",
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

    const result = await loadAdminDriverOtsPhotoProofs(new URL(request.url).searchParams);

    if (!result.ok) {
      return Response.json(
        {
          error: result.error,
          ok: false,
          version: result.version,
        },
        { status: result.status },
      );
    }

    return Response.json({
      booking_reference: result.booking_reference,
      customerVisible: false,
      external_send: false,
      ok: true,
      proofs: result.proofs,
      summary: result.summary,
      version: result.version,
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function DELETE(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);
    const url = new URL(request.url);
    if (!boundary.ok) return boundary.response;
    if (boundary.context.mode !== "server-session-role-surface" ||
        request.headers.get("origin") !== url.origin ||
        new URL(request.headers.get("referer") || "").pathname !== "/") {
      return blockedResponse("Photo deletion requires the signed-in Admin dashboard.");
    }
    if (url.search || !request.headers.get("content-type")?.startsWith("application/json")) {
      return Response.json({ ok: false, error: "Invalid photo deletion request." }, { status: 400 });
    }
    const body = await request.text();
    if (body.length > 1024) return Response.json({ ok: false }, { status: 400 });
    let input: unknown;
    try { input = JSON.parse(body); }
    catch { return Response.json({ ok: false }, { status: 400 }); }
    const result = await deleteAdminDriverOtsPhotoProof(input);
    return Response.json(result, { status: result.ok ? 200 : result.status });
  } catch { return safeFailureResponse(); }
}
