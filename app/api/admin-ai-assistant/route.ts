import {
  adminAiAssistantPurpose,
  requestAdminAiConversation,
} from "../../../lib/admin-ai-runtime";
import { resolveAdminDispatcherBoundary } from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

async function readJsonBody(request: Request) {
  try {
    const value = await request.json();

    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function blockedResponse(error: string) {
  return Response.json(
    {
      error,
      external_send: false,
      ok: false,
      write_action: false,
    },
    { status: 403 },
  );
}

export async function POST(request: Request) {
  const boundary = resolveAdminDispatcherBoundary(request, adminAiAssistantPurpose, {
    allowServerSessionRoleMethodsWithoutRequestToken: ["POST"],
  });

  if (!boundary.ok) {
    return blockedResponse(boundary.error);
  }

  const body = await readJsonBody(request);
  const result = await requestAdminAiConversation(body.message, body.history);

  if (!result.ok) {
    return Response.json(
      {
        error: result.error,
        external_send: false,
        ok: false,
        write_action: false,
      },
      { status: result.status },
    );
  }

  return Response.json({
    answer: result.data.answer,
    external_send: false,
    model: result.model,
    ok: true,
    usage: result.usage,
    write_action: false,
  });
}
