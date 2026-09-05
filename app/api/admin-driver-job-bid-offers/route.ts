import { after } from "next/server";

import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import { adminBookingPersistencePurpose, resolveAdminDispatcherBoundary } from "../../../lib/admin-dispatcher-auth-boundary";
import { sendDriverDevicePushAlertForDriverPoolOffer } from "../../../lib/driver-device-push-notification";
import {
  cancelDriverPoolOffer,
  getDriverPoolClientForProduction,
  loadAdminDriverPoolOffer,
  parseDriverPoolCancelPayload,
  parseDriverPoolPublishPayload,
  publishDriverPoolOffer,
} from "../../../lib/driver-pool-fast-accept";

export const dynamic = "force-dynamic";

function response(body: Record<string, unknown>, status: number) {
  return Response.json(body, { headers: { "Cache-Control": "no-store" }, status });
}

function boundary(request: Request) {
  return resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose);
}

async function body(request: Request) {
  return request.json().catch(() => ({}));
}

export async function GET(request: Request) {
  try {
    const access = boundary(request);
    if (!access.ok) return response({ error: access.error, ok: false }, 403);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => key !== "booking_reference")) {
      return response({ error: "Malformed Driver Pool request.", ok: false }, 400);
    }
    const reference = params.get("booking_reference") || "";
    const database = getDriverPoolClientForProduction();
    if (!database.ok) return response({ error: "Driver Pool is not configured.", ok: false }, 503);
    const result = await loadAdminDriverPoolOffer(database.client, reference);
    return result.ok
      ? response({ ...result.data, ok: true }, 200)
      : response({ error: result.error, ok: false }, result.status);
  } catch {
    return response({ error: "Driver Pool request failed safely.", ok: false }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const access = boundary(request);
    if (!access.ok) return response({ error: access.error, ok: false }, 403);
    const parsed = parseDriverPoolPublishPayload(await body(request));
    if (!parsed.ok) return response({ error: parsed.error, ok: false }, parsed.status);
    const database = getDriverPoolClientForProduction();
    if (!database.ok) return response({ error: "Driver Pool is not configured.", ok: false }, 503);
    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(access.context);
    const result = await publishDriverPoolOffer(database.client, parsed.data, actor);
    return result.ok
      ? response({ offer: result.data, ok: true }, 200)
      : response({ error: result.error, ok: false }, result.status);
  } catch {
    return response({ error: "Driver Pool request failed safely.", ok: false }, 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const access = boundary(request);
    if (!access.ok) return response({ error: access.error, ok: false }, 403);
    const parsed = parseDriverPoolCancelPayload(await body(request));
    if (!parsed.ok) return response({ error: parsed.error, ok: false }, parsed.status);
    const database = getDriverPoolClientForProduction();
    if (!database.ok) return response({ error: "Driver Pool is not configured.", ok: false }, 503);
    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(access.context);
    const result = await cancelDriverPoolOffer(database.client, parsed.data, actor);
    if (
      result.ok &&
      result.data.assignment_cancelled &&
      result.data.cancelled_driver_id &&
      result.data.public_booking_reference
    ) {
      after(async () => {
        try {
          await sendDriverDevicePushAlertForDriverPoolOffer(database.client, {
            driver_id: result.data.cancelled_driver_id,
            notification_kind: "assignment_cancelled",
            offer_key: result.data.offer.offer_key,
            public_booking_reference: result.data.public_booking_reference,
          });
        } catch {
          // The atomic cancellation must not fail because Driver push is unavailable.
        }
      });
    }
    return result.ok
      ? response({ ...result.data, ok: true }, 200)
      : response({ error: result.error, ok: false }, result.status);
  } catch {
    return response({ error: "Driver Pool request failed safely.", ok: false }, 500);
  }
}
