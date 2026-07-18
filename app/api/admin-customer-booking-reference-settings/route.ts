import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
} from "../../../lib/admin-dispatcher-auth-boundary";
import {
  loadAdminCustomerBookingReferenceSetting,
  parseAdminCustomerBookingReferenceSettingsSavePayload,
  saveAdminCustomerBookingReferenceSetting,
} from "../../../lib/admin-customer-booking-reference-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

const blockedMessage =
  "Customer booking reference settings are available only from internal customer folders.";

function errorResponse(error: string, status = 403) {
  return Response.json({ error, ok: false }, { status });
}

function clean(value: string | undefined) {
  return value?.trim() || null;
}

function hasSameOriginCustomerFolderReferer(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if ((origin && origin !== requestUrl.origin) || !referer) return false;

  try {
    const refererUrl = new URL(referer);

    return (
      refererUrl.origin === requestUrl.origin &&
      (refererUrl.pathname === "/customers" ||
        refererUrl.pathname.startsWith("/customers/"))
    );
  } catch {
    return false;
  }
}

function requireCustomerFolderAdminBoundary(request: Request): BoundaryCheck {
  if (
    request.headers.get("x-prestige-admin-purpose") !==
      adminBookingPersistencePurpose ||
    !hasSameOriginCustomerFolderReferer(request)
  ) {
    return { ok: false, response: errorResponse(blockedMessage) };
  }

  if (process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE === "server-session-token") {
    const expectedToken = clean(
      process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
    );
    const requestToken = clean(
      request.headers.get("x-prestige-admin-session-token") || undefined,
    );
    const role = clean(process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE);

    if (
      !expectedToken ||
      (requestToken && requestToken !== expectedToken) ||
      role !== "admin"
    ) {
      return { ok: false, response: errorResponse(blockedMessage) };
    }

    return {
      context: {
        actorLabel:
          clean(process.env.PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL) ||
          "Admin customer booking reference session",
        mode: "server-session-role-surface",
        role: "admin",
      },
      ok: true,
    };
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED === "true") {
    return { ok: false, response: errorResponse(blockedMessage) };
  }

  return {
    context: {
      actorLabel: "Local admin customer booking reference",
      mode: "local-dev-admin-surface",
      role: "local-dev-admin",
    },
    ok: true,
  };
}

async function readJsonBody(request: Request) {
  try {
    const value = await request.json();

    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  try {
    const boundary = requireCustomerFolderAdminBoundary(request);

    if (!boundary.ok) return boundary.response;

    const result = await loadAdminCustomerBookingReferenceSetting(
      new URL(request.url).searchParams,
      adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context),
    );

    return result.ok
      ? Response.json({
          customer_account: result.data.customer_account,
          ok: true,
          reference_setting: result.data.reference_setting,
          version: result.data.version,
        })
      : errorResponse(result.error, result.status);
  } catch {
    return errorResponse(
      "Customer booking reference settings request failed safely.",
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    const boundary = requireCustomerFolderAdminBoundary(request);

    if (!boundary.ok) return boundary.response;

    const parsed = parseAdminCustomerBookingReferenceSettingsSavePayload(
      await readJsonBody(request),
    );

    if (!parsed.ok) return errorResponse(parsed.error, parsed.status);

    const result = await saveAdminCustomerBookingReferenceSetting(
      parsed.data,
      adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context),
    );

    return result.ok
      ? Response.json({
          customer_account: result.data.customer_account,
          ok: true,
          reference_setting: result.data.reference_setting,
          version: result.data.version,
        })
      : errorResponse(result.error, result.status);
  } catch {
    return errorResponse(
      "Customer booking reference settings request failed safely.",
      500,
    );
  }
}
