import { createDriverAccountForAcknowledgedLink } from "../../../../../lib/driver-account-device-lock.ts";
import { isProductionDriverJobLinkMode } from "../../../../../lib/driver-job-link-mode.ts";
import { resolveDriverPortalSession } from "../../../../../lib/driver-portal-session.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ token: string }> };

function response(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    headers: { "cache-control": "private, no-store, max-age=0" },
    status,
  });
}

function authorizedRequest(request: Request, token: string) {
  if (request.headers.get("x-prestige-driver-purpose") !== "driver-account-create") return false;
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if ((origin && origin !== requestUrl.origin) || !referer) return false;

  try {
    const refererUrl = new URL(referer);
    return refererUrl.origin === requestUrl.origin &&
      refererUrl.pathname === `/driver-job/${encodeURIComponent(token)}`;
  } catch {
    return false;
  }
}

export async function POST(request: Request, context: Context) {
  const { token } = await context.params;
  if (!isProductionDriverJobLinkMode() || !authorizedRequest(request, token)) {
    return response({ ok: false, reason: "unauthorized" }, 401);
  }

  const session = resolveDriverPortalSession(request.headers.get("cookie"));
  if (!session.ok) {
    return response({ ok: false, reason: "unauthorized" }, 401);
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || Array.isArray(body) || Object.keys(body).some((key) => !["email", "password"].includes(key))) {
    return response({ ok: false, reason: "invalid_input" }, 400);
  }

  const result = await createDriverAccountForAcknowledgedLink({
    authorizedDriverId: session.claims.driverId,
    email: body.email,
    password: body.password,
    token,
  });
  if (!result.ok) {
    const status = result.reason === "account_exists" ? 409
      : result.reason === "invalid_input" ? 400
        : result.reason === "invalid_link" ? 403
          : result.reason === "not_configured" ? 503
            : 500;
    return response({ ok: false, reason: result.reason }, status);
  }

  return response({
    account_created: true,
    device_binding: "pending_first_native_sign_in",
    ok: true,
  }, 201);
}

export async function GET() {
  return response({ ok: false, reason: "method_not_allowed" }, 405);
}

export async function PUT() { return GET(); }
export async function PATCH() { return GET(); }
export async function DELETE() { return GET(); }
