import { cookies } from "next/headers";

import {
  completeDriverGoogleCalendarOauth,
  driverGoogleCalendarOauthCookieName,
} from "../../../../lib/driver-google-calendar.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const state = requestUrl.searchParams.get("state") || "";
  const code = requestUrl.searchParams.get("code") || "";
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(driverGoogleCalendarOauthCookieName)?.value || "";
  const result = await completeDriverGoogleCalendarOauth({ code, cookieValue, state });

  cookieStore.delete(driverGoogleCalendarOauthCookieName);

  if (result.driver_job_url) {
    const redirectUrl = new URL(result.driver_job_url);
    redirectUrl.searchParams.set("calendar", result.ok ? "saved" : "error");
    return Response.redirect(redirectUrl, 303);
  }

  return new Response(
    "Google Calendar connection could not be completed. Return to the original Driver Job link and try again.",
    {
      headers: {
        "cache-control": "private, no-store, max-age=0",
        "content-type": "text/plain; charset=utf-8",
      },
      status: result.ok ? 400 : result.status,
    },
  );
}
