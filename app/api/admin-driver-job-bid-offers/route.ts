import { after } from "next/server";

import { sendAdminDevicePushAlert } from "../../../lib/admin-device-push-notification";

import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import { adminBookingPersistencePurpose, resolveAdminDispatcherBoundary } from "../../../lib/admin-dispatcher-auth-boundary";
import { loadDriverPoolAlertReadiness, sendDriverDevicePushAlertForDriverPoolOffer, sendDriverDeviceSilentRefreshForDriverPoolOffer } from "../../../lib/driver-device-push-notification";
import {
  cancelDriverPoolOffer,
  refreshCancelledDriverPoolRecipients,
  decideDriverPoolOffer,
  loadDriverPoolWinnerPlate,
  parseDriverPoolAdminActionPayload,
  getDriverPoolClientForProduction,
  loadAdminDriverPoolAttentionOffers,
  loadAdminDriverPoolOffer,
  parseDriverPoolCancelPayload,
  parseDriverPoolAttentionQuery,
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
    const database = getDriverPoolClientForProduction();
    if (!database.ok) return response({ error: "Driver Pool is not configured.", ok: false }, 503);

    if (params.has("scope")) {
      const parsed = parseDriverPoolAttentionQuery(params);
      if (!parsed.ok) return response({ error: parsed.error, ok: false }, parsed.status);
      const result = await loadAdminDriverPoolAttentionOffers(
        database.client,
        parsed.data.page,
        parsed.data.limit,
      );
      return result.ok
        ? response({ ...result.data, ok: true }, 200)
        : response({ error: result.error, ok: false }, result.status);
    }

    if ([...params.keys()].some((key) => !["booking_reference", "driver_ids"].includes(key))) {
      return response({ error: "Malformed Driver Pool request.", ok: false }, 400);
    }
    const rawIds = params.get("driver_ids");
    const driverIds = rawIds ? rawIds.split(",").map(Number) : [];
    if (params.getAll("driver_ids").length > 1 || (rawIds !== null &&
        (!/^[1-9][0-9]*(,[1-9][0-9]*)*$/.test(rawIds) || driverIds.length > 200 ||
         new Set(driverIds).size !== driverIds.length || driverIds.some((id) => !Number.isSafeInteger(id))))) {
      return response({ error: "Malformed Driver Pool request.", ok: false }, 400);
    }
    const reference = params.get("booking_reference") || "";
    const result = await loadAdminDriverPoolOffer(database.client, reference);
    return result.ok
      ? response({ ...result.data, ...(rawIds !== null ? { driver_alert_readiness: await loadDriverPoolAlertReadiness(database.client, driverIds) } : {}), ok: true }, 200)
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
    const payload = await body(request);
    if (payload && typeof payload === "object" && "action" in payload) {
      const parsedAction = parseDriverPoolAdminActionPayload(payload);
      if (!parsedAction.ok) return response({ error: parsedAction.error, ok: false }, parsedAction.status);
      const database = getDriverPoolClientForProduction();
      if (!database.ok) return response({ error: "Driver Pool is not configured.", ok: false }, 503);
      const actor = adminDispatcherBoundaryToPersistenceAdapterActor(access.context);
      const input = parsedAction.data;
      if (input.action === "widen") {
        const result = await publishDriverPoolOffer(database.client, {
          booking_reference: input.booking_reference!, offer_key: input.offer_key,
          expected_updated_at: input.expected_updated_at, idempotency_key: input.idempotency_key,
          offer_payout_sgd: input.offer_payout_sgd!, vehicle_requirement: input.vehicle_requirement!,
        }, actor);
        return result.ok ? response({ offer: result.data, ok: true }, 200) : response({ error: result.error, ok: false }, result.status);
      }
      const result = await decideDriverPoolOffer(database.client, input.driver_id!, input, "accept", actor);
      if (result.ok && result.data.reason === "accepted" && result.data.public_booking_reference) {
        after(async () => {
          await Promise.allSettled([
            (async () => {
              const vehiclePlate = await loadDriverPoolWinnerPlate(database.client, input.driver_id!);
              if (vehiclePlate) await sendAdminDevicePushAlert("driver_pool_accepted", {
                bookingReference: result.data.public_booking_reference!, vehiclePlate,
              });
            })(),
            sendDriverDevicePushAlertForDriverPoolOffer(database.client, {
              driver_id: input.driver_id!, notification_kind: "winner", offer_key: input.offer_key,
              public_booking_reference: result.data.public_booking_reference!,
            }),
            ...result.data.other_recipient_driver_ids.map((driverId) => sendDriverDeviceSilentRefreshForDriverPoolOffer(database.client, {
              driver_id: driverId, offer_key: input.offer_key,
            })),
          ]);
        });
      }
      return result.ok ? response({ ...result.data, ok: true }, 200) : response({ error: result.error, ok: false }, result.status);
    }
    const parsed = parseDriverPoolCancelPayload(payload);
    if (!parsed.ok) return response({ error: parsed.error, ok: false }, parsed.status);
    const database = getDriverPoolClientForProduction();
    if (!database.ok) return response({ error: "Driver Pool is not configured.", ok: false }, 503);
    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(access.context);
    const result = await cancelDriverPoolOffer(database.client, parsed.data, actor);
    if (result.ok) {
      after(async () => {
        await Promise.allSettled([
          refreshCancelledDriverPoolRecipients(database.client, result.data.offer.offer_key),
          ...(result.data.assignment_cancelled && result.data.cancelled_driver_id && result.data.public_booking_reference ? [
            sendDriverDevicePushAlertForDriverPoolOffer(database.client, {
              driver_id: result.data.cancelled_driver_id, notification_kind: "assignment_cancelled",
              offer_key: result.data.offer.offer_key, public_booking_reference: result.data.public_booking_reference,
            }),
          ] : []),
        ]);
      });
    }
    return result.ok
      ? response({ ...result.data, ok: true }, 200)
      : response({ error: result.error, ok: false }, result.status);
  } catch {
    return response({ error: "Driver Pool request failed safely.", ok: false }, 500);
  }
}
