import { cookies } from "next/headers";

import {
  driverGoogleCalendarOauthCookieName,
  driverGoogleCalendarVersion,
  readDriverGoogleCalendarStatus,
  saveOrAuthorizeDriverGoogleCalendar,
} from "../../../../../lib/driver-google-calendar.ts";
import { isProductionDriverJobLinkMode } from "../../../../../lib/driver-job-link-mode.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DriverJobCalendarRouteContext = {
  params: Promise<{ token: string }>;
};

function safeError(result: { reason: string; status: number }) {
  return Response.json({
    error: "Google Calendar is unavailable for this Driver Job.",
    ok: false,
    reason: result.reason,
    version: driverGoogleCalendarVersion,
  }, {
    headers: { "cache-control": "private, no-store, max-age=0" },
    status: result.status,
  });
}

export async function GET(_request: Request, context: DriverJobCalendarRouteContext) {
  if (!isProductionDriverJobLinkMode()) {
    return safeError({ reason: "not_configured", status: 503 });
  }

  const { token } = await context.params;
  const result = await readDriverGoogleCalendarStatus(token);

  if (!result.ok) return safeError(result);
  if (result.action !== "status") {
    return safeError({ reason: "not_configured", status: 503 });
  }

  return Response.json({
    connected: result.connected,
    ok: true,
    status: result.status,
    version: driverGoogleCalendarVersion,
  }, {
    headers: { "cache-control": "private, no-store, max-age=0" },
  });
}

export async function POST(_request: Request, context: DriverJobCalendarRouteContext) {
  if (!isProductionDriverJobLinkMode()) {
    return safeError({ reason: "not_configured", status: 503 });
  }

  const { token } = await context.params;
  const result = await saveOrAuthorizeDriverGoogleCalendar(token);

  if (!result.ok) return safeError(result);

  if (result.action === "authorize") {
    const cookieStore = await cookies();
    cookieStore.set(driverGoogleCalendarOauthCookieName, result.cookie_value, {
      httpOnly: true,
      maxAge: 10 * 60,
      path: "/api/driver-google-calendar-oauth/callback",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production",
    });

    return Response.json({
      action: result.action,
      google_consent_url: result.authorization_url,
      ok: true,
      status: result.status,
      version: driverGoogleCalendarVersion,
    }, {
      headers: { "cache-control": "private, no-store, max-age=0" },
    });
  }

  return Response.json({
    action: result.action,
    ok: true,
    status: result.status,
    version: driverGoogleCalendarVersion,
  }, {
    headers: { "cache-control": "private, no-store, max-age=0" },
  });
}
