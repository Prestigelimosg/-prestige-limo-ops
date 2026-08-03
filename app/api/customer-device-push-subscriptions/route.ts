import {
  getCustomerDevicePushReadiness,
  registerCustomerDevicePushSubscription,
  revokeCustomerDevicePushSubscription,
} from "../../../lib/customer-device-push-notification";
import { resolveCustomerSavedBookingsBoundaryForPurpose } from "../../../lib/customer-saved-bookings-read";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const customerDevicePushPurpose = "customer-device-push-subscription";

function safeErrorResponse(error: string, status: number) {
  return Response.json({ error, ok: false }, { status });
}

function safeFailureResponse() {
  return safeErrorResponse("Customer alerts request failed safely.", 500);
}

function resolveBoundary(request: Request) {
  return resolveCustomerSavedBookingsBoundaryForPurpose(
    request,
    customerDevicePushPurpose,
    "/my-bookings",
  );
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  try {
    const boundary = resolveBoundary(request);

    if (!boundary.ok) {
      return safeErrorResponse(boundary.error, boundary.status);
    }

    return Response.json({
      ok: true,
      readiness: getCustomerDevicePushReadiness(),
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function POST(request: Request) {
  try {
    const boundary = resolveBoundary(request);

    if (!boundary.ok) {
      return safeErrorResponse(boundary.error, boundary.status);
    }

    const result = await registerCustomerDevicePushSubscription(
      await readJsonBody(request),
      boundary.data,
    );

    return Response.json(
      {
        error: result.error,
        ok: result.ok,
        reason: result.reason,
        subscription_status: result.subscription_status,
      },
      { status: result.status },
    );
  } catch {
    return safeFailureResponse();
  }
}

export async function PATCH(request: Request) {
  try {
    const boundary = resolveBoundary(request);

    if (!boundary.ok) {
      return safeErrorResponse(boundary.error, boundary.status);
    }

    const result = await revokeCustomerDevicePushSubscription(
      await readJsonBody(request),
      boundary.data,
    );

    return Response.json(
      {
        error: result.error,
        ok: result.ok,
        reason: result.reason,
        subscription_status: result.subscription_status,
      },
      { status: result.status },
    );
  } catch {
    return safeFailureResponse();
  }
}
