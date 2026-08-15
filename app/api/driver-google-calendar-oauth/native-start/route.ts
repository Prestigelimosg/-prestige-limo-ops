import { cookies } from "next/headers";

import {
  driverGoogleCalendarOauthCookieName,
  readDriverGoogleCalendarNativeOauthStart,
} from "../../../../lib/driver-google-calendar.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const state = requestUrl.searchParams.get("state") || "";
  const hasExactQuery =
    requestUrl.searchParams.size === 1 && !requestUrl.hash && state.length <= 4096;
  const result = hasExactQuery
    ? readDriverGoogleCalendarNativeOauthStart(state)
    : { ok: false as const, reason: "invalid_oauth", status: 400 as const };

  if (!result.ok) {
    return new Response("Google Calendar connection could not start.", {
      headers: {
        "cache-control": "private, no-store, max-age=0",
        "content-type": "text/plain; charset=utf-8",
        "referrer-policy": "no-referrer",
      },
      status: result.status,
    });
  }

  const cookieStore = await cookies();
  cookieStore.set(driverGoogleCalendarOauthCookieName, result.cookie_value, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/api/driver-google-calendar-oauth/callback",
    sameSite: "lax",
    secure:
      process.env.NODE_ENV === "production" ||
      process.env.VERCEL_ENV === "production",
  });

  const response = new Response(null, {
    headers: {
      "cache-control": "private, no-store, max-age=0",
      location: result.authorization_url,
      "referrer-policy": "no-referrer",
    },
    status: 303,
  });
  return response;
}
