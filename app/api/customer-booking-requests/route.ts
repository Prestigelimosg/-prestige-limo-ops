import {
  createAdminBooking,
  parseCustomerBookingRequestPayloads,
  type AdminBookingPersistenceRecord,
} from "../../../lib/admin-booking-persistence";
import { createCustomerBookingRequestAdminAppNotification } from "../../../lib/admin-app-notification-persistence";
import { customerBookingRequestPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import { sendAdminNewBookingDevicePushAlert } from "../../../lib/admin-device-push-notification";
import { sendAdminNewBookingEmailAlert } from "../../../lib/admin-new-booking-email-alert";
import {
  expiredCustomerSavedBookingsSessionCookieHeaders,
  resolveCustomerSavedBookingsBoundaryForPurpose,
  resolveCustomerSavedBookingsVerifiedIdentity,
} from "../../../lib/customer-saved-bookings-read";
import { prepareCodexJobCardForAdminReview } from "../../../lib/codex-job-card-auto-preparation";
import { sendCustomerBookingReceiptEmail } from "../../../lib/customer-booking-receipt-email";
import { createCustomerPortalAccessLinkToken } from "../../../lib/customer-portal-access-link";

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

function stalePortalAccessResponse() {
  const expiredCookieHeaders = expiredCustomerSavedBookingsSessionCookieHeaders();

  if (expiredCookieHeaders.length === 0) {
    return Response.json({ ok: false, error: "Verified PA booking identity is not ready." }, { status: 403 });
  }

  const headers = new Headers({ "Cache-Control": "no-store" });

  for (const expiredCookieHeader of expiredCookieHeaders) {
    headers.append("Set-Cookie", expiredCookieHeader);
  }

  return Response.json(
    {
      ok: false,
      error: "Saved customer portal access was cleared. Review the request and submit it again.",
    },
    { headers, status: 409 },
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

function normalizedReceiptEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function buildVerifiedCustomerPortalReceiptUrl({
  booking,
  customerAccountReference,
  linkRevision,
  request,
  verifiedBookerEmail,
}: {
  booking: AdminBookingPersistenceRecord;
  customerAccountReference: string;
  linkRevision: string;
  request: Request;
  verifiedBookerEmail: string | null;
}) {
  const recipient = normalizedReceiptEmail(booking.contact_email);
  const verifiedRecipient = normalizedReceiptEmail(verifiedBookerEmail);
  const bookingReference = typeof booking.booking_reference === "string"
    ? booking.booking_reference.trim()
    : "";

  if (
    !recipient ||
    recipient !== verifiedRecipient ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(bookingReference)
  ) {
    return null;
  }

  const tokenResult = createCustomerPortalAccessLinkToken(customerAccountReference, {
    linkRevision,
    scope: "portal_account",
  });

  if (!tokenResult.ok) {
    return null;
  }

  const url = new URL(
    `/api/customer-portal-access/${encodeURIComponent(tokenResult.data.token)}`,
    request.url,
  );
  url.searchParams.set("booking", bookingReference);
  url.searchParams.set("tracking", "1");

  return url.toString();
}

async function notifyAdminNewBookingRequest(booking: AdminBookingPersistenceRecord) {
  try {
    await createCustomerBookingRequestAdminAppNotification({
      booking_reference: booking.booking_reference,
    });
  } catch {
    // Customer booking intake must not fail because the admin in-app inbox is unavailable.
  }

  try {
    await sendAdminNewBookingEmailAlert(booking);
  } catch {
    // Customer booking intake must not fail because an admin alert channel is unavailable.
  }

  try {
    await sendAdminNewBookingDevicePushAlert(booking);
  } catch {
    // Customer booking intake must not fail because admin device push is unavailable.
  }
}

async function prepareSavedCustomerBookingRequestJobCards(
  savedRequests: AdminBookingPersistenceRecord[],
) {
  await Promise.all(
    savedRequests.map(async (savedRequest) => {
      const bookingReference = savedRequest.booking_reference?.trim();

      if (!bookingReference) {
        return;
      }

      try {
        await prepareCodexJobCardForAdminReview({
          bookingReference,
          event: "new_booking",
        });
      } catch {
        // Booking intake must remain available when internal preparation is unavailable.
      }
    }),
  );
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

    const body = await readJsonBody(request);
    const parsed = parseCustomerBookingRequestPayloads(body);

    if (!parsed.ok) {
      return Response.json(
        {
          ok: false,
          error: customerSafeError(parsed.error),
        },
        { status: parsed.status },
      );
    }

    const portalBoundary = resolveCustomerSavedBookingsBoundaryForPurpose(
      request,
      "customer-booking-request",
      "/book",
    );
    const verifiedIdentity = portalBoundary.ok
      ? await resolveCustomerSavedBookingsVerifiedIdentity(portalBoundary.data, body.travelerId)
      : null;

    if (verifiedIdentity && !verifiedIdentity.ok) {
      return stalePortalAccessResponse();
    }

    if (!verifiedIdentity?.ok && body.travelerId !== undefined && body.travelerId !== null && body.travelerId !== "") {
      return blockedResponse();
    }

    const savedRequests: AdminBookingPersistenceRecord[] = [];

    for (const requestPayload of parsed.data.requests) {
      const verifiedRequestPayload = verifiedIdentity?.ok
        ? {
            ...requestPayload,
            booking: {
              ...requestPayload.booking,
              customer_id: verifiedIdentity.data.customer_account_reference,
              company_id: verifiedIdentity.data.company_id,
              booker_id: verifiedIdentity.data.booker_id,
              ...(verifiedIdentity.data.traveler_id && verifiedIdentity.data.traveler_name
                ? {
                    passenger_name: verifiedIdentity.data.traveler_name,
                    traveler_id: verifiedIdentity.data.traveler_id,
                  }
                : {}),
            },
          }
        : requestPayload;
      const result = await createAdminBooking(verifiedRequestPayload, customerBookingRequestPersistenceAdapterActor, {
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

      savedRequests.push(result.data);
    }

    if (savedRequests.length === 0) {
      return safeFailureResponse();
    }

    const primaryRequest = savedRequests[0];
    const returnRequest = savedRequests[1] ?? null;

    await prepareSavedCustomerBookingRequestJobCards(savedRequests);
    await notifyAdminNewBookingRequest(primaryRequest);
    const portalUrl = portalBoundary.ok && verifiedIdentity?.ok && portalBoundary.data.portal_link_revision
      ? buildVerifiedCustomerPortalReceiptUrl({
          booking: primaryRequest,
          customerAccountReference: verifiedIdentity.data.customer_account_reference,
          linkRevision: portalBoundary.data.portal_link_revision,
          request,
          verifiedBookerEmail: verifiedIdentity.data.booker_email,
        })
      : null;
    const receipt = await sendCustomerBookingReceiptEmail(savedRequests, { portalUrl });

    return Response.json({
      ok: true,
      request: {
        booking_reference:
          primaryRequest.public_booking_reference || primaryRequest.booking_reference,
        customer_facing_status: primaryRequest.customer_facing_status,
        return_booking_reference:
          returnRequest?.public_booking_reference ||
          returnRequest?.booking_reference ||
          null,
        return_trip_requested: parsed.data.returnTripRequested,
        receipt_status: receipt.status,
        short_notice_review_required:
          savedRequests.some((savedRequest) => savedRequest.short_notice_review_status === "Admin Review Required"),
      },
    });
  } catch {
    return safeFailureResponse();
  }
}
