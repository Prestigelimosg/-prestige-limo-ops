import {
  normalizeChatGptBookingPreview,
  type ChatGptBookingPreviewValidationIssue,
} from "../../../lib/chatgpt-booking-preview";
import { resolveAdminDispatcherBoundary } from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

const adminBookingPreviewPurpose = "admin-booking-preview";

function issue(
  code: string,
  message: string,
): ChatGptBookingPreviewValidationIssue {
  return {
    code,
    field: "request",
    message,
    severity: "error",
  };
}

function safeResponse(
  preview: ReturnType<typeof normalizeChatGptBookingPreview>["preview"],
  validationIssues: ChatGptBookingPreviewValidationIssue[],
  missingRequiredFields: string[],
  status: number,
) {
  return Response.json(
    {
      preview,
      validation_issues: validationIssues,
      missing_required_fields: missingRequiredFields,
    },
    { status },
  );
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPreviewPurpose, {
    allowServerSessionRoleMethodsWithoutRequestToken: ["POST"],
  });

  if (!boundary.ok) {
    return safeResponse(
      null,
      [issue("preview_access_denied", "Booking preview is available only to the authorised admin surface.")],
      [],
      403,
    );
  }

  try {
    const normalized = normalizeChatGptBookingPreview(await readJsonBody(request));

    return safeResponse(
      normalized.preview,
      normalized.validation_issues,
      normalized.missing_required_fields,
      normalized.ok ? 200 : 400,
    );
  } catch {
    return safeResponse(
      null,
      [issue("preview_failed_safely", "Booking preview could not be prepared safely.")],
      [],
      500,
    );
  }
}
