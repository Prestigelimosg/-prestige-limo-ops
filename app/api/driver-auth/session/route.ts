import { completeDriverPinReset, signInDriverAccountForInstallation, verifyDriverAccountSession } from "../../../../lib/driver-account-device-lock.ts";
import { recordDriverAccountActivity } from "../../../../lib/driver-account-activity";
import { getDriverJobStatusPersistenceClientForProduction } from "../../../../lib/driver-job-status-persistence";
import {
  clearDriverPortalSessionCookie,
  issueDriverPortalAccountSession,
  resolveDriverPortalSession,
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
  if (request.headers.get("x-prestige-driver-purpose") === "driver-account-pin-reset") {
    if (!sameOriginPortalRequest(request, "driver-account-pin-reset")
      || !/\b(?:Android|iPhone)\b/i.test(request.headers.get("user-agent") || "")) {
      return response({ ok: false }, 401);
    }
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Array.isArray(body) || Object.keys(body).some(key => !["installation_id", "password", "confirmation"].includes(key))) {
      return response({ ok: false }, 400);
    }
    const reset = await completeDriverPinReset({ installationId: body.installation_id, password: body.password, confirmation: body.confirmation });
    return response(reset, reset.ok ? 200 : 403, reset.ok ? clearDriverPortalSessionCookie() : undefined);
  }
  if (!sameOriginPortalRequest(request, "driver-account-sign-in")) {
    return response({ ok: false, reason: "unauthorized" }, 401);
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || Array.isArray(body) || Object.keys(body).some((key) => !["email", "installation_id", "password"].includes(key))) {
    return response({ ok: false, reason: "invalid_credentials" }, 401);
  }

  const result = await signInDriverAccountForInstallation({
    // Platform chooses the presentation, never the account or authorization.
    allowBoundDevicePin: /\b(?:Android|iPhone)\b/i.test(request.headers.get("user-agent") || ""),
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
    now: result.sessionIssuedAt,
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

  try {
    const session = resolveDriverPortalSession(request.headers.get("cookie"));
    const database = getDriverJobStatusPersistenceClientForProduction();
    if (session.ok && database.ok) await recordDriverAccountActivity(database.client, session.claims, "signed_out");
  } catch { /* Logout still clears the cookie if optional activity storage fails. */ }
  return response({ ok: true, session: "ended" }, 200, clearDriverPortalSessionCookie());
}

export async function GET() {
  return response({ ok: false, reason: "method_not_allowed" }, 405);
}

export async function PUT() { return GET(); }
export async function PATCH(request: Request) {
  // Activity is separate from authorization and accepts no identity or timestamp body.
  try {
    const url = new URL(request.url);
    const referer = new URL(request.headers.get("referer") || "invalid:");
    if (request.headers.get("x-prestige-driver-purpose") !== "driver-account-activity"
      || (request.headers.get("origin") && request.headers.get("origin") !== url.origin)
      || referer.origin !== url.origin
      || !(referer.pathname === "/driver-portal" || /^\/driver-job\/[^/]+$/.test(referer.pathname))
      || url.search || (await request.text()).length !== 0) return response({ ok: false }, 403);
    const session = resolveDriverPortalSession(request.headers.get("cookie"));
    if (!session.ok || !session.claims.accountId || !session.claims.deviceIdHash) return response({ ok: false }, 401);
    const database = getDriverJobStatusPersistenceClientForProduction();
    if (!database.ok) return response({ ok: false }, 503);
    if (!await verifyDriverAccountSession({
      accountId: session.claims.accountId, deviceIdHash: session.claims.deviceIdHash,
      driverId: session.claims.driverId, sessionIssuedAt: session.claims.issuedAt,
      installationId: request.headers.get("x-prestige-driver-installation-id"), client: database.client,
    })) return response({ ok: false }, 401);
    const recorded = await recordDriverAccountActivity(database.client, session.claims, "active");
    return response({ ok: recorded }, recorded ? 200 : 503);
  } catch { return response({ ok: false }, 503); }
}
