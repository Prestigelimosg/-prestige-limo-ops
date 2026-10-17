import { NextResponse, type NextRequest } from "next/server";
import { resolveStoreReviewSession, storeReviewRequestAllowed, storeReviewBlockedResponse } from "./lib/store-review-access";

import { revalidateAdminAccountSession } from "./lib/admin-account-auth.ts";
import {
  adminAccountAuthIsEnabled,
  adminAccountSessionCookieName,
  clearAdminAccountSessionCookie,
  resolveAdminAccountSession,
} from "./lib/admin-account-session.ts";

function protectedAdminPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/customers" ||
    pathname.startsWith("/customers/") ||
    pathname === "/settings/invoice"
  );
}

function protectedAdminApiPath(pathname: string) {
  return pathname.startsWith("/api/admin-") || pathname === "/api/ai-parse";
}

function safeReturnPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const parsed = new URL(value, "https://app.prestigelimo.sg");
    return parsed.origin === "https://app.prestigelimo.sg" && protectedAdminPath(parsed.pathname)
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : "/";
  } catch {
    return "/";
  }
}

function clearInvalidSession(response: NextResponse, shouldClear: boolean) {
  if (shouldClear) {
    response.headers.set("set-cookie", clearAdminAccountSessionCookie());
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const review = resolveStoreReviewSession(request.headers.get("cookie"));
  if (review.state !== "absent") {
    const path = request.nextUrl.pathname;
    const authPath = ["/api/admin-auth/session", "/api/driver-auth/session", "/api/customer-principal-access"].includes(path);
    // Expired review sessions must still reach the existing sign-in/logout UI.
    if (request.method === "GET" && ["/admin-sign-in", "/customer-access/sign-in", "/driver-portal"].includes(path)) return NextResponse.next();
    if ((review.state === "valid" && storeReviewRequestAllowed(review, path, request.method, request)) ||
        (authPath && ["POST", "DELETE"].includes(request.method))) {
      const response = NextResponse.next();
      response.headers.set("cache-control", "private, no-store");
      if (path.startsWith("/driver-job/review-")) response.headers.set("referrer-policy", "same-origin");
      return response;
    }
    if (request.method === "GET" && (path.startsWith("/icons/") || path === "/favicon.ico")) return NextResponse.next();
    return storeReviewBlockedResponse();
  }
  if (!adminAccountAuthIsEnabled()) return NextResponse.next();

  const pathname = request.nextUrl.pathname;
  if (pathname === "/api/admin-auth/session") return NextResponse.next();
  if (
    !protectedAdminPath(pathname) &&
    pathname !== "/admin-sign-in" &&
    !protectedAdminApiPath(pathname)
  ) {
    return NextResponse.next();
  }

  const hasAdminCookie = request.cookies.has(adminAccountSessionCookieName);
  const session = resolveAdminAccountSession(request.headers.get("cookie"));
  const revalidated = session.ok
    ? await revalidateAdminAccountSession({ claims: session.claims })
    : null;
  const authenticated = session.ok && revalidated?.ok === true;

  if (protectedAdminApiPath(pathname)) {
    if (!hasAdminCookie) {
      const response = NextResponse.next();
      response.headers.set("x-prestige-admin-session", "required");
      return response;
    }
    return authenticated
      ? NextResponse.next()
      : clearInvalidSession(
          NextResponse.json({ ok: false, reason: "admin_session_invalid" }, {
            status: 403,
            headers: { "x-prestige-admin-session": "required" },
          }),
          true,
        );
  }

  if (pathname === "/admin-sign-in") {
    if (
      authenticated &&
      request.nextUrl.searchParams.get("action") !== "signout"
    ) {
      return NextResponse.redirect(
        new URL(safeReturnPath(request.nextUrl.searchParams.get("return_to")), request.url),
      );
    }
    const response = NextResponse.next();
    response.headers.set("cache-control", "private, no-store, max-age=0");
    return clearInvalidSession(response, hasAdminCookie);
  }

  if (protectedAdminPath(pathname) && !authenticated) {
    const signInUrl = new URL("/admin-sign-in", request.url);
    signInUrl.searchParams.set(
      "return_to",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return clearInvalidSession(NextResponse.redirect(signInUrl), hasAdminCookie);
  }

  const response = NextResponse.next();
  if (protectedAdminPath(pathname)) {
    response.headers.set("cache-control", "private, no-store, max-age=0");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
