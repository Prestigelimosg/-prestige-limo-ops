import { signInDriverAccountForInstallation } from "../../../../lib/driver-account-device-lock.ts";
import {
  clearDriverPortalSessionCookie,
  issueDriverPortalAccountSession,
} from "../../../../lib/driver-portal-session.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number, cookie?: string) {
  const headers = new Headers({ "cache-control": "private, no-store, max-age=0" });
  if (cookie) headers.set("set-cookie", cookie);
  return Response.json(body, { headers, status });
}

function sameOriginPortalRequest(request: Request, purpose: string) {
  if (request.headers.get("x-prestige-driver-purpose") !== purpose) return false;
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if ((origin && origin !== requestUrl.origin) || !referer) return false;

  try {
    const refererUrl = new URL(referer);
    return refererUrl.origin === requestUrl.origin && refererUrl.pathname === "/driver-portal";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOriginPortalRequest(request, "driver-account-sign-in")) {
    return response({ ok: false, reason: "unauthorized" }, 401);
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || Array.isArray(body) || Object.keys(body).some((key) => !["email", "installation_id", "password"].includes(key))) {
    return response({ ok: false, reason: "invalid_credentials" }, 401);
  }

  const result = await signInDriverAccountForInstallation({
    email: body.email,
    installationId: body.installation_id,
    password: body.password,
  });
  if (!result.ok) {
    if (result.reason === "not_configured") {
      return response({ ok: false, reason: "not_configured" }, 503);
    }
    return response({ ok: false, reason: "invalid_credentials" }, 401);
  }

  const cookie = issueDriverPortalAccountSession({
    accountId: result.accountId,
    deviceIdHash: result.deviceIdHash || "",
    driverId: result.driverId,
  });
  if (!cookie) return response({ ok: false, reason: "not_configured" }, 503);

  return response({ ok: true, session: "active" }, 200, cookie);
}

export async function DELETE(request: Request) {
  if (!sameOriginPortalRequest(request, "driver-account-sign-out")) {
    return response({ ok: false, reason: "unauthorized" }, 401);
  }

  return response({ ok: true, session: "ended" }, 200, clearDriverPortalSessionCookie());
}

export async function GET() {
  return response({ ok: false, reason: "method_not_allowed" }, 405);
}

export async function PUT() { return GET(); }
export async function PATCH() { return GET(); }
