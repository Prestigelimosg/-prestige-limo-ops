import {
  createAdminBooking,
  parseCustomerBookingRequestPayload,
} from "../../../lib/admin-booking-persistence";
import { customerBookingRequestPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";

export const dynamic = "force-dynamic";

const customerBookingPurposeHeader = "customer-booking-request";

function isCustomerBookingRequest(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const purpose = request.headers.get("x-prestige-customer-purpose");

  if (purpose !== customerBookingPurposeHeader) {
    return false;
  }

  if (origin && origin !== requestUrl.origin) {
    return false;
  }

  if (!referer) {
    return false;
  }

  try {
    const refererUrl = new URL(referer);

    return refererUrl.origin === requestUrl.origin && refererUrl.pathname === "/book";
  } catch {
    return false;
  }
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function blockedResponse() {
  return Response.json(
    {
      ok: false,
      error: "Booking requests can be submitted only from the customer booking form.",
    },
    { status: 403 },
  );
}

function safeFailureResponse() {
  return Response.json(
    {
      ok: false,
      error: "Booking request failed safely.",
    },
    { status: 500 },
  );
}

function customerSafeError(rawError: string) {
  const normalizedError = rawError.toLowerCase();

  if (/not enabled|configuration/.test(normalizedError)) {
    return "Booking request intake is not enabled or configured on this server.";
  }

  if (/forbidden/.test(normalizedError)) {
    return "Booking request includes fields outside the approved request scope.";
  }

  if (/unknown/.test(normalizedError)) {
    return "Booking request includes unknown request fields.";
  }

  if (/missing|required/.test(normalizedError)) {
    return "Booking request is missing required trip details.";
  }

  if (/malformed|invalid|route/.test(normalizedError)) {
    return "Booking request trip details need review before submission.";
  }

  return "Booking request could not be saved safely.";
}

export async function GET() {
  return blockedResponse();
}

export async function PUT() {
  return blockedResponse();
}

export async function PATCH() {
  return blockedResponse();
}

export async function DELETE() {
  return blockedResponse();
}

export async function HEAD() {
  return blockedResponse();
}

export async function OPTIONS() {
  return blockedResponse();
}

export async function POST(request: Request) {
  try {
    if (!isCustomerBookingRequest(request)) {
      return blockedResponse();
    }

    const parsed = parseCustomerBookingRequestPayload(await readJsonBody(request));

    if (!parsed.ok) {
      return Response.json(
        {
          ok: false,
          error: customerSafeError(parsed.error),
        },
        { status: parsed.status },
      );
    }

    const result = await createAdminBooking(parsed.data, customerBookingRequestPersistenceAdapterActor, {
      action: "customer_booking_request_create",
      source_route: "/book",
      actor_label: "Customer booking request",
      change_summary: "Customer-submitted booking request saved for admin review.",
    });

    if (!result.ok) {
      return Response.json(
        {
          ok: false,
          error: customerSafeError(result.error),
        },
        { status: result.status },
      );
    }

    return Response.json({
      ok: true,
      request: {
        booking_reference: result.data.booking_reference,
        customer_facing_status: result.data.customer_facing_status,
        short_notice_review_required:
          result.data.short_notice_review_status === "Admin Review Required",
      },
    });
  } catch {
    return safeFailureResponse();
  }
}
