import {
  adminEmailAiIntakePurpose,
  loadAdminEmailAiIntake,
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
