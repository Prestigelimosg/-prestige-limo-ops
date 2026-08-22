import {
  assertActiveCustomerPrincipalSession,
  completeCustomerPrincipalActivation,
  completeCustomerPrincipalPinRecovery,
  customerPrincipalPinLogin,
  expiredCustomerPrincipalSessionCookie,
  logoutCustomerPrincipalDevice,
  readCustomerPrincipalTokenFromRequest,
  startCustomerPrincipalEmailChallenge,
} from "../../../lib/customer-principal-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeJsonBody(request: Request): Promise<Record<string, unknown>> {
  return request.json().then((value) =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {},
  ).catch(() => ({} as Record<string, unknown>));
}

function sameOriginCustomerRequest(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (origin && origin !== url.origin) return false;
  if (!referer) return false;
  try {
    const refererUrl = new URL(referer);
    return refererUrl.origin === url.origin && (
      refererUrl.pathname === "/my-bookings" ||
      refererUrl.pathname === "/customer-access/activate" ||
      refererUrl.pathname === "/customer-access/sign-in"
    );
  } catch {
    return false;
  }
}

function responseFor(result: { data?: unknown; error?: string; ok: boolean; status?: number }, cookie?: string) {
  const response = Response.json(
    result.ok ? { data: result.data, ok: true } : { error: result.error, ok: false },
    { status: result.ok ? 200 : result.status || 500 },
  );
  if (cookie) response.headers.append("set-cookie", cookie);
  response.headers.set("cache-control", "private, no-store");
  return response;
}

function sourceIpKey(request: Request) {
  return (
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    ""
  ).trim().slice(0, 256);
}

export async function POST(request: Request) {
  if (!sameOriginCustomerRequest(request)) {
    return responseFor({ error: "Customer app access is required.", ok: false, status: 403 });
  }
  const body = await safeJsonBody(request);
  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  if (action === "start_activation" || action === "start_new_device" || action === "start_recovery") {
    return responseFor(await startCustomerPrincipalEmailChallenge({
      ...body,
      purpose: action === "start_recovery" ? "forgot_pin" : action === "start_new_device" ? "new_device" : "activation",
      requestIp: sourceIpKey(request),
    }));
  }
  if (action === "complete_activation") {
    const result = await completeCustomerPrincipalActivation(body);
    return responseFor(result, result.ok ? result.data.cookie : undefined);
  }
  if (action === "pin_login") {
    const result = await customerPrincipalPinLogin({ ...body, ipKey: sourceIpKey(request) });
    return responseFor(result, result.ok ? result.data.cookie : undefined);
  }
  if (action === "complete_recovery") {
    const result = await completeCustomerPrincipalPinRecovery(body);
    return responseFor(result, result.ok ? result.data.cookie : undefined);
  }
  if (action === "logout") {
    const result = await logoutCustomerPrincipalDevice(readCustomerPrincipalTokenFromRequest(request));
    return responseFor(result, expiredCustomerPrincipalSessionCookie());
  }
  return responseFor({ error: "Customer app access request is invalid.", ok: false, status: 400 });
}

export async function GET(request: Request) {
  if (!sameOriginCustomerRequest(request)) {
    return responseFor({ error: "Customer app access is required.", ok: false, status: 403 });
  }
  const token = readCustomerPrincipalTokenFromRequest(request);
  if (!token) return responseFor({ error: "Customer app access is required.", ok: false, status: 403 });
  const result = await assertActiveCustomerPrincipalSession(token);
  if (!result.ok) return responseFor(result);
  return responseFor({
    data: {
      memberships: result.data.memberships,
      normalized_email: result.data.normalized_email,
      principal_role: result.data.principal_role,
    },
    ok: true,
  }, result.data.renewed_cookie);
}
