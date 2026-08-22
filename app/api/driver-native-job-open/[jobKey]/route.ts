import { verifyDriverAccountSession } from "../../../../lib/driver-account-device-lock";
import { opaqueDriverJobLinkKey } from "../../../../lib/driver-device-push-notification";
import {
  hashDriverJobLinkToken,
  isDriverJobLinkExpired,
  isDriverJobLinkExpiryOutsideAllowedWindow,
} from "../../../../lib/driver-job-link";
import { getDriverJobStatusPersistenceClientForProduction } from "../../../../lib/driver-job-status-persistence";
import { openDriverNativeJobHandoff } from "../../../../lib/driver-native-job-handoff";
import { resolveDriverPortalSession } from "../../../../lib/driver-portal-session";

export const dynamic = "force-dynamic";

type UnknownRecord = Record<string, unknown>;

const nativeJobOpenPurpose = "driver-native-job-open";
const jobKeyPattern = /^[0-9a-f]{64}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const terminalBookingStatuses = new Set([
  "archived",
  "cancelled",
  "canceled",
  "complete",
  "completed",
  "declined",
  "declined_internal",
  "history",
  "job completed",
  "job_completed",
]);

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function rows(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown, maxLength: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized && normalized.length <= maxLength ? normalized : "";
}

function positiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? ""));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function blocked(status: 401 | 404 | 410 | 503) {
  return Response.json(
    { ok: false, reason: status === 503 ? "not_configured" : "unavailable" },
    {
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        Vary: "Cookie, x-prestige-driver-installation-id",
      },
      status,
    },
  );
}

function requestIsNativeAppBoundary(request: Request) {
  if (request.headers.get("x-prestige-driver-purpose") !== nativeJobOpenPurpose) {
    return false;
  }

  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (origin && origin !== requestUrl.origin) {
    return false;
  }
  if (!referer) {
    return true;
  }

  try {
    const refererUrl = new URL(referer);
    return refererUrl.origin === requestUrl.origin &&
      (refererUrl.pathname === "/driver-portal" ||
        refererUrl.pathname.startsWith("/api/driver-native-job-open/"));
  } catch {
    return false;
  }
}

function linkIsActive(link: UnknownRecord) {
  const expiresAt = text(link.expires_at, 80);
  return link.link_status === "active" &&
    !link.revoked_at &&
    Boolean(expiresAt) &&
    !isDriverJobLinkExpired(expiresAt) &&
    !isDriverJobLinkExpiryOutsideAllowedWindow(expiresAt);
}

function bookingIsTerminal(booking: UnknownRecord) {
  return [
    booking.status,
    booking.admin_internal_status,
    booking.customer_facing_status,
  ].some((value) => terminalBookingStatuses.has(text(value, 80).toLowerCase()));
}

export async function GET(
  request: Request,
  context: { params: Promise<{ jobKey: string }> },
) {
  if (!requestIsNativeAppBoundary(request)) {
    return blocked(401);
  }

  const { jobKey } = await context.params;
  if (!jobKeyPattern.test(jobKey)) {
    return blocked(404);
  }

  const session = resolveDriverPortalSession(request.headers.get("cookie"));
  if (
    !session.ok ||
    !session.claims.accountId ||
    !session.claims.deviceIdHash
  ) {
    return blocked(session.ok || session.reason !== "not_configured" ? 401 : 503);
  }

  const clientResult = getDriverJobStatusPersistenceClientForProduction();
  if (!clientResult.ok) {
    return blocked(503);
  }

  const installationId = request.headers.get("x-prestige-driver-installation-id");
  const accountIsActiveOnThisPhone = await verifyDriverAccountSession({
    accountId: session.claims.accountId,
    client: clientResult.client,
    deviceIdHash: session.claims.deviceIdHash,
    driverId: session.claims.driverId,
    installationId,
  });
  if (!accountIsActiveOnThisPhone) {
    return blocked(401);
  }

  const { data: linkData, error: linkError } = await clientResult.client
    .from("driver_job_links")
    .select(
      "id, booking_reference, driver_id, link_status, expires_at, revoked_at, safe_link_context, created_at, token_hash",
    )
    .eq("driver_id", session.claims.driverId)
    .eq("link_status", "active")
    .order("created_at", { ascending: false })
    .limit(100);
  if (linkError) {
    return blocked(503);
  }

  const link = rows(linkData).find((candidate) => {
    const id = text(candidate.id, 80);
    return uuidPattern.test(id) &&
      linkIsActive(candidate) &&
      opaqueDriverJobLinkKey(id) === jobKey;
  });
  const linkId = text(link?.id, 80);
  const bookingReference = text(link?.booking_reference, 120);
  if (!link || !uuidPattern.test(linkId) || !bookingReference) {
    return blocked(404);
  }

  const { data: newestLinkData, error: newestLinkError } = await clientResult.client
    .from("driver_job_links")
    .select("id, expires_at, link_status, revoked_at")
    .eq("booking_reference", bookingReference)
    .eq("link_status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const newestLink = record(newestLinkData);
  if (
    newestLinkError ||
    text(newestLink.id, 80) !== linkId ||
    !linkIsActive(newestLink)
  ) {
    return blocked(410);
  }

  const { data: bookingData, error: bookingError } = await clientResult.client
    .from("bookings")
    .select(
      "booking_reference, driver_id, status, admin_internal_status, customer_facing_status",
    )
    .eq("booking_reference", bookingReference)
    .maybeSingle();
  const booking = record(bookingData);
  if (
    bookingError ||
    text(booking.booking_reference, 120) !== bookingReference ||
    positiveInteger(booking.driver_id) !== session.claims.driverId ||
    bookingIsTerminal(booking)
  ) {
    return blocked(410);
  }

  const contextRecord = record(link.safe_link_context);
  const tokenHash = text(link.token_hash, 64);
  const token = openDriverNativeJobHandoff({
    bookingReference,
    ciphertext: contextRecord.native_handoff_ciphertext,
    tokenHash,
  });
  if (!token || hashDriverJobLinkToken(token) !== tokenHash) {
    return blocked(410);
  }

  const destination = new URL(`/driver-job/${encodeURIComponent(token)}`, request.url);
  const response = Response.redirect(destination, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Vary", "Cookie, x-prestige-driver-installation-id");
  return response;
}

export async function POST() {
  return blocked(404);
}

export async function PUT() {
  return blocked(404);
}

export async function PATCH() {
  return blocked(404);
}

export async function DELETE() {
  return blocked(404);
}
