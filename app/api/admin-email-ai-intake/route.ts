import {
  adminEmailAiIntakePurpose,
  loadAdminEmailAiIntake,
  markAdminEmailAiIntakeReviewed,
} from "../../../lib/admin-email-ai-intake";
import { resolveAdminDispatcherBoundary } from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

function blockedResponse(error: string) {
  return Response.json(
    {
      error,
      ok: false,
    },
    { status: 403 },
  );
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isExactReviewBody(
  value: unknown,
): value is {
  intake_id: string;
  processing_status: "reviewed";
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const body = value as Record<string, unknown>;
  const keys = Object.keys(body).sort();

  return (
    keys.length === 2 &&
    keys[0] === "intake_id" &&
    keys[1] === "processing_status" &&
    typeof body.intake_id === "string" &&
    body.processing_status === "reviewed"
  );
}

export async function GET(request: Request) {
  const boundary = resolveAdminDispatcherBoundary(
    request,
    adminEmailAiIntakePurpose,
  );

  if (!boundary.ok) {
    return blockedResponse(boundary.error);
  }

  const result = await loadAdminEmailAiIntake();

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
    enabled: result.data.enabled,
    external_send: false,
    ok: true,
    records: result.data.records,
    token_usage: result.data.token_usage,
    version: result.data.version,
    write_action: false,
  });
}

export async function PATCH(request: Request) {
  const boundary = resolveAdminDispatcherBoundary(
    request,
    adminEmailAiIntakePurpose,
    {
      allowServerSessionRoleMethodsWithoutRequestToken: ["PATCH"],
    },
  );

  if (!boundary.ok) {
    return blockedResponse(boundary.error);
  }

  const body = await readJsonBody(request);

  if (!isExactReviewBody(body)) {
    return Response.json(
      {
        error: "Email AI intake review request is invalid.",
        ok: false,
      },
      { status: 400 },
    );
  }

  const result = await markAdminEmailAiIntakeReviewed(body.intake_id);

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
    external_send: false,
    intake_id: result.data.intake_id,
    ok: true,
    processing_status: result.data.processing_status,
    version: result.data.version,
    write_action: true,
  });
}
