import { getDriverJobStatusPersistenceClientForProduction } from "../../../../lib/driver-job-status-persistence";
import { loadDriverPortalJobs } from "../../../../lib/driver-portal-jobs";
import { resolveDriverPortalSession } from "../../../../lib/driver-portal-session";

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

function sameOriginDriverPortalRead(request: Request) {
  if (request.headers.get("x-prestige-driver-purpose") !== "driver-portal-jobs-read") {
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

export async function GET(request: Request) {
  if (!sameOriginDriverPortalRead(request)) {
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

export async function POST() {
  return methodNotAllowed();
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
