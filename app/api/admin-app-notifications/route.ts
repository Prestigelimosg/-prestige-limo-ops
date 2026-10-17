import { resolveStoreReviewAdminNotificationRequest, resolveStoreReviewSession, storeReviewSameOrigin, storeReviewBlockedResponse } from "../../../lib/store-review-access";
import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";
import {
  createAdminAppNotification,
  loadAdminAppNotifications,
  parseAdminAppNotificationCreatePayload,
  parseAdminAppNotificationUpdatePayload,
  updateAdminAppNotificationStatus,
  updateStoreReviewAdminNotification,
} from "../../../lib/admin-app-notification-persistence";

export const dynamic = "force-dynamic";

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function blockedResponse(error: string) {
  return Response.json(
    {
      error,
      ok: false,
    },
    { status: 403 },
  );
}

type AdminDispatcherBoundaryCheck =
  | {
      context: AdminDispatcherBoundaryContext;
      ok: true;
    }
  | {
      ok: false;
      response: Response;
    };

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose, {
    allowServerSessionRoleMethodsWithoutRequestToken: ["PATCH"],
  });

  return boundary.ok
    ? {
        context: boundary.context,
        ok: true,
      }
    : {
        ok: false,
        response: blockedResponse(boundary.error),
      };
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Admin app notification request failed safely.",
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
    const result = await loadAdminAppNotifications(new URL(request.url).searchParams, actor, review.state === "valid" ? review : undefined);

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
      notifications: result.data.notifications,
      ok: true,
      pagination: result.data.pagination,
      version: result.data.version,
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function POST(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const parsed = parseAdminAppNotificationCreatePayload(await readJsonBody(request));

    if (!parsed.ok) {
      return Response.json(
        {
          error: parsed.error,
          ok: false,
        },
        { status: parsed.status },
      );
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await createAdminAppNotification(parsed.data, actor);

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
      notification: result.data,
      ok: true,
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function PATCH(request: Request) {
  try {
    const review = resolveStoreReviewAdminNotificationRequest(request);
    if (review.state === "blocked") return storeReviewBlockedResponse();
    if (review.state === "review") {
      const result = await updateStoreReviewAdminNotification(review.proof, await readJsonBody(request));
      return result.ok ? Response.json({ ok: true, notification: result.data })
        : Response.json({ ok: false, error: result.error }, { status: result.status });
    }
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const parsed = parseAdminAppNotificationUpdatePayload(await readJsonBody(request));

    if (!parsed.ok) {
      return Response.json(
        {
          error: parsed.error,
          ok: false,
        },
        { status: parsed.status },
      );
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await updateAdminAppNotificationStatus(parsed.data, actor);

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
      notification: result.data,
      ok: true,
    });
  } catch {
    return safeFailureResponse();
  }
}
