import { after } from "next/server";

import { sendAdminDevicePushAlert } from "../../../lib/admin-device-push-notification";
import { verifyDriverAccountSession } from "../../../lib/driver-account-device-lock";
import {
  decideDriverPoolOffer,
  getDriverPoolClientForProduction,
  loadAvailableDriverPoolJobs,
  parseDriverPoolDecisionPayload,
  type DriverPoolClient,
} from "../../../lib/driver-pool-fast-accept";
import { clearDriverPortalSessionCookie, resolveDriverPortalSession } from "../../../lib/driver-portal-session";

export const dynamic = "force-dynamic";

function response(body: Record<string, unknown>, status: number, cookie?: string) {
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Cookie" });
  if (cookie) headers.set("Set-Cookie", cookie);
  return Response.json(body, { headers, status });
}

function sameOrigin(request: Request, purpose: string) {
  if (request.headers.get("x-prestige-driver-purpose") !== purpose) return false;
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if ((origin && origin !== url.origin) || !referer) return false;
  try {
    const parsed = new URL(referer);
    return parsed.origin === url.origin && parsed.pathname === "/driver-portal";
  } catch { return false; }
}

async function authenticated(request: Request) {
  const session = resolveDriverPortalSession(request.headers.get("cookie"));
  if (!session.ok || !session.claims.accountId || !session.claims.deviceIdHash) return null;
  const database = getDriverPoolClientForProduction();
  if (!database.ok) return null;
  const valid = await verifyDriverAccountSession({
    accountId: session.claims.accountId,
    client: database.client,
    deviceIdHash: session.claims.deviceIdHash,
    driverId: session.claims.driverId,
    installationId: request.headers.get("x-prestige-driver-installation-id"),
  });
  return valid ? { client: database.client, driverId: session.claims.driverId } : null;
}

async function body(request: Request) {
  return request.json().catch(() => ({}));
}

function safeDriverPlate(value: unknown) {
  if (typeof value !== "string") return null;
  const plate = value.trim().replace(/\s+/g, " ").toUpperCase();
  return plate && plate.length <= 20 && /\d/.test(plate) && /^[A-Z0-9][A-Z0-9 -]{0,19}$/.test(plate)
    ? plate
    : null;
}

async function notifyAdminOfDriverPoolAcceptance(
  client: DriverPoolClient,
  driverId: number,
  publicBookingReference: string,
) {
  try {
    const { data, error } = await client
      .from("drivers")
      .select("plate_number")
      .eq("id", driverId)
      .maybeSingle();

    const vehiclePlate = safeDriverPlate(data?.plate_number);
    if (error || !vehiclePlate) return;

    await sendAdminDevicePushAlert("driver_pool_accepted", {
      bookingReference: publicBookingReference,
      vehiclePlate,
    });
  } catch {
    // A completed atomic Driver Pool assignment must not fail because Admin push is unavailable.
  }
}

export async function GET(request: Request) {
  try {
    if (!sameOrigin(request, "driver-pool-offers-read")) return response({ jobs: [], ok: false, reason: "unauthorized" }, 401);
    const account = await authenticated(request);
    if (!account) return response({ jobs: [], ok: false, reason: "unauthorized" }, 401, clearDriverPortalSessionCookie());
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => !["page", "limit"].includes(key))) return response({ jobs: [], ok: false, reason: "invalid_request" }, 400);
    const page = Number(params.get("page") || 1);
    const limit = Number(params.get("limit") || 20);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
      return response({ jobs: [], ok: false, reason: "invalid_request" }, 400);
    }
    const result = await loadAvailableDriverPoolJobs(account.client, account.driverId, page, limit);
    return result.ok
      ? response({ enabled: result.data.enabled, has_more: result.data.has_more, jobs: result.data.jobs, ok: true }, 200)
      : response({ jobs: [], ok: false, reason: result.error }, result.status);
  } catch {
    return response({ jobs: [], ok: false, reason: "unavailable" }, 500);
  }
}

async function decide(request: Request, action: "accept" | "decline") {
  try {
    if (!sameOrigin(request, action === "accept" ? "driver-pool-offer-accept" : "driver-pool-offer-decline")) {
      return response({ ok: false, reason: "unauthorized" }, 401);
    }
    const account = await authenticated(request);
    if (!account) return response({ ok: false, reason: "unauthorized" }, 401, clearDriverPortalSessionCookie());
    const parsed = parseDriverPoolDecisionPayload(await body(request));
    if (!parsed.ok) return response({ ok: false, reason: parsed.error }, parsed.status);
    const result = await decideDriverPoolOffer(account.client, account.driverId, parsed.data, action);
    const acceptedPublicBookingReference = result.ok
      ? result.data.public_booking_reference
      : null;
    if (
      result.ok &&
      action === "accept" &&
      result.data.reason === "accepted" &&
      acceptedPublicBookingReference
    ) {
      after(() =>
        notifyAdminOfDriverPoolAcceptance(
          account.client,
          account.driverId,
          acceptedPublicBookingReference,
        ),
      );
    }
    return result.ok
      ? response({ accepted: result.data.accepted, ok: true, reason: result.data.reason }, 200)
      : response({ ok: false, reason: result.error }, result.status);
  } catch {
    return response({ ok: false, reason: "unavailable" }, 500);
  }
}

export async function POST(request: Request) { return decide(request, "accept"); }
export async function PATCH(request: Request) { return decide(request, "decline"); }
