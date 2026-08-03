import { getDriverJobStatusPersistenceClientForProduction } from "../../../../lib/driver-job-status-persistence";
import { loadDriverPortalJobs } from "../../../../lib/driver-portal-jobs";
import { resolveDriverPortalSession } from "../../../../lib/driver-portal-session";
import {
  getDriverDevicePushReadiness,
  registerDriverDevicePushSubscriptionForPortalSession,
} from "../../../../lib/driver-device-push-notification";

export const dynamic = "force-dynamic";

function response(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    headers: {
      "Cache-Control": "no-store",
      Vary: "Cookie",
    },
    status,
  });
}

function sameOriginDriverPortalRequest(request: Request, purpose: string) {
  if (request.headers.get("x-prestige-driver-purpose") !== purpose) {
    return false;
  }

  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if ((origin && origin !== requestUrl.origin) || !referer) {
    return false;
  }

  try {
    const refererUrl = new URL(referer);
    return refererUrl.origin === requestUrl.origin && refererUrl.pathname === "/driver-portal";
  } catch {
    return false;
  }
}

function publicDriverDeviceAlertReadiness() {
  const readiness = getDriverDevicePushReadiness();
  return {
    enabled: readiness.enabled,
    public_key: readiness.public_key,
    ready: readiness.ready,
  };
}

async function readJsonBody(request: Request) {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  if (!sameOriginDriverPortalRequest(request, "driver-portal-jobs-read")) {
    return response({ jobs: [], ok: false, reason: "unauthorized" }, 401);
  }

  const session = resolveDriverPortalSession(request.headers.get("cookie"));
  if (!session.ok) {
    return response(
      {
        jobs: [],
        ok: false,
        reason: session.reason === "not_configured" ? "not_configured" : "unauthorized",
      },
      session.reason === "not_configured" ? 503 : 401,
    );
  }

  const clientResult = getDriverJobStatusPersistenceClientForProduction();
  if (!clientResult.ok) {
    return response({ jobs: [], ok: false, reason: "not_configured" }, 503);
  }

  const jobsResult = await loadDriverPortalJobs({
    client: clientResult.client,
    driverId: session.claims.driverId,
  });
  if (!jobsResult.ok) {
    return response({ jobs: [], ok: false, reason: "not_configured" }, 503);
  }

  return response(
    {
      device_alerts: publicDriverDeviceAlertReadiness(),
      jobs: jobsResult.jobs.map((job) => ({
        job_key: job.jobKey,
        payload: job.payload,
        state: job.state,
        state_label: job.stateLabel,
      })),
      ok: true,
      version: jobsResult.version,
    },
    200,
  );
}

function methodNotAllowed() {
  return response({ jobs: [], ok: false, reason: "method_not_allowed" }, 405);
}

export async function POST(request: Request) {
  if (!sameOriginDriverPortalRequest(request, "driver-portal-device-alert-registration")) {
    return response({ ok: false, reason: "unauthorized" }, 401);
  }

  const session = resolveDriverPortalSession(request.headers.get("cookie"));
  if (!session.ok) {
    return response(
      {
        ok: false,
        reason: session.reason === "not_configured" ? "not_configured" : "unauthorized",
      },
      session.reason === "not_configured" ? 503 : 401,
    );
  }

  const clientResult = getDriverJobStatusPersistenceClientForProduction();
  if (!clientResult.ok) {
    return response({ ok: false, reason: "not_configured" }, 503);
  }

  const body = await readJsonBody(request);
  const registration = await registerDriverDevicePushSubscriptionForPortalSession({
    client: clientResult.client,
    driverId: session.claims.driverId,
    subscription: body.device_push_subscription,
  });
  if (!registration.ok) {
    const badRequest = registration.reason === "invalid_subscription";
    const unauthorized = registration.reason === "unverified_driver";
    return response(
      { ok: false, reason: registration.reason },
      badRequest ? 400 : unauthorized ? 401 : 503,
    );
  }

  return response(
    {
      device_alerts: { subscription_registered: true },
      ok: true,
    },
    200,
  );
}

export async function PUT() {
  return methodNotAllowed();
}

export async function PATCH() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}
