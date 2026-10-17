import { resolveStoreReviewJobRequest, storeReviewBlockedResponse } from "../../../../../lib/store-review-access.ts";
import { getDriverJobStatusPersistenceClientForProduction, saveDriverJobStatusThroughStatusPersistence } from "../../../../../lib/driver-job-status-persistence.ts";
import { after } from "next/server";
import { applyDriverJobStatusUpdateContract } from "../../../../../lib/driver-job-link-contract.ts";
import { applyProductionDriverJobStatusUpdate } from "../../../../../lib/driver-job-link-production.ts";
import {
  isProductionDriverJobLinkMode,
} from "../../../../../lib/driver-job-link-mode.ts";
import {
  mockDriverJobBookingsById,
  mockDriverJobLinks,
} from "../../../../../lib/driver-job-link-mock-store.ts";

type DriverJobStatusRouteContext = {
  params: Promise<{
    token: string;
  }>;
};

const blockedStatusByReason = {
  acknowledgement_required: 409,
  already_completed: 409,
  expired: 410,
  invalid_details: 400,
  invalid_status: 400,
  not_configured: 503,
  out_of_order: 409,
  revoked: 403,
  unauthorized: 401,
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function readJsonBody(request: Request) {
  try {
    return asRecord(await request.json());
  } catch {
    return {};
  }
}

export async function PATCH(request: Request, context: DriverJobStatusRouteContext) {
  const [{ token }, body] = await Promise.all([context.params, readJsonBody(request)]);
  const status = typeof body.status === "string" ? body.status : "";
  const completionNote = body.completion_note;
  const exceptionReason = body.exception_reason;
  const safeStatusContext = body.safe_status_context;
  const safeStatusNote = body.safe_status_note;

  const review = resolveStoreReviewJobRequest(request, token);
  if (review.state === "blocked") return storeReviewBlockedResponse();
  if (review.state === "review") {
    if (Object.keys(body).some(key => key !== "status")) return storeReviewBlockedResponse();
    const client = getDriverJobStatusPersistenceClientForProduction();
    if (!client.ok) return storeReviewBlockedResponse();
    try {
      const result = await saveDriverJobStatusThroughStatusPersistence({
        client: client.client, token, status, reviewBooking: review.proof,
      });
      return Response.json({ ...result, mode: "review" }, {
        status: result.ok ? 200 : blockedStatusByReason[result.reason],
        headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
      });
    } catch { return storeReviewBlockedResponse(); }
  }

  if (isProductionDriverJobLinkMode()) {
    const result = await applyProductionDriverJobStatusUpdate({
      afterResponse: after,
      completionNote,
      exceptionReason,
      safeStatusContext,
      safeStatusNote,
      token,
      status,
    });

    if (result.ok) {
      return Response.json({
        customer_notification: result.customer_notification.ok
          ? {
              delivery_surface: "customer_app",
              external_send: false,
              notification_status: "queued",
              ok: true,
              provider_send: false,
            }
          : {
              external_send: false,
              no_op: true,
              ok: false,
              provider_send: false,
              status: result.customer_notification.status,
            },
        link_expiry: result.link_expiry,
        ok: true,
        mode: "production",
        payload: result.payload,
        sharing_cleanup: result.sharing_cleanup,
        status: result.status,
      });
    }

    return Response.json(result, { status: blockedStatusByReason[result.reason] });
  }

  const result = applyDriverJobStatusUpdateContract({
    token,
    status,
    links: mockDriverJobLinks,
    bookingsById: mockDriverJobBookingsById,
  });

  if (!result.ok) {
    return Response.json(
      {
        ok: false,
        reason: result.reason,
        payload: null,
      },
      { status: blockedStatusByReason[result.reason] },
    );
  }

  // Mock-backed route skeleton only. No Supabase writes and no Driver Database access.
  return Response.json({
    ok: true,
    mode: "mock",
    status: result.status,
    payload: result.payload,
  });
}
