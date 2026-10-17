import { resolveStoreReviewSession, storeReviewSameOrigin, storeReviewBlockedResponse } from "../../../lib/store-review-access";
import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";
import { loadAdminRateSetup } from "../../../lib/admin-rate-setup-read";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | {
      context: AdminDispatcherBoundaryContext;
      ok: true;
    }
  | {
      ok: false;
      response: Response;
    };

function blockedResponse(error: string) {
  return Response.json(
    {
      error,
      ok: false,
    },
    { status: 403 },
  );
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose, {
    additionalSameOriginRefererPathPrefixes: ["/customers/"],
    additionalSameOriginRefererPathnames: ["/customers"],
  });

  if (!boundary.ok) {
    return {
      ok: false,
      response: blockedResponse(boundary.error),
    };
  }

  if (boundary.context.mode === "local-dev-admin-surface" && isProductionRuntime()) {
    return {
      ok: false,
      response: blockedResponse("Admin booking persistence is available only from the internal admin dashboard."),
    };
  }

  return {
    context: boundary.context,
    ok: true,
  };
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Admin rate setup request failed safely.",
      ok: false,
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const review = resolveStoreReviewSession(request.headers.get("cookie"));
    if (review.state !== "absent" && (review.state !== "valid" || review.role !== "admin" ||
        !storeReviewSameOrigin(request, "admin") ||
        request.headers.get("x-prestige-admin-purpose") !== adminBookingPersistencePurpose)) return storeReviewBlockedResponse();
    const boundary: AdminDispatcherBoundaryCheck = review.state === "valid"
      ? { ok: true, context: { actorLabel: "Store reviewer", role: "admin", mode: "server-session-role-surface" } }
      : requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await loadAdminRateSetup(actor, review.state === "valid" ? review : undefined);

    if (!result.ok) {
      return Response.json(
        {
          error: result.error,
          ok: false,
        },
        { status: result.status },
      );
    }

    return Response.json({
      bookers: result.data.bookers,
      companies: result.data.companies,
      ok: true,
      settings: result.data.settings,
      travelers: result.data.travelers,
      version: result.data.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
