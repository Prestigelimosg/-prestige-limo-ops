import { getDriverJobStatusPersistenceClientForProduction } from "../../../../lib/driver-job-status-persistence";
import { verifyDriverAccountSession } from "../../../../lib/driver-account-device-lock";
import { clearDriverPortalAlerts, loadDriverPortalJobs, loadDismissedDriverNotificationKeys } from "../../../../lib/driver-portal-jobs";
import {
  clearDriverPortalSessionCookie,
  resolveDriverPortalSession,
} from "../../../../lib/driver-portal-session";
import {
  getDriverDevicePushReadiness,
  registerDriverDevicePushSubscriptionForPortalSession,
} from "../../../../lib/driver-device-push-notification";

export const dynamic = "force-dynamic";

function response(body: Record<string, unknown>, status: number, cookie?: string) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Cookie",
  });
  if (cookie) {
    headers.set("Set-Cookie", cookie);
  }

  return Response.json(body, {
    headers,
    status,
  });
}

function inactiveDriverAccountResponse(includeJobs: boolean) {
  return response(
    {
      ...(includeJobs ? { jobs: [] } : {}),
      ok: false,
      reason: "unauthorized",
    },
    401,
    clearDriverPortalSessionCookie(),
  );
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

  if (session.claims.accountId && session.claims.deviceIdHash) {
    const activeAccount = await verifyDriverAccountSession({
    sessionIssuedAt: session.claims.issuedAt,
      accountId: session.claims.accountId,
      client: clientResult.client,
      deviceIdHash: session.claims.deviceIdHash,
      driverId: session.claims.driverId,
      installationId: request.headers.get("x-prestige-driver-installation-id"),
    });
    if (!activeAccount) {
      return inactiveDriverAccountResponse(true);
    }
  }

  const jobsResult = await loadDriverPortalJobs({
    client: clientResult.client,
    driverId: session.claims.driverId,
    includeAlerts: Boolean(session.claims.accountId && session.claims.deviceIdHash),
  });
  if (!jobsResult.ok) {
    return response({ jobs: [], ok: false, reason: "not_configured" }, 503);
  }

  const badge = session.claims.accountId && session.claims.deviceIdHash
    ? await clientResult.client.from("driver_device_push_subscriptions").select("badge_count")
      .eq("driver_id",session.claims.driverId).eq("source_surface","driver_native_ios")
      .eq("subscription_status","active").is("revoked_at",null).limit(2)
    : null;
  return response(
    {
      native_badge_count: badge && !badge.error && badge.data?.length===1 ? badge.data[0].badge_count : null,
      dismiss_notification_keys: session.claims.accountId && session.claims.deviceIdHash
        ? await loadDismissedDriverNotificationKeys(clientResult.client, session.claims.driverId).catch(() => null) : null,
      device_alerts: {
        ...publicDriverDeviceAlertReadiness(),
        native_registration_ready: badge && !badge.error ? badge.data?.length === 1 : null,
      },
      alert_count: jobsResult.alertCount,
      alerts: jobsResult.alerts.map((alert) => ({
        created_at: alert.createdAt,
        notification_ids: alert.notificationIds,
        job_key: alert.jobKey,
        job_reference: alert.jobReference,
        latest_message: alert.latestMessage,
        latest_title: alert.latestTitle,
        priority: alert.priority,
        update_count: alert.updateCount,
      })),
      alerts_available: jobsResult.alertsAvailable,
      jobs: jobsResult.jobs.map((job) => ({
        job_key: job.jobKey,
        payload: job.payload,
        state: job.state,
        state_label: job.stateLabel,
      })),
      ok: true,
      session: session.claims.accountId ? "account" : "link",
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

  if (session.claims.accountId && session.claims.deviceIdHash) {
    const activeAccount = await verifyDriverAccountSession({
    sessionIssuedAt: session.claims.issuedAt,
      accountId: session.claims.accountId,
      client: clientResult.client,
      deviceIdHash: session.claims.deviceIdHash,
      driverId: session.claims.driverId,
      installationId: request.headers.get("x-prestige-driver-installation-id"),
    });
    if (!activeAccount) {
      return inactiveDriverAccountResponse(false);
    }
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

export async function DELETE() {
  return methodNotAllowed();
}

export async function PATCH(request: Request) {
  if (!sameOriginDriverPortalRequest(request, "driver-portal-alerts-clear")) {
    return response({ ok: false }, 401);
  }
  const session = resolveDriverPortalSession(request.headers.get("cookie"));
  if (!session.ok || !session.claims.accountId || !session.claims.deviceIdHash) {
    return response({ ok: false }, 401);
  }
  const clientResult = getDriverJobStatusPersistenceClientForProduction();
  if (!clientResult.ok) return response({ ok: false }, 503);
  const verified = await verifyDriverAccountSession({
    sessionIssuedAt: session.claims.issuedAt,
    accountId: session.claims.accountId, client: clientResult.client,
    deviceIdHash: session.claims.deviceIdHash, driverId: session.claims.driverId,
    installationId: request.headers.get("x-prestige-driver-installation-id"),
  });
  if (!verified) return inactiveDriverAccountResponse(false);
  const body = await readJsonBody(request);
  if (Object.keys(body).length===2 && Number.isInteger(body.badge_count) && Number.isInteger(body.expected_badge_count) &&
    Number(body.badge_count)>=0 && Number(body.badge_count)<=99 && Number(body.expected_badge_count)>=0 && Number(body.expected_badge_count)<=99) {
    const subscriptions = await clientResult.client.from("driver_device_push_subscriptions").select("id")
      .eq("driver_id",session.claims.driverId).eq("source_surface","driver_native_ios")
      .eq("subscription_status","active").is("revoked_at",null).limit(2);
    if (subscriptions.error || subscriptions.data?.length !== 1) return response({ok:false},409);
    const saved=await clientResult.client.from("driver_device_push_subscriptions")
      .update({badge_count:body.badge_count,updated_at:new Date().toISOString()})
      .eq("id",subscriptions.data[0].id)
      .eq("driver_id",session.claims.driverId).eq("source_surface","driver_native_ios")
      .eq("subscription_status","active").is("revoked_at",null).eq("badge_count",body.expected_badge_count).select("id");
    return response({ok:!saved.error && saved.data?.length===1}, saved.error || saved.data?.length!==1 ? 409 : 200);
  }
  if (Object.keys(body).length===1 && Array.isArray(body.pool_offers) && body.pool_offers.length>0 && body.pool_offers.length<=20 &&
    body.pool_offers.every(item=>item && typeof item==='object' && Object.keys(item).length===2 &&
      /^[a-f0-9]{64}$/.test(String(item.offer_key)) && typeof item.updated_at==='string' && Number.isFinite(Date.parse(item.updated_at)))) {
    if (!clientResult.client.rpc) return response({ok:false},503);
    const cleared = await clientResult.client.rpc("mark_driver_pool_alerts_read", {p_driver_id:session.claims.driverId,p_reads:body.pool_offers});
    return response({ok:!cleared.error && cleared.data?.ok===true}, cleared.error || cleared.data?.ok!==true ? 409 : 200);
  }
  if (Object.keys(body).length !== 1 || !("notification_ids" in body)) {
    return response({ ok: false }, 400);
  }
  const result = await clearDriverPortalAlerts({
    client: clientResult.client, driverId: session.claims.driverId,
    notificationIds: body.notification_ids,
  });
  if (!result.ok) return response({ ok: false }, result.status);
  return response({ ok: true, cleared_count: result.clearedCount }, 200);
}
