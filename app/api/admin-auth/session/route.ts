import {
  requestAdminAccountOtp,
  verifyAdminAccountOtp,
} from "../../../../lib/admin-account-auth.ts";
import {
  clearAdminAccountSessionCookie,
  issueAdminAccountSession,
} from "../../../../lib/admin-account-session.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number, cookie?: string) {
  const headers = new Headers({ "cache-control": "private, no-store, max-age=0" });
  if (cookie) headers.set("set-cookie", cookie);
  return Response.json(body, { headers, status });
}

function adminProtectedRefererPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/customers" ||
    pathname.startsWith("/customers/") ||
    pathname === "/settings/invoice"
  );
}

function sameOriginAuthRequest(
  request: Request,
  purpose: "admin-account-sign-in" | "admin-account-sign-out",
) {
  if (request.headers.get("x-prestige-admin-auth-purpose") !== purpose) return false;
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if ((origin && origin !== requestUrl.origin) || !referer) return false;

  try {
    const refererUrl = new URL(referer);
    if (refererUrl.origin !== requestUrl.origin) return false;
    return purpose === "admin-account-sign-in"
      ? refererUrl.pathname === "/admin-sign-in"
      : adminProtectedRefererPath(refererUrl.pathname);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOriginAuthRequest(request, "admin-account-sign-in")) {
    return response({ ok: false, reason: "unauthorized" }, 401);
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || Array.isArray(body)) {
    return response({ ok: false, reason: "invalid_request" }, 400);
  }

  if (body.action === "request_code") {
    if (Object.keys(body).some((key) => !["action", "email"].includes(key))) {
      return response({ ok: false, reason: "invalid_request" }, 400);
    }
    const requested = await requestAdminAccountOtp({ email: body.email });
    return requested.ok
      ? response({ ok: true, status: "code_sent_if_authorized" }, 200)
      : response({ ok: false, reason: "not_configured" }, 503);
  }

  if (body.action !== "verify_code") {
    return response({ ok: false, reason: "invalid_request" }, 400);
  }
  if (Object.keys(body).some((key) => !["action", "email", "token"].includes(key))) {
    return response({ ok: false, reason: "invalid_request" }, 400);
  }

  const result = await verifyAdminAccountOtp({
    email: body.email,
    token: body.token,
  });
  if (!result.ok) {
    return result.reason === "not_configured"
      ? response({ ok: false, reason: "not_configured" }, 503)
      : response({ ok: false, reason: "invalid_code" }, 401);
  }

  const cookie = issueAdminAccountSession(result);
  if (!cookie) return response({ ok: false, reason: "not_configured" }, 503);

  return response({ ok: true, session: "active" }, 200, cookie);
}

export async function DELETE(request: Request) {
  if (!sameOriginAuthRequest(request, "admin-account-sign-out")) {
    return response({ ok: false, reason: "unauthorized" }, 401);
  }
  return response({ ok: true, session: "ended" }, 200, clearAdminAccountSessionCookie());
}

export async function GET() {
  return response({ ok: false, reason: "method_not_allowed" }, 405);
}

export async function PUT() { return GET(); }
export async function PATCH() { return GET(); }
